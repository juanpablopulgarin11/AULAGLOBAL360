# Diagnóstico Integral del Proyecto · AULA GLOBAL 360

**Fecha de auditoría y remediación:** 28 de octubre de 2026  
**Rama evaluada:** `main`  
**Repositorio:** `https://github.com/juanpablopulgarin11/AULAGLOBAL360.git`

---

## 1. Resumen Ejecutivo

**AULA GLOBAL 360** se encuentra en un estado **funcional, maduro y con alta cobertura de pruebas automatizadas** en su versión servidor (`backend/`), manteniendo además paridad documentada con la versión web estática original (`index.html` + `script.js`). Todos los hallazgos detectados durante la auditoría fueron corregidos y verificados.

| Indicador | Resultado | Detalle |
|---|---|---|
| **Suite de pruebas (`pytest`)** | ✅ **1.863 pasadas** | `1863 passed, 1 skipped` (sin `RuntimeWarning` en `serie.py`) |
| **Chequeo de sistema Django** | ✅ **Sin errores** | `python manage.py check` (0 problemas detectados) |
| **Estado de migraciones** | ✅ **Al día** | `python manage.py makemigrations --check --dry-run` (sin cambios pendientes) |
| **Sincronización Docker (`backend/datos/`)** | ✅ **Corregido y probado** | `backend/datos/plantillas_progresion.json` sincronizado con las 108 sesiones y cubierto por `test_datos_docker_sincronizados` |
| **Dependencias Cloud SQL (`PyMySQL`)** | ✅ **Corregido** | `PyMySQL>=1.1` en `requirements/prod.txt` y `PyMySQL==1.2.3` en `requirements/lock.txt` |

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

## 3. Hallazgos de Despliegue y Producción (Auditados y Corregidos)

### 3.1 ✅ Desfase del banco de sesiones en Docker / Cloud Run (Corregido)
* **Ubicación:** `backend/Dockerfile` (líneas 22–23), `backend/datos/plantillas_progresion.json` vs `docs/datos/plantillas_progresion.json`.
* **Problema detectado:** `backend/Dockerfile` copia `backend/datos/` hacia `/app/datos/` (`AULA360_DATOS_DIR=/app/datos`). El archivo `backend/datos/plantillas_progresion.json` tenía la versión antigua de **36 sesiones** (3 habilidades, sin `criterios` ni `fuente`), frente a las **108 sesiones** de las 9 habilidades en `docs/datos/plantillas_progresion.json`.
* **Corrección aplicada:** Se sincronizó `backend/datos/plantillas_progresion.json` con `docs/datos/plantillas_progresion.json` (108 sesiones completas) y se añadió la prueba automatizada `test_datos_docker_sincronizados` en `backend/tests/test_catalogo.py` para evitar futuros desfases.

### 3.2 ✅ Ausencia de `PyMySQL` en los archivos `requirements/` de producción (Corregido)
* **Ubicación:** `backend/config/__init__.py` (líneas 1–5), `backend/requirements/prod.txt` y `backend/requirements/lock.txt`.
* **Problema detectado:** `backend/config/__init__.py` invoca `pymysql.install_as_MySQLdb()` para conexiones con Cloud SQL MySQL, pero `PyMySQL` no figuraba en `requirements/prod.txt` ni en `requirements/lock.txt`.
* **Corrección aplicada:** Se añadió `PyMySQL>=1.1` en `backend/requirements/prod.txt` y `PyMySQL==1.2.3` en `backend/requirements/lock.txt`.

### 3.3 ✅ Variables de entorno CSRF en producción (`prod.py`) (Corregido)
* **Ubicación:** `backend/config/settings/prod.py` (línea 7) y `generar_todos_los_anexos.py` (línea 506).
* **Problema detectado:** `prod.py` solo leía `DJANGO_CSRF_TRUSTED_ORIGINS`, mientras que la documentación de despliegue mencionaba `CSRF_TRUSTED_ORIGINS`.
* **Corrección aplicada:** `backend/config/settings/prod.py` ahora acepta tanto `DJANGO_CSRF_TRUSTED_ORIGINS` como `CSRF_TRUSTED_ORIGINS`, y se unificó el nombre en `generar_todos_los_anexos.py`.

