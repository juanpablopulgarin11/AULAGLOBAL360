"""Motor v2: eventos del video completo, detección con confianza y criterios por confirmar."""
import pytest
from django.urls import reverse

from apps.catalogo.models import Habilidad
from apps.evaluaciones.models import Evaluacion
from apps.evaluaciones.servicios import diagnosticar_y_guardar, preparar_frames
from apps.reportes.servicios import reporte_de_evaluacion
from biomecanica.clasificador_v2 import detectar
from biomecanica.motor_v2 import run_motor_v2, totales
from biomecanica.reglas_v2 import REGLAS_V2, VISUAL, evaluar_criterios
from biomecanica.serie import calcular_cinematica

from tests import sinteticos as S

GESTOS = {
    "Carrera": lambda: S.correr(),
    "Marcha": lambda: S.caminar(),
    "Salto Horizontal": lambda: S.salto_horizontal(),
    "Salto Unipodal": lambda: S.pata_sola("d"),
    "Equilibrio Estático Unipodal": lambda: S.equilibrio("d"),
    "Lanzamiento Sobre Hombro": lambda: S.lanzar("d"),
    "Patear": lambda: S.patear("d"),
    "Recepción y Atrape": lambda: S.atrapar(),
}


def _frames(serie, cada=8):
    return preparar_frames([{"timestampNum": t, "landmarks": lm} for t, lm in serie[::cada]])


@pytest.mark.parametrize("habilidad", list(GESTOS))
def test_deteccion_automatica_por_eventos(habilidad):
    d = detectar(calcular_cinematica(GESTOS[habilidad]()))
    assert d.habilidad == habilidad and d.confianza in ("alta", "media"), d.motivo


@pytest.mark.parametrize("habilidad", [h for h in GESTOS if h != "Recepción y Atrape"])
def test_gesto_bien_ejecutado_cumple_lo_medible(habilidad):
    criterios = evaluar_criterios(habilidad, calcular_cinematica(GESTOS[habilidad]()))
    medidos = [c for c in criterios if c["puntaje"] is not None]
    assert medidos and all(c["puntaje"] == 1 for c in medidos), [(c["criterio"], c["medido"]) for c in medidos]


def test_persona_quieta_no_recibe_puntos_ni_habilidad():
    """La foto de yoga del diagnóstico: v1 daba «Equilibrio estático 80 %» y «Salto 4/5»."""
    cin = calcular_cinematica(S.quieto_dos_pies())
    assert cin["vuelos"] == 0 and cin["apoyo_unipodal_s"] == 0
    assert detectar(cin).confianza == "baja"
    for habilidad in ("Salto Horizontal", "Equilibrio Estático Unipodal", "Carrera", "Lanzamiento Sobre Hombro", "Patear"):
        assert all(c["puntaje"] in (0, None) for c in evaluar_criterios(habilidad, cin)), habilidad


def test_eventos_clave_y_lateralidad():
    assert calcular_cinematica(S.pata_sola("i"))["saltos_mismo_pie"] == 3
    assert calcular_cinematica(S.pata_sola("i"))["lado_saltos"] == "izquierdo"
    sos = calcular_cinematica(S.equilibrio("i", segundos=6))
    assert sos["pie_apoyo"] == "izquierdo" and sos["apoyo_unipodal_s"] >= 5.9
    assert calcular_cinematica(S.lanzar("i"))["lanzamiento"]["brazo"] == "izquierdo"
    assert calcular_cinematica(S.patear("i"))["pateo"]["pierna"] == "izquierdo"
    corre = calcular_cinematica(S.correr(d=-1))
    assert corre["direccion"] == "izquierda" and corre["vuelos"] >= 2 and corre["tronco_mediana"] > 0


def test_equilibrio_corto_no_cumple_los_cinco_segundos():
    criterios = evaluar_criterios("Equilibrio Estático Unipodal", calcular_cinematica(S.equilibrio("d", segundos=3)))
    assert criterios[4]["puntaje"] == 0 and "graba al menos 6 segundos" in criterios[4]["observacion"]
    largo = evaluar_criterios("Equilibrio Estático Unipodal", calcular_cinematica(S.equilibrio("d", segundos=6)))
    assert largo[4]["puntaje"] == 1


def test_errores_de_la_bateria():
    criterios = evaluar_criterios("Equilibrio Estático Unipodal", calcular_cinematica(S.equilibrio("d", brazos_abiertos=True)))
    assert criterios[0]["puntaje"] == 0 and "compensar" in criterios[0]["observacion"]


def test_criterios_visuales_quedan_por_confirmar():
    visuales = sum(1 for lista in REGLAS_V2.values() for c in lista if c.fuente == VISUAL)
    assert visuales == 9          # pelota, agarre, manos en copa, mirada, pies sobre la línea…
    diag = run_motor_v2("lanzar", "7_anos", "", _frames(S.lanzar()), S.lanzar())
    assert diag["totales"] == {"aprobados": 3, "calificados": 3, "pendientes": 2, "total": 5, "porcentaje": 100,
                               "estadio": "Maduro", "provisional": True}
    assert [c["fuente"] for c in diag["criterios"]][3:] == ["visual", "visual"]
    assert "provisional: faltan 2 por confirmar" in diag["resumen_biomecanico"]
    assert "mano derecha" in diag["resumen_biomecanico"]


