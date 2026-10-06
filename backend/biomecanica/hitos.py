"""Etiquetas visuales de cada fotograma: ángulo inicial, pico del gesto y cierre
(port de ``assignKeyframeMilestones``, ``script.js:2079``)."""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

from .clasificador import classify_skill
from .jsutil import js_str
from .telemetria import aggregate_video_telemetry

COLOR_INICIAL = "#0D9488"
COLOR_FINAL = "#6366F1"

# (titulo, desc, color) para el resto de fotogramas según su posición respecto al pico
Etiqueta = Tuple[str, str, str]


def _es_auto(habilidad: Optional[str]) -> bool:
    return not habilidad or habilidad in ("auto", "Detección Automática") or "Automática" in habilidad


def _validos(frames: List[Dict[str, Any]]) -> List[Tuple[int, Dict[str, Any]]]:
    return [(i, f["angles"]) for i, f in enumerate(frames) if f.get("angles") is not None]


def _argmax(items, score, excluir_extremos: bool, n: int) -> int:
    mejor, idx_mejor = -math.inf, -1
    for idx, a in items:
        if excluir_extremos and not (0 < idx < n - 1):
            continue
        s = score(a)
        if s > mejor:
            mejor, idx_mejor = s, idx
    return idx_mejor


def _etiquetar(f: Dict[str, Any], titulo: str, desc: str, color: str, badge: Optional[str] = None) -> None:
    f["milestoneTitle"], f["milestoneDesc"], f["milestoneColor"] = titulo, desc, color
    if badge:
        f["milestoneBadge"] = badge


def _inicial(f: Dict[str, Any], desc: str) -> None:
    _etiquetar(f, "🎯 Ángulo Inicial", desc, COLOR_INICIAL, "🎯 ÁNGULO INICIAL")


def _final(f: Dict[str, Any], badge: str, titulo: str, desc: str) -> None:
    f["isFinalMilestone"] = True
    _etiquetar(f, titulo, desc, COLOR_FINAL, badge)


def _pico(f: Dict[str, Any], badge: str, titulo: str, desc: str, color: str) -> None:
    f["isMilestonePeak"] = True
    _etiquetar(f, titulo, desc, color, badge)


