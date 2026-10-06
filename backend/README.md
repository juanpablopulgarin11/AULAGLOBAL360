# backend · AULA GLOBAL 360 en Python/Django

Versión completa del sistema en Python. Reemplaza a la web estática (`index.html` + `script.js`): el video se analiza en el servidor, los resultados se guardan por estudiante y salón, y las planeaciones y reportes se descargan como Word (`.docx`).

Plan y decisiones: [docs/06](../docs/06_PLAN_MIGRACION_DJANGO.md) · Hallazgos: [docs/07](../docs/07_HALLAZGOS_Y_DEUDA_TECNICA.md)

| Fase | Estado |
|---|---|
| 0 · Proyecto Django 5.2 LTS, settings por entorno, Celery, pruebas, CI | ✅ |
| 1 · Motor `biomecanica` en Python puro, idéntico al JS (paridad probada) | ✅ |
| 2 · Modelos de datos y carga del catálogo | ✅ |
| 3 · Video en el servidor (OpenCV + MediaPipe), tarea Celery, retención | ✅ afinado |
| 4 · Unidad didáctica (paridad con el JS) y documentos Word reales | ✅ |
| 5 · Interfaz web del docente | ✅ |
| 6 · Salones, estudiantes, evaluación grupal e historial | ✅ |
| 7 · Gemini Vision en el servidor con respaldo local | ✅ |
| 8 · Mejoras del método (ver docs/07) | parcial |

## Puesta en marcha local (macOS / Linux)

