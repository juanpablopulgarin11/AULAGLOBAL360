"""Paridad JS → Python.

``golden/dorados.json`` se genera ejecutando el ``script.js`` real (ver ``generar_dorados.js``).
Cada salida de Python debe coincidir con la del navegador: enteros y textos exactos, flotantes
con tolerancia mínima (``Math.hypot``/``acos`` de V8 y de libm pueden diferir en el último bit).
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from biomecanica import (
    aggregate_video_telemetry, assign_keyframe_milestones, check_exercise_trigger_pose, classify_skill,
    compute_joint_angles, ejecutar_fsm, run_local_engine,
)
from biomecanica.geometria import angulo_2d, calculate_angle_3d, inclinacion_horizontal
from biomecanica.landmarks import a_punto
from biomecanica.motor_local import SinPersonaDetectada

DORADOS = json.loads((Path(__file__).parent / "golden" / "dorados.json").read_text(encoding="utf-8"))
CASOS = DORADOS["casos"]
CAMPOS_HITO = ["isMilestonePeak", "isSubMilestone", "isFinalMilestone", "milestoneBadge",
               "milestoneTitle", "milestoneDesc", "milestoneColor"]


def igual(py, js, ruta="$"):
    """Comparación profunda; devuelve la ruta de la primera diferencia o None."""
    if isinstance(js, bool) or isinstance(py, bool):
        return None if py is js or py == js and type(py) is type(js) else f"{ruta}: {py!r} != {js!r}"
    if isinstance(js, (int, float)) and isinstance(py, (int, float)):
        return None if math.isclose(py, js, rel_tol=1e-12, abs_tol=1e-12) else f"{ruta}: {py!r} != {js!r}"
    if isinstance(js, dict) and isinstance(py, dict):
        if set(js) != set(py):
            return f"{ruta}: claves distintas, solo JS={sorted(set(js) - set(py))}, solo Py={sorted(set(py) - set(js))}"
        for k in js:
            d = igual(py[k], js[k], f"{ruta}.{k}")
            if d:
                return d
        return None
    if isinstance(js, list) and isinstance(py, list):
        if len(js) != len(py):
            return f"{ruta}: longitudes {len(py)} != {len(js)}"
        for i, (a, b) in enumerate(zip(py, js)):
            d = igual(a, b, f"{ruta}[{i}]")
            if d:
                return d
        return None
    return None if py == js else f"{ruta}: {py!r} != {js!r}"


def construir_frames(caso):
    frames = []
    for idx, f in enumerate(caso["frames"]):
        frames.append({
            "time": f"{f['timestampNum']:.2f}s",
            "timestampNum": f["timestampNum"],
            "phase": f"Fase {idx + 1}",
            "landmarks": f["landmarks"],
            "angles": compute_joint_angles(f["landmarks"]),
        })
    return frames


@pytest.mark.parametrize("g", DORADOS["geometria"], ids=lambda g: "geo")
def test_geometria(g):
    a, b, c = a_punto(g["a"]), a_punto(g["b"]), a_punto(g["c"])
    assert calculate_angle_3d(a, b, c) == g["angle3d"]
    assert angulo_2d(a, b, c) == g["angle2d"]
    assert math.isclose(inclinacion_horizontal(a, b), g["inclinacion"], abs_tol=1e-9)


@pytest.mark.parametrize("caso", CASOS, ids=lambda c: c["nombre"])
def test_angulos_y_gatillos(caso):
    frames = construir_frames(caso)
    assert igual([f["angles"] for f in frames], caso["salida"]["angulos"]) is None

    prev, gatillos = None, []
    for f in frames:
        if not f["angles"]:
            gatillos.append(None)
            continue
        gatillos.append(check_exercise_trigger_pose(f["angles"], prev))
        prev = f["angles"]
    assert igual(gatillos, caso["salida"]["gatillos"]) is None


@pytest.mark.parametrize("caso", CASOS, ids=lambda c: c["nombre"])
def test_telemetria_y_clasificacion(caso):
    frames = construir_frames(caso)
    tel = aggregate_video_telemetry(frames)
    assert igual(tel, caso["salida"]["telemetria"]) is None
    for texto, esperado in caso["salida"]["clasificacion"].items():
        assert classify_skill(tel, texto) == esperado, texto


@pytest.mark.parametrize("caso", CASOS, ids=lambda c: c["nombre"])
def test_fsm(caso):
    frames = construir_frames(caso)
    for habilidad, esperado in caso["salida"]["fsm"].items():
        assert igual(ejecutar_fsm(frames, habilidad).to_dict(), esperado, habilidad) is None


@pytest.mark.parametrize("caso", CASOS, ids=lambda c: c["nombre"])
def test_hitos(caso):
    for habilidad, esperado in caso["salida"]["hitos"].items():
        frames = construir_frames(caso)
        assign_keyframe_milestones(frames, None if habilidad == "auto" else habilidad)
        obtenido = [{k: f[k] for k in CAMPOS_HITO} for f in frames]
        assert igual(obtenido, esperado, habilidad) is None


@pytest.mark.parametrize("caso", CASOS, ids=lambda c: c["nombre"])
def test_motor_local(caso):
    for m in caso["salida"]["motor"]:
        e = m["entrada"]
        frames = construir_frames(caso)
        if "error" in m:
            with pytest.raises(SinPersonaDetectada) as exc:
                run_local_engine(e["codigo"], e["grado"], e["obs"], frames)
            assert str(exc.value) == m["error"]
            continue
        d = run_local_engine(e["codigo"], e["grado"], e["obs"], frames)
        fsm = d["telemetria_medida"].pop("fsm")
        assert igual(d, m["diagnostico"], str(e)) is None
        assert igual(fsm, m["fsm"], "fsm") is None
