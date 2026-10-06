# 01 · Arquitectura actual (versión JavaScript estática)

> Estado documentado: commit `72e7a88` (rama `main`).

## 1. Qué es el sistema

AULA GLOBAL 360 es una aplicación web para docentes de Educación Física (preescolar y primaria, 5 a 11 años, contexto colombiano / MEN) que:

1. Recibe un **video corto (3–5 s) o una foto** de un estudiante ejecutando una Habilidad Motriz Básica (HMB).
2. Extrae fotogramas y detecta la pose corporal (33 puntos de **MediaPipe Pose**).
3. Calcula ángulos articulares y métricas biomecánicas.
4. Detecta automáticamente qué habilidad se ejecuta (o usa la elegida por el docente).
5. Puntúa 5 criterios dicotómicos (0/1) de la **Batería HMB (González Palacio & Montoya Grisales, 2021, Dialnet 7925607)** y asigna un **estadio de Gallahue** (Inicial / Elemental / Maduro).
6. Genera una **unidad didáctica** de 1 a 12 clases priorizando las falencias detectadas.
7. Exporta un **reporte del estudiante** y la **planeación** a Word (`.doc` HTML).

Tiene dos motores intercambiables:

| Motor | Dónde corre | Qué hace |
|---|---|---|
| **Local** (por defecto) | 100 % navegador | MediaPipe WASM + reglas deterministas en JS |
| **Gemini Vision** | Navegador → API de Google | Envía los 8 fotogramas + telemetría a Gemini, que devuelve el diagnóstico en JSON. Si falla, cae al motor local |

**No hay backend, base de datos, usuarios ni autenticación.** Todo el estado vive en memoria del navegador y en `localStorage`. Se publica en GitHub Pages.

## 2. Inventario de archivos

| Archivo | Líneas | Rol |
|---|---|---|
| `index.html` | 583 | Dashboard (asistente de 3 pasos). Carga `styles.css` y `script.js` |
| `script.js` | 6.063 | **Toda la lógica**: UI, MediaPipe, biomecánica, clasificador, reglas, Gemini, planeación, exportación Word |
| `styles.css` | 2.561 | Estilos del dashboard (tokens CSS en `:root`, clases `engine-local` / `engine-gemini`) |
| `landing.html` + `landing.css` | 579 + 1.670 | Página comercial. Enlaza a `index.html`. Solo JS para el menú móvil |
| `preview.html` + `preview_styles.css` | 473 + 981 | Prototipo alternativo de UI ("Premium Preview"). Reutiliza `script.js` y redefine `goToStep`. **No es la UI en producción** |
| `codigodelsalto.py` | 113 | Script Python de referencia (OpenCV + MediaPipe, cámara en vivo) para **equilibrio estático unipodal**. Su lógica se portó a JS (`analyzeEquilibriumFromPythonReference`) |
| `logo.svg`, `logo-icon.svg` | — | Logotipo e isotipo |
| `.nojekyll` | — | Desactiva Jekyll en GitHub Pages |
| `Data/*.pdf` + `*.md` | — | Bibliografía (batería HMB, libros de juegos y sesiones de EF, unidad didáctica de ejemplo). **El código no los lee en tiempo de ejecución**; son base de conocimiento |

## 3. Dependencias externas (todas por CDN / red)

| Recurso | URL | Uso |
|---|---|---|
| MediaPipe Tasks Vision 0.10.14 | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14` (+ `/wasm`) | `PoseLandmarker` (import dinámico) |
| Modelo de pose | `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` | Modelo *lite* float16 |
| Gemini API | `https://generativelanguage.googleapis.com/{v1beta\|v1}/models...` | Listar modelos y `generateContent` |
| Google Fonts | DM Sans, JetBrains Mono | Tipografía (landing) |

> Aunque el motor se anuncia como "sin internet", la primera carga necesita red para bajar MediaPipe y el modelo.

## 4. Flujo de usuario (asistente de 3 pasos)

```
Paso 1: Elegir habilidad ──► Paso 2: Subir video/foto + observaciones ──► Paso 3: Resultado
 (tarjetas, o "auto")          handleFile() extrae 8 fotogramas            sendMsg() ejecuta motor
                                y los muestra con esqueleto                 renderiza diagnóstico +
                                                                            unidad didáctica + botones .doc
```

Panel lateral **"Configurar clase"** (drawer), cuyos valores se leen al analizar:

