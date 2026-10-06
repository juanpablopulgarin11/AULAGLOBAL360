"""Extracción de fotogramas y tarea de procesamiento, con un detector falso.

El video sintético codifica la postura en el brillo de cada fotograma: oscuro = de pie,
claro = sentadilla bipodal (gatillo de Salto Horizontal). Así se verifica la lógica de
escaneo, ventana y fases sin depender del modelo de MediaPipe.
"""
from __future__ import annotations

import os
from pathlib import Path

import cv2
import numpy as np
import pytest
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.catalogo.models import Habilidad
from apps.evaluaciones import tasks
from apps.evaluaciones.models import Evaluacion
from apps.evaluaciones.validadores import validar_evidencia
from biomecanica.extraccion import (
    ALTO, ANCHO, ArchivoIlegible, extraer_imagen, extraer_video, tipo_de_archivo, ventana_de_accion,
)

FPS = 30
SENTADILLA = (0.8, 1.6)   # segundos


def _pose(sentadilla: bool):
    c = {11: (0.55, 0.30), 12: (0.45, 0.30), 13: (0.57, 0.42), 14: (0.43, 0.42), 15: (0.58, 0.53),
         16: (0.42, 0.53), 23: (0.53, 0.55), 24: (0.47, 0.55), 25: (0.53, 0.72), 26: (0.47, 0.72),
         27: (0.53, 0.90), 28: (0.47, 0.90)}
    if sentadilla:
        c.update({23: (0.53, 0.62), 24: (0.47, 0.62), 25: (0.62, 0.72), 26: (0.56, 0.72)})
    return [{"x": c.get(i, (0.5, 0.15))[0], "y": c.get(i, (0.5, 0.15))[1], "z": 0.0, "visibility": 0.9}
            for i in range(33)]


def detector_falso(rgb: np.ndarray):
    assert rgb.shape[2] == 3 and max(rgb.shape[:2]) <= ANCHO
    brillo = float(rgb.mean())
    if brillo < 10:
        return None                     # fotograma negro: no hay persona
    return _pose(sentadilla=brillo > 128)


def escribir_video(ruta: Path, segundos: float = 3.0, sin_persona: bool = False) -> Path:
    vw = cv2.VideoWriter(str(ruta), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (320, 180))
    for i in range(int(segundos * FPS)):
        t = i / FPS
        valor = 0 if sin_persona else (200 if SENTADILLA[0] <= t < SENTADILLA[1] else 60)
        vw.write(np.full((180, 320, 3), valor, np.uint8))
    vw.release()
    return ruta


def test_video_ancla_la_ventana_en_el_angulo_inicial(tmp_path):
    r = extraer_video(escribir_video(tmp_path / "salto.mp4"), detector_falso)

    # 3 s → 45 pasos (dt = 3/46 s). La primera muestra en sentadilla es i=13 (t≈0.848) y se confirma
    # en i=14; la ventana empieza 0.1 s antes. Al volver a estar de pie, el gatillo por cambio
    # angular (referencia ~0.19 s antes) sigue activo 3 muestras más: termina en i=28 (t≈1.826).
    dt = 3 / 46
    assert r.muestras_escaneo == 46
    assert r.ventana == pytest.approx((13 * dt - 0.1, 28 * dt))
    assert r.gatillo["skillHint"] == "Salto Horizontal"

    assert len(r.frames) == 8 and r.con_persona == 8
    tiempos = [f["timestampNum"] for f in r.frames]
    assert np.allclose(np.diff(tiempos), (r.ventana[1] - r.ventana[0]) / 7)
    assert r.meta["fps"] == pytest.approx(30, abs=0.5) and r.meta["fotogramas"] == 90
    assert r.advertencias == []

    primero = r.frames[0]
    assert primero["isInitialTrigger"] and primero["phase"].startswith("Fase 1: Ángulo Inicial (Flexión preparatoria bípode")
    assert r.frames[1]["phase"] == "Fase 2: Impulso y Extensión Triple"
    assert primero["milestoneBadge"] == "🎯 ÁNGULO INICIAL" and r.frames[-1]["isFinalMilestone"]
    assert primero["imagen_jpeg"][:2] == b"\xff\xd8" and primero["imagen_esqueleto_jpeg"] != primero["imagen_jpeg"]


def test_video_sin_gatillo_usa_bordes_naturales():
    escaneo = [(i * 0.25, None, {"triggered": False}) for i in range(9)]
    assert ventana_de_accion(escaneo, 2.0, -1) == pytest.approx((0.16, 1.84))


