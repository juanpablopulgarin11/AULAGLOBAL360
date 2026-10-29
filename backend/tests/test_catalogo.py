from io import StringIO
from pathlib import Path

import pytest
from django.conf import settings
from django.core.management import call_command

from apps.catalogo.models import CriterioHMB, Habilidad, PlantillaSesion
from biomecanica.reglas import REGLAS


def test_datos_docker_sincronizados():
    """El directorio ``backend/datos/`` copiado por el Dockerfile debe coincidir con ``docs/datos/``."""
    datos_docker = Path(settings.BASE_DIR) / "datos"
    datos_docs = Path(settings.REPO_DIR) / "docs" / "datos"
    for nombre in ("plantillas_progresion.json", "bateria_hmb_reglas.json"):
        assert (datos_docker / nombre).read_text(encoding="utf-8") == (datos_docs / nombre).read_text(encoding="utf-8"), nombre


@pytest.mark.django_db
def test_carga_completa_e_idempotente():
    salida = StringIO()
    call_command("cargar_catalogo", stdout=salida)
    call_command("cargar_catalogo", stdout=salida)
    assert Habilidad.objects.count() == 9
    assert CriterioHMB.objects.count() == 45
    assert PlantillaSesion.objects.count() == 108                 # 12 sesiones por cada una de las 9 habilidades
    assert "Sin plantillas propias" not in salida.getvalue()


@pytest.mark.django_db
def test_criterios_coinciden_con_el_motor(catalogo):
    for h in Habilidad.objects.prefetch_related("criterios"):
        regla = REGLAS[h.nombre]
        assert h.prueba_nro == regla.prueba_nro
        assert h.componente_etiqueta == regla.componente
        assert [c.texto for c in h.criterios.all()] == [c.texto for c in regla.criterios]


@pytest.mark.django_db
def test_plantillas_ordenadas_por_fase(catalogo):
    for h in Habilidad.objects.all():
        plantillas = list(h.plantillas.all())
        assert [p.orden for p in plantillas] == list(range(1, 13)), h
        assert plantillas[0].fase_pedagogica.startswith("Fase 1")
        assert plantillas[-1].fase_pedagogica.startswith("Fase 4")
        assert all(p.criterios and set(p.criterios) <= {1, 2, 3, 4, 5} and p.fuente for p in plantillas), h
        # cada criterio de la batería se trabaja en al menos dos sesiones además del festival final
        assert all(sum(c in p.criterios for p in plantillas[:-1]) >= 2 for c in range(1, 6)), h


@pytest.mark.django_db
def test_admin_carga(admin_client, catalogo):
    for url in ["/admin/", "/admin/catalogo/habilidad/", "/admin/catalogo/habilidad/1/change/",
                "/admin/evaluaciones/evaluacion/", "/admin/catalogo/plantillasesion/"]:
        assert admin_client.get(url).status_code == 200, url
