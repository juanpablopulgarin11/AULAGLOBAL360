"""Detección del "ángulo inicial" del ejercicio (port de ``checkExerciseTriggerPose``,
``script.js:1620``). Las condiciones se evalúan en orden y gana la primera."""
from __future__ import annotations

from typing import Any, Dict, Optional

from .jsutil import js_or, js_str


def check_exercise_trigger_pose(a: Optional[Dict[str, Any]], prev: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if not a:
        return {"triggered": False}

    def disparo(reason: str, hint: str) -> Dict[str, Any]:
        return {"triggered": True, "reason": reason, "skillHint": hint}

    # 0. Postura unipodal con pierna de apoyo extendida
    has_lift = a["unipodalFootRaised"] or a["ankleYDiff"] >= 0.035
    has_support = js_or(a["unipodalSupportKnee"], a["kneeMax"], 0) >= 148
    if has_lift and has_support:
        return disparo(
            f"Elevación podal y postura unipodal ({js_str(js_or(a['unipodalSupportKnee'], a['kneeMax']))}°)",
            "Equilibrio Estático Unipodal",
        )

    # 1. Flexión preparatoria bípode con ambos pies en el suelo
    if a["kneeMin"] <= 138 and a["kneeDiff"] <= 18 and a["ankleYDiff"] < 0.030 and not a["unipodalFootRaised"]:
        return disparo(f"Flexión preparatoria bípode ({js_str(a['kneeMin'])}°)", "Salto Horizontal")

    # 2. Apertura de zancada
    if a["hipAngle"] >= 22 or a["ankleXDiff"] >= 0.14:
        return disparo(f"Apertura de zancada / paso ({js_str(a['hipAngle'])}°)", "Carrera")

    # 3. Armado de brazo
    if a["wristAboveShoulder"] or (a["elbowDiff"] >= 26 and a["elbowMin"] <= 110):
        return disparo(f"Armado o elevación de brazo ({js_str(a['elbowMin'])}°)", "Lanzamiento Sobre Hombro")

    # 4. Péndulo de pierna
    if a["ankleYDiff"] >= 0.055 and a["kneeDiff"] >= 28 and (a["isLegStraddle"] or a["ankleXDiff"] >= 0.12):
        return disparo(f"Péndulo o despegue podal unilateral ({js_str(a['kneeDiff'])}° asimetría)", "Patear")

    # 5. Manos juntas al frente
    if a["wristDist"] <= 0.28 and 70 <= a["elbowAvg"] <= 125:
        return disparo("Brazos al frente en copa para recepción", "Recepción y Atrape")

    # 6. Inclinación de tronco
    if a["trunkLean"] >= 12:
        return disparo(f"Inclinación dinámica de tronco ({js_str(a['trunkLean'])}°)", "Carrera")

    # 7. Cambio angular brusco respecto al fotograma anterior
    if prev:
        delta_knee = abs(a["kneeMin"] - prev["kneeMin"])
        delta_hip = abs(a["hipAngle"] - prev["hipAngle"])
        delta_trunk = abs(a["trunkLean"] - prev["trunkLean"])
        if delta_knee >= 12 or delta_hip >= 10 or delta_trunk >= 7:
            return disparo(f"Aceleración angular de inicio (Δ rodilla {js_str(delta_knee)}°)", "Cinemática Dinámica")

    return {"triggered": False}