Requiere **Python 3.10+** (probado con 3.12).

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements/dev.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py cargar_catalogo          # 9 habilidades, 45 criterios, 36 sesiones
.venv/bin/python manage.py descargar_modelo_pose    # MediaPipe Pose lite (verificado por SHA-256)
.venv/bin/python manage.py createsuperuser          # o regístrate en /cuentas/registro/
.venv/bin/python manage.py runserver
```

Abre http://127.0.0.1:8000 → *Acceder al Dashboard*. Sin `.env` se usa SQLite y Celery **síncrono** (el video se analiza dentro de la misma petición, unos 2 s con GPU en Mac). Para Gemini, define `GEMINI_API_KEY` en `.env`.

Pruebas: `.venv/bin/python -m pytest -q` (1.541; la de MediaPipe real se activa con `AULA360_IMAGEN_PRUEBA=/ruta/foto.jpg`).

## Producción (Docker)

```bash
cd backend
cp .env.example .env     # DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS, POSTGRES_PASSWORD, (GEMINI_API_KEY)
docker compose up --build -d
docker compose exec web python manage.py createsuperuser
```

Levanta **web** (gunicorn), **worker** (Celery: análisis de videos y Gemini), **beat** (purga diaria de videos vencidos), **PostgreSQL** y **Redis**. Al iniciar, `web` migra, sincroniza el catálogo y descarga el modelo. Pon un proxy HTTPS (Nginx, Caddy o el del proveedor) delante del puerto 8000.

> **Sin probar todavía**: la imagen Docker y MediaPipe en **CPU sobre Linux**. En macOS mediapipe solo funciona con GPU; si en Linux con CPU fallara, el worker se cae en cada análisis. Primera verificación en el servidor:
> `docker compose exec worker env AULA360_IMAGEN_PRUEBA=/app/algo.jpg python -m pytest -q tests/test_extraccion.py -k mediapipe_real`

## Qué hace la aplicación

| Pantalla | Ruta | Descripción |
|---|---|---|
| Inicio | `/` | Landing institucional |
| Panel | `/panel/` | Resumen por estadio, evaluaciones recientes, salones y planeaciones |
| Evaluar | `/evaluar/` | Habilidad (o automática), video/foto con vista previa, estudiante, grado, observaciones, motor |
| Resultado | `/evaluaciones/<id>/` | Estadio de Gallahue, % de madurez, criterios con medición y umbral, avisos de calidad de la grabación, fotogramas con esqueleto, telemetría, reporte `.docx`, generar unidad |
| Planeación | `/unidades/<id>/` | Unidad didáctica con sesiones de refuerzo dirigido; cada sesión es editable; descarga `.docx` |
| Salones | `/grupos/` | Salones, carga masiva de estudiantes, consentimientos (Ley 1581) |
| Evaluación del salón | `/evaluaciones-grupales/<id>/` | Progreso, matriz de deficiencias colectivas, plan consolidado (habilidad más débil + errores frecuentes) |
| Estudiante | `/estudiantes/<id>/` | Evolución de la madurez por habilidad en el tiempo |
| Administración | `/admin/` | Todo el modelo de datos |

## Estructura

```
backend/
├── config/                 # settings (base, dev, test, prod), urls, celery
├── apps/
│   ├── cuentas/            # Institucion, Docente; registro y panel
│   ├── catalogo/           # Habilidad, CriterioHMB, PlantillaSesion + cargar_catalogo
│   ├── estudiantes/        # Grupo, Estudiante; vistas de salones e historial
│   ├── evaluaciones/       # Evaluacion, Fotograma, ResultadoCriterio, EvaluacionGrupal
│   │                       #   servicios.py (motor → BD), tasks.py (Celery), vistas, formularios
│   ├── planeacion/         # UnidadDidactica, Sesion; servicios y vistas
│   ├── ia/                 # Gemini: prompt, esquema Pydantic, cliente y permisos
│   └── reportes/           # documentos Word con python-docx
├── biomecanica/            # motor en Python puro (sin Django)
│   ├── geometria · angulos · gatillo · telemetria · clasificador · fsm · hitos
│   ├── reglas (45 criterios) · motor_local · didactica (unidad) · habilidades
│   └── extraccion.py       # video/foto → 8 fotogramas (OpenCV + MediaPipe)
├── templates/ · static/    # interfaz (sin dependencias JS externas)
├── tests/                  # 1.541 pruebas; golden/ = paridad con script.js
├── Dockerfile · docker-compose.yml · docker-entrypoint.sh
└── requirements/           # base, dev, prod y lock.txt (versiones probadas)
```

## Decisiones de diseño

- **Mismos resultados que la web.** El motor y el generador de planeaciones se compararon contra el `script.js` real en 91 secuencias de poses, 301 casos de geometría y 720 planeaciones (`tests/golden/`). Si cambia `script.js`, la CI exige regenerar los dorados.
- **Las reglas de la batería son código** (`biomecanica/reglas.py`, probado). `CriterioHMB` guarda solo lo descriptivo y se sincroniza con `cargar_catalogo`.
- **Video sin deformar.** La imagen se ajusta a 640×360 con bandas negras: para 16:9 es idéntico a la calibración original, y en video vertical evita leer una rodilla a 87° como 160°.
- **Privacidad de menores.** Videos e imágenes en almacenamiento privado, servidos solo al docente dueño; borrado automático a los `AULA360_DIAS_RETENCION_VIDEO` días (se conservan las métricas). Para Gemini se exige la autorización de la institución y el consentimiento del acudiente.
- **Gemini nunca decide solo.** La respuesta se valida con Pydantic, el puntaje y el estadio se recalculan desde los criterios, y ante cualquier fallo se usa el motor local con un aviso visible.
- **Reproducibilidad.** `Evaluacion.version_motor` y `meta_video` registran la versión del motor y del prompt, la resolución, los fps y la ventana analizada.

## Configuración (variables de entorno)

| Variable | Defecto | Uso |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.dev` | `config.settings.prod` en producción |
| `DJANGO_SECRET_KEY` | — | Obligatoria en producción |
| `DJANGO_ALLOWED_HOSTS` / `DJANGO_CSRF_TRUSTED_ORIGINS` | — | Dominio(s) del sitio |
| `DATABASE_URL` | SQLite local | `postgres://…` |
| `CELERY_BROKER_URL` / `CELERY_TASK_ALWAYS_EAGER` | `memory://` / `true` | Redis y `false` en producción |
| `AULA360_PRIVATE_MEDIA_ROOT` | `backend/privado` | Videos y fotogramas (privado) |
| `AULA360_DIAS_RETENCION_VIDEO` | 30 | Días antes de borrar videos e imágenes |
| `AULA360_MAX_SUBIDA_MB` | 60 | Tamaño máximo del archivo |
| `AULA360_MODELO_POSE` | `backend/modelos/pose_landmarker_lite.task` | Modelo de MediaPipe |
| `AULA360_POSE_GPU` | `true` en macOS, `false` en otro | Delegado de MediaPipe |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | vacío | IA en la nube; sin modelo se elige el mejor *flash* disponible |

## Paridad con la web estática

```bash
node backend/tests/golden/generar_dorados.js     # desde la raíz, tras cambiar script.js
```

Diferencias intencionales con el JS original, aplicadas en ambos lados: error claro sin persona detectada; etiqueta legible del grado; encuadre sin deformación. Solo en Django: escaneo de video denso con gatillo confirmado, suavizado por mediana, avisos de calidad, textos del resumen propios del servidor, plan grupal que prioriza los errores del salón.
