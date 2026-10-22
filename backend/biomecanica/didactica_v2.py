"""Unidad didáctica personalizada (Django): por habilidad y por resultado de la evaluación.

El generador v1 (``didactica.generar_unidad_v1``) conserva la paridad con ``generateDidacticPlan`` de la
web: textos genéricos con el nombre de la habilidad, refuerzos elegidos por palabras clave y las
sesiones de Carrera para las 6 habilidades sin banco propio. Aquí:

- Cada habilidad tiene su banco de 12 sesiones (``docs/datos/plantillas_progresion.json``), escrito
  con los libros de la carpeta Data, y cada sesión declara qué criterios de la Batería HMB trabaja.
- Las sesiones de refuerzo se eligen por los **criterios no logrados** en la evaluación (o por los
  errores más frecuentes del salón), no por coincidencia de palabras.
- Pregunta problematizadora, objetivos, indicadores, estándar motriz, tarea para la casa,
  evaluación y consignas son propios de la habilidad; los objetivos específicos nombran los
  criterios por mejorar.
- La unidad guarda el punto de partida (puntaje, estadio, logrados, por mejorar y por confirmar).
"""
from __future__ import annotations

import datetime as _dt
from typing import Any, Dict, List, Mapping, Optional, Sequence

from .didactica import (
    FORMATO_DEFECTO, MATERIALES_DEFECTO, METODOLOGIA_DEFECTO, SUFIJO_REFUERZO, _palabras, plantillas_para, sustituir,
    tiempos_sesion,
)
from .habilidades import CARRERA, grado_y_ciclo
from .reglas import REGLAS

MAX_REFUERZOS = 3

