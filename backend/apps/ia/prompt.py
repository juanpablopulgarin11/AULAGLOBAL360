"""Prompt del sistema para Gemini (port de ``callGeminiVision``, ``script.js:4144-4214``).

Cambios respecto al JS: la telemetría se mide en el servidor y se incluyen los criterios
oficiales de la batería para que Gemini evalúe exactamente los mismos que el motor local.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from biomecanica.reglas import REGLAS

VERSION_PROMPT = "2026.10-servidor-1"

DETECCION_AUTOMATICA = """MODO DETECCIÓN AUTOMÁTICA BASADA EN VISIÓN:
Debes analizar de forma AUTÓNOMA la secuencia cronológica de los {n} fotogramas proporcionados para CLASIFICAR cuál de las 9 habilidades de la Batería HMB (González Palacio & Montoya Grisales) se ejecuta en el video:
- "Equilibrio Estático Unipodal": Se sostiene quieto sobre un solo pie (apoyo unipodal) durante la secuencia, sin desplazarse por el espacio. (REGLA CRÍTICA: Si el niño permanece en el sitio y levanta un pie del piso sosteniéndose en la otra pierna, ES Equilibrio Estático Unipodal; NUNCA lo clasifiques como Salto Horizontal ni Patear).
- "Salto Horizontal": Flexiona rodillas con ambos pies en el piso y salta hacia adelante trasladándose por el espacio con despegue bipodal y fase de vuelo. (REGLA CRÍTICA: Exige desplazamiento horizontal hacia adelante por el piso; si el niño no se traslada hacia adelante en el espacio, NO es Salto Horizontal).
- "Carrera": El estudiante corre desplazándose por el espacio, con zancadas alternas cíclicas y braceo sagital.
- "Marcha": Camina progresivamente paso a paso manteniendo contacto continuo con el piso.
- "Salto Unipodal": Salta y cae sucesivamente sobre un solo pie ("pata sola").
- "Lanzamiento Sobre Hombro": Sostiene y arroja un objeto con un brazo por encima del hombro. (Si corre o salta y levanta los brazos por impulso o braceo, NO es lanzamiento).
- "Recepción y Atrape": Recibe y asegura con ambas manos un móvil/pelota que viene por el aire frente al pecho.
- "Patear": Da un paso hacia un balón en el suelo y lo impacta con el pie.
- "Equilibrio Dinámico": Camina en equilibrio manteniendo los pies sobre una línea estrecha.

REGLA DE DECISIÓN VISUAL:
Tu análisis visual de las imágenes fotográficas tiene PRIORIDAD TOTAL sobre cualquier aproximación matemática. Observa la acción global del cuerpo y el entorno. Escribe en "habilidad_detectada" el nombre exacto de la habilidad que ves ejecutada.
La sugerencia del clasificador cinemático es: "{sugerida}" (úsala solo como apoyo)."""

DIRIGIDA = 'Habilidad Específica Seleccionada por el Docente: "{habilidad}". Evalúa estrictamente los criterios de esta habilidad.'


def _criterios(habilidad: Optional[str]) -> str:
    nombres = [habilidad] if habilidad else list(REGLAS)
    bloques = []
    for nombre in nombres:
        regla = REGLAS[nombre]
        lineas = [f'  {i}. [{c.fase}] {c.texto} (referencia instrumental: {c.umbral})' for i, c in enumerate(regla.criterios, 1)]
        bloques.append(f'- "{nombre}" (prueba {regla.prueba_nro}, protocolo: {regla.protocolo}):\n' + "\n".join(lineas))
    return "\n".join(bloques)


def construir_prompt(t: Dict[str, Any], habilidad: Optional[str], sugerida: str, grado: str, n: int) -> str:
    fases = " ➔ ".join(t.get("fsmPhases") or []) or "Secuencia temporal"
    instruccion = DIRIGIDA.format(habilidad=habilidad) if habilidad else DETECCION_AUTOMATICA.format(n=n, sugerida=sugerida)
    sosten = (t["unipodalHoldFrames"] >= 2 or (t.get("unipodalRaisedFrames") or 0) >= 2)
    desplazamiento = (f"NULO/MÍNIMO ({t['hipDisplacement']:.3f} - Permanece en el mismo sitio, descartar salto)"
                      if t["hipDisplacement"] < 0.08 else f"DINÁMICO ({t['hipDisplacement']:.3f} - Se traslada en el espacio)")
    return f"""Eres un Biomecánico Deportivo y Docente Experto en Desarrollo Motor Infantil especializado en la evaluación de Habilidades Motrices Básicas (HMB) mediante la Batería Validada de Habilidades Motrices Básicas para Niños entre 5 y 11 Años (González Palacio, Montoya Grisales, Cardona, Marín & Muñoz, 2021 · Dialnet 7925607) y los estadios evolutivos de David L. Gallahue.
