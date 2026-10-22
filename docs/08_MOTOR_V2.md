# 08 · Motor v2: evaluación sobre el video completo

**Estado:** implementado en `backend/` (Django). El motor v1 (`biomecanica/motor_local.py`) se conserva sin cambios como referencia de paridad con `script.js` de la web (rama `main`).

## 1. Por qué un motor v2

La auditoría de octubre de 2026 comparó el motor con la batería original (Dialnet 7925607, `Data/`) y con MediaPipe real.

**MediaPipe funciona.** El modelo `pose_landmarker_lite` detecta los 33 puntos en el servidor, con GPU en macOS y CPU en Linux.

**El problema estaba en cómo se calificaba.** El v1 calificaba con **8 fotogramas sueltos** (≈4 por segundo):

- **Un vuelo no se ve.** El vuelo de una carrera infantil (≈0,1 s) casi siempre cae entre dos fotogramas.
- **Hay cosas que no se pueden medir.** Con 8 fotogramas no se cuentan «3 saltos seguidos sobre el mismo pie» ni se miden «5 segundos» de equilibrio.
- **La postura basta para aprobar.** Muchos criterios se aprobaban con condiciones como `vuelo O cadera ≥ 30°`, `codo ≥ 145° O codo medio ≥ 80°` o `rodilla ≤ 120°`. Con un video de una persona **quieta** en estocada (dos pies en el suelo), el v1 daba:
  - detección automática: «Equilibrio Estático Unipodal, Maduro 80 %»;
  - salto horizontal 4/5 (Maduro) y lanzamiento 4/5 (Maduro) sin saltar ni lanzar.
- **Hay criterios que la pose no puede ver.** Ocurre en 9 de 45: pelota, agarre, manos en copa, mirada y pies sobre la línea. Se aproximaban con la simetría de rodillas o la inclinación del tronco.

## 2. Qué cambia

| | v1 (paridad con la web) | v2 (Django) |
|---|---|---|
| Datos | 8 fotogramas | Pose de todo el video a 30 muestras/s (`extraccion.py` → `serie`) |
| Medición | Ángulos agregados | **Eventos** (`biomecanica/serie.py`): contacto de cada pie (cerca del suelo **y** quieto en vertical), vuelos (≥ 0,05 s), despegue/caída bipodal, saltos seguidos sobre el mismo pie, segundos en un pie, desplazamiento, velocidad de muñecas y tobillos, lado que ejecuta. Distancias en **largos de pierna**. |
| «El gesto ocurrió» | No se exige | Sin vuelo no hay salto, sin muñeca sobre el hombro a ≥ 4 piernas/s no hay lanzamiento, sin ≥ 1 s en un pie no hay equilibrio, etc. |
| Detección automática | Puntos por postura | Evento característico + **confianza** (alta, media o baja). Con confianza baja el sistema lo dice y pide elegir la habilidad. |
| Criterios visuales | Aproximados | **Por confirmar**: los califica Gemini (si está activo) o el docente con un clic en el resultado |
| Puntaje | Sobre 5 | Sobre los criterios calificados; el estadio es **provisional** mientras haya pendientes |
| Lateralidad | No | Pie de apoyo, pie de los saltos, mano que lanza y pierna que patea (la batería evalúa cada lado por separado) |
| Gemini | Califica todo | Recibe lo medido como hecho y califica solo lo visual. Puede corregir la habilidad solo si el motor no estaba seguro. |

## 3. Criterios por fuente

- **Medidos con la pose (36):** codo, tronco, rodillas, vuelos, apoyos, recobro, oposición brazo-pierna, talón-punta (de perfil), doble apoyo, saltos seguidos, extensión del codo al soltar, rotación de hombros, pie contrario adelantado, recorrido de cadera, seguimiento del pateo, brazos en cruz y balanceo lateral (de frente), sostén de 5 s.
- **Visuales (9):** marcha en línea recta; agarre y trayectoria de la pelota en el lanzamiento; mirada, manos en copa y retención en el atrape; golpeo limpio del balón; mirada y pies dentro de la línea en el equilibrio dinámico.
- Algunos criterios de pose dependen de la toma (de perfil o de frente). Si la toma no los permite, quedan por confirmar con el motivo («El balanceo lateral se ve grabando de frente»).

