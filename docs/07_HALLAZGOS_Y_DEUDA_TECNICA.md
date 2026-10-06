# 07 · Hallazgos, errores y deuda técnica

Lista de problemas encontrados al documentar el código. La migración debe decidir conscientemente si **replica** el comportamiento (fase de paridad) o lo **corrige** (fase de mejoras). Gravedad: 🔴 afecta resultados o seguridad · 🟠 funcionalidad incompleta · 🟡 menor · ✅ corregido en la rama `migracion-django` (en `script.js` y en el port Python).

## 1. Errores de lógica

| # | Gravedad | Dónde | Problema | Efecto |
|---|---|---|---|---|
| 1 | ✅ corregido | `aggregateVideoTelemetry` (`script.js:2620`) | Si MediaPipe no detectaba a nadie, el motor local diagnosticaba con **valores inventados** (rodilla 108°, codo 94°, simetría 86 %…) | Ahora `runLocalBiomechanicalEngine` (y `run_local_engine` en Python) lanza un error "No se detectó a la persona…" |
| 2 | ✅ corregido | Canvas 640×360 | Todo video se estiraba a 16:9. Verificado con MediaPipe real: en video vertical una rodilla a 87° se leía como 157–165° | Ahora encuadre sin deformación en web y servidor; la pose se detecta sobre el contenido y se lleva al lienzo 16:9 calibrado (16:9 idéntico al original) |
| 3 | 🟡 sin efecto | `SaltoHorizontalFSM` y `CarreraFSM` (`script.js:1040`, `1120`) | Usan `angles.flightDetected`, que no existe en los ángulos por fotograma (es un campo de la telemetría agregada) | Esas ramas nunca se activan; solo afecta al texto de fases |
| 4 | 🟠 | `analyzeEquilibriumFromPythonReference` (`script.js:1426-1428`) | Dentro de `angRodillaApoyo > 155` se pregunta `angRodillaApoyo < 150`: condición imposible | Código muerto; la "flexión claudicante" nunca se marca como pérdida en esa rama |
| 5 | ✅ corregido | Prompt de Gemini (`script.js:4177`) | Usaba `telemetry.singleSupportKick`, que no existe, y siempre informaba "Pateo: NO" | Ahora usa `transientKickPeak` |
| 6 | ✅ corregido | `generateGroupPlan` | Pintaba el resultado en `#chatScroll`, oculto desde el rediseño, **y dejaba `isAnalyzing = true` para siempre** (el botón Analizar quedaba bloqueado) | Ahora se muestra en el paso 3 y libera el candado |
| 7 | ✅ corregido (Django) | `generateGroupPlan` | Usaba siempre Carrera y no priorizaba | En Django el plan del salón usa la habilidad con menor madurez media y prioriza los errores presentes en ≥ 25 % del salón |
| 8 | 🟠 | `getSkillProgressionTemplates` | Solo 3 de 9 habilidades tienen plantillas; las otras 6 reciben las sesiones de **Carrera** | Un estudiante evaluado en Equilibrio Estático recibe 12 clases de carrera |
| 9 | ✅ corregido | `runLocalBiomechanicalEngine` y prompt de Gemini | `'9_11_anos'.replace('_',' ')` daba `"9 11_anos"` | Ahora usan la etiqueta de `getGradeAndCycle` ("Grado 4º - 5º (9 a 11 años)") |
| 10 | ✅ corregido | `showAlert(..., {type: 'danger'})` | El CSS define `type-error`, no `type-danger` | Ahora usa `type: 'error'` |
| 11 | 🟡 | `codigodelsalto.py` | `calcular_angulo` usa `np.arctan2(c-b, c-b)` (incorrecto) y solo considera el pie izquierdo | No reutilizar esa función (ver doc 02 §11) |
| 12 | 🟡 | `symmetryScore` | Se limita a [65, 98]; varios criterios piden `>= 65` | Lanzamiento #5 siempre pasa; en Patear #1 y Salto Horizontal #4 la parte de simetría siempre se cumple |
| 14 | 🔴 | Clasificador (`minWristDist <= 0.26` → +160 a Recepción y Atrape) | Las distancias están en coordenadas de imagen y **no se normalizan por el tamaño del cuerpo** (`torsoHeight` se calcula pero no se usa). Con los brazos relajados a los lados, las muñecas suelen estar a menos de 0.26 | En las pruebas sintéticas, una postura de pie en reposo se clasifica como Recepción y Atrape. Normalizar distancias por `torsoHeight` tras validar con videos reales |
| 15 | 🟠 mitigado | Clasificador con una sola foto | Sin secuencia temporal, la perspectiva basta para que un tobillo quede "más alto" que el otro (`ankleYDiff ≥ 0.035`) | Verificado con MediaPipe real: una postura de yoga con ambos pies apoyados se clasificó como **Equilibrio Estático Unipodal, Maduro (80 %)**. En Django, con foto el docente debe elegir la habilidad |
| 16 | 🟠 | MediaPipe en macOS (servidor) | mediapipe 1.x con delegado CPU aborta el proceso (`graph_service.h: Service is unavailable`), no lanza excepción | Un *worker* de Celery mal configurado muere en cada tarea. Se usa GPU en Mac (`AULA360_POSE_GPU`) y hay que verificar CPU en el Linux de producción |
| 13 | 🟡 | Clasificador por palabras clave | "pelota" o "tiro" → Patear aunque sea lanzar o atrapar; "parado" → Equilibrio Estático | Clasificación equivocada según las observaciones del docente |

