# Documentación técnica · AULA GLOBAL 360

Documentación completa de la versión actual (HTML + JavaScript estático en GitHub Pages) preparada para **migrar el sistema a Python con Django**.

## Resumen en 30 segundos

- Hoy todo corre en el navegador: un `script.js` de ~6.000 líneas hace la detección de pose (MediaPipe WASM), los cálculos biomecánicos, la clasificación de la habilidad, la puntuación de la Batería HMB, la generación de la unidad didáctica y la exportación a Word. No hay backend ni base de datos.
- El conocimiento valioso que hay que conservar es: **las fórmulas y umbrales** (doc 02), **las 45 reglas de la batería** (doc 03), **las 36 plantillas de sesiones y el algoritmo de priorización** (doc 04) y **el prompt de Gemini** (doc 05).
- Recomendación: un paquete Python puro `biomecanica/` probado contra el JS para obtener los mismos resultados, envuelto en un proyecto Django con Celery, PostgreSQL y exportes `.docx` reales (doc 06).

## Estado

La migración está implementada en [`backend/`](../backend/README.md): aplicación Django completa (evaluación por video en el servidor, salones, historial, planeaciones editables, Word, Gemini opcional) con más de 1.600 pruebas, incluida la paridad del motor v1 con `script.js`; el servidor usa el motor v2 (doc 08). Esta carpeta documenta el sistema original y el plan que se siguió.

## Índice

| Documento | Contenido |
|---|---|
| [01 · Arquitectura actual](01_ARQUITECTURA_ACTUAL.md) | Archivos, dependencias, flujo de usuario, controles y opciones, estado global, `localStorage`, mapa de funciones de `script.js` |
| [02 · Motor biomecánico](02_MOTOR_BIOMECANICO.md) | Landmarks, fórmulas de ángulos, `computeJointAngles`, extracción de fotogramas, gatillo de inicio, telemetría agregada, clasificador (todas las puntuaciones), máquinas de estado, hitos, contrato JSON `Diagnostico` |
| [03 · Reglas Batería HMB](03_REGLAS_BATERIA_HMB.md) | Las 9 habilidades × 5 criterios con condición exacta, umbral, error y frases; cobertura frente a las 16 pruebas originales |
| [04 · Planeación y exportes](04_PLANEACION_DIDACTICA_Y_EXPORTES.md) | Plantillas de 12 sesiones, algoritmo de priorización por falencias, cálculo de tiempos, grados MEN, estructura de la unidad didáctica, plan grupal, contenido de los dos `.doc` |
| [05 · Integración Gemini](05_INTEGRACION_GEMINI.md) | Listado y elección de modelos, prompt, formato de petición/respuesta, respaldo local, recomendación con SDK oficial y Pydantic |
| [06 · Plan de migración a Django](06_PLAN_MIGRACION_DJANGO.md) | Decisión de arquitectura, estructura de proyecto, dependencias, **modelos de datos**, correspondencia JS → Python, URLs, tarea Celery, estrategia de paridad, fases |
| [07 · Hallazgos y deuda técnica](07_HALLAZGOS_Y_DEUDA_TECNICA.md) | Errores encontrados, inconsistencias, riesgos de seguridad/privacidad y limitaciones del método |
| [08 · Motor v2](08_MOTOR_V2.md) | Evaluación sobre el video completo: eventos, detección con confianza, criterios por confirmar (IA o docente), verificación y cómo validar con videos reales |
| [09 · Planeación personalizada](09_PLANEACION_V2.md) | Banco de 108 sesiones (12 por habilidad) con referentes de `Data/`, refuerzos por criterios no logrados, unidad por habilidad y montajes 3D propios |

## Datos extraídos (listos para fixtures de Django)

| Archivo | Contenido |
|---|---|
| [`datos/bateria_hmb_reglas.json`](datos/bateria_hmb_reglas.json) | 9 habilidades: componente, nº de prueba, protocolo, frases y 5 criterios con condición, umbral y error |
| [`datos/plantillas_progresion.json`](datos/plantillas_progresion.json) | 108 sesiones (12 por habilidad) con marcadores `{materiales}`, `{formato}`, `{metodologia}`, criterios de la batería que trabaja y referente. Las de Carrera, Salto Horizontal y Lanzamiento vienen de `script.js`; las demás, de los libros de `Data/` (doc 09) |

Se generaron ejecutando las funciones originales de `script.js` con Node, de modo que coinciden con el código del commit `72e7a88`. Si se cambian las reglas o plantillas en el JS antes de migrar, hay que volver a generarlos.

## Bibliografía del dominio (carpeta `Data/`)

- **Batería HMB** — González Palacio, Montoya Grisales et al. (2021), Dialnet 7925607: criterios, protocolos y baremo. Es la base de las reglas.
- Castañer & Camerino — *Manifestaciones básicas de la motricidad*.
- Rodríguez & Bustamante — *Juegos motores para primaria* (8–10 y 10–12 años).
- Pérez Feito, Piñón & Pérez, López et al. — *Sesiones de Educación Física* (6–7, 8–9, 10–11, 12–13 años).
- *Juegos deportivos cooperativos con pelotona*.
- `Unidad_Didactica_y_Planeacion_Marcha.docx` — ejemplo del formato institucional de planeación.

Cada PDF tiene su versión `.md`. El código actual no los lee; son la fuente para completar las plantillas de las 6 habilidades que hoy no tienen sesiones propias.
