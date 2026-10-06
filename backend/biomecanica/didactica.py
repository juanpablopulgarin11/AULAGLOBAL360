"""Generador de la unidad didáctica (port de ``generateDidacticPlan``, ``script.js:5153``).

Python puro: recibe el diagnóstico, las preferencias del docente y el banco de plantillas
(``{habilidad: [plantilla, ...]}``, desde la base de datos o desde
``docs/datos/plantillas_progresion.json``) y devuelve la unidad como ``dict``.

A diferencia del JS, las sesiones no llevan HTML: los minutos, el refuerzo y el error que
se refuerza van en campos propios y el formato se aplica al presentar (plantilla o Word).
"""
from __future__ import annotations

import datetime as _dt
import math
import re
from typing import Any, Dict, List, Mapping, Optional, Sequence

from .habilidades import CARRERA, grado_y_ciclo
from .jsutil import js_round

FORMATO_DEFECTO = "Circuito de Estaciones"
METODOLOGIA_DEFECTO = "Asignación de Tareas"
MATERIALES_DEFECTO = "Aros, Conos y recursos corporales"
SUFIJO_REFUERZO = " 🎯 [Enfoque Prioritario]"

STOP_WORDS = {"para", "como", "sobre", "durante", "fase", "patron", "criterio", "movimiento", "estudiante",
              "cuerpo", "logra", "mantiene", "realiza", "adecuada", "adecuado"}
_SEPARADORES = re.compile(r"[\s,.;:]+")

FRASES_DEFECTO = [
    "¡Aterriza suave como gato ninja!",
    "¡Brazos firmes a 90 grados y mirada al frente!",
    "¡Siente la impulsión desde tus pies!",
]


def sustituir(texto: str, materiales: str, formato: str, metodologia: str) -> str:
    """Reemplaza los marcadores de las plantillas por las preferencias del docente."""
    return texto.replace("{materiales}", materiales).replace("{formato}", formato).replace("{metodologia}", metodologia)


def _palabras(texto: str) -> List[str]:
    return [w for w in _SEPARADORES.split(texto.lower()) if len(w) > 3 and w not in STOP_WORDS]


def tiempos_sesion(duracion_min: int) -> Dict[str, int]:
    """20 % activación, 20 % vuelta a la calma (mínimo 5 min cada una), resto desarrollo."""
    inicial = max(5, js_round(duracion_min * 0.20))
    final = max(5, js_round(duracion_min * 0.20))
    return {"inicial": inicial, "central": duracion_min - inicial - final, "final": final, "total": duracion_min}


def plantillas_para(banco: Mapping[str, Sequence[Mapping[str, Any]]], habilidad: str) -> List[Mapping[str, Any]]:
    """Plantillas de la habilidad; si no tiene propias se usan las de Carrera (como el JS)."""
    lista = banco.get(habilidad) or banco.get(CARRERA)
    if not lista:
        raise ValueError("No hay plantillas de sesiones cargadas (ejecuta manage.py cargar_catalogo)")
    return sorted(lista, key=lambda p: p.get("orden", 0))


