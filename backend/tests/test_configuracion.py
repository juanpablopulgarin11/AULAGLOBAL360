"""«Configurar clase»: preferencias guardadas por docente que precargan evaluación, planeación y montaje."""
import pytest
from django.urls import reverse

from apps.ia import cliente as ia

from apps.estudiantes.models import Grupo
from apps.planeacion.models import UnidadDidactica

from tests.test_planeacion import evaluacion  # noqa: F401  (fixture)

CONFIG = {"grado": "9_11_anos", "estudiantes": 18, "formato": "Cuento Motor", "metodologia": "Descubrimiento Guiado",
          "periodo": 3, "duracion_min": 55, "total_clases": 4, "materiales": ["Conos", "Cuerdas"], "motor": "local"}


@pytest.mark.django_db
def test_guardar_configuracion_y_volver(client, catalogo, docente):
    client.force_login(docente)
    assert client.get(reverse("configurar_clase")).status_code == 200
    r = client.post(reverse("configurar_clase"), {**CONFIG, "siguiente": "/evaluar/"})
    assert r.status_code == 302 and r["Location"] == "/evaluar/"
    docente.refresh_from_db()
    assert docente.configuracion_clase == CONFIG
    assert client.get(reverse("evaluar")).context["form"]["grado"].value() == "9_11_anos"
    r = client.post(reverse("configurar_clase"), {**CONFIG, "siguiente": "https://otro.sitio/"})
    assert r["Location"] == reverse("panel")


@pytest.mark.django_db
def test_configuracion_precarga_planeacion_y_montaje(client, catalogo, docente, evaluacion):  # noqa: F811
    docente.configuracion_clase = CONFIG
    docente.save()
    client.force_login(docente)
    form = client.get(reverse("evaluacion", args=[evaluacion.pk])).context["form_unidad"]
    assert form["formato"].value() == "Cuento Motor" and form["materiales"].value() == ["Conos", "Cuerdas"]
    assert form["total_clases"].value() == 4

    client.post(reverse("unidad_crear", args=[evaluacion.pk]), {**CONFIG, "total_clases": 2, "materiales": ["Aros"]})
    ud = UnidadDidactica.objects.get()
    docente.refresh_from_db()
    assert docente.configuracion_clase["total_clases"] == 2 and docente.configuracion_clase["materiales"] == ["Aros"]
    assert docente.configuracion_clase["estudiantes"] == 18      # no lo pisa la planeación
    # el salón de la evaluación tiene 1 estudiante registrado: el montaje usa los de la configuración
    assert client.get(reverse("sesion_montaje", args=[ud.pk, 1])).context["estudiantes"] == 18


@pytest.mark.django_db
def test_evaluacion_grupal_usa_estudiantes_configurados(client, catalogo, docente):
    docente.configuracion_clase = CONFIG
    docente.save()
    client.force_login(docente)
    client.post(reverse("grupos"), {"nombre": "4ºA", "grado": "9_11_anos", "anio": 2026})
    grupo = Grupo.objects.get()
    assert client.get(reverse("grupo", args=[grupo.pk])).context["form_grupal"]["estudiantes_objetivo"].value() == 18


@pytest.mark.django_db
def test_panel_lateral_en_todas_las_paginas_y_guardado_al_instante(client, catalogo, docente):
    client.force_login(docente)
    html = client.get(reverse("panel")).content.decode()
    assert 'id="configDrawer"' in html and "Materiales disponibles" in html and "Modo de evaluación" in html
    assert html.count('class="engine-toggle"') == 1
    html = client.get(reverse("evaluar")).content.decode()
    assert 'id="config_grado"' in html and 'id="wizardStep1"' in html and 'class="skill-card skill-card--auto active"' in html
    r = client.post(reverse("configurar_clase"), CONFIG, HTTP_X_REQUESTED_WITH="fetch")
    assert r.json() == {"ok": True}
    r = client.post(reverse("configurar_clase"), {**CONFIG, "estudiantes": 0}, HTTP_X_REQUESTED_WITH="fetch")
    assert r.status_code == 400 and "estudiantes" in r.json()["errores"]


@pytest.mark.django_db
def test_selector_de_motor(client, catalogo, docente, settings):
    settings.GEMINI_API_KEY = ""
    client.force_login(docente)
    r = client.post(reverse("elegir_motor"), {"motor": "gemini", "siguiente": "/evaluar/"})
    assert r["Location"] == "/evaluar/"
    docente.refresh_from_db()
    assert docente.configuracion_clase["motor"] == "gemini"
    # sin clave el formulario de evaluar solo ofrece el motor local
    assert client.get(reverse("evaluar")).context["form"]["motor"].value() == "local"
    settings.GEMINI_API_KEY = "clave-servidor"
    assert client.get(reverse("evaluar")).context["form"]["motor"].value() == "gemini"


