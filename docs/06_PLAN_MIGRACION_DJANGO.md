# 06 · Plan de migración a Python + Django

## 1. Decisión principal: ¿dónde se detecta la pose?

| Opción | Cómo | A favor | En contra |
|---|---|---|---|
| **A. Todo en el servidor** (recomendada) | El docente sube el video; una tarea Celery lo procesa con `opencv` + `mediapipe` en Python | Una sola fuente de verdad en Python; se puede procesar a FPS completos y medir tiempo real (los 5 s del equilibrio); historial y reprocesamiento | Se suben videos de menores al servidor (consentimiento y retención); consumo de CPU |
| B. Híbrida | MediaPipe sigue en el navegador (JS); se envían a Django solo los landmarks (33 × 8 puntos) y Python calcula todo lo demás | No viajan imágenes; servidor liviano | Sigue habiendo JS crítico; dos lugares donde puede fallar la paridad |

Recomendación: **A**, y conservar B como modo "privacidad" más adelante si una institución no permite subir videos. Como el paquete `biomecanica` (abajo) recibe landmarks y no imágenes, sirve para ambas opciones sin cambios.

## 2. Estructura de proyecto propuesta

```
aulaglobal360/
├── manage.py
├── config/
│   ├── settings/ (base.py, dev.py, prod.py)
│   ├── urls.py
│   └── celery.py
├── biomecanica/                 # Python puro, SIN Django → testeable y reutilizable
│   ├── landmarks.py             # índices MediaPipe, dataclass Punto
│   ├── geometria.py             # calculate_angle_3d, angulo_2d, inclinacion_horizontal, js_round
│   ├── angulos.py               # compute_joint_angles, analizar_equilibrio
│   ├── extraccion.py            # lectura de video (cv2), escaneo, gatillo, 8 fotogramas, esqueleto
│   ├── gatillo.py               # check_exercise_trigger_pose
│   ├── telemetria.py            # aggregate_video_telemetry → dataclass Telemetria
│   ├── clasificador.py          # classify_skill_from_kinematics
│   ├── fsm.py                   # 9 máquinas de estado
│   ├── hitos.py                 # assign_keyframe_milestones
│   ├── reglas.py                # condiciones de los 45 criterios
│   └── motor_local.py           # run_local_engine → Diagnostico
├── apps/
│   ├── cuentas/                 # Usuario docente, Institucion
│   ├── catalogo/                # Habilidad, CriterioHMB, PlantillaSesion (+ fixtures desde docs/datos/*.json)
│   ├── estudiantes/             # Grupo (salón), Estudiante
│   ├── evaluaciones/            # Evaluacion, Fotograma, ResultadoCriterio, EvaluacionGrupal; tareas Celery
│   ├── planeacion/              # UnidadDidactica, Sesion; generador.py (port de generateDidacticPlan)
│   ├── ia/                      # cliente Gemini, prompts, esquemas Pydantic
│   └── reportes/                # exportes .docx / .pdf
├── templates/                   # Django templates (+ HTMX)
├── static/                      # styles.css migrado, logos
└── tests/
    ├── golden/                  # fixtures de paridad generados con Node desde script.js
    └── ...
```

Separar `biomecanica/` de Django permite probar la paridad con el JS sin base de datos y reutilizarla desde un script de línea de comandos (como `codigodelsalto.py`).

## 3. Dependencias sugeridas

| Paquete | Para qué |
|---|---|
| `Django` (5.x LTS) | Framework web |
| `django-environ` | Configuración por variables de entorno |
| `psycopg[binary]` | PostgreSQL (SQLite en desarrollo) |
| `celery` + `redis` | Procesamiento de video y llamadas a Gemini en segundo plano |
| `opencv-python-headless` | Lectura de video y dibujo del esqueleto |
| `mediapipe` | Pose Landmarker (verificar que la versión de Python del servidor tenga *wheel* disponible) |
| `numpy` | Cálculo vectorial |
| `pydantic` | Validación de `Diagnostico` y de la respuesta de Gemini |
| `google-genai` | SDK oficial de Gemini |
| `python-docx` o `docxtpl` | Exportes Word reales (`.docx`) |
| `weasyprint` (opcional) | Exportes PDF |
| `django-htmx` (opcional) | Asistente de 3 pasos sin SPA |
| `djangorestframework` (opcional) | Si se quiere API para app móvil o front separado |
| `pytest`, `pytest-django` | Pruebas |

## 4. Modelos de datos propuestos