PERFILES: Dict[str, Dict[str, str]] = {
    "Carrera": {
        "pregunta": "¿Cómo puedo correr más rápido y con menos esfuerzo coordinando mis brazos, mis piernas y mi respiración en los juegos y en la vida diaria?",
        "objetivo": "el patrón maduro de la carrera (braceo en oposición, inclinación del tronco, propulsión, recobro y fase de vuelo)",
        "saber": "Identifico las fases de la carrera (apoyo, propulsión, recobro y vuelo) y cómo me ayudan los brazos a correr mejor.",
        "hacer": "Corro coordinando brazos y piernas en oposición, con fase de vuelo, en diferentes ritmos, trayectorias y juegos.",
        "motriz": "Controla de forma coordinada la carrera variando velocidades, trayectorias y distancias en juegos y retos.",
        "tarea": "Jugar en casa a 'el semáforo' con la familia: trotar suave, correr rápido y frenar en un pie, cuidando el braceo en oposición.",
    },
    "Salto Horizontal": {
        "pregunta": "¿Cómo uso la fuerza de mis piernas y el impulso de mis brazos para saltar más lejos y caer con seguridad?",
        "objetivo": "el patrón maduro del salto horizontal (carga, despegue con extensión, vuelo, aterrizaje bipodal amortiguado y recepción estable)",
        "saber": "Reconozco las fases del salto (impulso, despegue, vuelo y caída) y por qué debo amortiguar al caer.",
        "hacer": "Salto hacia adelante con los dos pies coordinando el impulso de los brazos y caigo con control sin perder el equilibrio.",
        "motriz": "Controla el impulso, el vuelo y la caída en saltos de longitud con y sin obstáculos.",
        "tarea": "Practicar en casa saltos de rana sobre las líneas del piso y caer 'como gato', en silencio, contando hasta 3 sin moverse.",
    },
    "Lanzamiento Sobre Hombro": {
        "pregunta": "¿Cómo coordino mis piernas, mi tronco y mi brazo para lanzar un objeto lejos y con precisión?",
        "objetivo": "el patrón maduro del lanzamiento por encima del hombro (paso contralateral, rotación del tronco, armado, extensión y dirección)",
        "saber": "Identifico la secuencia del lanzamiento: pie contrario adelante, giro del tronco y extensión del brazo.",
        "hacer": "Lanzo por encima del hombro coordinando pierna contraria, tronco y brazo hacia objetivos a distintas distancias.",
        "motriz": "Ajusta la fuerza y la dirección de los lanzamientos a objetivos fijos y en movimiento.",
        "tarea": "Lanzar en casa pelotas de papel a una caja o balde desde 2 y 3 metros, adelantando el pie contrario al brazo que lanza.",
    },
    "Marcha": {
        "pregunta": "¿Cómo puedo adaptar los pasos de mi cuerpo para marchar en diferentes ritmos y direcciones sin perder la postura correcta?",
        "objetivo": "el patrón fundamental de la marcha (postura erguida, braceo sagital en oposición, apoyo talón-punta, doble apoyo y dirección)",
        "saber": "Exploro e identifico los componentes de una marcha coordinada (postura, braceo en el plano sagital y apoyo talón-punta) ante estímulos externos.",
        "hacer": "Utilizo las partes de mi cuerpo para marchar eficazmente variando las direcciones, las velocidades y el transporte de pequeños objetos.",
        "motriz": "Identifica y controla de forma coordinada trayectorias y distancias al marchar en diferentes direcciones y ritmos.",
        "tarea": "Practicar en casa con la familia la caminata sobre una línea del piso (la junta de la baldosa), exagerando el braceo y el paso talón-punta.",
    },
    "Salto Unipodal": {
        "pregunta": "¿Cómo logro saltar varias veces sobre un mismo pie sin perder el equilibrio, con los dos lados de mi cuerpo?",
        "objetivo": "el salto unipodal maduro (brazos que estabilizan, tronco alineado, pierna libre pendular, aterrizaje controlado y tres saltos seguidos)",
        "saber": "Reconozco cuál es mi pie más fuerte y cómo la pierna libre y los brazos me ayudan a saltar en un pie.",
        "hacer": "Encadeno saltos en un pie con cada pierna, amortiguando cada caída y manteniendo la dirección.",
        "motriz": "Controla el equilibrio y el impulso en saltos sobre un pie con ambos lados del cuerpo.",
        "tarea": "Jugar en casa a la golosa (rayuela) con la familia, alternando el pie derecho y el izquierdo.",
    },
    "Equilibrio Dinámico": {
        "pregunta": "¿Qué hace mi cuerpo para no caerse cuando camino por superficies estrechas o elevadas?",
        "objetivo": "el equilibrio dinámico (mirada al frente, tronco erguido, brazos coordinados, estabilidad lateral y precisión de los apoyos)",
        "saber": "Comprendo cómo la mirada, la postura y los brazos me ayudan a mantener el equilibrio al desplazarme.",
        "hacer": "Me desplazo sobre líneas, bancos y superficies estrechas sin perder el equilibrio y con los pies sobre la trayectoria.",
        "motriz": "Controla el cuerpo en desplazamientos sobre bases estrechas, elevadas e inestables.",
        "tarea": "Caminar en casa sobre una línea del piso llevando un libro o un cojín en la cabeza y mirando un punto al frente.",
    },
    "Equilibrio Estático Unipodal": {
        "pregunta": "¿Cómo puedo quedarme quieto sobre un pie el tiempo que quiera sin que mi cuerpo se mueva?",
        "objetivo": "el equilibrio estático sobre un pie (brazos relajados, control adelante-atrás y lateral, pierna de apoyo firme y sostén de 5 segundos)",
        "saber": "Reconozco las partes de mi cuerpo que trabajan para mantenerme quieto sobre un pie.",
        "hacer": "Mantengo posturas de equilibrio sobre un pie con cada pierna, en diferentes superficies y con los ojos abiertos o cerrados.",
        "motriz": "Ajusta la postura para mantener el equilibrio estático en distintas bases de sustentación.",
        "tarea": "Cepillarse los dientes en casa parado en un pie (un día el derecho y otro el izquierdo), contando hasta 10.",
    },
    "Recepción y Atrape": {
        "pregunta": "¿Cómo preparo mis ojos, mis brazos y mis manos para atrapar objetos que vienen hacia mí sin que se escapen?",
        "objetivo": "la recepción y el atrape maduros (seguimiento visual, brazos en espera, manos en copa, amortiguación y retención)",
        "saber": "Identifico cómo seguir con la vista la trayectoria de un objeto y cómo poner las manos para atraparlo.",
        "hacer": "Atrapo con las dos manos objetos lanzados desde diferentes distancias y alturas, amortiguando la llegada.",
        "motriz": "Ajusta los movimientos de su cuerpo en la manipulación y recepción de objetos de diferentes tamaños y trayectorias.",
        "tarea": "Jugar en casa a lanzar y atrapar una pelota de calcetines con la familia, contando cuántas atrapadas seguidas logran.",
    },
    "Patear": {
        "pregunta": "¿Cómo coordino mi pie de apoyo, mi pierna y mis brazos para golpear el balón con fuerza y precisión?",
        "objetivo": "el patrón maduro del pateo (brazo contrario, tronco que acompaña, péndulo desde la cadera, seguimiento y golpe hacia el objetivo)",
        "saber": "Reconozco dónde ubicar el pie de apoyo y qué partes del pie puedo usar para golpear el balón.",
        "hacer": "Pateo el balón quieto y en movimiento hacia objetivos, con el pie dominante y con el no dominante.",
        "motriz": "Ajusta la fuerza y la dirección del golpeo con el pie en juegos y retos de precisión.",
        "tarea": "Patear en casa una pelota contra la pared con el interior del pie, 10 veces con cada pie, controlando el rebote.",
    },
}

