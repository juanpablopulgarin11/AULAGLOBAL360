"""Gemini con un cliente simulado (no se llama a la API real)."""
import json
from types import SimpleNamespace

import pytest
from google.genai import errors

from apps.catalogo.models import Habilidad
from apps.cuentas.models import Institucion
from apps.estudiantes.models import Estudiante, Grupo
from apps.evaluaciones.models import Evaluacion, Motor
from apps.evaluaciones.servicios import diagnosticar_y_guardar
from apps.ia import cliente as ia
from apps.ia.prompt import construir_prompt_v2
from biomecanica.reglas import REGLAS


def _pose():
    c = {11: (0.55, 0.30), 12: (0.45, 0.30), 13: (0.57, 0.42), 14: (0.43, 0.42), 15: (0.58, 0.53), 16: (0.42, 0.53),
         23: (0.53, 0.55), 24: (0.47, 0.55), 25: (0.53, 0.72), 26: (0.47, 0.72), 27: (0.53, 0.90), 28: (0.47, 0.90)}
    return [{"x": c.get(i, (0.5, 0.15))[0], "y": c.get(i, (0.5, 0.15))[1], "z": 0.0} for i in range(33)]


MUESTRAS = [{"timestampNum": k * 0.2, "landmarks": _pose(), "imagen_jpeg": b"\xff\xd8falso"} for k in range(8)]


def respuesta_marcha(puntajes=(1, 1, 0, 1, 1)):
    regla = REGLAS["Marcha"]
    return {
        "habilidad_detectada": "Marcha",
        "resumen_biomecanico": "En el Fotograma #4 se evidencia el doble apoyo.",
        "criterios": [{"criterio": c.texto, "fase": c.fase, "puntaje": p, "observacion": "obs"} for c, p in zip(regla.criterios, puntajes)],
        "analisis_articular": {"angulos_principales": "a", "cadena_cinetica": "b", "apoyo_y_base": "c"},
        "errores_criticos": [{"error": "Apoyo plano", "impacto_biomecanico": "x"}],
        "frases_profe": ["¡Como un rey!"],
        "porcentaje_madurez": 99, "estadio_gallahue": "Maduro",       # la IA exagera: se recalcula
    }


class ClienteFalso:
    def __init__(self, respuestas, modelos=("gemini-9.0-flash", "gemini-9.0-pro", "text-embedding-004")):
        self.respuestas = list(respuestas)
        self.llamadas = []
        modelos_ns = [SimpleNamespace(name=f"models/{m}", supported_actions=["generateContent"]) for m in modelos]

        def generate_content(model, contents, config):
            self.llamadas.append((model, contents, config))
            r = self.respuestas.pop(0)
            if isinstance(r, Exception):
                raise r
            return SimpleNamespace(text=r if isinstance(r, str) else json.dumps(r))

        self.models = SimpleNamespace(list=lambda: modelos_ns, generate_content=generate_content)


@pytest.fixture
def con_gemini(settings, monkeypatch):
    settings.GEMINI_API_KEY = "clave-de-prueba"
    settings.GEMINI_MODEL = ""
    from django.core.cache import cache
    cache.clear()

    def instalar(cliente):
        monkeypatch.setattr(ia, "crear_cliente", lambda clave=None: cliente)
        return cliente
    return instalar


@pytest.fixture
def evaluacion_gemini(catalogo, docente):
    inst = Institucion.objects.create(nombre="IE", usa_ia_nube=True)
    docente.institucion = inst
    docente.save()
    grupo = Grupo.objects.create(institucion=inst, docente=docente, nombre="1A", grado="6_anos", anio=2026)
    est = Estudiante.objects.create(grupo=grupo, nombres="Ana", consentimiento_ia_nube=True)
    return Evaluacion.objects.create(docente=docente, estudiante=est, grado="6_anos", motor=Motor.GEMINI)


def test_eleccion_de_modelo():
    assert ia.puntuar_modelo("gemini-2.5-flash") > ia.puntuar_modelo("gemini-2.5-pro")
    assert ia.puntuar_modelo("gemini-3.0-flash") > ia.puntuar_modelo("gemini-2.5-flash")
    assert ia.puntuar_modelo("gemini-2.5-flash") > ia.puntuar_modelo("gemini-2.5-flash-lite")
    assert ia.puntuar_modelo("text-embedding-004") < 0 and ia.puntuar_modelo("gemini-2.0-flash-preview-image-generation") < 0


