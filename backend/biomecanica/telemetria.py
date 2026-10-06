"""Agregación de los ángulos de todos los fotogramas en una telemetría única
(port de ``aggregateVideoTelemetry``, ``script.js:2617``)."""
from __future__ import annotations

import math
from typing import Any, Dict, List, Sequence

from .jsutil import js_or, js_round, media, round1

Telemetria = Dict[str, Any]

METODO_MUESTREO = "Adaptativo por Diferencial de Luminancia"

# Valores de relleno del JS cuando no hay landmarks. El motor local ya no los usa para
# diagnosticar (lanza SinPersonaDetectada), pero se conservan por compatibilidad.
TELEMETRIA_SIN_LANDMARKS: Telemetria = {
    "hasLandmarks": False,
    "minKneeAngle": 108, "maxKneeAngle": 168,
    "avgElbowAngle": 94, "maxElbowAngle": 110, "minElbowAngle": 80,
    "avgTrunkAngle": 8, "maxHipAngle": 36,
    "maxWristAboveShoulder": False, "minWristDist": 0.4,
    "avgAnkleYDiff": 0.02, "maxAnkleYDiff": 0.04, "maxAnkleXDiff": 0.08, "maxAnkleDist": 0.20,
    "hasStraddleKickFrame": False,
    "unipodalHoldFrames": 0, "unipodalHoldRatio": 0,
    "avgShoulderTilt": 2.0, "maxShoulderTilt": 4.0, "avgHipTilt": 2.0,
    "unipodalMaintainedFrames": 0, "unipodalRaisedFrames": 0, "avgSupportKnee": 165,
    "transientKickPeak": False,
    "avgKneeDiff": 10, "maxKneeDiff": 18, "maxHipDiff": 15,
    "avgElbowDiff": 12, "maxElbowDiff": 20,
    "ankleDistAvg": 0.25, "hipDisplacement": 0.15,
    "flightDetected": False, "flightFrames": [],
    "symmetryScore": 86,
    "samplingMethod": METODO_MUESTREO,
}


def _angulos(frames: Sequence[Any]) -> List[Dict[str, Any]]:
    salida = []
    for f in frames:
        a = f.get("angles") if isinstance(f, dict) else getattr(f, "angles", None)
        if a is not None:
            salida.append(a)
    return salida