def assign_keyframe_milestones(frames: List[Dict[str, Any]], habilidad: Optional[str] = None) -> List[Dict[str, Any]]:
    """Modifica ``frames`` en el sitio (como el JS) y los devuelve."""
    if not frames:
        return frames
    resuelta = habilidad
    if _es_auto(resuelta):
        resuelta = classify_skill(aggregate_video_telemetry(frames), "")
    s = (resuelta or "").lower()
    n = len(frames)

    for idx, f in enumerate(frames):
        f["isMilestonePeak"] = False
        f["isSubMilestone"] = False
        f["isFinalMilestone"] = False
        f["milestoneBadge"] = None
        f["milestoneTitle"] = f"Cuadro #{idx + 1}"
        f["milestoneDesc"] = f.get("phase") or f"Cinemática en {f.get('time')}"
        f["milestoneColor"] = "#64748B"

    validos = _validos(frames)

    if "pate" in s:
        def kick(a):
            return ((a.get("ankleXDiff") or 0) * 1.6 + (0.08 if a.get("isLegStraddle") else 0)
                    + ((a.get("kneeDiff") or 0) / 180) * 0.3 + (a.get("ankleYDiff") or 0) * 0.4)
        pico = _argmax(validos, kick, False, n)
        if pico == -1:
            pico = min(n - 2, max(1, math.floor(n * 0.55)))
        for idx, f in enumerate(frames):
            if idx == 0:
                _inicial(f, "Aproximación y orientación al balón")
            elif idx == n - 1:
                _final(f, "🏁 RECOBRO Y DESACELERACIÓN", "🏁 Recobro y Desaceleración", "Apoyo bipodal y desaceleración post-impacto")
            elif idx == pico:
                _pico(f, "⚽ PATEADA EVIDENCIADA", "⚽ Pateada Evidenciada", "Impacto al balón / Máx. péndulo", "#F59E0B")
            elif idx < pico:
                _etiquetar(f, "Apoyo y Carga", "Pie de apoyo firme y pierna atrás", "#3B82F6")
            else:
                _etiquetar(f, "Acompañamiento y Salida", "Seguimiento del miembro ejecutor", "#8B5CF6")

    elif "salto horizontal" in s or ("salto" in s and "unipodal" not in s):
        pico = _argmax(validos, lambda a: -((a["lAnkleY"] + a["rAnkleY"]) / 2), True, n)
        if pico == -1:
            pico = math.floor(n * 0.45)
        aterrizaje, min_knee = -1, math.inf
        for i in range(pico + 1, n - 1):
            a = frames[i].get("angles")
            if a and a["kneeMin"] < min_knee:
                min_knee, aterrizaje = a["kneeMin"], i
        if aterrizaje == -1:
            aterrizaje = min(n - 2, pico + 1)
        for idx, f in enumerate(frames):
            if idx == 0:
                _inicial(f, "Flexión preparatoria bípode")
            elif idx == n - 1:
                _final(f, "🏁 FRENADO Y CONTROL", "🏁 Frenado y Control Estático", "Amortiguación bipodal y equilibrio final")
            elif idx == pico:
                _pico(f, "🦘 VUELO EVIDENCIADO", "🦘 Vuelo Bipodal Evidenciado", "Ápice aéreo / Ambos pies en el aire", "#38BDF8")
            elif idx == aterrizaje:
                f["isSubMilestone"] = True
                _etiquetar(f, "🦿 Aterrizaje Evidenciado", "Contacto simultáneo de ambos pies", "#10B981", "🦿 ATERRIZAJE")
            elif idx < pico:
                _etiquetar(f, "Propulsión e Impulso", "Extensión triple de tobillo, rodilla y cadera", "#3B82F6")
            elif idx < aterrizaje:
                _etiquetar(f, "Descenso Aéreo", "Extensión preparatoria para el suelo", "#0284C7")
            else:
                _etiquetar(f, "Amortiguación Post-Contacto", "Flexión reactiva de rodillas y caderas", "#475569")

    elif "corre" in s or "carrera" in s:
        pico = _argmax(validos, lambda a: (a.get("hipAngle") or 0) + (a.get("ankleXDiff") or 0) * 130, False, n)
        if pico == -1:
            pico = math.floor(n * 0.5)
        for idx, f in enumerate(frames):
            if idx == 0:
                _inicial(f, "Inicio de tracción sagital")
            elif idx == n - 1:
                _final(f, "🏁 FASE DE DESACELERACIÓN", "🏁 Fase de Desaceleración", "Disminución de cadencia y control postural")
            elif idx == pico:
                _pico(f, "🏃 ZANCADA EVIDENCIADA", "🏃 Zancada y Vuelo Evidenciado", "Máx. amplitud sagital y suspensión", "#10B981")
            elif idx % 2 == 0:
                _etiquetar(f, "Apoyo y Propulsión", "Contacto metatarsiano y empuje", "#0284C7")
            else:
                _etiquetar(f, "Recobro Aéreo", "Elevación de rodilla libre", "#3B82F6")

    elif "lanz" in s or "arroja" in s or "hombro" in s:
        def throw(a):
            return (60 if a.get("wristAboveShoulder") else 0) + (a.get("elbowMax") or 0) + a["elbowDiff"] * 0.5
        pico = _argmax(validos, throw, True, n)
        if pico == -1:
            pico = math.floor(n * 0.55)
        for idx, f in enumerate(frames):
            if idx == 0:
                _inicial(f, "Armado detrás de la cabeza")
            elif idx == n - 1:
                _final(f, "🏁 SEGUIMIENTO FINAL", "🏁 Seguimiento y Frenado", "Acompañamiento del brazo y balance de salida")
            elif idx == pico:
                _pico(f, "⚾ LANZAMIENTO EVIDENCIADO", "⚾ Lanzamiento Evidenciado", "Soltada / Máx. extensión de brazo", "#F43F5E")
            elif idx < pico:
                _etiquetar(f, "Carga y Aceleración", "Rotación de tronco y palanca escapular", "#3B82F6")
            else:
                _etiquetar(f, "Desaceleración de Brazo", "El brazo cruza diagonalmente el torso", "#8B5CF6")

    elif "atrap" in s or "recep" in s:
        pico = _argmax(validos, lambda a: -a["wristDist"], False, n)
        if pico == -1:
            pico = math.floor(n * 0.55)
        for idx, f in enumerate(frames):
            if idx == 0:
                _inicial(f, "Brazos al frente en espera")
            elif idx == n - 1:
                _final(f, "🏁 CONTROL ESTABLE", "🏁 Control y Retención Estable", "Móvil asegurado contra el pecho y equilibrio")
            elif idx == pico:
                _pico(f, "🧤 ATRAPE EVIDENCIADO", "🧤 Atrape Evidenciado", "Contacto y manos en copa", "#8B5CF6")
            elif idx < pico:
                _etiquetar(f, "Seguimiento Visual", "Alineación de manos con la trayectoria", "#3B82F6")
            else:
                _etiquetar(f, "Absorción del Impacto", "Flexión de codos hacia el cuerpo", "#0284C7")

    elif "unipodal" in s and "salto" in s:
        pico = _argmax(validos, lambda a: a["ankleYDiff"] * 120 + a["kneeDiff"] * 0.6, True, n)
        if pico == -1:
            pico = math.floor(n * 0.5)
        for idx, f in enumerate(frames):
            if idx == 0:
                _inicial(f, "Flexión unipodal preparatoria")
            elif idx == n - 1:
                _final(f, "🏁 ESTABILIZACIÓN FINAL", "🏁 Estabilización Unipodal", "Apoyo final y control de balance")
            elif idx == pico:
                _pico(f, "🦿 DESPEGUE UNIPODAL", "🦿 Despegue Unipodal Evidenciado", "Suspensión sobre un solo pie", "#EC4899")
            elif idx < pico:
                _etiquetar(f, "Impulso Unipodal", "Empuje con pierna de apoyo", "#3B82F6")
            else:
                _etiquetar(f, "Amortiguación Unipodal", "Aterrizaje sobre el mismo pie", "#10B981")

    elif "estatico" in s or "estático" in s or "flamenco" in s:
        def hold(a):
            bonus = 50 if a.get("unipodalMaintained") else (20 if a.get("unipodalFootRaised") else 0)
            return a["kneeDiff"] * 0.8 + a["ankleYDiff"] * 140 + bonus - (a.get("shoulderTilt") or 0) * 1.5
        pico = _argmax(validos, hold, False, n)
        if pico == -1:
            pico = math.floor(n * 0.5)
        for idx, f in enumerate(frames):
            if idx == 0:
                _inicial(f, "Elevación de pierna libre")
            elif idx == n - 1:
                _final(f, "🏁 MANTENIMIENTO FINAL", "🏁 Cierre y Retorno Bipodal", "Estabilidad sostenida y descenso controlado")
            elif idx == pico:
                a = f.get("angles")
                tilt = f" (inclinación: {js_str(a['shoulderTilt'])}°)" if a and a.get("shoulderTilt") is not None else ""
                _pico(f, "🦩 SOSTÉN EVIDENCIADO", "🦩 Sostén Unipodal Evidenciado", f"Estabilidad estática en un pie{tilt}", "#06B6D4")
            else:
                _etiquetar(f, "Ajuste Postural", "Brazos equilibradores y control", "#0284C7")

    elif "dinamico" in s or "dinámico" in s or "linea" in s or "viga" in s:
        medio = math.floor(n * 0.5)
        for idx, f in enumerate(frames):
            if idx == 0:
                _inicial(f, "Inicio de alineación sobre eje")
            elif idx == n - 1:
                _final(f, "🏁 LLEGADA Y DETENCIÓN", "🏁 Detención y Equilibrio", "Parada estable al final de la trayectoria")
            elif idx == medio:
                _pico(f, "🧘 PASAJE EN LÍNEA", "🧘 Pasaje en Línea Evidenciado", "Apoyo tándem con brazos en cruz", "#14B8A6")
            else:
                _etiquetar(f, "Desplazamiento Guiado", "Avance controlado sin salirse", "#0284C7")

    else:  # Marcha o predeterminado
        medio = math.floor(n * 0.5)
        for idx, f in enumerate(frames):
            if idx == 0:
                _inicial(f, "Inicio del paso / despegue")
            elif idx == n - 1:
                _final(f, "🏁 APOYO Y FRENADO", "🏁 Apoyo Final y Frenado", "Cierre del ciclo de paso y postura erguida")
            elif idx == medio:
                _pico(f, "🚶 PASAJE EVIDENCIADO", "🚶 Contacto y Pasaje Evidenciado", "Apoyo de talón y braceo alterno", "#6366F1")
            else:
                _etiquetar(f, "Fase de Apoyo / Oscilación", "Transición fluida del paso", "#0284C7")

    if n > 1:
        ultimo = frames[-1]
        ultimo["isFinalMilestone"] = True
        if not ultimo.get("milestoneBadge"):
            ultimo["milestoneBadge"] = "🏁 FASE FINAL"
            ultimo["milestoneTitle"] = "🏁 Fase Final y Cierre"
            ultimo["milestoneColor"] = COLOR_FINAL
    return frames