BIBLIOGRAFIA = (
    "Ministerio de Educación Nacional (MEN). Orientaciones Pedagógicas para la Educación Física, Recreación y Deporte "
    "(Documento 15). / González Palacio, E., Montoya Grisales, N., Cardona, C., Marín, E. y Muñoz, D. (2021). Diseño y "
    "validación de una batería de habilidades motrices básicas para niños entre 5 y 11 años (Dialnet 7925607). / Castañer, M. "
    "y Camerino, O. Manifestaciones básicas de la motricidad. / Pérez Feito, J. M. Sesiones de Educación Física para niños de "
    "6 a 7 y de 8 a 9 años. / Piñón y Pérez. Sesiones de Educación Física 10 a 11 años. / Rodríguez y Bustamante. Juegos "
    "motores para primaria. / Gallahue, D. L. y Ozmun, J. C. (2012). Understanding Motor Development.")


def criterios_de(habilidad: str) -> List[Dict[str, Any]]:
    """Criterios de la batería de la habilidad: ``[{orden, fase, texto, error}]``."""
    regla = REGLAS.get(habilidad)
    return [{"orden": i, "fase": c.fase, "texto": c.texto, "error": c.error}
            for i, c in enumerate(regla.criterios, start=1)] if regla else []


def _criterios_plantilla(p: Mapping[str, Any], base: Sequence[Mapping[str, Any]], propia: bool = True) -> List[int]:
    """Los declarados en el banco; si la plantilla no los trae (o es prestada de otra habilidad, con
    otra numeración), los criterios con los que comparte palabras."""
    if propia and p.get("criterios"):
        return [int(c) for c in p["criterios"]]
    pajar = f"{p['titulo']} {p['objetivo']} {p['criterio_eval']} {p['actividad_central']}".lower()
    return [c["orden"] for c in base if sum(w in pajar for w in _palabras(c["texto"])) >= 2]


def estado_criterios(diagnostico: Mapping[str, Any], base: Sequence[Mapping[str, Any]]) -> Dict[str, List[int]]:
    """Criterios logrados, por mejorar (en orden de prioridad) y por confirmar.

    Individual: por el puntaje de cada criterio. Salón: por los errores consolidados, que vienen
    ordenados del más al menos frecuente."""
    estado: Dict[str, List[int]] = {"logrados": [], "por_mejorar": [], "por_confirmar": []}
    criterios = list(diagnostico.get("criterios") or [])
    if criterios:
        for i, c in enumerate(criterios, start=1):
            orden = int(c.get("orden") or i)
            clave = {1: "logrados", 0: "por_mejorar"}.get(c.get("puntaje"), "por_confirmar")
            estado[clave].append(orden)
        return estado
    por_error = {c["error"]: c["orden"] for c in base}
    for e in diagnostico.get("errores_criticos") or []:
        orden = por_error.get(e.get("error") or "")
        if orden and orden not in estado["por_mejorar"]:
            estado["por_mejorar"].append(orden)
    return estado


def _orden_sesiones(trabaja: Sequence[Sequence[int]], por_mejorar: Sequence[int], total: int) -> List[tuple]:
    """Sesión 1 de exploración, luego una de refuerzo por criterio no logrado (la más temprana que
    lo trabaje) y después la progresión del banco. Devuelve [(índice de plantilla, criterio reforzado | None)]."""
    refuerzos: List[tuple] = []
    usadas = {0}
    for orden in list(por_mejorar)[:MAX_REFUERZOS]:
        candidatas = [i for i, cs in enumerate(trabaja) if orden in cs and i not in usadas]
        if candidatas:
            i = min(candidatas, key=lambda k: (len(trabaja[k]) > 2, k))     # mejor una sesión focalizada que el festival
            usadas.add(i)
            refuerzos.append((i, orden))
    ciclo = [(0, None)] + refuerzos + [(i, None) for i in range(1, len(trabaja)) if i not in usadas]
    # con más clases que sesiones en el banco se repite la progresión, sin volver a marcar refuerzos
    return [(ciclo[k % len(ciclo)][0], ciclo[k][1] if k < len(ciclo) else None) for k in range(total)]