def test_foto_deja_todo_por_confirmar():
    serie = S.equilibrio("d")
    diag = run_motor_v2("equilibrio_estatico", "7_anos", "", _frames(serie[100:101], cada=1))
    assert diag["totales"]["pendientes"] == 5 and diag["estadio_gallahue"] == ""
    assert "fotografía" in diag["resumen_biomecanico"]


def test_totales():
    assert totales([{"puntaje": 1}, {"puntaje": 0}, {"puntaje": None}])["porcentaje"] == 50
    assert totales([{"puntaje": None}])["estadio"] == ""


@pytest.mark.django_db
def test_docente_confirma_los_pendientes(client, catalogo, docente):
    ev = Evaluacion.objects.create(docente=docente, habilidad_solicitada=Habilidad.objects.get(codigo="lanzar"))
    serie = S.lanzar("d")
    diagnosticar_y_guardar(ev, [{"timestampNum": t, "landmarks": lm} for t, lm in serie[::8]], serie=serie)
    ev.refresh_from_db()
    assert (ev.puntaje, ev.puntaje_maximo, ev.criterios_pendientes, ev.estadio_gallahue) == (3, 3, 2, "Maduro")

    client.force_login(docente)
    html = client.get(reverse("evaluacion", args=[ev.pk])).content.decode()
    assert "2 criterios por confirmar" in html and "✓ Lo logra" in html and "(provisional)" in html
    contenido, _ = reporte_de_evaluacion(ev)                        # el Word acepta criterios pendientes
    assert contenido[:2] == b"PK"

    client.post(reverse("evaluacion_criterio", args=[ev.pk, 4]), {"logrado": "1"})
    client.post(reverse("evaluacion_criterio", args=[ev.pk, 5]), {"logrado": "0"})
    ev.refresh_from_db()
    assert (ev.puntaje, ev.puntaje_maximo, ev.criterios_pendientes, ev.porcentaje_madurez, ev.estadio_gallahue) == (4, 5, 0, 80, "Maduro")
    assert ev.resultados.get(orden=5).fuente == "docente"
    assert len(ev.errores_criticos) == 1                            # solo el criterio que el docente marcó «aún no»
    assert client.post(reverse("evaluacion_criterio", args=[ev.pk, 9]), {"logrado": "1"}).status_code == 404


@pytest.mark.django_db
def test_otro_docente_no_puede_confirmar(client, catalogo, docente, django_user_model):
    ev = Evaluacion.objects.create(docente=docente, habilidad_solicitada=Habilidad.objects.get(codigo="lanzar"))
    serie = S.lanzar("d")
    diagnosticar_y_guardar(ev, [{"timestampNum": t, "landmarks": lm} for t, lm in serie[::8]], serie=serie)
    client.force_login(django_user_model.objects.create_user("otro", password="x-segura-123"))
    assert client.post(reverse("evaluacion_criterio", args=[ev.pk, 4]), {"logrado": "1"}).status_code == 404


@pytest.mark.parametrize("semilla", range(1, 6))
def test_robusto_al_ruido_de_mediapipe_y_al_temblor(semilla):
    """Con el ruido de la detección (±1,5 px) y el temblor de una cámara en la mano, la detección
    y los criterios no cambian (la verificación amplia, 51 semillas × 9 gestos, da 0 errores)."""
    for habilidad, gesto in GESTOS.items():
        cin = calcular_cinematica(S.con_ruido(gesto(), semilla=semilla))
        assert detectar(cin).habilidad == habilidad
        puntajes = [c["puntaje"] for c in evaluar_criterios(habilidad, cin)]
        assert 0 not in puntajes, (habilidad, puntajes)
    quieto = calcular_cinematica(S.con_ruido(S.quieto_dos_pies(), semilla=semilla))
    assert detectar(quieto).confianza == "baja"


def test_ejecucion_deficiente_reprueba_el_criterio():
    assert [c["puntaje"] for c in evaluar_criterios("Salto Horizontal", calcular_cinematica(S.salto_horizontal(con_brazos=False)))][:2] == [0, 0]
    assert evaluar_criterios("Salto Unipodal", calcular_cinematica(S.pata_sola("d", saltos=2)))[4]["puntaje"] == 0
    trote = calcular_cinematica(S.caminar(velocidad=2.0, frec=1.3))
    assert all(c["puntaje"] == 0 for c in evaluar_criterios("Carrera", trote))


def test_comando_validar_videos(tmp_path, monkeypatch):
    import io

    from django.core.management import call_command

    from apps.evaluaciones import tasks
    from tests.test_extraccion import detector_falso, escribir_video

    monkeypatch.setattr(tasks, "obtener_detector", lambda: detector_falso)
    monkeypatch.setattr("apps.evaluaciones.management.commands.validar_videos.obtener_detector", lambda: detector_falso)
    (tmp_path / "salto").mkdir()
    (tmp_path / "otros").mkdir()
    escribir_video(tmp_path / "salto" / "a.mp4")
    escribir_video(tmp_path / "otros" / "b.mp4")
    esperado = tmp_path / "docente.csv"
    esperado.write_text("archivo,c1,c2,c3,c4,c5\na.mp4,1,0,0,0,0\n")
    salida = io.StringIO()
    call_command("validar_videos", str(tmp_path), "--esperado", str(esperado), "--csv", str(tmp_path / "r.csv"), stdout=salida)
    texto = salida.getvalue()
    assert "Detección automática: 1/2" in texto          # el video sin salto no se reconoce (correcto en «otros»)
    assert "Concordancia con el docente" in texto and (tmp_path / "r.csv").exists()
