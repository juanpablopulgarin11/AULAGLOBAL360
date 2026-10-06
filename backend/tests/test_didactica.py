"""Paridad del generador de unidades didácticas con ``generateDidacticPlan`` del JS.

El JS mezcla HTML en las actividades (minutos, recuadro de refuerzo); aquí se desarma ese HTML
y se compara campo por campo con la salida estructurada de Python.
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

import pytest

from biomecanica.didactica import generar_unidad, tiempos_sesion

RAIZ = Path(__file__).resolve().parents[2]
BANCO = json.loads((RAIZ / "docs" / "datos" / "plantillas_progresion.json").read_text(encoding="utf-8"))["plantillas"]
DORADOS = json.loads((Path(__file__).parent / "golden" / "dorados.json").read_text(encoding="utf-8"))

PLANES = [(c["nombre"], m, p) for c in DORADOS["casos"] for m in c["salida"]["motor"] for p in m.get("planes", [])]

INICIAL = re.compile(r'^<strong>Activación \((\d+) min\):</strong>(?:<br>(?P<banner><div class="refuerzo-docente-box".*?</div>)?| )(?P<texto>.*)$', re.S)
ERROR_BANNER = re.compile(r'<em>"(.*?)"</em>', re.S)
FINAL = re.compile(r'^<strong>Vuelta a la calma \((\d+) min\):</strong> (?P<texto>.*)$', re.S)
CAMPOS_FIJOS = ["institucion", "area", "ciclo", "grado", "periodo", "total_clases", "docente", "jornada", "duracion_clase",
                "lugar", "tema", "skill", "formato", "metodologia", "materiales", "pregunta_problematizadora",
                "objetivo_general", "objetivos_especificos", "estandares", "lineamientos", "indicadores", "duraciones",
                "tarea_extracurricular", "evaluacion", "metodos_ensenanza", "estilo_ensenanza", "adaptaciones_piar",
                "reflexion_pedagogica", "retroalimentacion_tips", "bibliografia"]


@pytest.mark.parametrize("nombre,motor,plan", PLANES, ids=[f"{n}-{i}" for i, (n, _, _) in enumerate(PLANES)])
def test_paridad_unidad_didactica(nombre, motor, plan):
    js = plan["plan"]
    py = generar_unidad(motor["diagnostico"], plan["prefs"], BANCO, grado=motor["entrada"]["grado"],
                        es_grupal=plan.get("grupal", False), anio=int(js["anio"]))
    for campo in CAMPOS_FIJOS:
        assert py[campo] == js[campo], campo

    assert len(py["clases_secuencia"]) == len(js["clases_secuencia"])
    for s_py, s_js in zip(py["clases_secuencia"], js["clases_secuencia"]):
        assert s_py["numero"] == s_js["numero"]
        assert s_py["titulo_mostrado"] == s_js["titulo"]
        for campo in ("fase_pedagogica", "objetivo", "distribucion", "actividad_central", "consigna", "criterio_eval"):
            assert s_py[campo] == s_js[campo], campo

        ini = INICIAL.match(s_js["actividad_inicial"])
        assert ini, s_js["actividad_inicial"][:80]
        assert int(ini.group(1)) == s_py["minutos_inicial"]
        assert ini.group("texto") == s_py["actividad_inicial"]
        assert bool(ini.group("banner")) == s_py["es_refuerzo"]
        if ini.group("banner"):
            assert html.unescape(ERROR_BANNER.search(ini.group("banner")).group(1)) == s_py["error_reforzado"]

        fin = FINAL.match(s_js["actividad_final"])
        assert fin and int(fin.group(1)) == s_py["minutos_final"] and fin.group("texto") == s_py["actividad_final"]


@pytest.mark.parametrize("minutos,esperado", [(45, (9, 27, 9)), (50, (10, 30, 10)), (60, (12, 36, 12)), (20, (5, 10, 5))])
def test_tiempos(minutos, esperado):
    t = tiempos_sesion(minutos)
    assert (t["inicial"], t["central"], t["final"]) == esperado


def test_sin_falencias_sigue_el_orden_del_banco():
    diag = {"habilidad_detectada": "Salto Horizontal", "criterios": [{"criterio": "x", "puntaje": 1}],
            "errores_criticos": [{"error": "Sin fallos biomecánicos críticos"}]}
    u = generar_unidad(diag, {"totalClasses": "12"}, BANCO)
    assert [s["orden_plantilla"] for s in u["clases_secuencia"]] == list(range(1, 13))
    assert not any(s["es_refuerzo"] for s in u["clases_secuencia"])


def test_habilidad_sin_plantillas_usa_carrera():
    u = generar_unidad({"habilidad_detectada": "Patear"}, {"totalClasses": "2"}, BANCO)
    assert u["clases_secuencia"][0]["titulo"] == BANCO["Carrera"][0]["titulo"]
    assert "Patrón: Patear" in u["tema"]