> Implementados en `backend/apps/*/models.py` con un cambio: `CriterioHMB` no guarda plantillas de texto ni la clave de la regla. La lógica y los textos interpolados viven solo en `biomecanica/reglas.py` (probados contra el JS), y el modelo guarda lo descriptivo. Se añadieron `Estudiante.apellidos`, `acudiente`, `fecha_consentimiento`, `Evaluacion.mensaje_error` y `puntaje_maximo`.

```python
# apps/cuentas
class Institucion(models.Model):
    nombre = models.CharField(max_length=200)
    nit = models.CharField(max_length=30, blank=True)
    municipio = models.CharField(max_length=100, blank=True)
    usa_ia_nube = models.BooleanField(default=False)          # habilita Gemini para la institución

class Docente(AbstractUser):
    institucion = models.ForeignKey(Institucion, null=True, on_delete=models.SET_NULL)

# apps/catalogo  (se cargan desde docs/datos/*.json)
class Habilidad(models.Model):
    codigo = models.SlugField(unique=True)        # carrera, salto, marcha, salto_unipodal, lanzar, atrapar, patear, equilibrio, equilibrio_estatico
    nombre = models.CharField(max_length=60)      # "Salto Horizontal"
    componente = models.CharField(max_length=40, choices=[("HMB-L","Locomoción"),("HMB-M","Manipulación"),("HMB-E","Estabilidad-Equilibrio")])
    prueba_nro = models.PositiveSmallIntegerField()
    protocolo = models.TextField()
    icono = models.CharField(max_length=8)
    frases_profe = models.JSONField(default=list)

class CriterioHMB(models.Model):
    habilidad = models.ForeignKey(Habilidad, related_name="criterios", on_delete=models.CASCADE)
    orden = models.PositiveSmallIntegerField()
    texto = models.TextField()
    fase = models.CharField(max_length=40)
    regla = models.CharField(max_length=60)       # clave de la función en biomecanica/reglas.py
    umbral_texto = models.CharField(max_length=120)
    medido_tpl = models.CharField(max_length=200)
    observacion_ok_tpl = models.TextField()
    observacion_falla_tpl = models.TextField()
    error_titulo = models.CharField(max_length=200)
    error_impacto_tpl = models.TextField()

class PlantillaSesion(models.Model):
    habilidad = models.ForeignKey(Habilidad, on_delete=models.CASCADE)
    orden = models.PositiveSmallIntegerField()    # 1..12
    titulo = models.CharField(max_length=200)
    fase_pedagogica = models.CharField(max_length=80)
    objetivo = models.TextField()
    distribucion = models.TextField()
    actividad_inicial = models.TextField()
    actividad_central = models.TextField()
    actividad_final = models.TextField()
    consigna = models.TextField()
    criterio_eval = models.TextField()

# apps/estudiantes
class Grupo(models.Model):                        # "salón"
    institucion = models.ForeignKey(Institucion, on_delete=models.CASCADE)
    docente = models.ForeignKey(Docente, on_delete=models.PROTECT)
    nombre = models.CharField(max_length=60)      # "2ºB"
    grado = models.CharField(max_length=12, choices=[("5_anos",...),("6_anos",...),("7_anos",...),("8_anos",...),("9_11_anos",...)])
    anio = models.PositiveSmallIntegerField()

class Estudiante(models.Model):
    grupo = models.ForeignKey(Grupo, related_name="estudiantes", on_delete=models.CASCADE)
    nombres = models.CharField(max_length=120)
    documento = models.CharField(max_length=30, blank=True)
    fecha_nacimiento = models.DateField(null=True, blank=True)
    consentimiento_video = models.BooleanField(default=False)
    consentimiento_ia_nube = models.BooleanField(default=False)

# apps/evaluaciones
class Evaluacion(models.Model):
    class Estado(models.TextChoices):
        PENDIENTE = "pendiente"; PROCESANDO = "procesando"; LISTA = "lista"; ERROR = "error"
    estudiante = models.ForeignKey(Estudiante, null=True, blank=True, on_delete=models.SET_NULL)
    docente = models.ForeignKey(Docente, on_delete=models.PROTECT)
    evaluacion_grupal = models.ForeignKey("EvaluacionGrupal", null=True, blank=True, on_delete=models.SET_NULL)
    archivo = models.FileField(upload_to="evidencias/%Y/%m/")  # borrar tras N días
    tipo_archivo = models.CharField(max_length=10)             # video | imagen
    habilidad_solicitada = models.ForeignKey(Habilidad, null=True, blank=True, on_delete=models.PROTECT, related_name="+")  # null = auto
    habilidad_detectada = models.ForeignKey(Habilidad, null=True, on_delete=models.PROTECT, related_name="+")
    es_deteccion_automatica = models.BooleanField(default=False)
    grado = models.CharField(max_length=12)
    observaciones_docente = models.TextField(blank=True)
    motor = models.CharField(max_length=10, choices=[("local","Local"),("gemini","Gemini")])
    modelo_ia = models.CharField(max_length=60, blank=True)
    estado = models.CharField(max_length=12, choices=Estado.choices, default=Estado.PENDIENTE)
    puntaje = models.PositiveSmallIntegerField(null=True)            # 0..5
    porcentaje_madurez = models.PositiveSmallIntegerField(null=True)
    estadio_gallahue = models.CharField(max_length=10, blank=True)
    resumen = models.TextField(blank=True)
    analisis_articular = models.JSONField(default=dict)
    errores_criticos = models.JSONField(default=list)
    frases_profe = models.JSONField(default=list)
    telemetria = models.JSONField(default=dict)                       # Telemetria completa (doc 02 §5)
    fases_fsm = models.JSONField(default=list)
    version_motor = models.CharField(max_length=20)                   # para reproducibilidad
    creado = models.DateTimeField(auto_now_add=True)

class Fotograma(models.Model):
    evaluacion = models.ForeignKey(Evaluacion, related_name="fotogramas", on_delete=models.CASCADE)
    orden = models.PositiveSmallIntegerField()
    tiempo_s = models.FloatField()
    fase = models.CharField(max_length=120)
    imagen = models.ImageField(upload_to="fotogramas/")
    imagen_esqueleto = models.ImageField(upload_to="fotogramas/")
    landmarks = models.JSONField(null=True)
    angulos = models.JSONField(null=True)
    es_gatillo = models.BooleanField(default=False)
    hito_tipo = models.CharField(max_length=10, blank=True)           # inicial | pico | sub | final
    hito_badge = models.CharField(max_length=60, blank=True)
    hito_titulo = models.CharField(max_length=120, blank=True)
    hito_desc = models.CharField(max_length=200, blank=True)
    hito_color = models.CharField(max_length=9, blank=True)

class ResultadoCriterio(models.Model):
    evaluacion = models.ForeignKey(Evaluacion, related_name="criterios", on_delete=models.CASCADE)
    criterio = models.ForeignKey(CriterioHMB, null=True, on_delete=models.PROTECT)  # null si viene de Gemini con texto libre
    texto = models.TextField()
    fase = models.CharField(max_length=40)
    puntaje = models.PositiveSmallIntegerField()   # 0 | 1
    medido = models.CharField(max_length=200, blank=True)
    umbral = models.CharField(max_length=120, blank=True)
    observacion = models.TextField(blank=True)

class EvaluacionGrupal(models.Model):
    grupo = models.ForeignKey(Grupo, on_delete=models.CASCADE)
    habilidad = models.ForeignKey(Habilidad, null=True, on_delete=models.PROTECT)
    estudiantes_objetivo = models.PositiveSmallIntegerField()        # 1..60
    creado = models.DateTimeField(auto_now_add=True)

# apps/planeacion
class UnidadDidactica(models.Model):
    docente = models.ForeignKey(Docente, on_delete=models.PROTECT)
    evaluacion = models.ForeignKey(Evaluacion, null=True, blank=True, on_delete=models.SET_NULL)
    evaluacion_grupal = models.ForeignKey(EvaluacionGrupal, null=True, blank=True, on_delete=models.SET_NULL)
    habilidad = models.ForeignKey(Habilidad, on_delete=models.PROTECT)
    formato = models.CharField(max_length=40)        # Cuento Motor | Circuito de Estaciones | Retos Cooperativos | Juego Libre Dirigido
    metodologia = models.CharField(max_length=40)    # Descubrimiento Guiado | Resolución de Problemas | Asignación de Tareas
    materiales = models.JSONField(default=list)      # ["Conos","Aros","Balones",...]
    periodo = models.PositiveSmallIntegerField()     # 1..4
    duracion_min = models.PositiveSmallIntegerField()  # 45 | 50 | 55 | 60 | 90
    total_clases = models.PositiveSmallIntegerField()  # 1,2,3,4,6,8,10,12
    contenido = models.JSONField()                   # objeto UnidadDidactica completo (doc 04 §2.5)
    creado = models.DateTimeField(auto_now_add=True)

class Sesion(models.Model):
    unidad = models.ForeignKey(UnidadDidactica, related_name="sesiones", on_delete=models.CASCADE)
    numero = models.PositiveSmallIntegerField()
    plantilla = models.ForeignKey(PlantillaSesion, null=True, on_delete=models.SET_NULL)
    es_refuerzo = models.BooleanField(default=False)
    error_reforzado = models.CharField(max_length=200, blank=True)
    # campos materializados (para que el docente pueda editarlos)
    titulo = models.CharField(max_length=220)
    objetivo = models.TextField()
    actividad_inicial = models.TextField()
    actividad_central = models.TextField()
    actividad_final = models.TextField()
    consigna = models.TextField()
    criterio_eval = models.TextField()
```

