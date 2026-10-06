"""Clasificador de habilidad motriz (port de ``classifySkillFromKinematics``, ``script.js:2810``).

1. Palabras clave en las observaciones del docente (prioridad absoluta).
2. Puntuación ponderada sobre la telemetría; gana la mayor (empates: la primera del diccionario).
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from .habilidades import (
    ATRAPE, CARRERA, EQ_DINAMICO, EQ_ESTATICO, LANZAMIENTO, MARCHA, PATEAR, SALTO_HORIZONTAL,
    SALTO_UNIPODAL,
)

# Orden de evaluación de palabras clave (la primera coincidencia gana)
PALABRAS_CLAVE = [
    (EQ_ESTATICO, ["estatico", "estático", "flamenco", "parado", "equilibrio estatico"]),
    (EQ_DINAMICO, ["dinamico", "dinámico", "linea", "línea", "viga", "caminar linea"]),
    (PATEAR, ["pate", "chut", "balon", "balón", "pelota", "futbol", "fútbol", "golpe", "remat", "tiro"]),
    (LANZAMIENTO, ["lanz", "arroja", "tirar", "lanzamiento", "sobre hombro"]),
    (ATRAPE, ["atrap", "recep", "coger", "recibir", "guante"]),
    (SALTO_UNIPODAL, ["pata sola", "salto unipodal", "unipodal", "un solo pie", "un pie", "cojito"]),
    (SALTO_HORIZONTAL, ["salto horizontal", "salto largo", "saltar", "brinc", "salto"]),
    (MARCHA, ["marcha", "caminar", "paso", "caminata"]),
    (CARRERA, ["corre", "carrera", "sprint", "velocidad", "trote"]),
]


def clasificar_por_texto(texto: Optional[str]) -> Optional[str]:
    if not texto or not isinstance(texto, str):
        return None
    txt = texto.lower()
    for habilidad, palabras in PALABRAS_CLAVE:
        if any(p in txt for p in palabras):
            return habilidad
    return None


def puntuar(t: Dict[str, Any]) -> Dict[str, int]:
    s = {EQ_ESTATICO: 0, PATEAR: 0, LANZAMIENTO: 0, ATRAPE: 0, SALTO_HORIZONTAL: 0,
         SALTO_UNIPODAL: 0, EQ_DINAMICO: 0, MARCHA: 0, CARRERA: 0}
    maintained = t.get("unipodalMaintainedFrames") or 0
    raised = t.get("unipodalRaisedFrames") or 0
    hold_ratio = t["unipodalHoldRatio"]
    bipodal = t.get("bipodalFlightDetected")

    # A. Equilibrio estático unipodal
    if t["unipodalHoldFrames"] >= 2 or hold_ratio >= 0.25:
        s[EQ_ESTATICO] += 200
    if t["avgKneeDiff"] >= 15:
        s[EQ_ESTATICO] += 60
    if t["avgAnkleYDiff"] >= 0.035 or t["maxAnkleYDiff"] >= 0.04:
        s[EQ_ESTATICO] += 70
    if not bipodal:
        s[EQ_ESTATICO] += 60
    if t["hipDisplacement"] <= 0.08:
        s[EQ_ESTATICO] += 100
    if maintained >= 1 or (raised >= 2 and (t.get("avgShoulderTilt") or 0) <= 10.0):
        s[EQ_ESTATICO] += 160

    # B. Patear (golpeo transitorio con apoyo en el suelo)
    if hold_ratio < 0.45 and not bipodal and maintained < 2:
        if t["transientKickPeak"]:
            s[PATEAR] += 150
        if t["hasStraddleKickFrame"]:
            s[PATEAR] += 90
        if t["maxAnkleXDiff"] >= 0.14:
            s[PATEAR] += 50
        if t["maxAnkleYDiff"] >= 0.05:
            s[PATEAR] += 40
        if t["maxHipAngle"] >= 18 or t["maxHipDiff"] >= 15:
            s[PATEAR] += 35
        if t.get("rapidKneeDelta", 0) >= 14:
            s[PATEAR] += 25
        if not t["maxWristAboveShoulder"]:
            s[PATEAR] += 25
        if t["minWristDist"] > 0.18:
            s[PATEAR] += 20
    if bipodal:
        s[PATEAR] -= 300
    if maintained >= 2:
        s[PATEAR] -= 200

    # C. Lanzamiento sobre hombro (sin patrón de locomoción)
    locomocion = t["maxHipAngle"] >= 26 or t["maxAnkleXDiff"] >= 0.11 or t["flightDetected"]
    if t["maxWristAboveShoulder"] and not locomocion and t["maxElbowDiff"] >= 26:
        s[LANZAMIENTO] += 150
        if t["maxElbowAngle"] >= 135:
            s[LANZAMIENTO] += 35
        if t["maxHipAngle"] >= 18:
            s[LANZAMIENTO] += 20

    # D. Recepción y atrape
    if t["minWristDist"] <= 0.26:
        s[ATRAPE] += 160
    if 70 <= t["avgElbowAngle"] <= 130:
        s[ATRAPE] += 40
    if not t["maxWristAboveShoulder"] and t["avgKneeDiff"] < 25:
        s[ATRAPE] += 30

    # E. Salto horizontal (exige vuelo bipodal y traslación)
    if bipodal:
        s[SALTO_HORIZONTAL] += 220
    if t["hipDisplacement"] >= 0.12:
        s[SALTO_HORIZONTAL] += 120
    if t["minKneeAngle"] <= 135 and t["avgKneeDiff"] <= 18 and hold_ratio < 0.25:
        s[SALTO_HORIZONTAL] += 90
    if t["hipDisplacement"] < 0.08 and not bipodal:
        s[SALTO_HORIZONTAL] -= 350
    if hold_ratio >= 0.25 or t["unipodalHoldFrames"] >= 2 or raised >= 2:
        s[SALTO_HORIZONTAL] -= 350

    # F. Salto unipodal
    if t["flightDetected"] and t["avgAnkleYDiff"] >= 0.07:
        s[SALTO_UNIPODAL] += 150
    if t["flightDetected"] and t["maxKneeDiff"] >= 20:
        s[SALTO_UNIPODAL] += 35

    # G. Equilibrio dinámico
    if not t["flightDetected"] and t["ankleDistAvg"] <= 0.18 and t["avgTrunkAngle"] <= 8 and hold_ratio < 0.3:
        s[EQ_DINAMICO] += 120
    if t["minKneeAngle"] >= 120 and (t["minWristDist"] >= 0.45 or t["avgElbowAngle"] >= 105) and hold_ratio < 0.3:
        s[EQ_DINAMICO] += 35

    # H. Marcha
    if (not t["flightDetected"] and t["minKneeAngle"] >= 112 and t["avgTrunkAngle"] <= 9
            and hold_ratio < 0.3 and not t["transientKickPeak"]):
        s[MARCHA] += 110
    if not t["flightDetected"] and t["avgKneeDiff"] < 20 and t["avgAnkleYDiff"] < 0.04 and hold_ratio < 0.3:
        s[MARCHA] += 35

    # I. Carrera
    if t["maxHipAngle"] >= 24 or t["maxAnkleXDiff"] >= 0.10:
        s[CARRERA] += 130
    if t["minKneeAngle"] <= 124 and hold_ratio < 0.35:
        s[CARRERA] += 50
    if t["flightDetected"]:
        s[CARRERA] += 50
    if 65 <= t["avgElbowAngle"] <= 125 and hold_ratio < 0.35:
        s[CARRERA] += 30
    return s


def classify_skill(telemetria: Optional[Dict[str, Any]], texto: Optional[str] = "") -> str:
    por_texto = clasificar_por_texto(texto)
    if por_texto:
        return por_texto
    if not telemetria or not telemetria.get("hasLandmarks"):
        return CARRERA

    mejor, maximo = CARRERA, -1
    for habilidad, puntaje in puntuar(telemetria).items():
        if puntaje > maximo:
            mejor, maximo = habilidad, puntaje
    return mejor
