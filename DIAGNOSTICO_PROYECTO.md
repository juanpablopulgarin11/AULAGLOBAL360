# Diagnóstico Integral del Proyecto · AULA GLOBAL 360

**Fecha de auditoría:** 28 de octubre de 2026  
**Rama evaluada:** `main` (commit `faf931e`)  
**Repositorio:** `https://github.com/juanpablopulgarin11/AULAGLOBAL360.git`

---

## 1. Resumen Ejecutivo

**AULA GLOBAL 360** se encuentra en un estado **funcional, maduro y con alta cobertura de pruebas automatizadas** en su versión servidor (`backend/`), manteniendo además paridad documentada con la versión web estática original (`index.html` + `script.js`).

| Indicador | Resultado | Detalle |
|---|---|---|
| **Suite de pruebas (`pytest`)** | ✅ **1.861 pasadas** | `1861 passed, 1 skipped, 2 warnings` en 66,41 s |
| **Chequeo de sistema Django** | ✅ **Sin errores** | `python manage.py check` (0 problemas detectados) |
| **Estado de migraciones** | ✅ **Al día** | `python manage.py makemigrations --check --dry-run` (sin cambios pendientes) |
| **Árbol de trabajo Git** | ✅ **Limpio** | Sin modificaciones sin confirmar |
| **Despliegue Docker / Cloud Run** | ⚠️ **Requiere ajustes** | Desfase en el JSON de plantillas copiado a la imagen y falta de `PyMySQL` en `requirements/` |

---

## 2. Arquitectura Actual del Sistema

El repositorio alberga dos implementaciones complementarias y los anexos de investigación:

### 2.1 Capa Web Estática (Raíz y `dist/`)
* **Archivos principales:** `index.html`, `landing.html`, `script.js` (~325 KB), `styles.css`, `landing.css`.
* **Construcción:** `scripts/build.mjs` y `scripts/build.py` generan la carpeta `dist/` lista para GitHub Pages (`.github/workflows/deploy-pages.yml`) o Netlify (`netlify.toml`).
* **Propósito:** Demo interactiva 100 % en navegador con MediaPipe Web y almacenamiento en `localStorage`.

### 2.2 Plataforma Servidor Full-Stack (`backend/`)
* **Stack tecnológico:** Python 3.12+, Django 5.2 LTS, Celery 5.6, MediaPipe (`pose_landmarker_lite.task`), OpenCV Headless, `python-docx`, `google-genai` (Gemini Vision + Pydantic) y WhiteNoise.
* **Módulos de negocio (`backend/apps/`):**
  * `cuentas`: Modelo `Docente` (usuario personalizado) e `Institucion`, configuración de clase y gestión cifrada de claves de Gemini.
  * `catalogo`: Modelos `Habilidad` (9 habilidades HMB), `CriterioHMB` (45 criterios) y `PlantillaSesion` (108 sesiones en el banco completo), sincronizados mediante `python manage.py cargar_catalogo`.
  * `estudiantes`: Gestión de salones (`Grupo`), estudiantes, historial evolutivo y consentimiento informado (Ley 1581).
  * `evaluaciones`: Procesamiento de video/imagen, ejecución de motores biomecánicos, confirmación docente de criterios visuales y consolidación grupal del salón.
  * `planeacion`: Generador de Unidades Didácticas personalizadas y motor de **Montaje 3D** (`apps/planeacion/montaje.py` + `static/js/montaje3d-escena.js` y `capturas3d.js`) con tres modelados 3D por sesión (parte inicial, central y final) y adaptación automática al material disponible del docente.
  * `ia`: Cliente de Gemini Vision con validación estricta de esquema Pydantic y fallback automático al motor biomecánico local.
  * `reportes`: Generación de documentos Microsoft Word (`.docx`) nativos para informes biomecánicos individuales y planes de unidad didáctica.