def generar_unidad(diagnostico: Mapping[str, Any], prefs: Optional[Mapping[str, Any]],
                   banco: Mapping[str, Sequence[Mapping[str, Any]]], grado: Optional[str] = "7_anos",
                   es_grupal: bool = False, anio: Optional[int] = None,
                   priorizar: Optional[bool] = None) -> Dict[str, Any]:
    """Misma firma y claves que ``generar_unidad_v1`` más ``diagnostico_base``, ``desempeno_men`` y,
    en cada sesión, ``criterios`` (los de la batería que trabaja) y ``fuente``."""
    prefs = prefs or {}
    priorizar = True if priorizar is None else priorizar
    skill = diagnostico.get("habilidad_detectada") or CARRERA
    perfil = PERFILES.get(skill, PERFILES[CARRERA])
    base = criterios_de(skill)
    por_orden = {c["orden"]: c for c in base}
    formato = prefs.get("format") or FORMATO_DEFECTO
    metodologia = prefs.get("pedagogy") or METODOLOGIA_DEFECTO
    materiales = prefs.get("materials") or MATERIALES_DEFECTO
    total_min = int(prefs.get("duration") or 50)
    periodo = str(prefs.get("period") or "1")
    total_clases = int(prefs.get("totalClasses") or 12)
    anio = anio or _dt.date.today().year
    info_grado = grado_y_ciclo(grado)
    t = tiempos_sesion(total_min)
    regla = REGLAS.get(skill)
    prueba = f"prueba {regla.prueba_nro} de la Batería HMB" if regla else "Batería HMB"

    campos = ("titulo", "objetivo", "distribucion", "actividad_inicial", "actividad_central", "actividad_final",
              "consigna", "criterio_eval")
    plantillas = [{**p, **{k: sustituir(p[k], materiales, formato, metodologia) for k in campos}}
                  for p in plantillas_para(banco, skill)]
    estado = estado_criterios(diagnostico, base)
    por_mejorar = estado["por_mejorar"] if priorizar else []
    propia = bool(banco.get(skill))
    trabaja = [_criterios_plantilla(p, base, propia) for p in plantillas]

    sesiones: List[Dict[str, Any]] = []
    for n, (i, reforzado) in enumerate(_orden_sesiones(trabaja, por_mejorar, total_clases), start=1):
        p = plantillas[i]
        c = por_orden.get(reforzado) if reforzado else None
        sesiones.append({
            "numero": n,
            "orden_plantilla": p.get("orden"),
            "titulo": p["titulo"],
            "titulo_mostrado": p["titulo"] + (SUFIJO_REFUERZO if c else ""),
            "es_refuerzo": bool(c),
            "error_reforzado": f"{c['error']} ({c['fase']})" if c else "",
            "fase_pedagogica": p["fase_pedagogica"],
            "objetivo": p["objetivo"],
            "distribucion": p["distribucion"],
            "actividad_inicial": p["actividad_inicial"],
            "actividad_central": p["actividad_central"],
            "actividad_final": p["actividad_final"],
            "consigna": p["consigna"],
            "criterio_eval": p["criterio_eval"],
            "criterios": [por_orden[o] | {"reforzado": o == reforzado} for o in trabaja[i] if o in por_orden],
            "fuente": p.get("fuente", ""),
            "minutos_inicial": t["inicial"],
            "minutos_central": t["central"],
            "minutos_final": t["final"],
        })

    nombres = lambda ordenes: [por_orden[o]["texto"] for o in ordenes if o in por_orden]  # noqa: E731
    mejorar = [por_orden[o] for o in estado["por_mejorar"] if o in por_orden]
    especificos = [f"Mejorar «{c['texto'].rstrip('.')}» ({c['fase']}), criterio no logrado en la evaluación."
                   for c in mejorar[:MAX_REFUERZOS]]
    if estado["logrados"]:
        especificos.append(f"Consolidar los criterios ya logrados ({', '.join(por_orden[o]['fase'] for o in estado['logrados'] if o in por_orden)}) "
                           "en situaciones de juego de mayor complejidad.")
    if not especificos:
        especificos.append(f"Experimentar las fases de {skill.lower()} transitando del estadio elemental hacia el maduro.")
    if estado["por_confirmar"]:
        especificos.append("Observar en clase los criterios que la cámara no pudo calificar ("
                           + ", ".join(por_orden[o]["fase"] for o in estado["por_confirmar"] if o in por_orden) + ").")
    especificos.append("Fomentar la cooperación, el respeto por las normas y el cuidado de sí mismo y de los compañeros.")

    diagnostico_base = {
        "fuente": "salón" if es_grupal else "estudiante",
        "puntaje": diagnostico.get("puntaje_obtenido") or "",
        "estadio": diagnostico.get("estadio_gallahue") or "",
        "porcentaje": diagnostico.get("porcentaje_madurez"),
        "logrados": nombres(estado["logrados"]),
        "por_mejorar": nombres(estado["por_mejorar"]),
        "por_confirmar": nombres(estado["por_confirmar"]),
        "prueba": prueba,
    }
    frases = list(diagnostico.get("frases_profe") or []) or (list(regla.frases) if regla else [])
    lista_cotejo = "; ".join(f"{c['orden']}) {c['texto'].rstrip('.')}" for c in base)

    return {
        "institucion": "INSTITUCIÓN EDUCATIVA / COLEGIO",
        "area": "Educación Física, Recreación y Deportes",
        "ciclo": "Básica Primaria" if es_grupal else info_grado["ciclo"],
        "grado": "Salón Completo (Heterogéneo)" if es_grupal else info_grado["grado"],
        "periodo": periodo,
        "total_clases": str(total_clases),
        "docente": "Docente Titular de Educación Física",
        "anio": str(anio),
        "jornada": "Mañana / Única",
        "duracion_clase": f"{total_min} Minutos",
        "lugar": "Patio del colegio, coliseo y cancha de primaria",
        "tema": f"Habilidades Motrices Básicas · {skill} ({prueba}) - Unidad Didáctica Periódica",
        "skill": skill,
        "formato": formato,
        "metodologia": metodologia,
        "materiales": materiales,
        "pregunta_problematizadora": perfil["pregunta"],
        "objetivo_general": (f"Desarrollar {perfil['objetivo']} mediante una secuencia progresiva de {total_clases} clases en "
                             f"el Período {periodo}, partiendo de los resultados de la evaluación inicial."),
        "objetivos_especificos": especificos,
        "estandares": {
            "motriz": perfil["motriz"],
            "expresivo_corporal": "Reconoce su cuerpo y demuestra sus posibilidades motrices y de ajuste postural para la interacción en el espacio de juego.",
            "axilogica_corporal": "Disfruta con responsabilidad y compañerismo, participando activamente y cuidando de sí mismo y de los otros.",
        },
        "lineamientos": ("Desarrollo motor y competencia motriz (Orientaciones Pedagógicas, MEN Documento 15): "
                         + (info_grado.get("desempeno_men") or "exploración de las posibilidades de movimiento del cuerpo.")),
        "desempeno_men": "" if es_grupal else info_grado.get("desempeno_men", ""),
        "indicadores": {
            "saber": perfil["saber"],
            "hacer": perfil["hacer"],
            "ser": "Participo y me integro en las actividades individuales y grupales, respetando el espacio y el turno de mis compañeros.",
        },
        "diagnostico_base": diagnostico_base,
        "clases_secuencia": sesiones,
        "duraciones": {k: f"{v} minutos" for k, v in t.items()},
        "tarea_extracurricular": perfil["tarea"],
        "evaluacion": (f"Evaluación formativa con la lista de cotejo de la {prueba}: {lista_cotejo}. Observación directa clase "
                       "a clase, autoevaluación y coevaluación en la sesión de cierre, y nueva grabación al final del período "
                       "para comparar con el punto de partida."),
        "metodos_ensenanza": ("Asignación de tareas con niveles de dificultad, descubrimiento guiado y aprendizaje cooperativo "
                              "en progresión: exploración, ajuste técnico, retos dinámicos y aplicación en juego."),
        "estilo_ensenanza": f"Estilo lúdico-participativo y resolución de problemas motores basado en {metodologia}.",
        "adaptaciones_piar": ("Ajustes razonables (DUA / PIAR): tres niveles por tarea (básico, medio y reto), distancias y alturas "
                              "graduables, compañero tutor, material alternativo y pausas activas para incluir todos los ritmos de aprendizaje."),
        "reflexion_pedagogica": ("La secuencia parte de lo que el estudiante ya logra y prioriza los criterios por mejorar; el error "
                                 "se trata como información para ajustar la tarea y avanzar con confianza hacia el estadio maduro."),
        "retroalimentacion_tips": frases,
        "bibliografia": BIBLIOGRAFIA,
    }