@pytest.mark.django_db
def test_gemini_ok_recalcula_puntaje(con_gemini, evaluacion_gemini):
    cli = con_gemini(ClienteFalso([respuesta_marcha()]))
    ev = diagnosticar_y_guardar(evaluacion_gemini, MUESTRAS)
    ev.refresh_from_db()
    assert ev.estado == "lista" and ev.habilidad_detectada.codigo == "marcha"
    assert ev.modelo_ia == "gemini-9.0-flash" and "+gemini:" in ev.version_motor
    # El motor no estaba seguro (persona quieta) y acepta la habilidad de la IA, pero los criterios
    # que mide la pose siguen en 0: no hubo desplazamiento. La IA solo califica el criterio visual.
    resultados = list(ev.resultados.order_by("orden"))
    assert [r.fuente for r in resultados] == ["pose", "pose", "pose", "pose", "ia"]
    assert [r.puntaje for r in resultados] == [0, 0, 0, 0, 1]
    assert (ev.puntaje, ev.puntaje_maximo, ev.porcentaje_madurez, ev.estadio_gallahue) == (1, 5, 20, "Inicial")
    assert ev.deteccion["confianza"] == "ia" and "Corregida por Gemini" in ev.deteccion["motivo"]
    assert all(r.criterio_id for r in resultados)                          # textos exactos → enlazados al catálogo
    assert resultados[0].medido                                            # medición instrumental añadida
    modelo, contenido, config = cli.llamadas[0]
    assert "CRITERIOS OFICIALES" in config.system_instruction and config.temperature == 0.1
    assert sum(1 for p in contenido if getattr(p, "inline_data", None)) == 8


@pytest.mark.django_db
def test_gemini_prueba_otro_modelo_si_uno_falla(con_gemini, evaluacion_gemini):
    no_existe = errors.ClientError(404, {"error": {"message": "model not found", "code": 404}})
    cli = con_gemini(ClienteFalso([no_existe, "```json\n" + json.dumps(respuesta_marcha()) + "\n```"]))
    ev = diagnosticar_y_guardar(evaluacion_gemini, MUESTRAS)
    assert ev.modelo_ia == "gemini-9.0-pro" and [m for m, _, _ in cli.llamadas] == ["gemini-9.0-flash", "gemini-9.0-pro"]


@pytest.mark.django_db
def test_respuesta_invalida_cae_al_motor_local(con_gemini, evaluacion_gemini):
    invalida = dict(respuesta_marcha(), habilidad_detectada="Natación")
    con_gemini(ClienteFalso([invalida, "no es json"]))
    ev = diagnosticar_y_guardar(evaluacion_gemini, MUESTRAS)
    ev.refresh_from_db()
    assert ev.estado == "lista" and ev.modelo_ia == ""
    assert any("No se pudo usar Gemini" in a for a in ev.advertencias)


@pytest.mark.django_db
def test_clave_rechazada_no_reintenta(con_gemini, evaluacion_gemini):
    cli = con_gemini(ClienteFalso([errors.ClientError(403, {"error": {"message": "API key not valid"}})]))
    ev = diagnosticar_y_guardar(evaluacion_gemini, MUESTRAS)
    assert len(cli.llamadas) == 1 and ev.modelo_ia == "" and ev.estado == "lista"


@pytest.mark.django_db
def test_sin_consentimiento_no_se_envian_imagenes(con_gemini, evaluacion_gemini):
    cli = con_gemini(ClienteFalso([respuesta_marcha()]))
    evaluacion_gemini.estudiante.consentimiento_ia_nube = False
    evaluacion_gemini.estudiante.save()
    ev = diagnosticar_y_guardar(evaluacion_gemini, MUESTRAS)
    assert cli.llamadas == [] and any("consentimiento" in a for a in ev.advertencias)


@pytest.mark.django_db
def test_sin_clave_en_servidor(settings, evaluacion_gemini):
    settings.GEMINI_API_KEY = ""
    ev = diagnosticar_y_guardar(evaluacion_gemini, MUESTRAS)
    assert ev.estado == "lista" and any("no tiene clave de Gemini" in a for a in ev.advertencias)


