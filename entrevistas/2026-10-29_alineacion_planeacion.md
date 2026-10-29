# Alineación de la planeación · AULAGLOBAL360

Entrevista (grill-me) del 29 de octubre de 2026 · Alejo

La planeación se alinea con la evaluación: lo que diagnostica el video tiene que decidir las sesiones, no solo adornarlas. Este documento recoge las preguntas de esa alineación, en rondas, cada una con una recomendación.

- Responder **sí** a una pregunta acepta la recomendación que la acompaña.
- Las preguntas de una ronda se pueden decidir en paralelo; la ronda siguiente depende de sus respuestas.
- No se escribe código hasta cerrar todas las rondas (Q4).

## Cómo funciona hoy

Hoy la unidad es casi la misma para todos los estudiantes de una habilidad: la evaluación solo cambia el orden de hasta 3 sesiones. Revisado en `backend/biomecanica/didactica_v2.py` y `backend/apps/planeacion/servicios.py`.

| Dato de la evaluación | Qué hace hoy con él la planeación |
| --- | --- |
| Criterios no logrados | Por cada uno, hasta 3, adelanta una sesión del banco que lo trabaja justo después de la sesión 1. Siguen siendo las mismas 12 sesiones, reordenadas. |
| Cuarto criterio no logrado y siguientes | Se ignoran en la secuencia (`MAX_REFUERZOS = 3`). |
| Criterios por confirmar | Solo una frase en los objetivos específicos. |
| Estadio de Gallahue y % de madurez | Solo texto en el punto de partida; no cambian qué sesiones se eligen. |
| Evaluación del salón | Toma los errores que superan `UMBRAL_ERROR_GRUPAL` y el estadio más frecuente; la diversidad del grupo se pierde. |
| Grabación del festival final | No se conecta con la unidad: no hay comparación antes y después. |

## Ronda 1: decidida

Las cuatro recomendaciones se aceptaron el 29 de octubre de 2026.

| # | Pregunta | Decisión | Por qué |
| --- | --- | --- | --- |
| Q1 | ¿Con qué se alinea la planeación? Opciones: la evaluación, el currículo (MEN o colegio), los anexos de la tesis, o el reparto de trabajo del equipo. | Con la evaluación: estadio, % de madurez y criterios deciden las sesiones. | Es lo que un jurado cuestionará primero: «qué tan personalizada es». El resto ya está razonablemente resuelto. |
| Q2 | ¿Hay un plazo que obligue a recortar el alcance? | Sí. Se prioriza lo que se pueda demostrar en vivo y documentar en los anexos. | Cada decisión siguiente se mide contra la fecha de entrega. |
| Q3 | ¿Quién se encarga de la planeación? | Alejo se encarga de `planeacion` y `biomecanica/didactica_v2.py`. El compañero de equipo propone cambios por PR. | Ambos tocaron los mismos archivos y ya hubo conflictos (PyMySQL). |
| Q4 | ¿Qué resultado deja la sesión? | Primero un documento de decisiones; después el código. | Ambos pueden leerlo y corregirlo antes de programar. |

## Ronda 2: abierta

Cinco preguntas pendientes; todas dependen solo de la ronda 1 y se pueden decidir a la vez. Q5 condiciona la ronda 3: si la planeación principal es la del salón, la diferenciación por nivel se vuelve el núcleo del trabajo.

### Q5 · ¿Para quién se planea, para un estudiante o para el salón?

El docente da la clase al grupo completo. Propuesta: la planeación del salón es la principal, y la evaluación individual diferencia dentro de esa clase (variantes por nivel en la actividad central, como las a, b y c del banco, más una lista de estudiantes por variante). La planeación individual queda como caso especial.

**Recomendación:** sí. Es lo realista en el aula, y la personalización ocurre dentro de la clase real.

**Decisión:** pendiente

### Q6 · ¿El estadio decide en qué fase arranca la unidad?

Hoy todos empiezan en la Fase 1. Propuesta:

- **Inicial:** las 4 fases completas.
- **Elemental:** Fase 1 corta y más sesiones en las Fases 2 y 3.
- **Maduro:** casi directo a las Fases 3 y 4, para consolidar.

**Recomendación:** sí. Es el cambio que más hace evidente la personalización y se sustenta con Gallahue.

**Decisión:** pendiente

### Q7 · ¿Los refuerzos se dosifican según lo que falta?

Hoy: adelantar una sesión por criterio, hasta 3. Propuesta: cada criterio no logrado recibe al menos 2 sesiones focalizadas, sin tope de 3, sin pasar del número de clases configurado; el espacio sale de sesiones de criterios ya logrados.

**Recomendación:** sí. Ningún criterio queda fuera, y aprovecha la regla ya probada de 2 sesiones por criterio.

**Decisión:** pendiente

### Q8 · ¿La sesión 1 confirma los criterios por confirmar?

Son los que el video no pudo calificar. Propuesta: observación guiada con lista de cotejo solo de esos criterios en la sesión 1.

**Recomendación:** sí, en dos pasos. Para el plazo, la sesión 1 lo indica y trae la lista de cotejo en el Word; que lo registrado reordene la unidad queda para después.

**Decisión:** pendiente

### Q9 · ¿Se mide el antes y el después?

El festival final ya incluye la prueba de la batería. Propuesta: registrar esa grabación como evaluación final de la unidad y comparar con el punto de partida: criterios ganados, cambio de estadio y de % de madurez.

**Recomendación:** sí. Es la evidencia de efecto que sostiene la investigación, y casi todo ya existe (evaluaciones, `diagnostico_base`, reportes Word).

**Decisión:** pendiente

## Próximos pasos

- [ ] Decidir Q5 a Q9.
- [ ] Anotar la fecha de entrega o sustentación que fija el plazo de Q2.
- [ ] Ronda 3: depende de Q5 (cómo se agrupan los estudiantes por nivel) y de Q6 (cuántas sesiones por fase según el estadio).
- [ ] Con todas las rondas cerradas, pasar las decisiones a `docs/10_ALINEACION_PLANEACION.md` y empezar el código.