def test_gatillo_aislado_por_ruido_no_ancla_la_ventana(tmp_path):
    """Un solo fotograma "en sentadilla" (ruido) antes del gesto real no debe anclar el inicio."""
    ruta = tmp_path / "ruido.mp4"
    vw = cv2.VideoWriter(str(ruta), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (320, 180))
    for i in range(90):
        t = i / FPS
        ruido = i == 9                                   # un único fotograma claro en t=0.3 s
        valor = 200 if (ruido or SENTADILLA[0] <= t < SENTADILLA[1]) else 60
        vw.write(np.full((180, 320, 3), valor, np.uint8))
    vw.release()
    r = extraer_video(ruta, detector_falso)
    assert r.gatillo["t"] > 0.75


def test_lienzo_conserva_la_proporcion():
    from biomecanica.extraccion import a_lienzo
    vertical = np.full((1920, 1080, 3), 255, np.uint8)
    lz = a_lienzo(vertical)
    assert lz.imagen.shape == (ALTO, ANCHO, 3) and lz.contenido.shape == (360, 203, 3)
    columnas_blancas = np.where(lz.imagen[ALTO // 2].sum(axis=1) > 0)[0]
    assert columnas_blancas.min() == 218 and columnas_blancas.max() == 420
    horizontal = np.full((720, 1280, 3), 255, np.uint8)
    assert a_lienzo(horizontal).imagen.min() == 255         # 16:9: sin bandas, igual que el JS


def test_landmarks_del_contenido_pasan_al_lienzo():
    """En un video vertical, el centro del contenido debe quedar en el centro del lienzo 16:9."""
    from biomecanica.extraccion import _detectar, a_lienzo
    lz = a_lienzo(np.full((1920, 1080, 3), 60, np.uint8))
    lm = _detectar(lambda rgb: [{"x": 0.5, "y": 0.5, "z": 0.2, "visibility": 1.0}] * 33, lz)
    assert lm[0]["x"] == pytest.approx(0.5, abs=0.002) and lm[0]["y"] == pytest.approx(0.5)
    assert lm[0]["z"] == pytest.approx(0.2 * 203 / 640)
    # Un punto en el borde derecho del contenido cae en el borde derecho de la franja útil
    lm = _detectar(lambda rgb: [{"x": 1.0, "y": 1.0, "z": 0.0}] * 33, lz)
    assert lm[0]["x"] == pytest.approx((218 + 203) / 640) and lm[0]["y"] == pytest.approx(1.0)


def test_video_vertical_avisa(tmp_path):
    ruta = tmp_path / "vertical.mp4"
    vw = cv2.VideoWriter(str(ruta), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (180, 320))
    for _ in range(60):
        vw.write(np.full((320, 180, 3), 60, np.uint8))
    vw.release()
    r = extraer_video(ruta, detector_falso)
    assert any("vertical" in a for a in r.advertencias)


def test_suavizado_por_mediana():
    from biomecanica.extraccion import mediana_landmarks
    base = _pose(False)
    atipico = [dict(p, x=p["x"] + 0.3) for p in base]
    med = mediana_landmarks([base, atipico, base])
    assert med[27]["x"] == pytest.approx(base[27]["x"])
    assert mediana_landmarks([None, None]) is None


def test_cuerpo_poco_visible_no_se_mide():
    from biomecanica.extraccion import angulos_si_visible
    oculto = [dict(p, visibility=0.1) for p in _pose(False)]
    assert angulos_si_visible(oculto) is None
    assert angulos_si_visible(_pose(False)) is not None


def test_ventana_minima_de_medio_segundo():
    escaneo = [(0.0, None, {"triggered": True}), (0.1, {"kneeMin": 170}, {"triggered": False})]
    assert ventana_de_accion(escaneo, 3.0, 0) == pytest.approx((0.04, 1.84))


def test_imagen_un_solo_fotograma(tmp_path):
    ruta = tmp_path / "foto.png"
    cv2.imwrite(str(ruta), np.full((480, 640, 3), 60, np.uint8))
    r = extraer_imagen(ruta, detector_falso, habilidad="Marcha")
    assert len(r.frames) == 1 and r.frames[0]["phase"] == "Postura Estática" and r.frames[0]["time"] == "0.0s"
    assert r.advertencias == []                       # con habilidad elegida no hay aviso de foto
    assert r.frames[0]["angles"]["kneeMin"] == 180


def test_archivos_ilegibles(tmp_path):
    malo = tmp_path / "roto.mp4"
    malo.write_bytes(b"esto no es un video")
    with pytest.raises(ArchivoIlegible):
        extraer_video(malo, detector_falso)
    with pytest.raises(ArchivoIlegible):
        extraer_imagen(b"tampoco una imagen", detector_falso)
    assert tipo_de_archivo("CLASE.MOV") == "video" and tipo_de_archivo("a.jpeg") == "imagen" and tipo_de_archivo("x.pdf") is None


def test_validador_de_evidencia(settings):
    validar_evidencia(SimpleUploadedFile("salto.mp4", b"0" * 10))
    with pytest.raises(ValidationError):
        validar_evidencia(SimpleUploadedFile("virus.exe", b"0"))
    settings.AULA360_MAX_SUBIDA_MB = 1
    with pytest.raises(ValidationError):
        validar_evidencia(SimpleUploadedFile("largo.mp4", b"0" * (2 * 1024 * 1024)))


# ---------------------------------------------------------------------------------------
# Tarea Celery de punta a punta (modo síncrono)
# ---------------------------------------------------------------------------------------
@pytest.fixture
def detector_de_prueba(monkeypatch):
    monkeypatch.setattr(tasks, "obtener_detector", lambda: detector_falso)


def _evaluacion_con_video(docente, tmp_path, **kwargs):
    datos = escribir_video(tmp_path / "v.mp4", **kwargs).read_bytes()
    ev = Evaluacion(docente=docente, habilidad_solicitada=Habilidad.objects.get(codigo="salto"))
    ev.archivo.save("v.mp4", ContentFile(datos), save=False)
    ev.save()
    return ev


@pytest.mark.django_db
def test_tarea_procesa_y_guarda_imagenes(catalogo, docente, tmp_path, detector_de_prueba):
    ev = _evaluacion_con_video(docente, tmp_path)
    assert tasks.procesar_evaluacion.delay(ev.pk).get() == "lista"
    ev.refresh_from_db()

    assert ev.tipo_archivo == "video"
    assert ev.habilidad_detectada.codigo == "salto" and ev.resultados.count() == 5
    fotos = list(ev.fotogramas.all())
    assert len(fotos) == 8 and fotos[0].es_gatillo
    assert all(Path(f.imagen.path).exists() and Path(f.imagen_esqueleto.path).exists() for f in fotos)

    # Reprocesar no deja imágenes huérfanas
    viejas = [f.imagen.path for f in fotos]
    tasks.procesar_evaluacion(ev.pk)
    assert not any(Path(p).exists() for p in viejas if p not in {f.imagen.path for f in ev.fotogramas.all()})


@pytest.mark.django_db
def test_tarea_video_sin_persona(catalogo, docente, tmp_path, detector_de_prueba):
    ev = _evaluacion_con_video(docente, tmp_path, sin_persona=True)
    assert tasks.procesar_evaluacion(ev.pk) == "error"
    ev.refresh_from_db()
    assert "No se detectó a la persona" in ev.mensaje_error


@pytest.mark.django_db
def test_tarea_archivo_corrupto(catalogo, docente, detector_de_prueba):
    ev = Evaluacion(docente=docente)
    ev.archivo.save("roto.mp4", ContentFile(b"basura"), save=False)
    ev.save()
    assert tasks.procesar_evaluacion(ev.pk) == "error"
    ev.refresh_from_db()
    assert ev.mensaje_error.startswith("No se pudo procesar el archivo")


@pytest.mark.django_db
def test_purga_borra_imagenes_y_conserva_metricas(catalogo, docente, tmp_path, detector_de_prueba):
    ev = _evaluacion_con_video(docente, tmp_path)
    tasks.procesar_evaluacion(ev.pk)
    ev.refresh_from_db()
    video = Path(ev.archivo.path)
    imagenes = [Path(f.imagen.path) for f in ev.fotogramas.all()]

    assert tasks.purgar_evidencias_vencidas(dias=30) == 0          # aún no vence
    assert tasks.purgar_evidencias_vencidas(dias=-1) == 1
    ev.refresh_from_db()
    assert not video.exists() and not any(p.exists() for p in imagenes)
    assert ev.archivo_purgado and not ev.archivo
    assert ev.fotogramas.count() == 8 and all(f.landmarks and not f.imagen for f in ev.fotogramas.all())
    assert ev.telemetria and ev.resultados.count() == 5
    assert tasks.purgar_evidencias_vencidas(dias=-1) == 0          # idempotente


# ---------------------------------------------------------------------------------------
# MediaPipe real (opcional): AULA360_IMAGEN_PRUEBA=/ruta/a/foto_con_persona.jpg
# ---------------------------------------------------------------------------------------
@pytest.mark.skipif(not os.environ.get("AULA360_IMAGEN_PRUEBA"), reason="definir AULA360_IMAGEN_PRUEBA")
def test_mediapipe_real(settings):
    if not Path(settings.AULA360_MODELO_POSE).exists():
        pytest.skip("modelo no descargado (manage.py descargar_modelo_pose)")
    r = extraer_imagen(os.environ["AULA360_IMAGEN_PRUEBA"], tasks.obtener_detector())
    assert r.con_persona == 1 and len(r.frames[0]["landmarks"]) == 33
