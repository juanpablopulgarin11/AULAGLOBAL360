import pytest

from apps.catalogo.models import Habilidad
from apps.cuentas.models import Institucion
from apps.estudiantes.models import Estudiante, Grupo
from apps.evaluaciones.models import Evaluacion, EvaluacionGrupal
from apps.evaluaciones.servicios import consolidar_grupo, diagnosticar_y_guardar, habilidad_mas_debil
from biomecanica import VERSION_MOTOR


def pose(levantar_pie=False):
    coords = {11: (0.55, 0.30), 12: (0.45, 0.30), 13: (0.57, 0.42), 14: (0.43, 0.42), 15: (0.58, 0.53),
              16: (0.42, 0.53), 23: (0.53, 0.55), 24: (0.47, 0.55), 25: (0.53, 0.72), 26: (0.47, 0.72),
              27: (0.53, 0.90), 28: (0.47, 0.90)}
    if levantar_pie:
        coords[25], coords[27] = (0.56, 0.68), (0.55, 0.78)
    return [{"x": coords.get(i, (0.5, 0.15))[0], "y": coords.get(i, (0.5, 0.15))[1], "z": 0.0} for i in range(33)]


def muestras(levantar_pie=False, n=8):
    return [{"timestampNum": k * 0.2, "landmarks": pose(levantar_pie and k > 0)} for k in range(n)]


@pytest.fixture
def estudiante(docente):
    inst = Institucion.objects.create(nombre="IE Prueba")
    grupo = Grupo.objects.create(institucion=inst, docente=docente, nombre="2ºB", grado="7_anos", anio=2026)
    return Estudiante.objects.create(grupo=grupo, nombres="Luis", consentimiento_video=True)


@pytest.mark.django_db
def test_evaluacion_dirigida_se_guarda_completa(catalogo, docente, estudiante):
    ev = Evaluacion.objects.create(docente=docente, estudiante=estudiante, grado="7_anos",
                                   habilidad_solicitada=Habilidad.objects.get(codigo="equilibrio_estatico"))
    diagnosticar_y_guardar(ev, muestras(levantar_pie=True))
    ev.refresh_from_db()

    assert ev.estado == Evaluacion.Estado.LISTA
    assert ev.habilidad_detectada.codigo == "equilibrio_estatico"
    assert ev.es_deteccion_automatica is False
    assert ev.puntaje_maximo == 5 and ev.puntaje == sum(r.puntaje for r in ev.resultados.all())
    assert ev.estadio_gallahue in {"Inicial", "Elemental", "Maduro"}
    assert ev.version_motor == VERSION_MOTOR
    assert ev.resultados.count() == 5 and all(r.criterio_id for r in ev.resultados.all())
    assert ev.fotogramas.count() == 8
    assert ev.fotogramas.get(orden=1).hito_tipo == "inicial"
    assert ev.fotogramas.get(orden=8).hito_tipo == "final"
    assert ev.fotogramas.filter(hito_tipo="pico").count() == 1
    assert "fsmPhases" in ev.telemetria and ev.fases_fsm


@pytest.mark.django_db
def test_reprocesar_no_duplica(catalogo, docente):
    ev = Evaluacion.objects.create(docente=docente)
    diagnosticar_y_guardar(ev, muestras())
    diagnosticar_y_guardar(ev, muestras())
    assert ev.resultados.count() == 5 and ev.fotogramas.count() == 8


@pytest.mark.django_db
def test_sin_persona_queda_en_error(catalogo, docente):
    ev = Evaluacion.objects.create(docente=docente)
    diagnosticar_y_guardar(ev, [{"timestampNum": 0.0, "landmarks": None}])
    ev.refresh_from_db()
    assert ev.estado == Evaluacion.Estado.ERROR
    assert "No se detectó a la persona" in ev.mensaje_error
    assert ev.resultados.count() == 0


@pytest.mark.django_db
def test_consolidado_del_salon(catalogo, docente, estudiante):
    grupal = EvaluacionGrupal.objects.create(grupo=estudiante.grupo, docente=docente, estudiantes_objetivo=4)
    for _ in range(2):
        ev = Evaluacion.objects.create(docente=docente, evaluacion_grupal=grupal,
                                       habilidad_solicitada=Habilidad.objects.get(codigo="carrera"))
        diagnosticar_y_guardar(ev, muestras())
    Evaluacion.objects.create(docente=docente, evaluacion_grupal=grupal)   # pendiente: no cuenta

    r = consolidar_grupo(grupal)
    assert r["evaluados"] == 2 and r["progreso_pct"] == 50
    assert r["errores"] and all(e["estudiantes"] == 2 and e["porcentaje"] == 100 for e in r["errores"])
    assert habilidad_mas_debil(grupal).codigo == "carrera"
