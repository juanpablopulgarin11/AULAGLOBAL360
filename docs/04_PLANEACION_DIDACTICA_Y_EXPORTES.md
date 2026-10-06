# 04 · Planeación didáctica y exportación a Word

## 1. Plantillas de progresión (`getSkillProgressionTemplates`, `script.js:4741`)

Banco de **12 sesiones progresivas** por habilidad. Cada sesión:

| Campo | Ejemplo |
|---|---|
| `titulo` | "Conciencia del Contacto Podal y Apoyos Reactivos" |
| `fase_pedagogica` | "Fase 1: Iniciación y Esquema Corporal" |
| `objetivo` | objetivo de la sesión |
| `distribucion` | montaje del espacio (puede incluir `{materiales}`) |
| `actividad_inicial` | activación |
| `actividad_central` | desarrollo (puede incluir `{metodologia}`) |
| `actividad_final` | vuelta a la calma |
| `consigna` | frase para el niño ("El lenguaje del profe") |
| `criterio_eval` | indicador de logro |

Las 12 sesiones siguen 4 fases: *1 Iniciación y Esquema Corporal* (1–3), *2 Coordinación y Ajuste Técnico* (4–6), *3 Complejidad y Retos Dinámicos* (7–9), *4 Consolidación y Aplicación en Juego* (10–12).

**Solo existen plantillas para 3 habilidades**: Carrera, Salto Horizontal y Lanzamiento Sobre Hombro. Las otras 6 (Marcha, Salto Unipodal, Recepción y Atrape, Patear, Equilibrio Dinámico, Equilibrio Estático) **reciben las sesiones de Carrera**. Este es el principal hueco de contenido; la carpeta `Data/` (libros de sesiones y juegos motores de 6 a 13 años) es la fuente natural para completarlo.

Datos completos (36 sesiones): [`datos/plantillas_progresion.json`](datos/plantillas_progresion.json). Los marcadores `{materiales}`, `{formato}`, `{metodologia}` se sustituyen con las preferencias del docente.

## 2. Generador: `generateDidacticPlan(diag, prefs, isGroup)` (`script.js:5153`)

### 2.1 Entradas

`prefs` (de `getTeacherPreferences`): `format`, `pedagogy`, `duration`, `period`, `totalClasses`, `materials` (materiales marcados unidos por ", "; si ninguno: "Aros, Conos y recursos corporales"). Además lee `gradeSelect`.

### 2.2 Tiempos

```text
inicial = max(5, round(duracion * 0.20))
final   = max(5, round(duracion * 0.20))
central = duracion - inicial - final
```
Ej.: 50 min → 10 / 30 / 10; 45 min → 9 / 27 / 9.

### 2.3 Priorización de falencias (solo modo individual)

1. `criteriosFallidos` = criterios con `puntaje == 0`.
2. `erroresDetectados` = errores cuyo texto no contiene "sin fallos" ni "adecuada".
3. Si hay alguno, se calcula una **afinidad** para cada plantilla:
   - `haystack = titulo + objetivo + criterio_eval + actividad_central` (minúsculas).
   - Para cada error: tokenizar por `[\s,.;:]+`, quedarse con palabras de > 3 letras que no estén en las *stop words* `{para, como, sobre, durante, fase, patron, criterio, movimiento, estudiante, cuerpo, logra, mantiene, realiza, adecuada, adecuado}`, contar cuántas aparecen en `haystack`. Puntaje candidato = `matches * 3`.
   - Para cada criterio fallido: igual con `criterio + observacion`, puntaje `matches * 2`.
   - `score` = el mayor; `matchedError` = el texto del error (o criterio) que lo produjo.
4. `threshold = max(4, floor(maxScore * 0.6))`; `prioritarias` = hasta 2 plantillas con `score >= threshold`, ordenadas desc.
5. **Orden final**: primera plantilla no prioritaria (normalmente la sesión 1) → prioritarias → resto en su orden original.
6. Se generan `totalClasses` clases recorriendo esa lista de forma circular (`i % len`).
7. Las clases prioritarias que quedan en las posiciones 2–3 llevan:
   - título con sufijo `" 🎯 [Enfoque Prioritario]"`;
   - un recuadro HTML "Refuerzo Dirigido Biomecánico" dentro de `actividad_inicial` que cita el error.

Sin falencias (o modo grupal) → las plantillas en orden, circular.

`actividad_inicial` y `actividad_final` se prefijan con `<strong>Activación (N min):</strong>` y `<strong>Vuelta a la calma (N min):</strong>`. **Hay HTML embebido en los datos**; en Django es mejor guardar texto plano y aplicar el formato en la plantilla.

### 2.4 Mapa de grados (`getGradeAndCycle`)

| Código | Grado | Ciclo |
|---|---|---|
| `5_anos` | Transición / Preescolar (5 años) | Preescolar / Inicial |
| `6_anos` | Grado 1º de Primaria (6 años) | Básica Primaria (Ciclo 1) |
| `7_anos` | Grado 2º de Primaria (7 años) | Básica Primaria (Ciclo 1) |
| `8_anos` | Grado 3º de Primaria (8 años) | Básica Primaria (Ciclo 1) |
| `9_11_anos` | Grado 4º - 5º (9 a 11 años) | Básica Primaria (Ciclo 2) |
| (otro) | Grado 3º de Primaria (8 años) | Básica Primaria (Ciclo 1) |

En modo grupal: grado "Salón Completo (Heterogéneo)", ciclo "Básica Primaria".

### 2.5 Salida `UnidadDidactica`

