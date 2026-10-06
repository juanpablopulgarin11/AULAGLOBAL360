"""Pruebas de comportamiento legibles (complementan la paridad con el JS)."""
from __future__ import annotations

import pytest

from biomecanica import (
    REGLAS, HABILIDADES, compute_joint_angles, estadio_gallahue, grado_y_ciclo, resolver_habilidad,
    run_local_engine,
)
from biomecanica.geometria import calculate_angle_3d
from biomecanica.jsutil import js_round, js_str
from biomecanica.landmarks import Punto
from biomecanica.motor_local import SinPersonaDetectada


def pose_de_pie():
    p = [Punto(0.5, 0.15, 0.0) for _ in range(33)]
    coords = {11: (0.55, 0.30), 12: (0.45, 0.30), 13: (0.57, 0.42), 14: (0.43, 0.42), 15: (0.58, 0.53),
              16: (0.42, 0.53), 23: (0.53, 0.55), 24: (0.47, 0.55), 25: (0.53, 0.72), 26: (0.47, 0.72),
              27: (0.53, 0.90), 28: (0.47, 0.90)}
    for i, (x, y) in coords.items():
        p[i] = Punto(x, y, 0.0)
    return p


def test_redondeo_como_javascript():
    assert js_round(2.5) == 3 and js_round(-2.5) == -2 and js_round(0.49999) == 0
    assert js_str(3.0) == "3" and js_str(8.5) == "8.5" and js_str(True) == "true"


def test_angulo_recto_y_degenerado():
    assert calculate_angle_3d(Punto(1, 0, 0), Punto(0, 0, 0), Punto(0, 1, 0)) == 90
    assert calculate_angle_3d(Punto(0, 0), Punto(0, 0), Punto(1, 1)) == 180


def test_pierna_extendida_de_pie():
    a = compute_joint_angles(pose_de_pie())
    assert a["kneeMin"] == 180 and a["trunkLean"] == 0
    assert a["unipodalFootRaised"] is False and a["unipodalState"] == "BIPEDESTACIÓN"


def test_menos_de_33_landmarks():
    assert compute_joint_angles(pose_de_pie()[:20]) is None
    assert compute_joint_angles(None) is None


def test_sin_persona_no_inventa_diagnostico():
    frames = [{"timestampNum": 0.0, "landmarks": None, "angles": None}]
    with pytest.raises(SinPersonaDetectada):
        run_local_engine("carrera", "7_anos", "", frames)


def test_evaluacion_dirigida_respeta_habilidad():
    lm = pose_de_pie()
    frames = [{"timestampNum": k * 0.2, "landmarks": lm, "angles": compute_joint_angles(lm)} for k in range(8)]
    d = run_local_engine("equilibrio_estatico", "9_11_anos", "", frames)
    assert d["habilidad_detectada"] == "Equilibrio Estático Unipodal"
    assert d["es_deteccion_automatica"] is False
    assert d["edad_calibrada"] == "Grado 4º - 5º (9 a 11 años)"
    assert len(d["criterios"]) == 5
    assert d["puntaje_obtenido"] == f"{sum(c['puntaje'] for c in d['criterios'])}/5"


def test_palabras_clave_tienen_prioridad():
    lm = pose_de_pie()
    frames = [{"timestampNum": 0.0, "landmarks": lm, "angles": compute_joint_angles(lm)}]
    assert run_local_engine("auto", "7_anos", "salto largo", frames)["habilidad_detectada"] == "Salto Horizontal"


@pytest.mark.parametrize("pct,estadio", [(100, "Maduro"), (80, "Maduro"), (60, "Elemental"), (40, "Elemental"), (20, "Inicial")])
def test_estadios_gallahue(pct, estadio):
    assert estadio_gallahue(pct) == estadio


def test_catalogo_completo():
    assert set(REGLAS) == set(HABILIDADES)
    assert all(len(r.criterios) == 5 and r.puntaje_max == 5 for r in REGLAS.values())
    assert resolver_habilidad("auto") is None
    assert resolver_habilidad("lanzar_izquierda") == "Lanzamiento Sobre Hombro"
    assert grado_y_ciclo("desconocido")["grado"] == "Grado 3º de Primaria (8 años)"
