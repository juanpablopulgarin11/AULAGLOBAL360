# backend · AULA GLOBAL 360 en Python/Django

Migración del sistema web (`script.js`) a Python. Plan completo: [docs/06](../docs/06_PLAN_MIGRACION_DJANGO.md).

| Fase | Estado |
|---|---|
| 0 · Proyecto Django, settings por entorno, Celery, pruebas | ✅ |
| 1 · Motor `biomecanica` en Python puro con paridad contra el JS | ✅ |
| 2 · Modelos de datos y carga del catálogo | ✅ |
| 3 · Extracción de fotogramas desde video (opencv + mediapipe) y tarea Celery | pendiente |
| 4 · Generador de unidad didáctica y exportes `.docx` | pendiente |
| 5–7 · Interfaz, modo grupal completo, Gemini en servidor | pendiente |

## Puesta en marcha

Requiere **Python 3.10+** (Django 5.2 LTS). El paquete `biomecanica` solo usa la biblioteca estándar.

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements/dev.txt
cp .env.example .env                      # opcional: sin .env usa SQLite y Celery síncrono
.venv/bin/python manage.py migrate
.venv/bin/python manage.py cargar_catalogo
.venv/bin/python manage.py createsuperuser
.venv/bin/python manage.py runserver      # admin en http://127.0.0.1:8000/admin/
.venv/bin/python -m pytest -q             # 777 pruebas
```

Para PostgreSQL y Redis basta con definir `DATABASE_URL` y `CELERY_BROKER_URL` (ver `.env.example`). En producción: `DJANGO_SETTINGS_MODULE=config.settings.prod` y `DJANGO_SECRET_KEY` obligatorio.

## Estructura

```
backend/
├── config/                 # settings (base, dev, test, prod), urls, celery, wsgi/asgi
├── apps/
│   ├── cuentas/            # Institucion, Docente (modelo de usuario propio)
│   ├── catalogo/           # Habilidad, CriterioHMB, PlantillaSesion + comando cargar_catalogo
│   ├── estudiantes/        # Grupo (salón), Estudiante con consentimientos (Ley 1581)
│   ├── evaluaciones/       # Evaluacion, Fotograma, ResultadoCriterio, EvaluacionGrupal + servicios.py
│   └── planeacion/         # UnidadDidactica, Sesion (el generador llega en la fase 4)
├── biomecanica/            # motor en Python puro (sin Django)
│   ├── geometria.py · angulos.py · gatillo.py · telemetria.py · clasificador.py
│   ├── fsm.py · hitos.py · habilidades.py · reglas.py · motor_local.py · jsutil.py
└── tests/
    ├── golden/             # generar_dorados.js ejecuta el script.js real → dorados.json
    ├── test_paridad.py     # Python == JS (769 casos)
    ├── test_motor.py
    ├── test_catalogo.py
    └── test_evaluaciones.py
```

## Decisiones de diseño

- **Las reglas de la batería son código, no datos.** Las condiciones y los textos con valores medidos viven en `biomecanica/reglas.py`, cubiertos por las pruebas de paridad. `CriterioHMB` guarda solo lo descriptivo (texto, fase, umbral, error) para el admin, las relaciones y los reportes, y `cargar_catalogo` lo sincroniza desde el código. Así no hay dos fuentes de verdad.
- **El contrato JSON conserva las claves del JS** (`avgElbowAngle`, `kneeMin`…), porque es lo que se guarda en `Evaluacion.telemetria`, se envía a Gemini y se compara en los fixtures.
- **Videos y fotogramas de menores en almacenamiento privado** (`PRIVATE_MEDIA_ROOT`, fuera de `MEDIA_URL`). Se servirán solo con vistas autenticadas. `AULA360_DIAS_RETENCION_VIDEO` queda listo para la tarea de borrado.
- **`Evaluacion.version_motor`** registra la versión del motor para poder explicar resultados si cambian los umbrales.

## Uso del motor desde Django

```python
from apps.evaluaciones.models import Evaluacion
from apps.evaluaciones.servicios import diagnosticar_y_guardar, consolidar_grupo

ev = Evaluacion.objects.create(docente=request.user, estudiante=est, grado="7_anos")   # sin habilidad = automática
diagnosticar_y_guardar(ev, [{"timestampNum": t, "landmarks": lm} for t, lm in muestras])
ev.estado            # "lista" o "error" ("No se detectó a la persona…")
ev.resultados.all()  # 5 criterios enlazados a CriterioHMB
```

## Paridad con el JavaScript

Si cambia la lógica de `script.js` mientras dure la migración:

```bash
node backend/tests/golden/generar_dorados.js     # desde la raíz del repo
```

Los dorados usan poses sintéticas deterministas. Antes de cambiar umbrales conviene agregar landmarks de **videos reales** de cada habilidad (docs/06 §7).

Diferencias intencionales respecto al JS de `72e7a88` (aplicadas también en `script.js`, así que la paridad se mantiene): sin landmarks → error en vez de diagnóstico inventado; `edad_calibrada` con la etiqueta del grado.
