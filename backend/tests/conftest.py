import pytest
from django.core.management import call_command


@pytest.fixture
def catalogo(db):
    call_command("cargar_catalogo", verbosity=0)


@pytest.fixture
def docente(db, django_user_model):
    return django_user_model.objects.create_user(username="profe", password="x-segura-123", first_name="Ana")


@pytest.fixture(scope="session", autouse=True)
def limpiar_almacenamiento_privado():
    """Las pruebas escriben videos e imágenes en PRIVATE_MEDIA_ROOT (settings de test)."""
    import shutil

    from django.conf import settings

    yield
    shutil.rmtree(settings.PRIVATE_MEDIA_ROOT, ignore_errors=True)
