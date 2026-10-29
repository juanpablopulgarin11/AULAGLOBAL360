"""Documentos Word a partir de los modelos."""
from __future__ import annotations

from typing import Any, Iterable, Mapping, Optional, Tuple

from apps.evaluaciones.models import Evaluacion
from apps.planeacion.models import UnidadDidactica
from apps.planeacion.servicios import unidad_como_dict

from . import word


def _docente(usuario) -> str:
    return (usuario.get_full_name() or usuario.username) if usuario else ""


def _institucion(usuario) -> str:
    return usuario.institucion.nombre if usuario and getattr(usuario, "institucion", None) else ""


def reporte_de_evaluacion(ev: Evaluacion) -> Tuple[bytes, str]:
    imagenes = []
    for f in ev.fotogramas.all():
        if f.imagen_esqueleto:
            with f.imagen_esqueleto.open("rb") as fh:
                imagenes.append(fh.read())
    est = ev.estudiante
    contenido = word.reporte_estudiante(
        ev.como_diagnostico(), estudiante=str(est) if est else "", grupo=str(est.grupo) if est else "",
        docente=_docente(ev.docente), institucion=_institucion(ev.docente), fecha=ev.creado.date(),
        imagenes=imagenes, advertencias=ev.advertencias,
    )
    nombre = word.nombre_archivo("Reporte", str(est) if est else f"evaluacion_{ev.pk}",
                                 ev.habilidad_detectada.nombre if ev.habilidad_detectada else "")
    return contenido, nombre


def documento_de_unidad(ud: UnidadDidactica, montajes: Optional[Mapping[int, Mapping[str, Any]]] = None,
                        sesiones_filtro: Optional[Iterable[int]] = None) -> Tuple[bytes, str]:
    """Word de la unidad. ``montajes``: fotos del montaje 3D por número de sesión (ver ``word.unidad_didactica``).
    ``sesiones_filtro``: si se indica, solo se incluyen las sesiones cuyos números estén en esta colección.
    """
    u = unidad_como_dict(ud)
    if sesiones_filtro is not None:
        filtro_set = {int(x) for x in sesiones_filtro}
        if filtro_set:
            u["clases_secuencia"] = [s for s in u["clases_secuencia"] if s["numero"] in filtro_set]
    contenido = word.unidad_didactica(u, institucion=_institucion(ud.docente), docente=_docente(ud.docente),
                                      montajes=montajes)
    total_clases = len(u.get("clases_secuencia", []))
    nombre = word.nombre_archivo("Unidad_Didactica", f"Periodo{ud.periodo}", f"{total_clases}Clases",
                                 ud.habilidad.nombre, ud.formato)
    return contenido, nombre

