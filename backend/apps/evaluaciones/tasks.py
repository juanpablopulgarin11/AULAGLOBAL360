"""Tareas en segundo plano: análisis de la evidencia y retención de videos."""
from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from biomecanica.extraccion import ArchivoIlegible, detector_mediapipe, extraer_imagen, extraer_video, tipo_de_archivo

from .models import Evaluacion, Fotograma
from .servicios import diagnosticar_y_guardar

log = logging.getLogger(__name__)


def obtener_detector():
    """Detector de pose del proceso. Las pruebas lo reemplazan por uno falso."""
    return detector_mediapipe(settings.AULA360_MODELO_POSE, usar_gpu=settings.AULA360_POSE_GPU)


@shared_task(name="evaluaciones.procesar_evaluacion")
def procesar_evaluacion(evaluacion_id: int) -> str:
    """Extrae los fotogramas del archivo subido, ejecuta el motor y guarda el diagnóstico."""
    ev = Evaluacion.objects.select_related("habilidad_solicitada").get(pk=evaluacion_id)
    ev.estado, ev.mensaje_error = Evaluacion.Estado.PROCESANDO, ""
    ev.save(update_fields=["estado", "mensaje_error", "actualizado"])

    tipo = ev.tipo_archivo or (tipo_de_archivo(ev.archivo.name) if ev.archivo else None)
    habilidad = ev.habilidad_solicitada.nombre if ev.habilidad_solicitada else None
    try:
        if not ev.archivo:
            raise ArchivoIlegible("La evaluación no tiene archivo")
        if tipo == "video":
            resultado = extraer_video(ev.archivo.path, obtener_detector(), habilidad=habilidad)
        elif tipo == "imagen":
            resultado = extraer_imagen(ev.archivo.path, obtener_detector(), habilidad=habilidad)
        else:
            raise ArchivoIlegible("Formato de archivo no reconocido")
    except (ArchivoIlegible, FileNotFoundError) as exc:
        ev.estado, ev.mensaje_error = Evaluacion.Estado.ERROR, f"No se pudo procesar el archivo: {exc}"
        ev.save(update_fields=["estado", "mensaje_error", "actualizado"])
        return ev.estado

    if not ev.tipo_archivo:
        ev.tipo_archivo = tipo
    ev.advertencias = resultado.advertencias
    ev.meta_video = {**resultado.meta, "ventana_s": [round(x, 3) for x in resultado.ventana],
                     "gatillo": resultado.gatillo and {k: resultado.gatillo[k] for k in ("reason", "skillHint", "t")},
                     "fotogramas_con_persona": resultado.con_persona}
    diagnosticar_y_guardar(ev, resultado.frames)
    log.info("Evaluación %s: %s (%s/8 fotogramas con persona)", ev.pk, ev.estado, resultado.con_persona)
    return ev.estado


@shared_task(name="evaluaciones.purgar_evidencias_vencidas")
def purgar_evidencias_vencidas(dias: int | None = None) -> int:
    """Borra videos e imágenes de fotogramas más antiguos que la retención configurada.

    Se conservan landmarks, ángulos, telemetría y resultados: el historial del estudiante
    sigue disponible sin guardar la imagen del menor.
    """
    dias = settings.AULA360_DIAS_RETENCION_VIDEO if dias is None else dias
    limite = timezone.now() - timedelta(days=dias)
    purgadas = 0
    for ev in Evaluacion.objects.filter(creado__lt=limite, archivo_purgado__isnull=True):
        if ev.archivo:
            ev.archivo.delete(save=False)
        for foto in Fotograma.objects.filter(evaluacion=ev):
            for campo in (foto.imagen, foto.imagen_esqueleto):
                if campo:
                    campo.delete(save=False)
            foto.save(update_fields=["imagen", "imagen_esqueleto"])
        ev.archivo_purgado = timezone.now()
        ev.save(update_fields=["archivo", "archivo_purgado"])
        purgadas += 1
    return purgadas