Debes contrastar los fotogramas del estudiante contra la siguiente telemetría instrumental ya medida con MediaPipe Pose (33 landmarks) y Máquinas de Estados Cinemáticas (FSM):

DATOS CINEMÁTICOS REALES MEDIDOS:
{instruccion}
- Edad Calibrada: {grado}
- Ciclo de Fases detectadas por FSM: [{fases}]
- Desplazamiento horizontal de cadera (traslación espacial): {desplazamiento}
- Postura de equilibrio unipodal sostenida: {'SÍ (' + str(t.get('unipodalMaintainedFrames') or t['unipodalHoldFrames']) + ' fotogramas en un solo pie)' if sosten else 'NO'}
- Inclinación lateral de hombros: {t.get('avgShoulderTilt', 'N/A')}°
- Flexión mínima de rodilla medida: {t['minKneeAngle']}°
- Ángulo medio de codos (braceo): {t['avgElbowAngle']}°
- Inclinación promedio de tronco: {t['avgTrunkAngle']}°
- Apertura máxima de zancada / cadera: {t['maxHipAngle']}°
- Apoyo unipodal con oscilación de patada (Pateo): {'DETECTADO (Un pie en suelo y pierna contraria en péndulo de golpeo)' if t['transientKickPeak'] else 'NO'}
- Elevación de muñeca sobre hombro: {'SÍ (Gesto elevado / braceo alto)' if t['maxWristAboveShoulder'] else 'NO'}
- Distancia mínima entre muñecas: {t['minWristDist']:.2f} (Manos juntas en copa: {'SÍ' if t['minWristDist'] < 0.26 else 'NO'})
- Asimetría vertical máxima de tobillos: {t['maxAnkleYDiff']:.2f}
- Asimetría máxima entre rodillas: {t['maxKneeDiff']}°
- Fase de vuelo / despegue aéreo bilateral: {'DETECTADA (Ambos pies en aire)' if t.get('bipodalFlightDetected') else 'NO DETECTADA (Apoyo en suelo)'}
- Simetría bilateral: {t['symmetryScore']}%

CRITERIOS OFICIALES DE LA BATERÍA (evalúa EXACTAMENTE los 5 de la habilidad identificada, en este orden y con este mismo texto):
{_criterios(habilidad)}

INSTRUCCIÓN VITAL:
Usa estrictamente estos datos cuantitativos reales medidos por MediaPipe. Evalúa los criterios dicotómicos (1 = logrado, 0 = en proceso) de la Batería HMB según los umbrales observados para la habilidad identificada. Tu función es la interpretación pedagógica, la justificación cualitativa según González Palacio & Montoya Grisales y la redacción de consignas verbales para el niño ("El Lenguaje del Profe"), en español claro para un docente de primaria.

Responde EXCLUSIVAMENTE con un objeto JSON con: habilidad_detectada (uno de los 9 nombres exactos), resumen_biomecanico (cita el número de fotograma donde se evidencia la acción cumbre), criterios (lista de 5 objetos con criterio, fase, puntaje 0/1 y observacion citando fotograma y ángulo), analisis_articular (angulos_principales, cadena_cinetica, apoyo_y_base), errores_criticos (lista de objetos con error e impacto_biomecanico) y frases_profe (2 metáforas visuales para el niño)."""