@pytest.mark.django_db
def test_dirigida_respeta_la_habilidad_del_docente(con_gemini, evaluacion_gemini):
    evaluacion_gemini.habilidad_solicitada = Habilidad.objects.get(codigo="marcha")
    evaluacion_gemini.save()
    otra = dict(respuesta_marcha(), habilidad_detectada="Carrera")
    con_gemini(ClienteFalso([otra]))
    ev = diagnosticar_y_guardar(evaluacion_gemini, MUESTRAS)
    assert ev.habilidad_detectada.codigo == "marcha"


def test_prompt_v2_separa_lo_medido_de_lo_visual():
    from biomecanica.motor_v2 import run_motor_v2
    from tests import sinteticos

    serie = sinteticos.lanzar("d")
    frames = [{"timestampNum": t, "landmarks": lm, "angles": None} for t, lm in serie[::8]]
    from apps.evaluaciones.servicios import preparar_frames
    diag = run_motor_v2("auto", "7_anos", "", preparar_frames(frames), serie)
    p = construir_prompt_v2(diag, None, "Grado 2º", 8)
    assert '"Lanzamiento Sobre Hombro"' in p and "confianza alta" in p and "no la cambies" in p
    assert p.count("MEDIDO CON LA POSE") == 3 and p.count("POR CONFIRMAR CON LAS IMÁGENES") == 2
    assert "Fases aéreas (ambos pies en el aire): 0" in p
    dirigido = construir_prompt_v2(diag, "Lanzamiento Sobre Hombro", "Grado 2º", 8)
    assert "Habilidad Específica Seleccionada por el Docente" in dirigido


@pytest.mark.django_db
def test_clave_propia_del_docente(settings, monkeypatch, evaluacion_gemini):
    """Como en la web: el docente conecta su clave y elige modelo; se guarda cifrada y tiene prioridad."""
    settings.GEMINI_API_KEY = ""
    docente = evaluacion_gemini.docente
    docente.gemini_clave = "AIzaSy-clave-del-docente-1234"
    docente.gemini_modelo = "gemini-2.5-flash"
    docente.save()
    docente.refresh_from_db()
    assert "AIzaSy" not in docente.gemini_clave_cifrada and docente.gemini_clave == "AIzaSy-clave-del-docente-1234"
    assert docente.gemini_clave_oculta == "AIzaSy••••1234"
    usadas = []
    cli = ClienteFalso([respuesta_marcha()])
    monkeypatch.setattr(ia, "crear_cliente", lambda clave=None: usadas.append(clave) or cli)
    ev = diagnosticar_y_guardar(evaluacion_gemini, MUESTRAS)
    assert usadas == ["AIzaSy-clave-del-docente-1234"] and ev.modelo_ia == "gemini-2.5-flash"



@pytest.mark.django_db
def test_gemini_califica_solo_lo_visual_y_no_cambia_una_deteccion_segura(con_gemini, evaluacion_gemini):
    """Lanzamiento medido con la pose: la IA califica agarre y trayectoria, no los criterios medidos."""
    from tests import sinteticos

    regla = REGLAS["Lanzamiento Sobre Hombro"]
    respuesta = {**respuesta_marcha(), "habilidad_detectada": "Patear",
                 "criterios": [{"criterio": c.texto, "fase": c.fase, "puntaje": 0, "observacion": "obs"} for c in regla.criterios]}
    respuesta["criterios"][3]["puntaje"] = 1                 # agarre firme
    con_gemini(ClienteFalso([respuesta]))
    serie = sinteticos.lanzar("d")
    muestras = [{"timestampNum": t, "landmarks": lm, "imagen_jpeg": b"\xff\xd8jpeg"} for t, lm in serie[::8]]
    ev = diagnosticar_y_guardar(evaluacion_gemini, muestras, serie=serie)
    resultados = list(ev.resultados.order_by("orden"))
    assert ev.habilidad_detectada.nombre == "Lanzamiento Sobre Hombro"          # detección segura: no la cambia
    assert any("Gemini sugirió «Patear»" in a for a in ev.advertencias), ev.advertencias
    assert [r.fuente for r in resultados] == ["pose", "pose", "pose", "ia", "ia"]
    assert [r.puntaje for r in resultados] == [1, 1, 1, 1, 0]                 # la IA no pudo bajar lo medido
