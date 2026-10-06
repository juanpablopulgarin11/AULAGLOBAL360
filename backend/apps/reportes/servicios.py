"""Documentos Word a partir de los modelos."""
from __future__ import annotations

from typing import Tuple

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


def documento_de_unidad(ud: UnidadDidactica) -> Tuple[bytes, str]:
    u = unidad_como_dict(ud)
    contenido = word.unidad_didactica(u, institucion=_institucion(ud.docente), docente=_docente(ud.docente))
    nombre = word.nombre_archivo("Unidad_Didactica", f"Periodo{ud.periodo}", f"{ud.total_clases}Clases",
                                 ud.habilidad.nombre, ud.formato)
    return contenido, nombre