def generar_unidad(diagnostico: Mapping[str, Any], prefs: Optional[Mapping[str, Any]],
                   banco: Mapping[str, Sequence[Mapping[str, Any]]], grado: Optional[str] = "7_anos",
                   es_grupal: bool = False, anio: Optional[int] = None,
                   priorizar: Optional[bool] = None) -> Dict[str, Any]:
    """``priorizar`` (por defecto: solo en modo individual, como el JS) reordena las sesiones
    según las falencias. El plan grupal lo activa con los errores consolidados del salón."""
    prefs = prefs or {}
    priorizar = (not es_grupal) if priorizar is None else priorizar
    skill = diagnostico.get("habilidad_detectada") or CARRERA
    formato = prefs.get("format") or FORMATO_DEFECTO
    metodologia = prefs.get("pedagogy") or METODOLOGIA_DEFECTO
    materiales = prefs.get("materials") or MATERIALES_DEFECTO
    total_min = int(prefs.get("duration") or 50)
    periodo = str(prefs.get("period") or "1")
    total_clases = int(prefs.get("totalClasses") or 12)
    anio = anio or _dt.date.today().year

    info_grado = grado_y_ciclo(grado)
    grado_txt = "Salón Completo (Heterogéneo)" if es_grupal else info_grado["grado"]
    ciclo = "Básica Primaria" if es_grupal else info_grado["ciclo"]
    t = tiempos_sesion(total_min)

    plantillas = [
        {**p, **{k: sustituir(p[k], materiales, formato, metodologia)
                 for k in ("titulo", "objetivo", "distribucion", "actividad_inicial", "actividad_central",
                           "actividad_final", "consigna", "criterio_eval")}}
        for p in plantillas_para(banco, skill)
    ]

    # Falencias del diagnóstico: criterios no logrados y errores críticos reales
    fallidos = [c for c in diagnostico.get("criterios") or [] if c.get("puntaje") == 0]
    errores = [e for e in diagnostico.get("errores_criticos") or []
               if (e.get("error") or "") and "sin fallos" not in e["error"].lower() and "adecuada" not in e["error"].lower()]
    hay_falencias = priorizar and (bool(fallidos) or bool(errores))

    def afinidad(p: Mapping[str, Any]):
        score, error = 0, ""
        pajar = f"{p['titulo']} {p['objetivo']} {p['criterio_eval']} {p['actividad_central']}".lower()
        for e in errores:
            coincidencias = sum(1 for w in _palabras(e.get("error") or "") if w in pajar)
            if coincidencias > 0 and coincidencias * 3 > score:
                score, error = coincidencias * 3, e["error"]
        for c in fallidos:
            coincidencias = sum(1 for w in _palabras(f"{c.get('criterio', '')} {c.get('observacion') or ''}") if w in pajar)
            if coincidencias > 0 and coincidencias * 2 > score:
                score = coincidencias * 2
                if not error:
                    error = c.get("criterio", "")
        return score, error

    sesiones: List[Dict[str, Any]] = []

    def agregar(numero: int, p: Mapping[str, Any], refuerzo: bool, error: str) -> None:
        sesiones.append({
            "numero": numero,
            "orden_plantilla": p.get("orden"),
            "titulo": p["titulo"],
            "titulo_mostrado": p["titulo"] + (SUFIJO_REFUERZO if refuerzo else ""),
            "es_refuerzo": refuerzo,
            "error_reforzado": error if refuerzo else "",
            "fase_pedagogica": p["fase_pedagogica"],
            "objetivo": p["objetivo"],
            "distribucion": p["distribucion"],
            "actividad_inicial": p["actividad_inicial"],
            "actividad_central": p["actividad_central"],
            "actividad_final": p["actividad_final"],
            "consigna": p["consigna"],
            "criterio_eval": p["criterio_eval"],
            "minutos_inicial": t["inicial"],
            "minutos_central": t["central"],
            "minutos_final": t["final"],
        })

    if hay_falencias:
        puntuadas = [{"p": p, "i": i, **dict(zip(("score", "error"), afinidad(p)))} for i, p in enumerate(plantillas)]
        umbral = max(4, math.floor(max(x["score"] for x in puntuadas) * 0.6))
        prioritarias = sorted([x for x in puntuadas if x["score"] >= umbral], key=lambda x: -x["score"])[:2]
        indices = {x["i"] for x in prioritarias}
        restantes = [x for x in puntuadas if x["i"] not in indices]
        # Sesión 1 de exploración, luego las de refuerzo, luego la progresión normal
        orden = ([restantes.pop(0)] if restantes else []) + prioritarias + restantes
        for i in range(total_clases):
            x = orden[i % len(orden)]
            refuerzo = x["i"] in indices and i < 1 + len(prioritarias) and bool(x["error"])
            agregar(i + 1, x["p"], refuerzo, x["error"])
    else:
        for i in range(total_clases):
            agregar(i + 1, plantillas[i % len(plantillas)], False, "")

    frases = list(diagnostico.get("frases_profe") or []) or list(FRASES_DEFECTO)

    return {
        "institucion": "INSTITUCIÓN EDUCATIVA / COLEGIO",
        "area": "Educación Física, Recreación y Deportes",
        "ciclo": ciclo,
        "grado": grado_txt,
        "periodo": periodo,
        "total_clases": str(total_clases),
        "docente": "Docente Titular de Educación Física",
        "anio": str(anio),
        "jornada": "Mañana / Única",
        "duracion_clase": f"{total_min} Minutos",
        "lugar": "Patio del colegio, coliseo y cancha de primaria",
        "tema": f"Habilidades Motrices Básicas (Patrón: {skill}) y Capacidades Sociomotrices - Unidad Didáctica Periódica",
        "skill": skill,
        "formato": formato,
        "metodologia": metodologia,
        "materiales": materiales,
        "pregunta_problematizadora": (
            f"¿Qué acciones motrices puedo desarrollar con mi cuerpo y cómo optimizo mis patrones de {skill.lower()} a lo "
            "largo de este período escolar para interactuar de forma armónica, segura y eficiente en mi entorno escolar y cotidiano?"),
        "objetivo_general": (
            f"Fortalecer, estructurar y perfeccionar los patrones básicos de movimiento vinculados a la {skill} y las capacidades "
            f"sociomotrices a través de una secuencia pedagógica progresiva de {total_clases} clases en el Período {periodo}."),
        "objetivos_especificos": [
            f"Comprender y experimentar las fases biomecánicas de {skill} transitando desde el estadio elemental hacia el estadio maduro.",
            "Ejecutar secuencias motrices de dificultad progresiva aplicando la alineación postural, apoyos elásticos y control segmentario.",
            "Fomentar la cooperación activa, el respeto por las normas y el cuidado de sí mismo y de los compañeros en retos individuales y colectivos.",
        ],
        "estandares": {
            "motriz": "Identifica y controla los segmentos corporales en movimientos realizados en diferentes alturas, trayectorias y con diversos elementos a lo largo de la secuencia curricular del período.",
            "expresivo_corporal": "Reconoce su cuerpo y demuestra sus posibilidades motrices para la interacción en el aula de clase, el patio escolar y el hogar con creciente fluidez y expresividad.",
            "axilogica_corporal": "Dispone de múltiples posibilidades de movimiento y las aplica cotidianamente a través de juegos y ejercicios en su contexto, cuidando su bienestar y el de sus compañeros.",
        },
        "lineamientos": ("Desarrollo del pensamiento motriz, integración de la corporeidad, hábitos de vida saludable y formación en "
                         "valores a través de la lúdica y la resolución de retos motores progresivos (Lineamientos Curriculares MEN Colombia)."),
        "indicadores": {
            "saber": f"Exploro e identifico los conceptos y componentes biomecánicos de {skill} mediante actividades lúdicas y reflexivas en las {total_clases} sesiones.",
            "hacer": f"Controlo y ejecuto en forma coordinada las fases de {skill} con y sin ayuda de elementos en diferentes trayectorias, ritmos y velocidades.",
            "ser": "Participo y me integro con entusiasmo en las actividades individuales y grupales, procurando generar un ambiente de respeto, compañerismo y sana convivencia.",
        },
        "clases_secuencia": sesiones,
        "duraciones": {k: f"{v} minutos" for k, v in t.items()},
        "tarea_extracurricular": (f"Compartir y repasar en casa con la familia las dinámicas y retos de {skill} practicados en cada "
                                  "sesión, fortaleciendo la integración familiar y los hábitos de vida activa."),
        "evaluacion": (f"Evaluación formativa continua: Observación directa de la progresión motriz del estudiante clase a clase ({skill}), "
                       "valoración de la adquisición de criterios maduros de la Batería HMB, participación activa y autorregulación."),
        "metodos_ensenanza": ("Mando directo pedagógico por asignación de tareas, descubrimiento guiado y aprendizaje cooperativo "
                              "estructurado en progresión de dificultad."),
        "estilo_ensenanza": f"Estilo lúdico-participativo y resolución de problemas motores basado en {metodologia}.",
        "adaptaciones_piar": ("Ajustes Razonables (DUA / PIAR): Graduación de niveles de dificultad, adaptación de distancias y apoyos; "
                              "uso de compañeros tutores; variación de materiales y pausas activas para asegurar la inclusión de todos los ritmos de aprendizaje."),
        "reflexion_pedagogica": ("La secuencia progresiva concibe el error motriz como una oportunidad de autorregulación y andamiaje "
                                 "corporal, garantizando que cada estudiante avance con confianza hacia el estadio maduro."),
        "retroalimentacion_tips": frases,
        "bibliografia": (
            "Ministerio de Educación Nacional de Colombia (MEN). Orientaciones Pedagógicas para la Educación Física, Recreación y Deporte. "
            "/ Gallahue, D. L., & Ozmun, J. C. (2012). Understanding Motor Development: Infants, Children, Adolescents, Adults. "
            "/ González Palacio, E., Montoya Grisales, N., Cardona, C., Marín, E., & Muñoz, D. (2021). Diseño y validación de una "
            "batería de habilidades motrices básicas para niños entre 5 y 11 años (Dialnet 7925607). "
            "/ Ulrich, D. A. (2019). Test of Gross Motor Development (TGMD-3)."),
    }
