"""Motor v2: serie del video completo → evento → habilidad → criterios de la batería.

Diferencias con el motor v1 (``motor_local``, que conserva la paridad con ``script.js``):

- Mide sobre la pose de todo el video (``serie``), no sobre 8 fotogramas.
- La detección automática exige el evento característico y declara su confianza.
- Los criterios que la pose no puede ver quedan **por confirmar** (``puntaje = None``): los
  califica Gemini o el docente. El porcentaje y el estadio se calculan sobre los criterios
  calificados y se marcan como provisionales mientras haya pendientes.
- Una foto no muestra movimiento: todos los criterios quedan por confirmar.

Devuelve el mismo contrato ``Diagnostico`` que el v1 más ``criterios[].fuente/pendiente``,
``deteccion`` y ``telemetria_medida.cinematica``.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple

from .clasificador_v2 import detectar
from .momentos import _eventos, momentos_clave
from .fsm import ejecutar_fsm
from .habilidades import grado_y_ciclo, resolver_habilidad
from .jsutil import js_round
from .motor_local import BATERIA_REFERENCIA, SIN_ERRORES, SinPersonaDetectada, estadio_gallahue
from .reglas import obtener_regla
from .reglas_v2 import errores_de, evaluar_criterios
from .serie import calcular_cinematica
from .telemetria import aggregate_video_telemetry

VERSION_MOTOR_V2 = "2.0.0"

Muestras = Sequence[Tuple[float, Optional[List[Dict[str, float]]]]]


def totales(criterios: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """Aprobados, calificados, pendientes, porcentaje y estadio (también tras confirmar el docente)."""
    aprobados = sum(1 for c in criterios if c.get("puntaje") == 1)
    calificados = sum(1 for c in criterios if c.get("puntaje") is not None)
    pendientes = len(criterios) - calificados
    porcentaje = js_round(aprobados / calificados * 100) if calificados else 0
    return {"aprobados": aprobados, "calificados": calificados, "pendientes": pendientes, "total": len(criterios),
            "porcentaje": porcentaje, "estadio": estadio_gallahue(porcentaje) if calificados else "",
            "provisional": pendientes > 0}


def _muestras_de_frames(frames: Sequence[Dict[str, Any]]) -> List[Tuple[float, Any]]:
    return [(float(f.get("timestampNum") or 0.0), f.get("landmarks")) for f in frames]


def gesto_detectado(cin: Dict[str, Any], habilidad: str) -> bool:
    """El evento característico de la prueba ocurrió (vuelo, suelta, impacto, sostén…)."""
    return bool(_eventos(cin, habilidad))


def momentos_para(serie: Muestras, duracion: float, codigo_habilidad: Optional[str], observaciones: str = "",
                  n: int = 8) -> List[Dict[str, Any]]:
    """Instantes de los fotogramas clave para la extracción (misma habilidad que decidirá el motor)."""
    cin = calcular_cinematica(serie)
    habilidad = resolver_habilidad(codigo_habilidad) or detectar(cin, observaciones).habilidad
    return momentos_clave(cin, habilidad, duracion, n)


def run_motor_v2(codigo_habilidad: Optional[str], grado: Optional[str], observaciones: str,
                 frames: Sequence[Dict[str, Any]], serie: Optional[Muestras] = None) -> Dict[str, Any]:
    """``frames``: los fotogramas clave (imágenes del resultado y de Gemini).
    ``serie``: (t, landmarks) de todo el video; sin ella se usan los fotogramas clave (y con uno solo,
    una foto, no hay movimiento que medir)."""
    telemetria = aggregate_video_telemetry(frames)
    if not telemetria["hasLandmarks"]:
        raise SinPersonaDetectada()

    es_foto = not serie and len(frames) <= 1
    cin = calcular_cinematica(serie or _muestras_de_frames(frames))
    habilidad = resolver_habilidad(codigo_habilidad)
    es_auto = habilidad is None
    deteccion = detectar(cin, observaciones) if es_auto else None
    if es_auto:
        habilidad = deteccion.habilidad

    fsm = ejecutar_fsm(frames, habilidad)
    telemetria["fsm"] = fsm.to_dict()
    telemetria["fsmPhases"] = fsm.fases_cumplidas
    telemetria["cinematica"] = cin
    if deteccion:
        telemetria["deteccion"] = deteccion.to_dict()

    regla = obtener_regla(habilidad)
    criterios = evaluar_criterios(habilidad, cin, telemetria)
    if es_foto:
        for c in criterios:
            c.update(puntaje=None, pendiente=True, fuente="visual", medido="Una foto no muestra el movimiento",
                     observacion=f"Por confirmar: {c['mira']}")
    errores = errores_de(habilidad, criterios, telemetria)
    tot = totales(criterios)

    gesto = gesto_detectado(cin, habilidad) and not es_foto
    lado = _lado(cin, habilidad) if gesto else ""
    partes = [("🔍 [Detección automática: " if es_auto else "[Evaluación dirigida: ") + f"{habilidad}]"]
    if deteccion:
        partes.append(f"Confianza de la detección: **{deteccion.confianza}** ({deteccion.motivo})")
    if es_foto:
        partes.append("Se analizó una **fotografía**: sin movimiento no se pueden medir los criterios de la batería; "
                      "confírmalos tú o graba un video de 3 a 6 segundos.")
    else:
        partes.append(f"Se analizó el video completo ({cin.get('duracion_s', 0)} s a {cin.get('fps_analisis', 0)} "
                      f"muestras/s, toma de {cin.get('vista', '—')}) con **MediaPipe Pose** según la **Batería HMB "
                      f"(González Palacio & Montoya Grisales, 2021 · Dialnet 7925607)**.")
    if lado:
        partes.append(lado)
    if tot["calificados"]:
        partes.append(f"Criterios calificados: **{tot['aprobados']}/{tot['calificados']} ({tot['porcentaje']}%)**, "
                      f"**Estadio {tot['estadio']}**" + (f" (provisional: faltan {tot['pendientes']} por confirmar)." if tot["pendientes"] else "."))
    else:
        partes.append(f"Los {tot['total']} criterios quedan por confirmar.")

    return {
        "version_motor": VERSION_MOTOR_V2,
        "habilidad_detectada": habilidad,
        "es_deteccion_automatica": es_auto,
        "deteccion": deteccion.to_dict() if deteccion else None,
        "componente_hmb": regla.componente,
        "prueba_nro": regla.prueba_nro,
        "puntaje_obtenido": f"{tot['aprobados']}/{tot['calificados']}",
        "totales": tot,
        "bateria_referencia": BATERIA_REFERENCIA,
        "edad_calibrada": grado_y_ciclo(grado or "7_anos")["grado"],
        "estadio_gallahue": tot["estadio"],
        "porcentaje_madurez": tot["porcentaje"],
        "resumen_biomecanico": " ".join(partes),
        "gesto_detectado": gesto,
        "criterios": criterios,
        "analisis_articular": _analisis(cin),
        "errores_criticos": errores or ([dict(SIN_ERRORES)] if tot["calificados"] and not tot["pendientes"] else []),
        "frases_profe": list(regla.frases),
        "telemetria_medida": telemetria,
    }


def _lado(cin: Dict[str, Any], habilidad: str) -> str:
    if habilidad == "Salto Unipodal" and cin.get("lado_saltos"):
        return f"Saltos sobre el **pie {cin['lado_saltos']}** (la batería evalúa cada pie por separado)."
    if habilidad == "Equilibrio Estático Unipodal" and cin.get("pie_apoyo"):
        return f"Apoyo sobre el **pie {cin['pie_apoyo']}** (la batería evalúa cada pie por separado)."
    if habilidad == "Lanzamiento Sobre Hombro" and (cin.get("lanzamiento") or {}).get("brazo"):
        mano = {"derecho": "derecha", "izquierdo": "izquierda"}[cin["lanzamiento"]["brazo"]]
        return f"Lanza con la **mano {mano}** (la batería evalúa cada mano por separado)."
    if habilidad == "Patear" and (cin.get("pateo") or {}).get("pierna"):
        pie = cin["pateo"]["pierna"]
        return f"Patea con el **pie {pie}** (la batería evalúa cada pie por separado)."
    return ""


def _num(x: Any, unidad: str = "°") -> str:
    if x is None:
        return "no medible en esta toma"
    if isinstance(x, float):
        x = 0.0 if abs(x) < 0.05 else x
        x = f"{x:.1f}".replace(".", ",")
    return f"{x}{unidad}"


def _analisis(cin: Dict[str, Any]) -> Dict[str, str]:
    if not cin.get("suficiente"):
        return {"angulos_principales": "No hubo suficientes fotogramas con el cuerpo visible.", "cadena_cinetica": "",
                "apoyo_y_base": ""}
    op = cin.get("oposicion_brazos")
    oposicion = (("no visible de frente" if cin.get("vista") == "frontal" else "no medible (no hubo desplazamiento)") if op is None else
                 "clara" if op >= 0.3 else "parcial" if op >= 0 else "ausente (brazo y pierna del mismo lado avanzan juntos)")
    doble = cin.get("doble_apoyo_frac")
    return {
        "angulos_principales": (f"Codo (mediana) {_num(cin.get('codo_mediana'))}; inclinación del tronco "
                                f"{_num(cin.get('tronco_mediana'))}; flexión mínima de rodilla {_num(cin.get('rodilla_min'))}; "
                                f"rodilla de recobro {_num(cin.get('recobro_rodilla_min'))}."),
        "cadena_cinetica": (f"{cin.get('vuelos', 0)} fases aéreas ({cin.get('vuelos_bipodales', 0)} con despegue y caída "
                            f"bipodal); {cin.get('saltos_mismo_pie', 0)} saltos seguidos sobre un pie; oposición "
                            f"brazo-pierna {oposicion}."),
        "apoyo_y_base": (f"Desplazamiento de {_num(abs(cin.get('desplazamiento_piernas') or 0.0), ' largos de pierna')}; "
                         f"apoyo en un pie más largo {_num(cin.get('apoyo_unipodal_s') or 0.0, ' s')}; doble apoyo "
                         f"{'no medible' if doble is None else f'{round(doble * 100)} % del recorrido'}; toma de {cin.get('vista')}."),
    }