## 5. Correspondencia JS → Python

| JS (`script.js`) | Python |
|---|---|
| `calculateAngle3D`, `calcularAngulo2D`, `calcularInclinacionHorizontal` | `biomecanica/geometria.py` |
| `analyzeEquilibriumFromPythonReference`, `computeJointAngles` | `biomecanica/angulos.py` |
| `getPoseLandmarker` | `biomecanica/extraccion.py` (instancia única por *worker* Celery) |
| `checkExerciseTriggerPose` | `biomecanica/gatillo.py` |
| `extractAdaptiveVideoKeyframes`, `extractImageKeyframe`, `drawPoseSkeleton` | `biomecanica/extraccion.py` (cv2) |
| `assignKeyframeMilestones` | `biomecanica/hitos.py` (títulos/colores en una tabla) |
| `aggregateVideoTelemetry` | `biomecanica/telemetria.py` (`@dataclass Telemetria`) |
| `classifySkillFromKinematics` | `biomecanica/clasificador.py` |
| `*FSM`, `createFSMForSkill`, `executeFSMAnalysis` | `biomecanica/fsm.py` |
| `biomechanicalRulesTable[*].criterios[*].evaluar` | `biomecanica/reglas.py` (condiciones) + `CriterioHMB` (textos) |
| `runLocalBiomechanicalEngine` | `biomecanica/motor_local.py` |
| `getGeminiCandidateEndpoints`, `callGeminiVision`, `cleanJSON` | `apps/ia/cliente.py`, `apps/ia/prompts/` |
| `sendMsg`, `handleDiagnosisOutput` | vista `EvaluacionCreateView` + tarea `procesar_evaluacion` |
| `getSkillProgressionTemplates` | modelo `PlantillaSesion` (fixtures) |
| `generateDidacticPlan`, `getGradeAndCycle` | `apps/planeacion/generador.py` |
| `generateGroupPlan` | `apps/planeacion/generador.py::plan_grupal` |
| `exportDiagnosticoToWord`, `exportToWord`, `downloadDocFile` | `apps/reportes/word.py` + vistas de descarga |
| `getTeacherPreferences` | `PreferenciasClaseForm` (Django Form) |
| alertas, wizard, drawer, drag & drop | templates + HTMX/Alpine (o JS mínimo) |
| `localStorage` | sesión de Django / modelo `PreferenciasDocente` |

