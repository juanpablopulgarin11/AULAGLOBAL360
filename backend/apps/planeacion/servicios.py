"""Creación y persistencia de unidades didácticas (usa ``biomecanica.didactica``)."""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from django.db import transaction

from apps.catalogo.models import Habilidad, PlantillaSesion
from apps.evaluaciones.models import Evaluacion, EvaluacionGrupal
from apps.evaluaciones.servicios import consolidar_grupo, habilidad_mas_debil
from biomecanica.didactica import MATERIALES_DEFECTO, generar_unidad
from biomecanica.habilidades import CARRERA

from .models import Formato, Metodologia, Sesion, UnidadDidactica

# Un error se usa para priorizar el plan del salón si aparece en al menos este % de estudiantes
UMBRAL_ERROR_GRUPAL = 25

CAMPOS_PLANTILLA = ["orden", "titulo", "fase_pedagogica", "objetivo", "distribucion", "actividad_inicial",
                    "actividad_central", "actividad_final", "consigna", "criterio_eval"]


def banco_plantillas() -> Dict[str, List[Dict[str, Any]]]:
    banco: Dict[str, List[Dict[str, Any]]] = {}
    for p in PlantillaSesion.objects.select_related("habilidad").order_by("habilidad__orden", "orden"):
        banco.setdefault(p.habilidad.nombre, []).append({c: getattr(p, c) for c in CAMPOS_PLANTILLA} | {"id": p.pk})
    return banco


def preferencias(formato: str = Formato.CIRCUITO, metodologia: str = Metodologia.TAREAS,
                 materiales: Optional[Iterable[str]] = None, periodo: int = 1, duracion_min: int = 50,
                 total_clases: int = 12) -> Dict[str, Any]:
    """Preferencias del docente en el formato que espera ``generar_unidad`` (claves del JS)."""
    mats = [m for m in (materiales or []) if m]
    return {"format": formato, "pedagogy": metodologia, "materials": ", ".join(mats) or MATERIALES_DEFECTO,
            "duration": str(duracion_min), "period": str(periodo), "totalClasses": str(total_clases),
            "_materiales_lista": mats}


@transaction.atomic
def _guardar(docente, habilidad: Habilidad, unidad: Dict[str, Any], prefs: Dict[str, Any],
             evaluacion: Optional[Evaluacion] = None, grupal: Optional[EvaluacionGrupal] = None) -> UnidadDidactica:
    ud = UnidadDidactica.objects.create(
        docente=docente, evaluacion=evaluacion, evaluacion_grupal=grupal, habilidad=habilidad,
        formato=unidad["formato"], metodologia=unidad["metodologia"], materiales=prefs.get("_materiales_lista", []),
        periodo=int(unidad["periodo"]), duracion_min=int(prefs["duration"]), total_clases=int(unidad["total_clases"]),
        contenido={k: v for k, v in unidad.items() if k != "clases_secuencia"},
    )
    plantillas = {(p.habilidad.nombre, p.orden): p for p in PlantillaSesion.objects.select_related("habilidad")}
    habilidad_banco = habilidad.nombre if habilidad.tiene_plantillas_propias else CARRERA
    Sesion.objects.bulk_create([
        Sesion(unidad=ud, numero=s["numero"], plantilla=plantillas.get((habilidad_banco, s["orden_plantilla"])),
               es_refuerzo=s["es_refuerzo"], error_reforzado=(s["error_reforzado"] or "")[:200],
               titulo=s["titulo"][:220], fase_pedagogica=s["fase_pedagogica"][:80], objetivo=s["objetivo"],
               distribucion=s["distribucion"], actividad_inicial=s["actividad_inicial"],
               actividad_central=s["actividad_central"], actividad_final=s["actividad_final"],
               consigna=s["consigna"], criterio_eval=s["criterio_eval"])
        for s in unidad["clases_secuencia"]
    ])
    return ud


def unidad_para_evaluacion(evaluacion: Evaluacion, docente, prefs: Dict[str, Any]) -> UnidadDidactica:
    """Unidad individual: las sesiones de refuerzo atacan las falencias del estudiante."""
    if evaluacion.estado != Evaluacion.Estado.LISTA or not evaluacion.habilidad_detectada:
        raise ValueError("La evaluación aún no tiene diagnóstico")
    unidad = generar_unidad(evaluacion.como_diagnostico(), prefs, banco_plantillas(), grado=evaluacion.grado)
    return _guardar(docente, evaluacion.habilidad_detectada, unidad, prefs, evaluacion=evaluacion)


def unidad_para_grupo(grupal: EvaluacionGrupal, docente, prefs: Dict[str, Any]) -> UnidadDidactica:
    """Unidad del salón: habilidad con menor madurez media, priorizando sus errores más frecuentes.

    Mejora sobre el JS, que siempre generaba el plan de Carrera sin priorizar.
    """
    habilidad = habilidad_mas_debil(grupal) or grupal.habilidad or Habilidad.objects.get(nombre=CARRERA)
    consolidado = consolidar_grupo(grupal, habilidad)
    errores = [{"error": e["error"], "impacto_biomecanico": f"Presente en el {e['porcentaje']}% del salón"}
               for e in consolidado["errores"] if e["porcentaje"] >= UMBRAL_ERROR_GRUPAL]
    diagnostico = {"habilidad_detectada": habilidad.nombre, "criterios": [], "errores_criticos": errores,
                   "frases_profe": habilidad.frases_profe}
    unidad = generar_unidad(diagnostico, prefs, banco_plantillas(), grado=grupal.grupo.grado, es_grupal=True, priorizar=True)
    return _guardar(docente, habilidad, unidad, prefs, grupal=grupal)


def unidad_como_dict(ud: UnidadDidactica) -> Dict[str, Any]:
    """Contenido + sesiones actuales (editadas por el docente) en el formato de ``generar_unidad``."""
    sesiones = [{
        "numero": s.numero, "titulo": s.titulo, "es_refuerzo": s.es_refuerzo, "error_reforzado": s.error_reforzado,
        "fase_pedagogica": s.fase_pedagogica, "objetivo": s.objetivo, "distribucion": s.distribucion,
        "actividad_inicial": s.actividad_inicial, "actividad_central": s.actividad_central,
        "actividad_final": s.actividad_final, "consigna": s.consigna, "criterio_eval": s.criterio_eval,
        "minutos_inicial": ud.contenido.get("duraciones", {}).get("inicial", "").split(" ")[0],
        "minutos_central": ud.contenido.get("duraciones", {}).get("central", "").split(" ")[0],
        "minutos_final": ud.contenido.get("duraciones", {}).get("final", "").split(" ")[0],
    } for s in ud.sesiones.all()]
    return {**ud.contenido, "clases_secuencia": sesiones}