* **Motor Biomecánico (`backend/biomecanica/`):**
  * **Motor v1 (`motor_local.py`, `reglas.py`, `didactica.py`):** Mantiene paridad exacta con `script.js` verificada por pruebas doradas (`backend/tests/golden/`).
  * **Motor v2 (`motor_v2.py`, `serie.py`, `reglas_v2.py`, `momentos.py`, `didactica_v2.py`, `materiales.py`):** Evalúa la serie completa del video a 30 muestras/s, mide eventos reales (vuelos, contactos podales, tiempos de sostén, velocidad articular en largos de pierna), separa los 36 criterios medibles por pose de los 9 criterios visuales, ancla los 8 fotogramas clave a los hitos del gesto y personaliza las unidades didácticas según los criterios reprobados y los materiales del docente.

---

## 3. Hallazgos Críticos (Despliegue y Producción)

### 3.1 🔴 Desfase del banco de sesiones en Docker / Cloud Run
* **Ubicación:** `backend/Dockerfile` (líneas 22–23), `backend/datos/plantillas_progresion.json` vs `docs/datos/plantillas_progresion.json`.
* **Diagnóstico:**
  * En entorno local (`backend/config/settings/base.py:104`), `AULA360_DATOS_DIR` apunta a `docs/datos`, donde `plantillas_progresion.json` pesa **154,9 KB** y contiene las **108 sesiones** para las **9 habilidades** (incluyendo los campos `criterios` y `fuente` de la Planeación v2).
  * En cambio, `backend/Dockerfile` ejecuta `COPY datos/ /app/datos/` y fija `ENV AULA360_DATOS_DIR=/app/datos`. El archivo `backend/datos/plantillas_progresion.json` pesa **41,7 KB** y contiene únicamente las **36 sesiones antiguas** de 3 habilidades (*Carrera*, *Salto Horizontal* y *Lanzamiento Sobre Hombro*), sin los campos `criterios` ni `fuente`.
* **Impacto:** Cualquier contenedor desplegado en Docker o Google Cloud Run sincroniza el catálogo con el archivo antiguo de 36 sesiones al ejecutar `python manage.py cargar_catalogo` en `docker-entrypoint.sh`, perdiendo las 72 sesiones nuevas y los metadatos de criterios/referentes bibliográficos en producción.
* **Solución recomendada:** Copiar el contenido actualizado de `docs/datos/plantillas_progresion.json` hacia `backend/datos/plantillas_progresion.json` y añadir una prueba en `backend/tests/test_catalogo.py` que verifique que ambos archivos permanezcan sincronizados.

### 3.2 🔴 Ausencia de `PyMySQL` en los archivos `requirements/` de producción
* **Ubicación:** `backend/config/__init__.py` (líneas 1–5), `backend/requirements/base.txt`, `backend/requirements/prod.txt` y `backend/requirements/lock.txt`.
* **Diagnóstico:**
  * En el commit `5836802` se añadió en `backend/config/__init__.py`:
    ```python
    try:
        import pymysql
        pymysql.install_as_MySQLdb()
    except ImportError:
        pass
    ```
  * Sin embargo, `PyMySQL` no fue listado en `requirements/base.txt`, `requirements/prod.txt` ni en `requirements/lock.txt`.
* **Impacto:** Al construir la imagen Docker (`pip install -r requirements/prod.txt -c requirements/lock.txt`), `PyMySQL` no se instala. Si en Cloud Run se configura `DATABASE_URL=mysql://...` (Cloud SQL para MySQL), el bloque `try/except` ignora el `ImportError` al iniciar y Django falla inmediatamente con `ImproperlyConfigured: Error loading MySQLdb module`.
* **Solución recomendada:** Declarar `PyMySQL>=1.1` en `backend/requirements/prod.txt` y fijar su versión en `backend/requirements/lock.txt`.