Implementación real (`backend/biomecanica/reglas.py`): cada criterio es un `Criterio(texto, fase, condicion, medido, umbral, observacion_ok, observacion_falla, error, impacto)`. Los ángulos y la telemetría se manejan como `dict` con las **mismas claves camelCase del JS** (`t["avgElbowAngle"]`), porque son el contrato JSON que se guarda en `Evaluacion.telemetria`, se envía a Gemini y se compara en los fixtures.

## 6. Flujo de la aplicación Django

```
GET  /                                   landing (landing.html → template)
GET  /evaluar/                           paso 1: elegir habilidad (o auto) + grupo/estudiante
POST /evaluar/                           paso 2: sube archivo + observaciones → crea Evaluacion(PENDIENTE), encola Celery
GET  /evaluaciones/<id>/estado/          polling HTMX (PROCESANDO → LISTA)
GET  /evaluaciones/<id>/                 paso 3: diagnóstico + fotogramas + unidad didáctica
POST /evaluaciones/<id>/unidad/          (re)genera la unidad con otras preferencias
GET  /evaluaciones/<id>/reporte.docx     reporte del estudiante
GET  /unidades/<id>/plan.docx            planeación
GET  /grupos/<id>/                       evaluación grupal: progreso N/M, errores consolidados
POST /grupos/<id>/plan/                  plan consolidado
GET  /estudiantes/<id>/historial/        evolución del estudiante en el tiempo (nuevo)
```

