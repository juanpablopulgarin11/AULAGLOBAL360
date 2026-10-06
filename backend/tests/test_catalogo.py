from io import StringIO

import pytest
from django.core.management import call_command

from apps.catalogo.models import CriterioHMB, Habilidad, PlantillaSesion
from biomecanica.reglas import REGLAS


@pytest.mark.django_db
def test_carga_completa_e_idempotente():
    salida = StringIO()
    call_command("cargar_catalogo", stdout=salida)
    call_command("cargar_catalogo", stdout=salida)
    assert Habilidad.objects.count() == 9
    assert CriterioHMB.objects.count() == 45
    assert PlantillaSesion.objects.count() == 36
    assert "Sin plantillas propias" in salida.getvalue()


@pytest.mark.django_db
def test_criterios_coinciden_con_el_motor(catalogo):
    for h in Habilidad.objects.prefetch_related("criterios"):
        regla = REGLAS[h.nombre]
        assert h.prueba_nro == regla.prueba_nro
        assert h.componente_etiqueta == regla.componente
        assert [c.texto for c in h.criterios.all()] == [c.texto for c in regla.criterios]


@pytest.mark.django_db
def test_plantillas_ordenadas_por_fase(catalogo):
    carrera = Habilidad.objects.get(codigo="carrera")
    plantillas = list(carrera.plantillas.all())
    assert [p.orden for p in plantillas] == list(range(1, 13))
    assert plantillas[0].fase_pedagogica.startswith("Fase 1")
    assert plantillas[-1].fase_pedagogica.startswith("Fase 4")
    assert not Habilidad.objects.get(codigo="patear").tiene_plantillas_propias


@pytest.mark.django_db
def test_admin_carga(admin_client, catalogo):
    for url in ["/admin/", "/admin/catalogo/habilidad/", "/admin/catalogo/habilidad/1/change/",
                "/admin/evaluaciones/evaluacion/", "/admin/catalogo/plantillasesion/"]:
        assert admin_client.get(url).status_code == 200, url