## 4. Verificación hecha

- **Movimientos sintéticos** (`backend/tests/sinteticos.py`): cinemática directa de una figura infantil que corre, camina, salta, salta en un pie, se sostiene en un pie, lanza, patea, atrapa y se queda quieta.
  - Con ruido de detección de MediaPipe (±1,5 px) y temblor de cámara en la mano: **0 errores en 459 casos** (51 semillas × 9 gestos), tanto en la detección como en los criterios.
  - Las ejecuciones deficientes reprueban el criterio correspondiente: salto sin brazos, equilibrio con brazos abiertos, 2 saltos en vez de 3, trote sin vuelo.
- **MediaPipe real** sobre un video de una persona quieta: todas las habilidades dan 0, y la detección dice «confianza baja». Tiempo: 1–2 s por video en un Mac M5.

## 5. Límites conocidos

- **Falta validación con videos reales de niños.** Los umbrales vienen de la batería y del v1. Hay que medirlos con videos etiquetados (siguiente sección).
- **La cámara debe estar fija.** Con un temblor fuerte (zoom oscilante del 3 %) aparecen vuelos falsos y la detección falla en ~45 % de los casos sintéticos. La guía de grabación pide la cámara fija: trípode o celular apoyado.
- **A 15 fps o menos** la detección baja a ~94 % de acierto. Los celulares graban a 30 fps y el servidor muestrea a 30 por segundo para videos de hasta 15 s.
- **Cobertura de la batería:** faltan el lanzamiento bimanual (prueba 6) y la recepción con el pie (pruebas 12–13). Las pruebas por lado (derecho/izquierdo) se evalúan una a la vez: el resultado indica el lado detectado.
- La pose se detecta sobre el cuadro original reducido a 1280 px de lado mayor (antes, sobre la miniatura de 640×360: un video vertical quedaba en 202×360).

## 5.1 Fotogramas clave anclados a eventos

Los 8 fotogramas del resultado y del Word ya no se eligen en una ventana fija (`biomecanica/momentos.py`):

- Se toman en los instantes que midió la serie: carga, despegue, vuelo y caída del salto; despegues y caídas de cada salto en un pie; apoyos de la marcha y la carrera; inicio, 1 s, 5 s y fin del apoyo en un pie; armado y suelta del lanzamiento; armado e impacto del pateo; contacto del atrape. Los cuadros que faltan se reparten en la ventana de acción.
- Solo se rotulan si el gesto ocurrió (las mismas comprobaciones que los criterios). Si no, los 8 cuadros se reparten en todo el video con la leyenda «No se detectó el gesto característico».
- El resumen ya no menciona la mano o el pie que ejecuta si no hubo gesto.
- El resultado y el Word muestran el desempeño esperado del MEN (Documento 15) para el ciclo del grado: 1.º a 3.º, «Exploro posibilidades de movimiento en mi cuerpo a nivel global y segmentario»; 4.º y 5.º, «Controlo de forma global y segmentaria la realización de movimientos técnicos».

## 6. Cómo validar con videos reales

```bash
cd backend
.venv/bin/python manage.py validar_videos /ruta/videos --esperado calificacion_docente.csv --csv resultados.csv
```

- La carpeta lleva una subcarpeta por habilidad: `carrera/`, `salto/`, `marcha/`, `salto_unipodal/`, `lanzar/`, `atrapar/`, `patear/`, `equilibrio/` y `equilibrio_estatico/`. Además puede llevar `otros/` para videos sin prueba, que deben quedar con confianza baja.
- `--esperado` (opcional) es un CSV `archivo,c1,c2,c3,c4,c5` con la calificación del docente (1/0, vacío si no aplica). Con él se reporta la concordancia criterio por criterio, como la validación entre jueces de la batería.
- La salida incluye el acierto de la detección automática, la matriz de confusión y el tiempo por video.
- Todo se procesa localmente; ningún video sale del computador.