### 3.3 🟠 Configuración de seguridad por defecto en `prod.py` y variables de entorno
* **Ubicación:** `backend/config/settings/prod.py` (líneas 5–7) y `generar_todos_los_anexos.py` (línea 506).
* **Diagnóstico:**
  * `prod.py` define valores por defecto permisivos si no se inyectan variables de entorno:
    * `SECRET_KEY = env("DJANGO_SECRET_KEY", default="django-insecure-prod-key-aulaglobal360-default")`
    * `ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["*"])`
  * Asimismo, `prod.py` lee la variable `DJANGO_CSRF_TRUSTED_ORIGINS`, pero en el documento técnico de despliegue (`generar_todos_los_anexos.py:506`) se documenta como `CSRF_TRUSTED_ORIGINS` (sin el prefijo `DJANGO_`).
* **Impacto:** Si en Cloud Run se omite `DJANGO_SECRET_KEY`, la aplicación opera en producción con una semilla criptográfica pública conocida, comprometiendo la firma de sesiones y el cifrado Fernet de claves de Gemini (`apps/cuentas/models.py`). Si un dominio personalizado se configura en `CSRF_TRUSTED_ORIGINS` en vez de `DJANGO_CSRF_TRUSTED_ORIGINS`, las peticiones `POST` desde ese dominio fallarán por validación CSRF.
* **Solución recomendada:** Asegurar que `DJANGO_SECRET_KEY` esté definida en Cloud Run (Secret Manager) y aceptar tanto `DJANGO_CSRF_TRUSTED_ORIGINS` como `CSRF_TRUSTED_ORIGINS` en `prod.py`.

### 3.4 🟠 Almacenamiento local efímero en entornos Serverless (Cloud Run)
* **Ubicación:** `backend/config/settings/base.py` (líneas 62 y 93).
* **Diagnóstico:**
  * Los videos y fotogramas extraídos se almacenan en `PRIVATE_MEDIA_ROOT` (`/app/privado` dentro del contenedor).
  * Si no se define `DATABASE_URL`, la base de datos por defecto es `/app/db.sqlite3`.
* **Impacto:** En Google Cloud Run con autoescalado a cero (`min-instances=0`), el sistema de archivos del contenedor reside en memoria y se destruye cuando la instancia se recicla. Con Cloud SQL conectado (`DATABASE_URL`), los registros de evaluaciones, diagnósticos, puntajes y unidades didácticas persisten, pero los archivos físicos de fotogramas (`.jpg`) y videos en `/app/privado` se pierden tras el reciclaje de la instancia a menos que se monte un bucket de Cloud Storage (GCS FUSE) en `/app/privado`.

---

## 4. Hallazgos en Código y Mantenibilidad

### 4.1 🟠 Dictamen consolidado estático (hardcodeado) en `reporte_estudiante`
* **Ubicación:** `backend/apps/reportes/word.py` (líneas 454–466).
* **Diagnóstico:**
  * Dentro de `reporte_estudiante()`, cuando se suministra el argumento `fotogramas_detalle`, la tabla final *"DICTAMEN METODOLÓGICO CONSOLIDADO PARA EL JURADO EVALUADOR"* inserta un párrafo fijo que describe específicamente el caso de prueba de Salto Horizontal (*"Estadio Maduro (80% de madurez motriz)... patrón preparatorio maduro (108°), extensión potente en el despegue (162°)... El Fotograma #7 aporta la prueba fehaciente de la rigidez de aterrizaje (142°)..."*).
* **Impacto:** Actualmente solo `generar_todos_los_anexos.py` pasa `fotogramas_detalle`, mientras que la vista web `reporte_de_evaluacion` (`backend/apps/reportes/servicios.py:21`) no lo envía. Sin embargo, si se reutiliza `fotogramas_detalle` para cualquier otro estudiante o habilidad, el documento Word incluirá conclusiones que no corresponden a la evaluación real.
* **Solución recomendada:** Pasar el texto del dictamen consolidado como parámetro opcional (`dictamen_evaluador: Optional[str] = None`) o construirlo dinámicamente a partir del diagnóstico `d`.

### 4.2 🟡 Anotación de tipo `Iterable` sin importar en `apps/reportes/servicios.py`
* **Ubicación:** `backend/apps/reportes/servicios.py` (líneas 4 y 39).
* **Diagnóstico:**
  * La firma `def documento_de_unidad(..., sesiones_filtro: Optional[Iterable[int]] = None)` utiliza `Iterable`, pero la línea 4 solo importa `from typing import Any, Mapping, Optional, Tuple`.