class _Modelos:
    def __init__(self, nombres):
        from types import SimpleNamespace
        self.models = SimpleNamespace(list=lambda: [SimpleNamespace(name=f"models/{n}", display_name=n.title(),
                                                                    supported_actions=["generateContent"]) for n in nombres])


@pytest.mark.django_db
def test_conectar_clave_de_gemini_y_elegir_modelo(client, catalogo, docente, monkeypatch, settings):
    settings.GEMINI_API_KEY = ""
    monkeypatch.setattr(ia, "crear_cliente", lambda clave=None: _Modelos(["gemini-2.5-flash", "gemini-2.5-pro", "text-embedding-004"]))
    client.force_login(docente)
    r = client.post(reverse("configurar_gemini"), {"accion": "conectar", "clave": "AIzaSyPRUEBA-1234567890"},
                    HTTP_X_REQUESTED_WITH="fetch")
    assert r.json()["ok"] and r.json()["clave"] == "AIzaSy••••7890"
    docente.refresh_from_db()
    assert docente.gemini_clave == "AIzaSyPRUEBA-1234567890" and docente.configuracion_clase["motor"] == "gemini"
    assert "AIzaSyPRUEBA-1234567890" not in client.get(reverse("panel")).content.decode()   # la clave nunca vuelve al navegador

    modelos = client.get(reverse("modelos_gemini") + "?refrescar=1").json()["modelos"]
    assert [m["id"] for m in modelos] == ["gemini-2.5-flash", "gemini-2.5-pro"]
    client.post(reverse("configurar_gemini"), {"accion": "modelo", "modelo": "gemini-2.5-pro"})
    docente.refresh_from_db()
    assert docente.gemini_modelo == "gemini-2.5-pro"

    client.post(reverse("configurar_gemini"), {"accion": "desconectar"})
    docente.refresh_from_db()
    assert docente.gemini_clave == "" and docente.gemini_modelo == ""


@pytest.mark.django_db
def test_clave_rechazada_no_se_guarda(client, catalogo, docente, monkeypatch):
    def rechazar(clave=None):
        raise RuntimeError("API key not valid")
    monkeypatch.setattr(ia, "crear_cliente", rechazar)
    client.force_login(docente)
    r = client.post(reverse("configurar_gemini"), {"accion": "conectar", "clave": "mala"}, HTTP_X_REQUESTED_WITH="fetch")
    assert r.status_code == 400 and "no aceptó" in r.json()["error"]
    docente.refresh_from_db()
    assert docente.gemini_clave_cifrada == ""


@pytest.mark.django_db
def test_resultado_muestra_el_plan_con_la_configuracion(client, catalogo, docente, evaluacion):  # noqa: F811
    docente.configuracion_clase = CONFIG
    docente.save()
    client.force_login(docente)
    r = client.get(reverse("evaluacion", args=[evaluacion.pk]))
    plan = r.context["plan"]
    assert int(plan["total_clases"]) == 4 and plan["formato"] == "Cuento Motor" and len(plan["clases_secuencia"]) == 4
    assert "Unidad didáctica institucional" in r.content.decode() and not UnidadDidactica.objects.exists()


@pytest.mark.django_db
def test_guardar_el_plan_de_la_vista_previa(client, catalogo, docente, evaluacion):  # noqa: F811
    docente.configuracion_clase = CONFIG
    docente.save()
    client.force_login(docente)
    html = client.get(reverse("evaluacion", args=[evaluacion.pk])).content.decode()
    import re
    form = re.search(r'<form method="post" action="(/evaluaciones/\d+/unidad/)" class="plan-acciones">(.*?)</form>', html, re.S)
    datos = {}
    for nombre, valor in re.findall(r'<input type="hidden" name="(\w+)" value="([^"]*)">', form.group(2)):
        datos.setdefault(nombre, []).append(valor)
    r = client.post(form.group(1), {**datos, "descargar": "1"})
    ud = UnidadDidactica.objects.get()
    assert r["Location"] == reverse("unidad", args=[ud.pk]) + "?descargar=1"   # la página arma el Word con las fotos 3D
    client.post(form.group(1), datos)
    assert UnidadDidactica.objects.count() == 1                            # mismas preferencias: no se duplica
    assert ud.total_clases == 4 and ud.formato == "Cuento Motor" and ud.materiales == ["Conos", "Cuerdas"]
