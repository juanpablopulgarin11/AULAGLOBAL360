"""Detección automática de la habilidad a partir de eventos del video completo (motor v2).

El clasificador v1 suma puntos por posturas de 8 fotogramas: una persona quieta en estocada
sumaba puntos de «equilibrio estático» por no desplazarse. Aquí cada habilidad exige que su
**evento característico** haya ocurrido (vuelos alternos, despegue bipodal, saltos sobre el
mismo pie, segundos en un pie, golpeo del tobillo, brazo sobre el hombro a alta velocidad…).
Si ningún evento es claro se devuelve confianza «baja» y el sistema le pide al docente que
elija la habilidad en lugar de adivinar.

Las palabras clave de las observaciones del docente siguen teniendo prioridad (``clasificador``).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from .clasificador import clasificar_por_texto
from .habilidades import (
    ATRAPE, CARRERA, EQ_DINAMICO, EQ_ESTATICO, LANZAMIENTO, MARCHA, PATEAR, SALTO_HORIZONTAL,
    SALTO_UNIPODAL,
)


def _fem(lado: Optional[str]) -> str:
    return {"derecho": "derecha", "izquierdo": "izquierda"}.get(lado or "", lado or "")


@dataclass
class Deteccion:
    habilidad: str
    confianza: str            # "docente" | "alta" | "media" | "baja"
    motivo: str
    candidatas: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return {"habilidad": self.habilidad, "confianza": self.confianza, "motivo": self.motivo, "candidatas": self.candidatas}


def detectar(cin: Dict[str, Any], observaciones: Optional[str] = "") -> Deteccion:
    por_texto = clasificar_por_texto(observaciones)
    if por_texto:
        return Deteccion(por_texto, "docente", "Indicada en las observaciones del docente.", [por_texto])
    if not cin.get("suficiente"):
        return Deteccion(CARRERA, "baja", "No hubo suficientes fotogramas con el cuerpo visible.", [])

    desp = abs(cin.get("desplazamiento_piernas") or 0)
    vuelos = cin.get("vuelos") or 0
    alternos = cin.get("vuelos_alternos") or 0
    hops = cin.get("saltos_mismo_pie") or 0
    uni_s = cin.get("apoyo_unipodal_s") or 0
    salto = cin.get("salto") or {}
    lanz = cin.get("lanzamiento") or {}
    pateo = cin.get("pateo") or {}
    atrape = cin.get("atrape") or {}
    candidatas: List[tuple] = []                 # (prioridad, habilidad, confianza, motivo)

    if hops >= 2:
        candidatas.append((100, SALTO_UNIPODAL, "alta" if hops >= 3 else "media",
                           f"{hops} saltos seguidos sobre el pie {cin.get('lado_saltos')}."))
    if salto.get("despegue_bipodal") and salto.get("aterrizaje_bipodal") and (salto.get("avance_piernas") or 0) >= 0.3 \
            and vuelos <= 3:
        candidatas.append((95, SALTO_HORIZONTAL, "alta", f"Despegue y caída con ambos pies avanzando "
                                                         f"{salto.get('avance_piernas'):.1f} piernas."))
    if vuelos >= 2 and desp >= 1.5 and hops < 2:
        candidatas.append((90, CARRERA, "alta" if alternos >= 1 else "media",
                           f"{vuelos} fases aéreas con desplazamiento de {desp:.1f} piernas."))
    if uni_s >= 1.5 and desp < 0.6 and vuelos == 0:
        candidatas.append((85, EQ_ESTATICO, "alta" if uni_s >= 3 else "media",
                           f"{uni_s:.1f} s sobre el pie {cin.get('pie_apoyo')} sin desplazarse."))
    if lanz.get("muneca_sobre_hombro") and (lanz.get("velocidad_muneca") or 0) >= 5 and desp < 1.5 and vuelos == 0:
        candidatas.append((80, LANZAMIENTO, "alta" if (lanz.get("velocidad_muneca") or 0) >= 7 else "media",
                           f"Brazo {lanz.get('brazo')} sobre el hombro a {lanz.get('velocidad_muneca')} piernas/s."))
    if pateo.get("apoyo_firme") and (pateo.get("velocidad_tobillo") or 0) >= 6 and (pateo.get("rango_cadera") or 0) >= 40 \
            and desp < 1.5 and vuelos == 0 and uni_s < 1.5:
        candidatas.append((78, PATEAR, "alta" if (pateo.get("velocidad_tobillo") or 0) >= 9 else "media",
                           f"Golpeo con la pierna {_fem(pateo.get('pierna'))} desde un apoyo firme."))
    if (atrape.get("manos_juntas") or 9) <= 0.45 and (atrape.get("flexion_amortigua") or 0) >= 15 and desp < 1.0 \
            and vuelos == 0 and not lanz.get("muneca_sobre_hombro"):
        candidatas.append((70, ATRAPE, "media", "Las manos se juntan al frente y los brazos amortiguan."))
    if vuelos == 0 and desp >= 1.0:
        ancho = (cin.get("linea") or {}).get("ancho_paso")
        if ancho is not None and ancho <= 0.12:
            candidatas.append((60, EQ_DINAMICO, "media", "Camina con los pies muy juntos, como sobre una línea."))
        candidatas.append((55, MARCHA, "media" if (cin.get("doble_apoyo_frac") or 0) >= 0.05 else "baja",
                           f"Se desplaza {desp:.1f} piernas caminando, sin fases aéreas."))

    if not candidatas:
        return Deteccion(CARRERA, "baja", "No se reconoce el evento característico de ninguna prueba "
                                          "(¿el gesto quedó fuera del video o la cámara se movió?).", [])
    candidatas.sort(key=lambda c: c[0], reverse=True)
    _, habilidad, confianza, motivo = candidatas[0]
    otras = [c[1] for c in candidatas[1:]]
    if otras and confianza == "alta" and candidatas[1][2] == "alta":
        confianza = "media"
        motivo += f" También se parece a {otras[0]}."
    return Deteccion(habilidad, confianza, motivo, [habilidad] + otras)