| Control (id) | Valores | Default |
|---|---|---|
| `gradeSelect` | `5_anos`, `6_anos`, `7_anos`, `8_anos`, `9_11_anos` | `7_anos` |
| `prefFormat` | Cuento Motor · Circuito de Estaciones · Retos Cooperativos · Juego Libre Dirigido | Circuito de Estaciones |
| `prefPedagogy` | Descubrimiento Guiado · Resolución de Problemas · Asignación de Tareas | Asignación de Tareas |
| `prefPeriod` | 1, 2, 3, 4 | 1 |
| `prefDuration` (min) | 45, 50, 55, 60, 90 | 50 |
| `prefTotalClasses` | 1, 2, 3, 4, 6, 8, 10, 12 | 12 |
| `.mat-check` (materiales) | Conos ✓, Aros ✓, Cuerdas, Balones ✓, Colchonetas | los marcados ✓ |
| Modo | `diagnostico` (individual) · `grupal` (salón) | individual |
| Motor | `local` · `gemini` | local |
| Clave Gemini (`apiKeyInput`) + modelo (`geminiModelSelect`) | — | — |

Códigos de habilidad (`skillSelect`):

| Código | Nombre canónico | Componente |
|---|---|---|
| `auto` | Detección automática | — |
| `carrera` | Carrera | HMB-L |
| `salto` | Salto Horizontal | HMB-L |
| `marcha` | Marcha | HMB-L |
| `salto_unipodal` | Salto Unipodal | HMB-L |
| `lanzar` | Lanzamiento Sobre Hombro | HMB-M |
| `atrapar` | Recepción y Atrape | HMB-M |
| `patear` | Patear | HMB-M |
| `equilibrio` | Equilibrio Dinámico | HMB-E |
| `equilibrio_estatico` | Equilibrio Estático Unipodal | HMB-E |

## 5. Estado global (variables en `script.js`)

| Variable | Tipo | Significado |
|---|---|---|
| `apiKey` | string | Clave Gemini (de `localStorage`) |
| `cachedGeminiEndpoint` | `{version, model}` | Último modelo Gemini que funcionó |
| `selectedGeminiModel` | string | `auto` o id de modelo |
| `availableGeminiModels` | array | Modelos listados por Google |
| `currentEngineMode` | `local`/`gemini` | Motor activo |
| `selectedSkill`, `selectedSkillName` | string | Habilidad elegida |
| `selectedMode` | `diagnostico`/`grupal` | Modo |
| `capturedKeyframes` | `Frame[]` | Fotogramas extraídos (ver doc 02) |
| `isAnalyzing` | bool | Candado anti doble clic |
| `globalDiagnosticoData` | `Diagnostico` | Último diagnóstico (para exportar) |
| `globalDidacticaData` | `UnidadDidactica` | Última planeación (para exportar) |
| `isGroupActive`, `targetStudents`, `evaluatedStudents`, `groupMemory[]` | — | Modo grupal (hasta 60 estudiantes) |
| `poseLandmarker`, `isPoseLoading`, `lastAnalyzedTelemetry` | — | MediaPipe y última telemetría |

### Claves de `localStorage`

| Clave | Contenido |
|---|---|
| `aula360_api_key` | Clave de Google AI Studio **en texto plano** |
| `aula360_selected_gemini_model` | Modelo fijado o `auto` |
| `aula360_gemini_models_cache` | JSON con la lista de modelos |
| `aula360_engine_mode` | `local` / `gemini` |

## 6. Mapa de funciones de `script.js`

