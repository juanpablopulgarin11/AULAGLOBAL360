"""Puente entre el motor ``biomecanica`` y los modelos.

La extracción de fotogramas desde video (opencv + mediapipe) llega en la fase 3; aquí se
recibe ya la lista de fotogramas con landmarks.
"""
from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List, Optional, Sequence

from django.core.files.base import ContentFile
from django.db import transaction

from apps.catalogo.models import CriterioHMB, Habilidad
from biomecanica import (
    VERSION_MOTOR, SinPersonaDetectada, assign_keyframe_milestones, compute_joint_angles, run_local_engine,
)

from .models import Evaluacion, EvaluacionGrupal, Fotograma, ResultadoCriterio

# Diagnóstico "sin errores" que el motor devuelve cuando todo se logra; no cuenta como falencia
_SIN_FALLOS = "sin fallos"


def preparar_frames(muestras: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Normaliza ``[{"timestampNum", "landmarks"}]`` y calcula los ángulos de cada fotograma."""
    frames = []
    for idx, m in enumerate(muestras):
        t = float(m.get("timestampNum", idx * 0.2))
        frames.append({
            "time": f"{t:.2f}s",
            "timestampNum": t,
            "phase": m.get("phase") or f"Fase {idx + 1}",
            "landmarks": m.get("landmarks"),
            "angles": compute_joint_angles(m.get("landmarks")),
            "isInitialTrigger": bool(m.get("isInitialTrigger")),
            "imagen_jpeg": m.get("imagen_jpeg"),
            "imagen_esqueleto_jpeg": m.get("imagen_esqueleto_jpeg"),
        })
    return frames


def borrar_fotogramas(evaluacion: Evaluacion) -> None:
    """Elimina los fotogramas y sus archivos de imagen (el borrado en BD no toca el disco)."""
    for foto in evaluacion.fotogramas.all():
        for campo in (foto.imagen, foto.imagen_esqueleto):
            if campo:
                campo.delete(save=False)
    evaluacion.fotogramas.all().delete()


def _tipo_hito(f: Dict[str, Any]) -> str:
    if f.get("isMilestonePeak"):
        return Fotograma.TipoHito.PICO
    if f.get("isFinalMilestone"):
        return Fotograma.TipoHito.FINAL
    if f.get("isInitialTrigger") or f.get("milestoneBadge") == "🎯 ÁNGULO INICIAL":
        return Fotograma.TipoHito.INICIAL
    if f.get("isSubMilestone"):
        return Fotograma.TipoHito.SUB
    return Fotograma.TipoHito.NINGUNO


@transaction.atomic
def diagnosticar_y_guardar(evaluacion: Evaluacion, muestras: Sequence[Dict[str, Any]]) -> Evaluacion:
    """Ejecuta el motor local sobre los fotogramas y persiste el resultado en ``evaluacion``."""
    frames = preparar_frames(muestras)
    codigo = evaluacion.habilidad_solicitada.codigo if evaluacion.habilidad_solicitada else "auto"

    borrar_fotogramas(evaluacion)
    evaluacion.resultados.all().delete()
    evaluacion.version_motor = VERSION_MOTOR

    try:
        diag = run_local_engine(codigo, evaluacion.grado, evaluacion.observaciones_docente, frames, origen="servidor")
    except SinPersonaDetectada as exc:
        evaluacion.estado = Evaluacion.Estado.ERROR
        evaluacion.mensaje_error = str(exc)
        evaluacion.save()
        return evaluacion

    assign_keyframe_milestones(frames, diag["habilidad_detectada"])
    habilidad = Habilidad.objects.get(nombre=diag["habilidad_detectada"])
    criterios = {c.orden: c for c in CriterioHMB.objects.filter(habilidad=habilidad)}

    aprobados, total = (int(x) for x in diag["puntaje_obtenido"].split("/"))
    telemetria = dict(diag["telemetria_medida"])

    evaluacion.estado = Evaluacion.Estado.LISTA
    evaluacion.mensaje_error = ""
    evaluacion.habilidad_detectada = habilidad
    evaluacion.es_deteccion_automatica = diag["es_deteccion_automatica"]
    evaluacion.puntaje, evaluacion.puntaje_maximo = aprobados, total
    evaluacion.porcentaje_madurez = diag["porcentaje_madurez"]
    evaluacion.estadio_gallahue = diag["estadio_gallahue"]
    evaluacion.resumen = diag["resumen_biomecanico"]
    evaluacion.analisis_articular = diag["analisis_articular"]
    evaluacion.errores_criticos = diag["errores_criticos"]
    evaluacion.frases_profe = diag["frases_profe"]
    evaluacion.fases_fsm = telemetria.get("fsmPhases", [])
    evaluacion.telemetria = telemetria
    evaluacion.modelo_ia = ""
    evaluacion.save()

    ResultadoCriterio.objects.bulk_create([
        ResultadoCriterio(evaluacion=evaluacion, criterio=criterios.get(i), orden=i, texto=c["criterio"],
                          fase=c["fase"], puntaje=c["puntaje"], medido=c.get("medido", ""),
                          umbral=c.get("umbral", ""), observacion=c.get("observacion", ""))
        for i, c in enumerate(diag["criterios"], start=1)
    ])
    for i, f in enumerate(frames, start=1):
        foto = Fotograma(evaluacion=evaluacion, orden=i, tiempo_s=f["timestampNum"], fase=f["phase"],
                         landmarks=f["landmarks"], angulos=f["angles"], es_gatillo=f["isInitialTrigger"],
                         hito_tipo=_tipo_hito(f), hito_badge=f.get("milestoneBadge") or "",
                         hito_titulo=f.get("milestoneTitle") or "", hito_desc=(f.get("milestoneDesc") or "")[:200],
                         hito_color=f.get("milestoneColor") or "")
        if f.get("imagen_jpeg"):
            foto.imagen.save(f"ev{evaluacion.pk}_{i}.jpg", ContentFile(f["imagen_jpeg"]), save=False)
        if f.get("imagen_esqueleto_jpeg"):
            foto.imagen_esqueleto.save(f"ev{evaluacion.pk}_{i}_esq.jpg", ContentFile(f["imagen_esqueleto_jpeg"]), save=False)
        foto.save()
    return evaluacion


def consolidar_grupo(grupal: EvaluacionGrupal, habilidad: Optional[Habilidad] = None) -> Dict[str, Any]:
    """Errores más frecuentes del salón (port de ``generateGroupPlan``), ordenados de mayor a menor.

    Con ``habilidad`` solo cuenta las evaluaciones de esa habilidad (los errores de habilidades
    distintas no son comparables)."""
    qs = grupal.evaluaciones.filter(estado=Evaluacion.Estado.LISTA)
    if habilidad is not None:
        qs = qs.filter(habilidad_detectada=habilidad)
    evaluaciones = list(qs)
    total = len(evaluaciones)
    conteo: Counter = Counter()
    for ev in evaluaciones:
        for e in ev.errores_criticos:
            texto = e.get("error", "")
            if texto and _SIN_FALLOS not in texto.lower():
                conteo[texto] += 1
    return {
        "evaluados": total,
        "objetivo": grupal.estudiantes_objetivo,
        "progreso_pct": min(100, round(total / grupal.estudiantes_objetivo * 100)) if grupal.estudiantes_objetivo else 0,
        "errores": [{"error": err, "estudiantes": n, "porcentaje": round(n / total * 100)}
                    for err, n in conteo.most_common()],
        "estadios": dict(Counter(ev.estadio_gallahue for ev in evaluaciones)),
        "madurez_media": round(sum(ev.porcentaje_madurez or 0 for ev in evaluaciones) / total) if total else None,
    }


def habilidad_mas_debil(grupal: EvaluacionGrupal) -> Optional[Habilidad]:
    """Habilidad con menor madurez media del salón: base para el plan consolidado (fase 4)."""
    medias: Dict[int, List[int]] = {}
    for ev in grupal.evaluaciones.filter(estado=Evaluacion.Estado.LISTA).exclude(habilidad_detectada=None):
        medias.setdefault(ev.habilidad_detectada_id, []).append(ev.porcentaje_madurez or 0)
    if not medias:
        return grupal.habilidad
    peor = min(medias, key=lambda k: sum(medias[k]) / len(medias[k]))
    return Habilidad.objects.get(pk=peor)