### 3.4 ℹ️ Consideración arquitectónica: almacenamiento efímero en Cloud Run
* **Ubicación:** `backend/config/settings/base.py` (línea 93).
* **Nota operativa:** En Cloud Run con escalado a cero (`min-instances=0`), el directorio `/app/privado` (`PRIVATE_MEDIA_ROOT`) vive en la memoria del contenedor. Mientras que los diagnósticos, métricas y planeaciones persisten en Cloud SQL (`DATABASE_URL`), si se desea conservar las imágenes de fotogramas más allá del ciclo de vida de la instancia de Cloud Run se recomienda montar un bucket de Google Cloud Storage (GCS FUSE) en `/app/privado`.

---

## 4. Hallazgos en Código y Mantenibilidad (Auditados y Corregidos)

### 4.1 ✅ Dictamen consolidado parametrizado y dinámico en `reporte_estudiante` (Corregido)
* **Ubicación:** `backend/apps/reportes/word.py` (líneas 236–240 y 455–476).
* **Problema detectado:** El bloque `if fotogramas_detalle:` incluía un dictamen estático con datos fijos de Salto Horizontal.
* **Corrección aplicada:** Se añadió el parámetro opcional `dictamen_evaluador: Optional[str] = None` en `reporte_estudiante()` y generación dinámica a partir de la habilidad, estadio, porcentaje de madurez, puntaje y errores críticos del diagnóstico cuando no se pasa un texto explícito. Cubierto por `test_reporte_word_dictamen_dinamico_y_parametrizado` en `backend/tests/test_planeacion.py`.

### 4.2 ✅ Importación de `Iterable` en `apps/reportes/servicios.py` (Corregido)
* **Ubicación:** `backend/apps/reportes/servicios.py` (línea 4).
* **Corrección aplicada:** Se añadió `Iterable` a `from typing import Any, Iterable, Mapping, Optional, Tuple`.

### 4.3 ✅ Supresión de `RuntimeWarning: All-NaN slice encountered` en `serie.py` (Corregido)
* **Ubicación:** `backend/biomecanica/serie.py` (líneas 69–77).
* **Corrección aplicada:** En `_mediana_movil()` se retorna de inmediato cuando toda la serie es `NaN` (`np.all(np.isnan(x))`) y se filtran los `RuntimeWarning` de `np.nanmedian` sobre rebanadas vacías.

### 4.4 ✅ Limpieza de artefactos intermedios en la raíz del repositorio (Corregido)
* **Ubicación:** Raíz del repositorio (`/`) y `.git/`.
* **Corrección aplicada:** Se eliminaron del control de versiones las 10 versiones intermedias obsoletas del manual (`Manual_Usuario_AulaGlobal360_v2.docx` a `v11.docx`, conservando `Manual_Usuario_AulaGlobal360.docx` y `Manual_Usuario_AulaGlobal360_v12.docx`), la imagen temporal `temp.png` y el archivo swap huérfano `.git/.MERGE_MSG.swp`.

---

## 5. Resumen del Plan Ejecutado

| Paso | Prioridad | Acción | Estado |
|---|---|---|---|
| **1** | Alta · Producción | Sincronizar `backend/datos/plantillas_progresion.json` (108 sesiones) y agregar test de paridad Docker | ✅ Completado |
| **2** | Alta · Producción | Añadir `PyMySQL` en `backend/requirements/prod.txt` y `backend/requirements/lock.txt` | ✅ Completado |
| **3** | Media · Código | Importar `Iterable` en `servicios.py`, dinamizar dictamen en `word.py` y eliminar warning en `serie.py` | ✅ Completado |
| **4** | Media · Configuración | Soportar `DJANGO_CSRF_TRUSTED_ORIGINS` y `CSRF_TRUSTED_ORIGINS` en `prod.py` | ✅ Completado |
| **5** | Baja · Limpieza | Eliminar versiones intermedias `v2..v11` del manual, `temp.png` y `.MERGE_MSG.swp` | ✅ Completado |
