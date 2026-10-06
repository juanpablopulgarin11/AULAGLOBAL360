import pytest
from django.core.management import call_command


@pytest.fixture
def catalogo(db):
    call_command("cargar_catalogo", verbosity=0)


@pytest.fixture
def docente(db, django_user_model):
    return django_user_model.objects.create_user(username="profe", password="x-segura-123", first_name="Ana")
