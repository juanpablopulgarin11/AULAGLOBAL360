"""Catálogo de las 9 habilidades motrices básicas evaluadas y de los grados."""
from __future__ import annotations

from typing import Dict, Optional

CARRERA = "Carrera"
SALTO_HORIZONTAL = "Salto Horizontal"
MARCHA = "Marcha"
SALTO_UNIPODAL = "Salto Unipodal"
LANZAMIENTO = "Lanzamiento Sobre Hombro"
ATRAPE = "Recepción y Atrape"
PATEAR = "Patear"
EQ_DINAMICO = "Equilibrio Dinámico"
EQ_ESTATICO = "Equilibrio Estático Unipodal"

HABILIDADES = [CARRERA, SALTO_HORIZONTAL, MARCHA, SALTO_UNIPODAL, LANZAMIENTO, ATRAPE, PATEAR, EQ_DINAMICO, EQ_ESTATICO]

# Códigos del selector de la interfaz → nombre canónico
CODIGO_A_HABILIDAD: Dict[str, str] = {
    "carrera": CARRERA,
    "salto": SALTO_HORIZONTAL,
    "marcha": MARCHA,
    "salto_unipodal": SALTO_UNIPODAL,
    "lanzar": LANZAMIENTO,
    "atrapar": ATRAPE,
    "patear": PATEAR,
    "equilibrio": EQ_DINAMICO,
    "equilibrio_estatico": EQ_ESTATICO,
}
HABILIDAD_A_CODIGO = {v: k for k, v in CODIGO_A_HABILIDAD.items()}

# Alias aceptados por el motor local (``skillMap`` en script.js)
_ALIAS: Dict[str, str] = {
    **CODIGO_A_HABILIDAD,
    "salto_horizontal": SALTO_HORIZONTAL,
    "salto horizontal": SALTO_HORIZONTAL,
    "salto unipodal": SALTO_UNIPODAL,
    "lanzar_derecha": LANZAMIENTO,
    "lanzar_izquierda": LANZAMIENTO,
    "lanzamiento": LANZAMIENTO,
    "lanzamiento sobre hombro": LANZAMIENTO,
    "recepcion": ATRAPE,
    "recepción": ATRAPE,
    "recepcion y atrape": ATRAPE,
    "recepción y atrape": ATRAPE,
    "equilibrio_dinamico": EQ_DINAMICO,
    "equilibrio dinamico": EQ_DINAMICO,
    "equilibrio dinámico": EQ_DINAMICO,
    "equilibrio estatico": EQ_ESTATICO,
    "equilibrio estático": EQ_ESTATICO,
    "equilibrio estático unipodal": EQ_ESTATICO,
}


def resolver_habilidad(codigo: Optional[str]) -> Optional[str]:
    """Nombre canónico a partir de un código o texto libre; ``None`` si es 'auto' o no se reconoce."""
    if not codigo or codigo == "auto":
        return None
    c = codigo.lower().strip()
    if c in _ALIAS:
        return _ALIAS[c]
    if "salto" in c and "unipodal" in c:
        return SALTO_UNIPODAL
    if "salto" in c:
        return SALTO_HORIZONTAL
    if "carrera" in c or "corre" in c:
        return CARRERA
    if "marcha" in c or "camina" in c:
        return MARCHA
    if "lanz" in c or "arroja" in c:
        return LANZAMIENTO
    if "atrap" in c or "recep" in c:
        return ATRAPE
    if "pate" in c:
        return PATEAR
    if "estatico" in c or "estático" in c:
        return EQ_ESTATICO
    if "dinamico" in c or "dinámico" in c or "equilibrio" in c:
        return EQ_DINAMICO
    return None


# Grados MEN (``getGradeAndCycle`` en script.js)
GRADOS: Dict[str, Dict[str, str]] = {
    "5_anos": {"grado": "Transición / Preescolar (5 años)", "ciclo": "Preescolar / Inicial"},
    "6_anos": {"grado": "Grado 1º de Primaria (6 años)", "ciclo": "Básica Primaria (Ciclo 1)"},
    "7_anos": {"grado": "Grado 2º de Primaria (7 años)", "ciclo": "Básica Primaria (Ciclo 1)"},
    "8_anos": {"grado": "Grado 3º de Primaria (8 años)", "ciclo": "Básica Primaria (Ciclo 1)"},
    "9_11_anos": {"grado": "Grado 4º - 5º (9 a 11 años)", "ciclo": "Básica Primaria (Ciclo 2)"},
}
GRADO_POR_DEFECTO = GRADOS["8_anos"]


def grado_y_ciclo(codigo: Optional[str]) -> Dict[str, str]:
    return dict(GRADOS.get(codigo or "", GRADO_POR_DEFECTO))