Tarea Celery `procesar_evaluacion(evaluacion_id)`:
1. Extraer fotogramas y landmarks (`biomecanica.extraccion`).
2. Guardar `Fotograma`s.
3. Si `motor == "gemini"` y la institución/estudiante lo permiten: llamar a Gemini; si falla o no valida → motor local.
4. Guardar `Evaluacion` + `ResultadoCriterio`; estado `LISTA`.
5. Generar `UnidadDidactica` con las preferencias enviadas.

## 7. Estrategia de paridad (para no perder la calibración actual)

Los umbrales del JS se ajustaron a mano durante muchos commits (ver historial: confusiones Patear / Equilibrio / Salto). La migración debe **reproducir exactamente** los resultados antes de mejorar nada.

1. **Fixtures dorados con Node**: escribir un script que cargue las funciones puras de `script.js` (`computeJointAngles`, `aggregateVideoTelemetry`, `classifySkillFromKinematics`, `runLocalBiomechanicalEngine` con stubs de DOM) y, para un conjunto de listas de landmarks guardadas, escriba `tests/golden/*.json` con entradas y salidas. (Así se generaron `docs/datos/*.json`.)
2. **Capturar landmarks reales**: añadir temporalmente al JS un botón "descargar landmarks" o registrar `capturedKeyframes` en consola, y grabar 3–5 videos de prueba por habilidad.
3. **Pruebas pytest** que comparen la salida Python con los dorados (ángulos con tolerancia 0, clasificación idéntica, mismos puntajes).
4. Cuidar: redondeo de JS (`Math.round`), `Math.max(...[])` = `-Infinity`, orden de iteración del dict de puntajes, índices 1-based de `flightFrames`, `replace('_', ' ')` que reemplaza solo la primera aparición.
5. **Extracción de fotogramas**: la paridad exacta con el navegador es imposible (el *seek* del navegador y el de OpenCV no caen en el mismo fotograma, y el decodificador difiere). Validar a nivel de "misma habilidad y mismo estadio" en los videos de prueba, no de ángulos exactos.
6. Mantener el redimensionado a **640×360** al principio para que los ángulos coincidan; corregir la deformación (doc 07) **después**, en un cambio aparte con su propia validación.

## 8. Fases sugeridas

| Fase | Entregable | Criterio de "hecho" |
|---|---|---|
| 0 ✅ | Proyecto Django 5.2 LTS, settings por entorno, Celery (síncrono sin broker), SQLite/Postgres por `DATABASE_URL`, pytest — **hecho en [`backend/`](../backend/README.md)** | `pytest` en verde |
| 1 ✅ | Paquete `biomecanica` (sin video): geometría, ángulos, telemetría, clasificador, FSM, reglas, motor local — **hecho en [`backend/`](../backend/README.md)** | Paridad 100 % con dorados de Node (769 pruebas) |
| 2 ✅ | Todos los modelos + comando `cargar_catalogo` (criterios desde `biomecanica.reglas`, plantillas desde `docs/datos`) + `servicios.diagnosticar_y_guardar` | 9 habilidades, 45 criterios, 36 plantillas en BD; 777 pruebas |
| 3 ✅ | Extracción de video en Python (cv2 + mediapipe) + tarea Celery + retención — `biomecanica/extraccion.py`, `apps/evaluaciones/tasks.py` | Lógica de ventanas probada con video sintético; MediaPipe real verificado con una foto. **Falta** comparar con videos reales en la web actual |
| 4 | Generador de unidad didáctica + exportes `.docx` | Documentos equivalentes a los `.doc` actuales |
| 5 | UI: asistente de 3 pasos con templates + HTMX, reutilizando `styles.css` | Flujo completo individual |
| 6 | Modo grupal, estudiantes, historial | Plan consolidado por grupo |
| 7 | Gemini en servidor (SDK oficial, Pydantic, prompts versionados) | Respaldo local probado |
| 8 | Mejoras (doc 07): plantillas para las 6 habilidades faltantes, lateralidad, medición temporal real del equilibrio, criterios con mejores proxies | Validadas con el equipo pedagógico |

## 9. Seguridad y datos personales

- Videos e imágenes de **menores**: consentimiento del acudiente, almacenamiento privado (no `MEDIA_URL` público; servir con vista autenticada), borrado automático configurable (p. ej. 30 días) conservando solo landmarks y métricas.
- Clave de Gemini solo en servidor.
- Escapar todo el contenido en templates (hoy el JS inserta `innerHTML` con texto devuelto por Gemini → riesgo de XSS).
- Límite de tamaño y duración del archivo (el JS recorta a 20 s; poner límite en `FILE_UPLOAD_MAX_MEMORY_SIZE` / validador y verificar el tipo con `ffprobe` o cv2).
