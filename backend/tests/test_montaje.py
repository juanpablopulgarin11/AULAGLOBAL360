"""Montaje 3D de las sesiones: interpretación del texto de distribución del espacio y vista."""
import json
from pathlib import Path

import pytest
from django.urls import reverse

from apps.planeacion.montaje import _listas_tras_a, _norm, construir_escena
from apps.planeacion.servicios import preferencias, unidad_para_evaluacion

from tests.test_planeacion import evaluacion  # noqa: F401  (fixture)

PLANTILLAS = json.loads((Path(__file__).resolve().parents[2] / "docs/datos/plantillas_progresion.json").read_text(encoding="utf-8"))


def _todas():
    for habilidad, sesiones in PLANTILLAS["plantillas"].items():
        for s in sesiones:
            yield habilidad, s["orden"], s["distribucion"].replace("{materiales}", "Conos, Aros, Cuerdas, Balones, Colchonetas")


@pytest.mark.parametrize("habilidad,orden,texto", list(_todas()))
def test_cada_plantilla_tiene_un_montaje_reconocible(habilidad, orden, texto):
    e = construir_escena(texto, estudiantes=24, materiales=["Conos"], minutos_central=30)
    assert e["receta"] != "generica", texto
    assert e["area"]["ancho"] > 0 and e["area"]["largo"] > 0
    assert e["elementos"] and e["cotas"] and len(e["estudiantes"]) == 24
    pasos = len(e["pasos"])
    assert all(0 <= x["paso"] < pasos for x in e["elementos"] + e["cotas"] + e["estudiantes"] + [e["docente"]])
    json.dumps(e)


def test_lee_las_medidas_del_texto():
    assert _listas_tras_a(_norm("conos de meta a 5, 10 y 15 metros")) == [[5.0, 10.0, 15.0]]
    assert _listas_tras_a(_norm("aros colgados a 1.2m, 1.8m y 2.4m")) == [[1.2, 1.8, 2.4]]
    assert _listas_tras_a(_norm("mini-vallas distribuidas a 80 cm")) == [[0.8]]
    assert _listas_tras_a(_norm("a la altura de los ojos")) == []


def test_carriles_con_metas_y_medidas():
    e = construir_escena("Líneas de salida paralelas de 15 metros con conos de meta a 5, 10 y 15 metros.", estudiantes=20)
    assert e["receta"] == "carriles" and e["resumen"] == "4 carriles de 15 m"
    textos = {c["texto"] for c in e["cotas"]}
    assert {"5 m", "10 m", "15 m", "1,5 m"} <= textos
    assert "Organiza a los 20 estudiantes en 4 hileras (5 por grupo)." in e["pasos"]


def test_texto_editado_por_el_docente():
    e = construir_escena("Para saltar, poner dos cuerdas a 3 metros de distancia")
    assert e["receta"] == "objetos" and e["resumen"] == "2 cuerdas a 3 m"
    assert sum(x["tipo"] == "cuerda" for x in e["elementos"]) == 2 and "3 m" in {c["texto"] for c in e["cotas"]}
    e = construir_escena("5 aros separados 80 cm")
    assert e["receta"] == "objetos" and sum(x["tipo"] == "aro" for x in e["elementos"]) == 5
    e = construir_escena("Circuito de 6 estaciones", minutos_central=30)
    assert e["receta"] == "circuito" and e["resumen"] == "Circuito de 6 estaciones"
    assert any("cambio cada 5 min" in p for p in e["pasos"])
    e = construir_escena("Organizar el grupo libremente")
    assert e["receta"] == "generica" and e["avisos"]


def test_material_no_elegido_sugiere_sustituto():
    e = construir_escena("Hileras de 6 aros consecutivos y mini-vallas de espuma distribuidas a 80 cm.", materiales=["Conos"])
    aros = next(m for m in e["materiales"] if m["nombre"] == "Aros")
    assert aros["elegido"] is False and "tiza" in aros["sustituto"]


@pytest.mark.django_db
def test_vista_montaje(client, docente, evaluacion, django_user_model):  # noqa: F811
    ud = unidad_para_evaluacion(evaluacion, docente, preferencias(total_clases=4))
    client.force_login(docente)
    url = reverse("sesion_montaje", args=[ud.pk, 2])
    r = client.get(url)
    html = r.content.decode()
    assert r.status_code == 200 and 'id="escena-datos"' in html and "vendor/three/three.module.min.js" in html
    assert r.context["estudiantes"] == 24 and r.context["anterior"] == 1 and r.context["siguiente"] == 3
    assert client.get(url + "?estudiantes=12").context["estudiantes"] == 12
    assert reverse("sesion_montaje", args=[ud.pk, 1]) in client.get(reverse("unidad", args=[ud.pk])).content.decode()
    client.force_login(django_user_model.objects.create_user("intruso", password="x-segura-123"))
    assert client.get(url).status_code == 404
