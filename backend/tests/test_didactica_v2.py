"""Unidad didáctica personalizada: banco propio por habilidad y refuerzos por criterios no logrados."""
import json
from collections import Counter
from pathlib import Path

import pytest
from django.urls import reverse

from apps.planeacion.montaje import construir_escena
from apps.planeacion.servicios import preferencias, unidad_para_evaluacion
from apps.reportes.servicios import documento_de_unidad
from biomecanica.didactica_v2 import PERFILES, criterios_de, generar_unidad
from biomecanica.reglas import REGLAS

from tests.test_planeacion import _texto, evaluacion  # noqa: F401  (fixture)

BANCO = json.loads((Path(__file__).resolve().parents[2] / "docs/datos/plantillas_progresion.json")
                   .read_text(encoding="utf-8"))["plantillas"]


def _diag(habilidad, puntajes, **extra):
    base = criterios_de(habilidad)
    return {"habilidad_detectada": habilidad, **extra,
            "criterios": [{"orden": c["orden"], "criterio": c["texto"], "fase": c["fase"], "puntaje": p}
                          for c, p in zip(base, puntajes)]}


@pytest.mark.parametrize("habilidad", list(REGLAS))
def test_cada_habilidad_usa_su_propio_banco(habilidad):
    u = generar_unidad(_diag(habilidad, [1] * 5), {"totalClasses": "12"}, BANCO)
    titulos = [s["titulo"] for s in u["clases_secuencia"]]
    assert titulos == [p["titulo"] for p in BANCO[habilidad]]
    assert u["pregunta_problematizadora"] == PERFILES[habilidad]["pregunta"]
    assert u["tarea_extracurricular"] == PERFILES[habilidad]["tarea"]
    assert u["retroalimentacion_tips"] == list(REGLAS[habilidad].frases)
    assert f"prueba {REGLAS[habilidad].prueba_nro}" in u["tema"]
    assert not any(s["es_refuerzo"] for s in u["clases_secuencia"])
    assert all(s["criterios"] and s["fuente"] for s in u["clases_secuencia"])


@pytest.mark.parametrize("habilidad", list(REGLAS))
def test_los_montajes_3d_no_se_repiten_dentro_de_una_habilidad(habilidad):
    recetas = Counter(construir_escena(p["distribucion"].replace("{materiales}", "Conos, Aros"), estudiantes=24)["receta"]
                      for p in BANCO[habilidad])
    if habilidad in ("Carrera", "Salto Horizontal", "Lanzamiento Sobre Hombro"):
        return                                   # bancos de la web: se conservan tal cual (algunas recetas con variantes)
    assert max(recetas.values()) == 1, recetas


def test_refuerza_los_criterios_no_logrados_en_orden():
    u = generar_unidad(_diag("Patear", [1, 0, 1, 0, None], estadio_gallahue="Elemental", porcentaje_madurez=50,
                             puntaje_obtenido="2/4 · 1 por confirmar"), {"totalClasses": "12"}, BANCO)
    s = u["clases_secuencia"]
    assert s[0]["orden_plantilla"] == 1 and not s[0]["es_refuerzo"]
    base = criterios_de("Patear")
    assert [x["es_refuerzo"] for x in s[:4]] == [False, True, True, False]
    assert base[1]["error"] in s[1]["error_reforzado"] and 2 in [c["orden"] for c in s[1]["criterios"] if c["reforzado"]]
    assert base[3]["error"] in s[2]["error_reforzado"] and 4 in [c["orden"] for c in s[2]["criterios"] if c["reforzado"]]
    assert sorted(x["orden_plantilla"] for x in s) == list(range(1, 13))       # las 12 sesiones, sin repetir
    d = u["diagnostico_base"]
    assert d["por_mejorar"] == [base[1]["texto"], base[3]["texto"]] and d["por_confirmar"] == [base[4]["texto"]]
    assert d["estadio"] == "Elemental" and d["porcentaje"] == 50
    assert any(base[1]["texto"].rstrip(".") in o for o in u["objetivos_especificos"])
    assert all(f"{c['orden']}) " in u["evaluacion"] for c in base)


def test_plan_del_salon_refuerza_los_errores_mas_frecuentes():
    base = criterios_de("Marcha")
    diag = {"habilidad_detectada": "Marcha", "criterios": [],
            "errores_criticos": [{"error": base[4]["error"]}, {"error": base[0]["error"]}, {"error": "otro texto"}]}
    u = generar_unidad(diag, {"totalClasses": "12"}, BANCO, es_grupal=True, priorizar=True)
    refuerzos = [x for x in u["clases_secuencia"] if x["es_refuerzo"]]
    assert [base[4]["error"] in refuerzos[0]["error_reforzado"], base[0]["error"] in refuerzos[1]["error_reforzado"]] == [True, True]
    assert u["grado"] == "Salón Completo (Heterogéneo)" and u["diagnostico_base"]["fuente"] == "salón"


def test_mas_clases_que_sesiones_repite_sin_marcar_refuerzos():
    u = generar_unidad(_diag("Recepción y Atrape", [0, 0, 1, 1, 1]), {"totalClasses": "16"}, BANCO)
    s = u["clases_secuencia"]
    assert len(s) == 16 and sum(x["es_refuerzo"] for x in s) == 2 and not any(x["es_refuerzo"] for x in s[12:])


@pytest.mark.django_db
def test_unidad_guardada_muestra_punto_de_partida_y_criterios(client, evaluacion, docente):  # noqa: F811
    ud = unidad_para_evaluacion(evaluacion, docente, preferencias(total_clases=6))
    sesiones = list(ud.sesiones.all())
    assert all(s.criterios and s.fuente for s in sesiones)
    refuerzo = next(s for s in sesiones if s.es_refuerzo)
    assert any(c["reforzado"] for c in refuerzo.criterios_detalle)
    assert ud.contenido["diagnostico_base"]["por_mejorar"]

    client.force_login(docente)
    html = client.get(reverse("unidad", args=[ud.pk])).content.decode()
    assert "Punto de partida" in html and "Criterios HMB" in html and "Referente" in html
    contenido, _ = documento_de_unidad(ud)
    texto = _texto(contenido)
    assert "PUNTO DE PARTIDA" in texto.upper() and "CRITERIOS DE LA BATERÍA QUE TRABAJA" in texto and "← refuerzo" in texto
