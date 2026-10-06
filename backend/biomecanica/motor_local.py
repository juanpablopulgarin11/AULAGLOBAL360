"""Motor determinista: telemetría → habilidad → criterios de la batería → estadio de Gallahue
(port de ``runLocalBiomechanicalEngine``, ``script.js:3925``)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from .clasificador import classify_skill
from .fsm import ejecutar_fsm
from .habilidades import grado_y_ciclo, resolver_habilidad
from .jsutil import js_round, js_str as v
from .reglas import obtener_regla
from .telemetria import aggregate_video_telemetry

VERSION_MOTOR = "1.0.0-paridad-js"

BATERIA_REFERENCIA = ("Batería de Habilidades Motrices Básicas (5-11 años) · "
                      "González Palacio, Montoya Grisales et al. (2021, Dialnet 7925607)")

# Textos heredados del JS. Cuando la detección corra en el servidor conviene cambiarlos
# (ya no será WASM ni hay muestreo por luminancia); se mantienen por paridad con la web.
ETIQUETA_AUTO = "🔍 [Detección Automática por Cinemática WASM: {habilidad}]"
ETIQUETA_DIRIGIDA = "[Evaluación Dirigida: {habilidad}]"
FUENTE_POSE = "**MediaPipe Pose Tasks (WASM)**"
NOTA_MUESTREO = "mediante muestreo adaptativo por luminancia"

SIN_ERRORES = {
    "error": "Sin fallos biomecánicos críticos",
    "impacto_biomecanico": "El estudiante demuestra adecuada coordinación articular e integración motriz acorde a los criterios de la Batería HMB.",
}

MENSAJE_SIN_PERSONA = ("No se detectó a la persona en ningún fotograma. Graba de nuevo con el cuerpo completo "
                       "visible, buena luz y la cámara fija.")


class SinPersonaDetectada(ValueError):
    """Ningún fotograma tiene landmarks: no se puede emitir un diagnóstico real."""

    def __init__(self) -> None:
        super().__init__(MENSAJE_SIN_PERSONA)


def estadio_gallahue(porcentaje: int) -> str:
    if porcentaje >= 80:
        return "Maduro"
    if porcentaje < 40:
        return "Inicial"
    return "Elemental"


def run_local_engine(codigo_habilidad: Optional[str], grado: Optional[str], observaciones: str,
                     frames: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """Diagnóstico completo con el contrato JSON ``Diagnostico`` (docs/02 §10).

    ``frames``: dicts con ``landmarks`` (33 puntos o ``None``), ``angles`` y ``timestampNum``.
    """
    telemetria = aggregate_video_telemetry(frames)
    if not telemetria["hasLandmarks"]:
        raise SinPersonaDetectada()

    habilidad = resolver_habilidad(codigo_habilidad)
    es_auto = habilidad is None
    if es_auto:
        habilidad = classify_skill(telemetria, observaciones)

    fsm = ejecutar_fsm(frames, habilidad)
    telemetria["fsm"] = fsm.to_dict()
    telemetria["fsmPhases"] = fsm.fases_cumplidas

    regla = obtener_regla(habilidad)
    criterios: List[Dict[str, Any]] = []
    errores: List[Dict[str, str]] = []
    for c in regla.criterios:
        r = c.evaluar(telemetria)
        criterios.append({"criterio": c.texto, "fase": c.fase, "puntaje": r["puntaje"], "medido": r["medido"],
                          "umbral": r["umbral"], "observacion": r["observacion"]})
        if r["error"]:
            errores.append(r["error"])

    aprobados = sum(1 for c in criterios if c["puntaje"] == 1)
    total = len(criterios)
    porcentaje = js_round((aprobados / total) * 100)
    estadio = estadio_gallahue(porcentaje)

    origen = (ETIQUETA_AUTO if es_auto else ETIQUETA_DIRIGIDA).format(habilidad=habilidad)
    cadena = " ➔ ".join(telemetria["fsmPhases"]) if telemetria["fsmPhases"] else "Secuencia detectada"
    t = telemetria

    return {
        "habilidad_detectada": habilidad,
        "es_deteccion_automatica": es_auto,
        "componente_hmb": regla.componente,
        "prueba_nro": regla.prueba_nro,
        "puntaje_obtenido": f"{aprobados}/{total}",
        "bateria_referencia": BATERIA_REFERENCIA,
        "edad_calibrada": grado_y_ciclo(grado or "7_anos")["grado"],
        "estadio_gallahue": estadio,
        "porcentaje_madurez": porcentaje,
        "resumen_biomecanico": (
            f"{origen} Evaluación cinemática instrumental según la **Batería de HMB (González Palacio & Montoya Grisales, "
            f"2021 · Dialnet 7925607)** mediante {FUENTE_POSE} y **Máquinas de Estado Cinemáticas (FSM)**. "
            f"Ciclo de fases completadas: [{cadena}]. El estudiante obtiene un puntaje de **{aprobados}/{total} puntos "
            f"({porcentaje}%)**, ubicándose en **Estadio {estadio}**. Parámetros articulares medidos: flexión de rodilla "
            f"{v(t['minKneeAngle'])}°, braceo medio {v(t['avgElbowAngle'])}°, inclinación de tronco {v(t['avgTrunkAngle'])}° "
            f"y simetría bilateral {v(t['symmetryScore'])}%."
        ),
        "criterios": criterios,
        "analisis_articular": {
            "angulos_principales": (f"Flexión mínima rodilla: {v(t['minKneeAngle'])}°, Ángulo medio codo: "
                                    f"{v(t['avgElbowAngle'])}°, Inclinación tronco: {v(t['avgTrunkAngle'])}°"),
            "cadena_cinetica": (f"Simetría bilateral calculada en {v(t['symmetryScore'])}%. Progresión de fases FSM: "
                                f"[{cadena}]. Fase de vuelo: {'Confirmada' if t['flightDetected'] else 'No evidente'}."),
            "apoyo_y_base": f"Apertura angular máxima de zancada/base: {v(t['maxHipAngle'])}° {NOTA_MUESTREO}.",
        },
        "errores_criticos": errores or [dict(SIN_ERRORES)],
        "frases_profe": list(regla.frases),
        "telemetria_medida": telemetria,
    }
