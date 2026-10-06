"""Cliente de Gemini Vision con el SDK oficial ``google-genai``.

Diferencias con el JS (``callGeminiVision``): la clave no sale del servidor, la respuesta se
valida con Pydantic, el puntaje y el estadio se recalculan a partir de los criterios, y el
modelo es configurable (``GEMINI_MODEL``) o se elige entre los disponibles en la cuenta.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

from django.conf import settings
from django.core.cache import cache
from pydantic import ValidationError

from biomecanica.motor_local import estadio_gallahue
from biomecanica.reglas import REGLAS

from .esquema import DiagnosticoIA
from .prompt import VERSION_PROMPT, construir_prompt

log = logging.getLogger(__name__)

EXCLUIR = ("embedding", "image", "imagen", "tts", "live", "audio", "aqa", "veo", "learnlm", "gemma",
           "robotics", "computer-use", "thinking")
MAX_CANDIDATOS = 3


class GeminiNoDisponible(RuntimeError):
    """Configuración o permisos impiden usar Gemini (no se reintenta con otros modelos)."""


def crear_cliente():
    from google import genai

    if not settings.GEMINI_API_KEY:
        raise GeminiNoDisponible("No hay GEMINI_API_KEY configurada en el servidor")
    return genai.Client(api_key=settings.GEMINI_API_KEY)


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


def modelos_candidatos(cliente) -> List[str]:
    if settings.GEMINI_MODEL:
        return [settings.GEMINI_MODEL]
    en_cache = cache.get("aula360:gemini:modelos")
    if en_cache:
        return en_cache
    nombres = []
    for m in cliente.models.list():
        acciones = getattr(m, "supported_actions", None) or []
        if acciones and "generateContent" not in acciones:
            continue
        nombre = (m.name or "").removeprefix("models/")
        if puntuar_modelo(nombre) >= 0:
            nombres.append(nombre)
    nombres.sort(key=puntuar_modelo, reverse=True)
    if not nombres:
        raise GeminiNoDisponible("La cuenta de Google no tiene modelos Gemini con visión disponibles")
    cache.set("aula360:gemini:modelos", nombres[:MAX_CANDIDATOS], 60 * 60)
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


def _a_contrato(ia: DiagnosticoIA, telemetria: Dict[str, Any], es_auto: bool, grado: str, modelo: str) -> Dict[str, Any]:
    """Convierte la respuesta validada en el contrato ``Diagnostico`` con números consistentes."""
    regla = REGLAS[ia.habilidad_detectada]
    referencia = [c.evaluar(telemetria) for c in regla.criterios]
    criterios = []
    for i, c in enumerate(ia.criterios):
        ref = referencia[i] if i < len(referencia) else {}
        criterios.append({"criterio": c.criterio, "fase": c.fase, "puntaje": c.puntaje, "observacion": c.observacion,
                          "medido": ref.get("medido", ""), "umbral": ref.get("umbral", "")})
    aprobados = sum(c["puntaje"] for c in criterios)
    porcentaje = round(aprobados / len(criterios) * 100)
    return {
        "habilidad_detectada": ia.habilidad_detectada,
        "es_deteccion_automatica": es_auto,
        "componente_hmb": regla.componente,
        "prueba_nro": regla.prueba_nro,
        "puntaje_obtenido": f"{aprobados}/{len(criterios)}",
        "edad_calibrada": grado,
        "estadio_gallahue": estadio_gallahue(porcentaje),
        "porcentaje_madurez": porcentaje,
        "resumen_biomecanico": ia.resumen_biomecanico,
        "criterios": criterios,
        "analisis_articular": ia.analisis_articular.model_dump(),
        "errores_criticos": [e.model_dump() for e in ia.errores_criticos] or [
            {"error": "Sin fallos biomecánicos críticos",
             "impacto_biomecanico": "El estudiante demuestra adecuada coordinación articular según la IA."}],
        "frases_profe": ia.frases_profe or list(regla.frases),
        "telemetria_medida": telemetria,
        "modelo_utilizado": modelo,
        "version_prompt": VERSION_PROMPT,
    }


def diagnosticar(frames: Sequence[Dict[str, Any]], diag_local: Dict[str, Any], habilidad: Optional[str],
                 grado: str, cliente=None) -> Dict[str, Any]:
    """Diagnóstico con Gemini. ``diag_local`` aporta la telemetría y la sugerencia del clasificador.

    Lanza ``GeminiNoDisponible`` (configuración) o la última excepción si ningún modelo respondió bien.
    """
    from google.genai import errors, types

    con_imagen = [f for f in frames if f.get("imagen_jpeg")]
    if not con_imagen:
        raise GeminiNoDisponible("No hay imágenes de fotogramas para enviar")
    cliente = cliente or crear_cliente()
    telemetria = diag_local["telemetria_medida"]
    prompt = construir_prompt(telemetria, habilidad, diag_local["habilidad_detectada"], grado, len(con_imagen))
    config = types.GenerateContentConfig(system_instruction=prompt, temperature=0.1, response_mime_type="application/json")
    contenido = _contenido(con_imagen)

    ultimo: Optional[Exception] = None
    for modelo in modelos_candidatos(cliente):
        try:
            respuesta = cliente.models.generate_content(model=modelo, contents=contenido, config=config)
            ia = DiagnosticoIA.model_validate(json.loads(_limpiar_json(respuesta.text)))
            if habilidad and ia.habilidad_detectada != habilidad:
                log.info("Gemini cambió la habilidad dirigida %s → %s; se respeta la del docente", habilidad, ia.habilidad_detectada)
                ia = ia.model_copy(update={"habilidad_detectada": habilidad})
            return _a_contrato(ia, telemetria, habilidad is None, grado, modelo)
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
    if not settings.GEMINI_API_KEY:
        return False, "El análisis con IA en la nube no está configurado en el servidor; se usó el motor local."
    inst = getattr(evaluacion.docente, "institucion", None)
    if inst is not None and not inst.usa_ia_nube:
        return False, "La institución no autoriza la IA en la nube; se usó el motor local."
    est = evaluacion.estudiante
    if est is not None and not est.consentimiento_ia_nube:
        return False, "No hay consentimiento del acudiente para enviar imágenes a la IA en la nube; se usó el motor local."
    return True, ""