| Rango de líneas | Bloque | Funciones principales |
|---|---|---|
| 7–31 | Estado global | — |
| 33–206 | Alertas/confirmaciones propias (reemplaza `window.alert`) | `showAlert`, `showConfirm`, `closeCustomAlert` |
| 208–372 | Inicialización y asistente | `goToStep`, `markStepComplete`, `selectSkillCard`, `startNewEvaluation`, `initWizardEvents` (drag & drop) |
| 374–712 | Navegación, motor, Gemini (clave/modelos) | `setEngineMode`, `refreshGeminiModels`, `saveGeminiKey`, `removeGeminiKey`… |
| 714–884 | Habilidad, modo, modo grupal | `onSkillSelectChange`, `updateCGIModel`, `selectMode`, `startGroupMode`, `resetGroupAssessment` |
| 886–955 | MediaPipe | `getPoseLandmarker` (GPU → CPU) |
| 957–995 | Trigonometría | `calculateAngle3D`, `calcularAngulo2D` |
| 997–1340 | **9 máquinas de estado (FSM)** | `SaltoHorizontalFSM` … `MarchaFSM`, `createFSMForSkill`, `executeFSMAnalysis` |
| 1342–1555 | Equilibrio (port de Python) y ángulos por fotograma | `calcularInclinacionHorizontal`, `analyzeEquilibriumFromPythonReference`, `computeJointAngles` |
| 1556–1614 | Dibujo del esqueleto | `drawPoseSkeleton` |
| 1616–1705 | Gatillo de inicio del ejercicio | `checkExerciseTriggerPose` |
| 1707–2073 | Extracción de fotogramas y carga de archivo | `extractAdaptiveVideoKeyframes`, `extractImageKeyframe`, `handleFile` |
| 2075–2564 | Hitos por fotograma y tira visual | `assignKeyframeMilestones`, `renderKeyframeStrip` |
| 2566–2611 | "Chat" (legado, oculto) | `addMsg`, `showTyping` |
| 2613–2807 | **Agregador de telemetría** | `aggregateVideoTelemetry` |
| 2809–2949 | **Clasificador de habilidad** | `classifySkillFromKinematics` |
| 2951–3922 | **Tabla de reglas de la batería** | `biomechanicalRulesTable` |
| 3924–4050 | **Motor local** | `runLocalBiomechanicalEngine` |
| 4052–4305 | **Gemini** | `getGeminiCandidateEndpoints`, `callGeminiVision`, `cleanJSON` |
| 4307–4519 | Orquestación | `sendMsg`, `updateTechDetails`, `handleDiagnosisOutput` |
| 4521–4737 | Render resultado | `renderResultStepHTML`, `getGradeAndCycle` |
| 4739–5150 | **Plantillas de 12 clases** | `getSkillProgressionTemplates` |
| 5152–5379 | **Generador de unidad didáctica** | `generateDidacticPlan` |
| 5381–5533 | Render de unidad y plan grupal | `renderDidacticaHTML`, `generateGroupPlan` |
| 5535–6052 | **Exportación Word** | `exportDiagnosticoToWord`, `exportToWord`, `downloadDocFile` |
| 6054–6063 | Preferencias | `getTeacherPreferences` |

## 7. Diagrama de la tubería de análisis

```
Archivo (video / imagen)
   │
   ▼
extractAdaptiveVideoKeyframes / extractImageKeyframe          (doc 02 §4)
   │  · escaneo 12–24 muestras → gatillo de inicio (checkExerciseTriggerPose)
   │  · ventana de acción → 8 timestamps equiespaciados
   │  · por fotograma: canvas 640×360 → PoseLandmarker → computeJointAngles
   ▼
Frame[] (8)  ──► assignKeyframeMilestones (etiquetas visuales)
   │
   ▼  sendMsg()
   ├── motor local:  runLocalBiomechanicalEngine
   │        aggregateVideoTelemetry → classifySkillFromKinematics (si auto)
   │        → executeFSMAnalysis → biomechanicalRulesTable[habilidad].criterios[i].evaluar(t)
   │        → puntaje, % madurez, estadio Gallahue
   └── motor Gemini: callGeminiVision  (telemetría + 8 JPEG → JSON)  ──falla──► motor local
   │
   ▼
Diagnostico (JSON) ──► generateDidacticPlan ──► UnidadDidactica (JSON)
   │                                              │
   ▼                                              ▼
exportDiagnosticoToWord (.doc)               exportToWord (.doc)
```

## 8. Modo grupal

1. El docente activa "grupal", indica N estudiantes (1–60) y pulsa *Iniciar registro*.
2. Cada análisis incrementa `evaluatedStudents` y agrega el diagnóstico a `groupMemory`.
3. *Generar plan consolidado* (`generateGroupPlan`) cuenta cuántas veces aparece cada `errores_criticos[].error` y muestra el % del salón.
4. Genera una unidad didáctica con habilidad fija `'Carrera y Locomoción Colectiva'` y `isGroup = true` (sin priorización de falencias).

> Nota: el resultado del modo grupal se pinta con `addMsg` en `#chatScroll`, que **está oculto** (`display:none`) en la UI actual. Ver doc 07.

## 9. Lo que NO existe hoy (y la migración debería decidir)

- Persistencia (estudiantes, cursos, evaluaciones, historial).
- Usuarios / docentes / instituciones / permisos.
- Gestión segura de la clave de Gemini (hoy la pone cada docente en su navegador).
- Pruebas automatizadas.
- Internacionalización (todo está en español, textos embebidos en el código).