## 2. Inconsistencias de texto vs código

- Umbrales mostrados ≠ condición real: Carrera postura (5° vs 4°), Salto carga (110° vs 112°), Eq. Estático sustentación (criterio dice 160°, código 155°), Lanzamiento liberación (≥ 145° pero también pasa con codo medio ≥ 80°). Ver doc 03.
- La landing anuncia **"10 habilidades"**; el sistema tiene **9**.
- La landing y la telemetría hablan de "muestreo adaptativo por **diferencial de luminancia**", pero no existe ningún cálculo de luminancia: el muestreo es por gatillo angular y espaciado uniforme. `samplingMethod` es una etiqueta fija.
- El reporte Word muestra rangos de referencia (rodilla ≤ 90°, codo 75–105°, tronco 5–15°) que no coinciden con los umbrales de cada habilidad.
- El motor local se anuncia como "sin internet / privacidad total", pero necesita descargar MediaPipe y el modelo desde CDN la primera vez.
- `README.md` describe una estructura de 3 archivos; no menciona `landing.html`, `preview.html` ni `codigodelsalto.py`.

## 3. Seguridad y privacidad

> En la versión Django: clave de Gemini solo en el servidor; videos e imágenes en almacenamiento privado servidos únicamente al docente dueño (probado: otro docente recibe 404); retención con borrado automático; consentimiento del acudiente y autorización institucional antes de usar IA en la nube; todo el texto se escapa en las plantillas (el resumen solo admite **negritas**). Los riesgos de abajo siguen vigentes en la web estática.

| Gravedad | Problema |
|---|---|
| 🔴 | La clave de Gemini se guarda en `localStorage` en texto plano y viaja en la URL (`?key=`) |
| 🔴 | Imágenes de menores se envían a un servicio externo sin registro de consentimiento |
| 🟠 | Se inserta con `innerHTML` texto que devuelve Gemini (`resumen_biomecanico`, criterios, frases) y las observaciones → posible XSS |
| 🟡 | `video_profundizacion` apunta a `https://aulaglobal360.edu.co/...`, un dominio que puede no existir |

## 4. Calidad de código / mantenibilidad

- Un solo archivo de 6.000 líneas con UI, cálculo, datos y exportes mezclados.
- Datos de negocio (reglas, plantillas, textos MEN) incrustados en el código; HTML incrustado en datos (`actividad_inicial` con `<strong>` y recuadros).
- Funciones y alias heredados sin uso o con uso residual: `renderDiagnosticoHTML`, `selectSkill`, `applyApiKey`, `useLocalEngine`, `updateKeyStatus`, sistema de "chat" (`addMsg`, `showTyping`) oculto.
- Referencias defensivas a IDs que no existen (`uploadZoneTitle`, `videoPlayer`, `imagePreview`…), restos de versiones anteriores del HTML.
- `preview.html` redefine `goToStep` con otra lógica (`.wizard-pane`) y envuelve `addMsg`; depende de IDs del `index.html` que no tiene. Es un prototipo de diseño, no la app en uso; decidir si se descarta o solo se toma como referencia visual.
- No hay pruebas automatizadas en el JS (el port Python sí tiene: `backend/tests`); la calibración se hizo a mano commit a commit (ver `git log`: varias correcciones de confusión Patear / Equilibrio / Salto).
- Sin control de versiones del motor: un mismo video puede dar otro resultado tras un cambio de umbrales sin que quede registro (en Django: campo `version_motor`).

## 5. Limitaciones del método (para el equipo pedagógico)

- Se analizan solo **8 fotogramas** de una ventana; acciones rápidas (patada, soltada) pueden caer entre fotogramas.
- Las reglas usan agregados globales (mín./máx./media), no la fase concreta del gesto.
- No hay detección de objetos (pelota, línea, cono): criterios como "la pelota avanza hacia el objetivo" o "pies sobre la línea de 5 cm" no se pueden medir realmente.
- No se distingue lado derecho/izquierdo, aunque la batería original evalúa ambos lados por separado.
- El "5 segundos" del equilibrio estático no se mide con tiempo real.
- Plano de grabación: la guía pide perfil para carrera/salto y frontal para equilibrio; los ángulos 2D dependen mucho de ese plano y no se verifica.