* **Impacto:** No produce `NameError` en ejecución gracias a `from __future__ import annotations`, pero genera error en analizadores estáticos de tipos (`mypy`, `pyright`, `flake8`).
* **Solución recomendada:** Agregar `Iterable` al import de `typing` en `backend/apps/reportes/servicios.py`.

### 4.3 🟡 `RuntimeWarning` de NumPy al suavizar series sin detecciones
* **Ubicación:** `backend/biomecanica/serie.py` (línea 75).
* **Diagnóstico:**
  * Al ejecutar `pytest`, la prueba `tests/test_extraccion.py::test_tarea_video_sin_persona` genera:
    `RuntimeWarning: All-NaN slice encountered in return np.nanmedian(ventanas, axis=0)`.
* **Solución recomendada:** Verificar si la serie contiene únicamente valores `NaN` antes de invocar `np.nanmedian`, o envolver el cálculo con `warnings.catch_warnings()`.

### 4.4 🟡 Higiene del repositorio y archivos binarios en la raíz
* **Ubicación:** Raíz del repositorio (`/`), `.git/.MERGE_MSG.swp`.
* **Diagnóstico:**
  * Existen **318 archivos rastreados por Git**. En la raíz del proyecto se encuentran versionadas 11 iteraciones históricas del manual (`Manual_Usuario_AulaGlobal360_v2.docx` hasta `v12.docx`, además de `Manual_Usuario_AulaGlobal360.docx`), ~20 imágenes `.png` sueltas de pruebas de captura, un video `dummy.mp4` (1 MB) y varios scripts auxiliares (`capture_manual.py`, `generate_docx.py`, `generate_validation.py`, `generate_validation_web.py`, `process_images.py`).
  * Existe además un archivo temporal de Vim `.git/.MERGE_MSG.swp` en el directorio `.git/`.
  * Los archivos locales con credenciales (`backend/.env` y `anexos_trabajo_investigacion/credenciales_cloud_...`) están **correctamente excluidos** por `.gitignore` y no están subidos al repositorio remoto.

---

## 5. Resultados de la Ejecución de Pruebas y Chequeos

```text
Plataforma: Windows (Python 3.12 / Django 5.2.17 / pytest 9.1.1)
Comando:    pytest -q (en backend/)
Resultado:  1861 passed, 1 skipped, 2 warnings in 66.41s (0:01:06)

Chequeo de migraciones:
Comando:    python manage.py makemigrations --check --dry-run
Resultado:  No changes detected

Chequeo del sistema Django:
Comando:    python manage.py check
Resultado:  System check identified no issues (0 silenced).
```

---

## 6. Plan de Acción Recomendado (Priorizado)

1. **[Prioridad Alta · Producción]** Sincronizar `backend/datos/plantillas_progresion.json` con `docs/datos/plantillas_progresion.json` para que el contenedor Docker disponga de las 108 sesiones y los metadatos de criterios y fuentes.
2. **[Prioridad Alta · Producción]** Añadir `PyMySQL` a `backend/requirements/prod.txt` y `backend/requirements/lock.txt` para garantizar la conectividad con Cloud SQL MySQL en despliegues de contenedores.
3. **[Prioridad Media · Código]** Importar `Iterable` en `backend/apps/reportes/servicios.py`, parametrizar el dictamen consolidado en `backend/apps/reportes/word.py` y suprimir el `RuntimeWarning` de `np.nanmedian` en `backend/biomecanica/serie.py`.
4. **[Prioridad Media · Configuración]** Soportar tanto `DJANGO_CSRF_TRUSTED_ORIGINS` como `CSRF_TRUSTED_ORIGINS` en `backend/config/settings/prod.py`.
5. **[Prioridad Baja · Limpieza]** Archivar o eliminar de la raíz las versiones intermedias `Manual_Usuario_AulaGlobal360_v2..v11.docx` y las capturas `.png` temporales para aligerar el repositorio.