def aggregate_video_telemetry(frames: Sequence[Any]) -> Telemetria:
    va = _angulos(frames)
    if not va:
        return {k: (list(v) if isinstance(v, list) else v) for k, v in TELEMETRIA_SIN_LANDMARKS.items()}

    min_knee = min(a["kneeMin"] for a in va)
    max_knee = max(a["kneeMax"] for a in va)
    avg_elbow = js_round(media([a["elbowAvg"] for a in va]))
    max_elbow = max(js_or(a.get("elbowMax"), a["elbowAvg"]) for a in va)
    min_elbow = min(js_or(a.get("elbowMin"), a["elbowAvg"]) for a in va)
    avg_trunk = js_round(media([a["trunkLean"] for a in va]))
    max_hip = max(a["hipAngle"] for a in va)

    # Inclinación y equilibrio (referencia codigodelsalto.py)
    shoulder_tilts = [a.get("shoulderTilt", 0) for a in va]
    avg_shoulder_tilt = round1(media(shoulder_tilts))
    max_shoulder_tilt = max(shoulder_tilts)
    avg_hip_tilt = round1(media([a.get("hipTilt", 0) for a in va]))

    maintained = sum(1 for a in va if a.get("unipodalMaintained") is True)
    raised = sum(1 for a in va if a.get("unipodalFootRaised") is True)
    support_knees = [a["unipodalSupportKnee"] for a in va if a.get("unipodalFootRaised") and a.get("unipodalSupportKnee")]
    avg_support_knee = js_round(media(support_knees)) if support_knees else js_or(max_knee, 165)

    knee_diffs = [a["kneeDiff"] for a in va]
    hip_diffs = [a.get("hipDiff", 0) for a in va]
    elbow_diffs = [a["elbowDiff"] for a in va]
    ankle_y_diffs = [a["ankleYDiff"] for a in va]
    ankle_x_diffs = [a.get("ankleXDiff", 0) for a in va]
    ankle_dists = [js_or(a.get("ankleDist"), 0.25) for a in va]
    wrist_dists = [js_or(a.get("wristDist"), 0.5) for a in va]

    avg_knee_diff = media(knee_diffs)

    # 1. Sostén unipodal: pierna libre elevada/flexionada con pierna de apoyo erguida
    hold_frames = 0
    for a in va:
        lifted = (a.get("unipodalFootRaised") is True) or a["ankleYDiff"] >= 0.035 or (
            a["kneeMax"] >= 145 and a["kneeMin"] <= 135 and a["kneeDiff"] >= 20)
        support = a["kneeMax"] >= 145 or bool(a.get("unipodalSupportKnee") and a["unipodalSupportKnee"] >= 145)
        if lifted and support:
            hold_frames += 1
    hold_ratio = hold_frames / len(va)

    # 2. Pico transitorio de patada (pierna adelante y atrás en 1–2 fotogramas)
    straddle = [a for a in va if (a["isLegStraddle"] and a["ankleXDiff"] >= 0.14) and a["kneeDiff"] >= 25 and a["ankleYDiff"] >= 0.04]
    has_straddle_kick = len(straddle) >= 1 and hold_ratio < 0.40
    transient_kick = 1 <= len(straddle) <= 2 and hold_ratio < 0.40

    # 3. Vuelo: ambos tobillos por encima del nivel del suelo a la vez
    ground = max(max(a["lAnkleY"], a["rAnkleY"]) for a in va)
    flight_frames: List[int] = []
    bipodal = 0
    for idx, a in enumerate(va):
        if a["lAnkleY"] < ground - 0.045 and a["rAnkleY"] < ground - 0.045:
            flight_frames.append(idx + 1)
            if a["ankleYDiff"] <= 0.065 and a["kneeDiff"] <= 32:
                bipodal += 1
    if hold_ratio >= 0.25 or hold_frames >= 2 or maintained >= 1:
        bipodal = 0
    flight_detected = len(flight_frames) > 0 and bipodal > 0

    rapid_knee_delta = 0
    for i in range(1, len(va)):
        d_l = abs(va[i]["lKnee"] - va[i - 1]["lKnee"])
        d_r = abs(va[i]["rKnee"] - va[i - 1]["rKnee"])
        rapid_knee_delta = max(rapid_knee_delta, d_l, d_r)

    hip_displacement = 0.02
    if len(va) >= 2 and va[0].get("midHipX") is not None:
        first, last = va[0], va[-1]
        hip_displacement = math.hypot(js_or(last.get("midHipX"), 0) - js_or(first.get("midHipX"), 0),
                                      js_or(last.get("midHipY"), 0) - js_or(first.get("midHipY"), 0))

    symmetry = max(65, min(98, js_round(100 - avg_knee_diff * 0.7)))

    return {
        "hasLandmarks": True,
        "minKneeAngle": min_knee,
        "maxKneeAngle": max_knee,
        "avgElbowAngle": avg_elbow,
        "maxElbowAngle": max_elbow,
        "minElbowAngle": min_elbow,
        "avgTrunkAngle": avg_trunk,
        "maxHipAngle": max_hip,
        "maxWristAboveShoulder": any(a.get("wristAboveShoulder") is True for a in va),
        "minWristDist": min(wrist_dists),
        "avgAnkleYDiff": media(ankle_y_diffs),
        "maxAnkleYDiff": max(ankle_y_diffs),
        "maxAnkleXDiff": max(ankle_x_diffs + [0]),
        "maxAnkleDist": max(ankle_dists),
        "unipodalHoldFrames": hold_frames,
        "unipodalHoldRatio": hold_ratio,
        "avgShoulderTilt": avg_shoulder_tilt,
        "maxShoulderTilt": max_shoulder_tilt,
        "avgHipTilt": avg_hip_tilt,
        "unipodalMaintainedFrames": maintained,
        "unipodalRaisedFrames": raised,
        "avgSupportKnee": avg_support_knee,
        "hasStraddleKickFrame": has_straddle_kick,
        "transientKickPeak": transient_kick,
        "avgKneeDiff": avg_knee_diff,
        "maxKneeDiff": max(knee_diffs),
        "maxHipDiff": max(hip_diffs + [0]),
        "avgElbowDiff": media(elbow_diffs),
        "maxElbowDiff": max(elbow_diffs),
        "ankleDistAvg": media(ankle_dists),
        "hipDisplacement": hip_displacement,
        "rapidKneeDelta": rapid_knee_delta,
        "flightDetected": flight_detected,
        "bipodalFlightDetected": bipodal > 0,
        "flightFrames": flight_frames,
        "symmetryScore": symmetry,
        "samplingMethod": METODO_MUESTREO,
    }
