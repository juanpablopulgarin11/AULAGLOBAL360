"""Ángulos y métricas por fotograma (port de ``computeJointAngles`` y
``analyzeEquilibriumFromPythonReference``, ``script.js:1361-1554``).

Los diccionarios devueltos usan las mismas claves camelCase del JS porque son parte del
contrato JSON compartido con la telemetría, el prompt de Gemini y los fixtures.
"""
from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Optional

from .geometria import calculate_angle_3d, inclinacion_horizontal
from .jsutil import js_round, round1
from .landmarks import NUM_LANDMARKS, Punto, normalizar

Angulos = Dict[str, Any]

_EQUILIBRIO_VACIO = {
    "estado": "BIPEDESTACIÓN",
    "balanceoHombros": 0,
    "balanceoCaderas": 0,
    "inclinacionLateralMax": 0,
    "pieElevado": False,
    "pieElevadoLado": "ninguno",
    "angRodillaApoyo": 170,
    "esMantenimiento": False,
    "perdidaEquilibrio": False,
}


def analizar_equilibrio(lm: Optional[List[Punto]], angles: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Estado de equilibrio unipodal de un fotograma aislado (sin dimensión temporal)."""
    if not lm or len(lm) < NUM_LANDMARKS:
        return dict(_EQUILIBRIO_VACIO)

    hombro_izq, hombro_der = lm[11], lm[12]
    cadera_izq, cadera_der = lm[23], lm[24]
    rodilla_izq, rodilla_der = lm[25], lm[26]
    tobillo_izq, tobillo_der = lm[27], lm[28]

    balanceo_hombros = round1(inclinacion_horizontal(hombro_der, hombro_izq))
    balanceo_caderas = round1(inclinacion_horizontal(cadera_der, cadera_izq))
    inclinacion_max = max(balanceo_hombros, balanceo_caderas)

    # Umbral de elevación podal de 0.04 (igual que codigodelsalto.py)
    pie_izq_elevado = tobillo_izq.y < (tobillo_der.y - 0.04)
    pie_der_elevado = tobillo_der.y < (tobillo_izq.y - 0.04)
    pie_elevado = pie_izq_elevado or pie_der_elevado
    lado = "izquierdo" if pie_izq_elevado else ("derecho" if pie_der_elevado else "ninguno")

    if pie_izq_elevado:
        apoyo = angles["rKnee"] if angles and angles.get("rKnee") is not None else calculate_angle_3d(cadera_der, rodilla_der, tobillo_der)
    elif pie_der_elevado:
        apoyo = angles["lKnee"] if angles and angles.get("lKnee") is not None else calculate_angle_3d(cadera_izq, rodilla_izq, tobillo_izq)
    else:
        apoyo = angles["kneeMax"] if angles and angles.get("kneeMax") is not None else 170
    apoyo = js_round(apoyo)

    es_mantenimiento = False
    perdida = False
    if pie_elevado and apoyo > 155:
        # La condición "apoyo < 150" del JS original es inalcanzable dentro de esta rama
        if balanceo_hombros > 15.0 or balanceo_caderas > 12.0:
            estado, perdida = "PÉRDIDA DE EQUILIBRIO", True
        elif balanceo_hombros < 6.0 and balanceo_caderas < 6.0:
            estado, es_mantenimiento = "MANTENIMIENTO ESTÁTICO", True
        else:
            estado = "ESTABILIZANDO"
    elif pie_elevado and (apoyo < 150 or balanceo_hombros > 15.0):
        estado, perdida = "PÉRDIDA DE EQUILIBRIO", True
    else:
        estado = "BIPEDESTACIÓN"

    return {
        "estado": estado,
        "balanceoHombros": balanceo_hombros,
        "balanceoCaderas": balanceo_caderas,
        "inclinacionLateralMax": inclinacion_max,
        "pieElevado": pie_elevado,
        "pieElevadoLado": lado,
        "angRodillaApoyo": apoyo,
        "esMantenimiento": es_mantenimiento,
        "perdidaEquilibrio": perdida,
    }


def compute_joint_angles(landmarks: Optional[Iterable[Any]]) -> Optional[Angulos]:
    """Ángulos articulares y métricas de un fotograma. ``None`` si no hay 33 landmarks."""
    lm = normalizar(landmarks)
    if not lm or len(lm) < NUM_LANDMARKS:
        return None

    l_knee = calculate_angle_3d(lm[23], lm[25], lm[27])
    r_knee = calculate_angle_3d(lm[24], lm[26], lm[28])
    l_elbow = calculate_angle_3d(lm[11], lm[13], lm[15])
    r_elbow = calculate_angle_3d(lm[12], lm[14], lm[16])

    l_hip_flex = calculate_angle_3d(lm[11], lm[23], lm[25])
    r_hip_flex = calculate_angle_3d(lm[12], lm[24], lm[26])

    mid_hip = Punto((lm[23].x + lm[24].x) / 2, (lm[23].y + lm[24].y) / 2)
    mid_shoulder = Punto((lm[11].x + lm[12].x) / 2, (lm[11].y + lm[12].y) / 2)
    trunk_dx = mid_shoulder.x - mid_hip.x
    trunk_dy = mid_shoulder.y - mid_hip.y
    trunk_lean = js_round(abs(math.atan2(trunk_dx, -trunk_dy) * 180 / math.pi))
    torso_height = math.hypot(trunk_dx, trunk_dy) or 0.25

    hip_angle = calculate_angle_3d(lm[25], mid_hip, lm[26])

    l_ankle_y, r_ankle_y = lm[27].y, lm[28].y
    l_ankle_x, r_ankle_x = lm[27].x, lm[28].x
    ankle_x_diff = abs(l_ankle_x - r_ankle_x)

    l_rel = l_ankle_x - mid_hip.x
    r_rel = r_ankle_x - mid_hip.x
    is_leg_straddle = (l_rel * r_rel < -0.001) or (ankle_x_diff >= 0.14)

    wrist_above = lm[15].y < lm[11].y or lm[16].y < lm[12].y

    eq = analizar_equilibrio(lm, {"lKnee": l_knee, "rKnee": r_knee, "kneeMax": max(l_knee, r_knee)})

    return {
        "lKnee": l_knee,
        "rKnee": r_knee,
        "kneeMin": min(l_knee, r_knee),
        "kneeMax": max(l_knee, r_knee),
        "kneeDiff": abs(l_knee - r_knee),
        "lElbow": l_elbow,
        "rElbow": r_elbow,
        "elbowAvg": js_round((l_elbow + r_elbow) / 2),
        "elbowMax": max(l_elbow, r_elbow),
        "elbowMin": min(l_elbow, r_elbow),
        "elbowDiff": abs(l_elbow - r_elbow),
        "lHipFlexion": l_hip_flex,
        "rHipFlexion": r_hip_flex,
        "hipDiff": abs(l_hip_flex - r_hip_flex),
        "trunkLean": trunk_lean,
        "torsoHeight": torso_height,
        "hipAngle": hip_angle,
        "lAnkleY": l_ankle_y,
        "rAnkleY": r_ankle_y,
        "lAnkleX": l_ankle_x,
        "rAnkleX": r_ankle_x,
        "ankleYDiff": abs(l_ankle_y - r_ankle_y),
        "ankleXDiff": ankle_x_diff,
        "ankleDist": math.hypot(l_ankle_x - r_ankle_x, l_ankle_y - r_ankle_y),
        "isLegStraddle": is_leg_straddle,
        "wristDist": math.hypot(lm[15].x - lm[16].x, lm[15].y - lm[16].y),
        "wristAboveShoulder": wrist_above,
        "midHipX": mid_hip.x,
        "midHipY": mid_hip.y,
        "shoulderTilt": eq["balanceoHombros"],
        "hipTilt": eq["balanceoCaderas"],
        "unipodalFootRaised": eq["pieElevado"],
        "unipodalSupportKnee": eq["angRodillaApoyo"],
        "unipodalState": eq["estado"],
        "unipodalMaintained": eq["esMantenimiento"],
    }