```jsonc
{
  "institucion": "INSTITUCIÓN EDUCATIVA / COLEGIO",          // fijo (placeholder)
  "area": "Educación Física, Recreación y Deportes",
  "ciclo": "...", "grado": "...", "periodo": "1", "total_clases": "12",
  "docente": "Docente Titular de Educación Física",            // fijo (placeholder)
  "anio": "2026", "jornada": "Mañana / Única", "duracion_clase": "50 Minutos",
  "lugar": "Patio del colegio, coliseo y cancha de primaria",
  "tema": "Habilidades Motrices Básicas (Patrón: {skill}) y Capacidades Sociomotrices - Unidad Didáctica Periódica",
  "skill": "...", "formato": "...", "metodologia": "...", "materiales": "...",
  "pregunta_problematizadora": "¿Qué acciones motrices puedo desarrollar con mi cuerpo y cómo optimizo mis patrones de {skill} ...?",
  "objetivo_general": "...", "objetivos_especificos": ["...", "...", "..."],
  "estandares": {"motriz": "...", "expresivo_corporal": "...", "axilogica_corporal": "..."},
  "lineamientos": "...",
  "indicadores": {"saber": "...", "hacer": "...", "ser": "..."},
  "clases_secuencia": [ {"numero": 1, "titulo": "...", "fase_pedagogica": "...", "objetivo": "...",
                         "distribucion": "...", "actividad_inicial": "...", "actividad_central": "...",
                         "actividad_final": "...", "consigna": "...", "criterio_eval": "..."} ],
  "duraciones": {"inicial": "10 minutos", "central": "30 minutos", "final": "10 minutos", "total": "50 minutos"},
  "tarea_extracurricular": "...", "evaluacion": "...", "metodos_ensenanza": "...", "estilo_ensenanza": "...",
  "adaptaciones_piar": "...", "reflexion_pedagogica": "...",
  "retroalimentacion_tips": ["frases_profe del diagnóstico o 3 por defecto"],
  "video_profundizacion": "https://aulaglobal360.edu.co/recursos/pedagogia-hmb",   // URL ficticia
  "bibliografia": "MEN ... / Gallahue & Ozmun (2012) / González Palacio et al. (2021) / Ulrich (2019) TGMD-3"
}
```

Todos los textos fijos (estándares MEN, objetivos, indicadores Saber/Hacer/Ser, PIAR/DUA, bibliografía…) están en `script.js:5305-5377` y conviene moverlos a plantillas o a un modelo editable por la institución.

## 3. Plan grupal (`generateGroupPlan`, `script.js:5464`)

- Cuenta `errores_criticos[].error` de todos los diagnósticos en `groupMemory` y muestra `% = round(count / total * 100)`.
- Genera la unidad con `habilidad_detectada = 'Carrera y Locomoción Colectiva'` (no existe plantilla con ese nombre → usa Carrera) y frases fijas.
- **No** usa los errores consolidados para priorizar sesiones (con `isGroup = true` la priorización está desactivada).

## 4. Exportación a Word

Ambos exportes generan **HTML con namespaces de Office** y lo descargan como `application/msword` con extensión `.doc` (con BOM `﻿`). Word lo abre en modo compatibilidad. Página carta vertical, márgenes 1.8 cm, Calibri 10 pt, color de encabezados `#0284C7`.

### 4.1 Reporte del estudiante — `exportDiagnosticoToWord` (`script.js:5537`)

Archivo: `Reporte_Estudiante_{Habilidad_con_guiones_bajos}.doc`. Secciones:

1. **Datos generales y resultado evolutivo**: habilidad, componente, puntaje (y %), estadio de Gallahue, edad/grado, modalidad (automática/dirigida), marco científico.
2. **Telemetría cinemática articular**: flexión mín. rodilla (ref. ≤ 90°), codo medio (75–105°), tronco (5–15°), apertura de cadera, fase aérea, simetría. Si no hay telemetría muestra valores fijos (108°, 94°, 8°, 32°, 86 %).
3. **Criterios contrastados (0/1)**: los 5 criterios con fase, medido/umbral, observación y LOGRADO / EN PROCESO.
4. **Síntesis biomecánica y anomalías**: `resumen_biomecanico` + lista de errores.
5. **Consignas verbales** ("El lenguaje del profe").
6. Firmas: docente evaluador y acudiente (C.C.).

### 4.2 Unidad didáctica — `exportToWord` (`script.js:5775`)

Archivo: `Unidad_Didactica_Periodo{N}_{K}Clases_{Formato}.doc`. Secciones:

1. Encabezado institucional (área, ciclo, grado, período, docente, año, jornada, duración, unidad temática, lugar, materiales).
2. Pregunta problematizadora, objetivo general y específicos.
3. Lineamientos MEN: competencias Motriz, Expresivo-Corporal, Axiológica-Corporal.
4. Indicadores de desempeño Saber / Hacer / Ser.
5. **Una tabla por sesión**: objetivo; parte inicial; parte central (montaje y distribución con el formato elegido, desarrollo, consigna clave); parte final; indicador de evaluación.
6. Lineamientos metodológicos: tarea extracurricular, métodos y estilo de enseñanza, adaptaciones PIAR/DUA, evaluación formativa, reflexión pedagógica, consignas, enlace, bibliografía.
7. Firmas: docente titular y coordinación académica.

### 4.3 Recomendación para Django

- Generar `.docx` reales con **`python-docx`** o, para mantener el diseño HTML actual, **`docxtpl`** (plantilla `.docx` editable por diseño + Jinja2). Para PDF: **WeasyPrint** a partir de una plantilla Django.
- Usar `Data/Unidad_Didactica_y_Planeacion_Marcha.docx` como referencia del formato institucional esperado.
