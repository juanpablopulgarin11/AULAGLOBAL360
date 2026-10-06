"""Esquema de la respuesta de Gemini: lo que no cumpla el contrato se rechaza y se usa el motor local."""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

Habilidad = Literal["Carrera", "Salto Horizontal", "Marcha", "Salto Unipodal", "Lanzamiento Sobre Hombro",
                    "Recepción y Atrape", "Patear", "Equilibrio Dinámico", "Equilibrio Estático Unipodal"]


class CriterioIA(BaseModel):
    criterio: str
    fase: str = ""
    puntaje: Literal[0, 1]
    observacion: str = ""


class ErrorIA(BaseModel):
    error: str
    impacto_biomecanico: str = ""


class AnalisisArticularIA(BaseModel):
    angulos_principales: str = ""
    cadena_cinetica: str = ""
    apoyo_y_base: str = ""


class DiagnosticoIA(BaseModel):
    habilidad_detectada: Habilidad
    resumen_biomecanico: str
    criterios: List[CriterioIA] = Field(min_length=1, max_length=8)
    analisis_articular: AnalisisArticularIA = AnalisisArticularIA()
    errores_criticos: List[ErrorIA] = []
    frases_profe: List[str] = Field(default_factory=list, max_length=6)
    # Gemini también los envía, pero se recalculan a partir de los criterios
    porcentaje_madurez: Optional[int] = None
    estadio_gallahue: Optional[str] = None
