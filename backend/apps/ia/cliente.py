"""Cliente de Gemini Vision con el SDK oficial ``google-genai``.

Diferencias con el JS (``callGeminiVision``): la clave no sale del servidor, la respuesta se
valida con Pydantic, el puntaje y el estadio se recalculan a partir de los criterios, y el
modelo es configurable (``GEMINI_MODEL``) o se elige entre los disponibles en la cuenta.

Como en la web, cada docente puede conectar su propia clave de Google AI Studio y elegir el
modelo («Configurar clase»); si no lo hace se usan ``GEMINI_API_KEY`` / ``GEMINI_MODEL``.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

from django.conf import settings
from django.core.cache import cache
from pydantic import ValidationError

from biomecanica.reglas import REGLAS

from .esquema import DiagnosticoIA
from .prompt import VERSION_PROMPT, construir_prompt_v2

log = logging.getLogger(__name__)

EXCLUIR = ("embedding", "image", "imagen", "tts", "live", "audio", "aqa", "veo", "learnlm", "gemma",
           "robotics", "computer-use", "thinking")
MAX_CANDIDATOS = 3


class GeminiNoDisponible(RuntimeError):
    """Configuración o permisos impiden usar Gemini (no se reintenta con otros modelos)."""


def clave_para(docente=None) -> str:
    """Clave propia del docente o, si no tiene, la del servidor."""
    return (getattr(docente, "gemini_clave", "") or settings.GEMINI_API_KEY or "").strip()


def modelo_para(docente=None) -> str:
    return getattr(docente, "gemini_modelo", "") or settings.GEMINI_MODEL


def disponible_para(docente=None) -> bool:
    return bool(clave_para(docente))


def crear_cliente(clave: Optional[str] = None):
    from google import genai

    clave = clave if clave is not None else settings.GEMINI_API_KEY
    if not clave:
        raise GeminiNoDisponible("No hay clave de Gemini: conéctala en «Configurar clase» o define GEMINI_API_KEY")
    return genai.Client(api_key=clave)


def puntuar_modelo(nombre: str) -> float:
    """Prefiere modelos *flash* estables y recientes (rápidos y con visión), como el JS."""
    n = nombre.lower()
    if any(x in n for x in EXCLUIR) or "gemini" not in n:
        return -1
    m = re.search(r"gemini-(\d+(?:\.\d+)?)", n)
    version = float(m.group(1)) if m else 0
    puntos = version * 10
    if "flash" in n:
        puntos += 100
    if "lite" in n:
        puntos -= 30
    if "preview" in n or "exp" in n:
        puntos -= 20
    return puntos


def listar_modelos(cliente, clave: str = "", refrescar: bool = False) -> List[Dict[str, str]]:
    """Modelos Gemini con visión de la cuenta, del más recomendado al menos (caché de 1 h por clave)."""
    llave = "aula360:gemini:modelos:" + hashlib.sha256(clave.encode()).hexdigest()[:16]
    en_cache = None if refrescar else cache.get(llave)
    if en_cache is not None:
        return en_cache
    modelos = []
    for m in cliente.models.list():
        acciones = getattr(m, "supported_actions", None) or []
        if acciones and "generateContent" not in acciones:
            continue
        nombre = (m.name or "").removeprefix("models/")
        if puntuar_modelo(nombre) >= 0:
            modelos.append({"id": nombre, "nombre": getattr(m, "display_name", None) or nombre})
    modelos.sort(key=lambda m: puntuar_modelo(m["id"]), reverse=True)
    cache.set(llave, modelos, 60 * 60)
    return modelos


def modelos_candidatos(cliente, preferido: str = "", clave: str = "") -> List[str]:
    preferido = preferido or settings.GEMINI_MODEL
    if preferido:
        return [preferido]
    nombres = [m["id"] for m in listar_modelos(cliente, clave)]
    if not nombres:
        raise GeminiNoDisponible("La cuenta de Google no tiene modelos Gemini con visión disponibles")
    return nombres[:MAX_CANDIDATOS]


def _contenido(frames: Sequence[Dict[str, Any]]) -> list:
    from google.genai import types

    partes = [types.Part.from_text(text=f"Analiza los siguientes {len(frames)} fotogramas del estudiante considerando la "
                                       "telemetría angular proporcionada e identifica la HMB. En cada fotograma se detalla "
                                       "el hito cinemático detectado:")]
    for i, f in enumerate(frames, start=1):
        if f.get("isMilestonePeak"):
            hito = f"[★ HITO CUMBRE DEL EJERCICIO: {f.get('milestoneTitle')} ({f.get('milestoneDesc')})]"
        elif f.get("isFinalMilestone"):
            hito = f"[🏁 FOTOGRAMA FINAL: {f.get('milestoneTitle')} ({f.get('milestoneDesc')})]"
        elif f.get("isInitialTrigger"):
            hito = f"[🎯 ÁNGULO INICIAL: {f.get('milestoneTitle')} ({f.get('milestoneDesc')})]"
        else:
            hito = f"[{f.get('milestoneTitle')} ({f.get('milestoneDesc')})]"
        partes.append(types.Part.from_text(text=f"Fotograma #{i} ({f.get('time')}) - {hito}:"))
        partes.append(types.Part.from_bytes(data=f["imagen_jpeg"], mime_type="image/jpeg"))
    return partes


def _limpiar_json(texto: str) -> str:
    t = (texto or "").strip()
    t = re.sub(r"^```(?:json)?", "", t).strip()
    return re.sub(r"```$", "", t).strip()


def fusionar(ia: DiagnosticoIA, diag: Dict[str, Any], dirigida: Optional[str], modelo: str) -> Dict[str, Any]:
    """Une la respuesta de Gemini con el motor v2: lo medido con la pose se conserva y la IA solo
    califica los criterios por confirmar. En detección automática, la IA puede corregir la
    habilidad únicamente si el motor no estaba seguro."""
    from biomecanica.motor_v2 import totales
    from biomecanica.reglas_v2 import errores_de, evaluar_criterios

    t = diag["telemetria_medida"]
    habilidad = diag["habilidad_detectada"]
    avisos = []
    if not dirigida and ia.habilidad_detectada != habilidad:
        if (diag.get("deteccion") or {}).get("confianza") == "alta":
            avisos.append(f"Gemini sugirió «{ia.habilidad_detectada}», pero la medición del video indica «{habilidad}» "
                          "con seguridad; se conserva la medición.")
        else:
            habilidad = ia.habilidad_detectada
    if habilidad == diag["habilidad_detectada"]:
        criterios = [dict(c) for c in diag["criterios"]]
    else:
        criterios = evaluar_criterios(habilidad, t.get("cinematica") or {}, t)
    for i, c in enumerate(criterios):
        if c.get("puntaje") is None and i < len(ia.criterios):
            c.update(puntaje=ia.criterios[i].puntaje, fuente="ia", pendiente=False,
                     observacion=ia.criterios[i].observacion or c.get("observacion", ""))
    tot = totales(criterios)
    regla = REGLAS[habilidad]
    deteccion = diag.get("deteccion")
    if deteccion and habilidad != diag["habilidad_detectada"]:
        deteccion = {**deteccion, "habilidad": habilidad, "confianza": "ia",
                     "motivo": f"Corregida por Gemini (el motor sugería {diag['habilidad_detectada']})."}
    return {
        **diag,
        "habilidad_detectada": habilidad,
        "deteccion": deteccion,
        "componente_hmb": regla.componente,
        "prueba_nro": regla.prueba_nro,
        "puntaje_obtenido": f"{tot['aprobados']}/{tot['calificados']}",
        "totales": tot,
        "estadio_gallahue": tot["estadio"],
        "porcentaje_madurez": tot["porcentaje"],
        "resumen_biomecanico": ia.resumen_biomecanico,
        "criterios": criterios,
        "analisis_articular": ia.analisis_articular.model_dump(),
        "errores_criticos": errores_de(habilidad, criterios, t) or [
            {"error": "Sin fallos biomecánicos críticos",
             "impacto_biomecanico": "El estudiante demuestra adecuada coordinación articular según la batería."}],
        "frases_profe": ia.frases_profe or list(regla.frases),
        "modelo_utilizado": modelo,
        "version_prompt": VERSION_PROMPT,
        "avisos_ia": avisos,
    }


def diagnosticar(frames: Sequence[Dict[str, Any]], diag_local: Dict[str, Any], habilidad: Optional[str],
                 grado: str, cliente=None, docente=None) -> Dict[str, Any]:
    """Diagnóstico con Gemini sobre el resultado del motor v2 (``diag_local``): la IA califica los
    criterios visuales y redacta el resumen; lo medido con la pose se conserva.

    Lanza ``GeminiNoDisponible`` (configuración) o la última excepción si ningún modelo respondió bien.
    """
    from google.genai import errors, types

    con_imagen = [f for f in frames if f.get("imagen_jpeg")]
    if not con_imagen:
        raise GeminiNoDisponible("No hay imágenes de fotogramas para enviar")
    cliente = cliente or crear_cliente(clave_para(docente))
    prompt = construir_prompt_v2(diag_local, habilidad, grado, len(con_imagen))
    config = types.GenerateContentConfig(system_instruction=prompt, temperature=0.1, response_mime_type="application/json")
    contenido = _contenido(con_imagen)

    ultimo: Optional[Exception] = None
    for modelo in modelos_candidatos(cliente, modelo_para(docente), clave_para(docente)):
        try:
            respuesta = cliente.models.generate_content(model=modelo, contents=contenido, config=config)
            ia = DiagnosticoIA.model_validate(json.loads(_limpiar_json(respuesta.text)))
            if habilidad and ia.habilidad_detectada != habilidad:
                log.info("Gemini cambió la habilidad dirigida %s → %s; se respeta la del docente", habilidad, ia.habilidad_detectada)
                ia = ia.model_copy(update={"habilidad_detectada": habilidad})
            return fusionar(ia, diag_local, habilidad, modelo)
        except errors.ClientError as exc:
            if getattr(exc, "code", None) in (401, 403):
                raise GeminiNoDisponible(f"Gemini rechazó la clave o el proyecto: {exc}") from exc
            ultimo = exc
        except (errors.APIError, json.JSONDecodeError, ValidationError, ValueError) as exc:
            ultimo = exc
        log.warning("Gemini falló con %s: %s", modelo, ultimo)
    raise ultimo or GeminiNoDisponible("Ningún modelo de Gemini respondió")


def permitido(evaluacion) -> Tuple[bool, str]:
    """Reglas de privacidad para enviar imágenes de un menor a un servicio externo."""
    if not disponible_para(evaluacion.docente):
        return False, ("El análisis con IA no tiene clave de Gemini (conéctala en «Configurar clase»); "
                       "se usó el motor local.")
    inst = getattr(evaluacion.docente, "institucion", None)
    if inst is not None and not inst.usa_ia_nube:
        return False, "La institución no autoriza la IA en la nube; se usó el motor local."
    est = evaluacion.estudiante
    if est is not None and not est.consentimiento_ia_nube:
        return False, "No hay consentimiento del acudiente para enviar imágenes a la IA en la nube; se usó el motor local."
    return True, ""
