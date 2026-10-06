# 02 · Motor biomecánico (especificación para portar a Python)

Este documento describe **exactamente** los cálculos de `script.js`, con todos los umbrales, para que la versión Python dé los mismos resultados. Las referencias `script.js:N` apuntan a la línea de inicio.

## 1. Sistema de coordenadas y landmarks

MediaPipe Pose devuelve 33 puntos con `x`, `y` normalizados a [0, 1] respecto a la imagen, `z` relativo (profundidad, escala aproximada de `x`) y `visibility`.

- **`y` crece hacia abajo**: un `y` menor significa "más arriba en la pantalla".
- La imagen se redimensiona siempre a **640×360** antes de detectar (se deforma si el video no es 16:9; ver doc 07).

Índices usados:

| Índice | Punto | Índice | Punto |
|---|---|---|---|
| 0 | Nariz | 23 / 24 | Cadera izq / der |
| 11 / 12 | Hombro izq / der | 25 / 26 | Rodilla izq / der |
| 13 / 14 | Codo izq / der | 27 / 28 | Tobillo izq / der |
| 15 / 16 | Muñeca izq / der | 29 / 30, 31 / 32 | Talón, punta del pie (solo dibujo) |

Equivalente Python: `mediapipe.solutions.pose.PoseLandmark` (mismos índices) o la nueva API `mediapipe.tasks.python.vision.PoseLandmarker`.

Configuración actual de MediaPipe (`script.js:895`):

```text
modelo: pose_landmarker_lite (float16)   runningMode: IMAGE   numPoses: 1
minPoseDetectionConfidence: 0.5   minPosePresenceConfidence: 0.5   minTrackingConfidence: 0.5
delegate: GPU, y si falla CPU (en CPU no se pasan las confianzas → valores por defecto)
```

## 2. Funciones trigonométricas

### 2.1 `calculateAngle3D(A, B, C)` — ángulo en el vértice B (`script.js:961`)

```python
def calculate_angle_3d(a, b, c) -> int:
    if a is None or b is None or c is None:
        return 180
    v1 = (a.x - b.x, a.y - b.y, (a.z or 0) - (b.z or 0))
    v2 = (c.x - b.x, c.y - b.y, (c.z or 0) - (b.z or 0))
    m1, m2 = norm(v1), norm(v2)
    if m1 == 0 or m2 == 0:
        return 180
    cos = clamp(dot(v1, v2) / (m1 * m2), -1.0, 1.0)
    return round(degrees(acos(cos)))       # ¡redondeo de JS! ver nota
```

> **Redondeo**: `Math.round` de JS redondea .5 hacia +∞; `round()` de Python usa redondeo bancario. Para paridad exacta usar `math.floor(x + 0.5)`.

**Esta es la función que usa todo el motor** (rodillas, codos, caderas). Incluye `z`.

### 2.2 `calcularAngulo2D(a, b, c)` — versión planar tipo NumPy (`script.js:980`)

```python
rad = atan2(c.y - b.y, c.x - b.x) - atan2(a.y - b.y, a.x - b.x)
ang = abs(degrees(rad));  ang = 360 - ang if ang > 180 else ang
return js_round(ang)
```

Solo la usa `SaltoHorizontalFSM` (rodilla derecha 24-26-28).

### 2.3 `calcularInclinacionHorizontal(p1, p2)` (`script.js:1347`)

```python
ang = abs(degrees(atan2(p2.y - p1.y, p2.x - p1.x)))
if ang > 90: ang = abs(180 - ang)     # 0° = línea perfectamente horizontal
return ang
```

> Diferencia con `codigodelsalto.py`: el Python original devuelve `abs(angulo)` sin el pliegue `>90`, por lo que una línea hombro-der→hombro-izq daba ~180°. El JS corrigió eso.

## 3. Ángulos por fotograma: `computeJointAngles(landmarks)` (`script.js:1457`)

Devuelve `None` si hay menos de 33 landmarks. Con `L = landmarks`, `A3 = calculate_angle_3d`:

| Campo | Fórmula |
|---|---|
| `lKnee` | `A3(L23, L25, L27)` |
| `rKnee` | `A3(L24, L26, L28)` |
| `lElbow` | `A3(L11, L13, L15)` |
| `rElbow` | `A3(L12, L14, L16)` |
| `lHipFlexion` | `A3(L11, L23, L25)` |
| `rHipFlexion` | `A3(L12, L24, L26)` |
| `hipDiff` | `abs(lHipFlexion - rHipFlexion)` |
| `midHip` | punto medio de L23, L24 (solo x, y) |
| `midShoulder` | punto medio de L11, L12 |
| `trunkLean` | `round(abs(degrees(atan2(dx, -dy))))` con `dx = midShoulder.x - midHip.x`, `dy = midShoulder.y - midHip.y` → inclinación del tronco respecto a la vertical |
| `torsoHeight` | `hypot(dx, dy)` o `0.25` si es 0 |
| `hipAngle` | `A3(L25, midHip, L26)` — apertura entre muslos ("zancada"). `midHip` sin z → z = 0 |
| `lAnkleY`, `rAnkleY`, `lAnkleX`, `rAnkleX` | coordenadas de L27 y L28 |
| `ankleYDiff` | `abs(lAnkleY - rAnkleY)` |
| `ankleXDiff` | `abs(lAnkleX - rAnkleX)` |
| `ankleDist` | `hypot(lAnkleX - rAnkleX, lAnkleY - rAnkleY)` |
| `isLegStraddle` | `(lAnkleX - midHip.x) * (rAnkleX - midHip.x) < -0.001` **o** `ankleXDiff >= 0.14` (un pie delante y otro detrás de la cadera) |
| `wristDist` | `hypot(L15.x - L16.x, L15.y - L16.y)` |
| `wristAboveShoulder` | `L15.y < L11.y` **o** `L16.y < L12.y` |
| `kneeMin`, `kneeMax`, `kneeDiff` | min, max, abs diff de `lKnee`/`rKnee` |
| `elbowAvg` | `round((lElbow + rElbow) / 2)` |
| `elbowMax`, `elbowMin`, `elbowDiff` | idem codos |
| `midHipX`, `midHipY` | coordenadas de `midHip` |
| `shoulderTilt`, `hipTilt`, `unipodalFootRaised`, `unipodalSupportKnee`, `unipodalState`, `unipodalMaintained` | de `analyzeEquilibrium` (§3.1) |

### 3.1 `analyzeEquilibriumFromPythonReference(landmarks, angles)` (`script.js:1361`)

Port de `codigodelsalto.py`, pero **sin tiempo** (evalúa cada fotograma de forma aislada).

```text
balanceoHombros = round1(inclinacion(L12, L11))
balanceoCaderas = round1(inclinacion(L24, L23))
pieIzqElevado   = L27.y < L28.y - 0.04
pieDerElevado   = L28.y < L27.y - 0.04
pieElevado      = pieIzqElevado or pieDerElevado
angRodillaApoyo = rKnee si pieIzqElevado; lKnee si pieDerElevado; si no kneeMax (o 170)

si pieElevado y angRodillaApoyo > 155:
    si balanceoHombros > 15 o balanceoCaderas > 12 o angRodillaApoyo < 150 → "PÉRDIDA DE EQUILIBRIO"
    elif balanceoHombros < 6 y balanceoCaderas < 6                      → "MANTENIMIENTO ESTÁTICO" (esMantenimiento)
    else                                                                → "ESTABILIZANDO"
elif pieElevado y (angRodillaApoyo < 150 o balanceoHombros > 15)       → "PÉRDIDA DE EQUILIBRIO"
else                                                                    → "BIPEDESTACIÓN"
```

Mapea a `computeJointAngles` como: `shoulderTilt = balanceoHombros`, `hipTilt = balanceoCaderas`, `unipodalFootRaised = pieElevado`, `unipodalSupportKnee = angRodillaApoyo`, `unipodalState = estado`, `unipodalMaintained = esMantenimiento`.

> Si faltan landmarks devuelve: BIPEDESTACIÓN, tilts 0, `angRodillaApoyo` 170.

## 4. Extracción de fotogramas

### 4.1 Video: `extractAdaptiveVideoKeyframes(file, targetCount=8)` (`script.js:1708`)

1. `dur = clamp(video.duration, 0.6, 20)`.
2. **Escaneo**: `scanSteps = min(24, max(12, floor(dur * 5)))`, `dt = dur / (scanSteps + 1)`. Para `i in 0..scanSteps` se toma `t = i*dt` (seek a `min(t, dur-0.05)`), se dibuja en canvas 640×360, se detecta la pose y se calcula `angles`.
3. Para cada muestra con ángulos se evalúa `checkExerciseTriggerPose(angles, prevAngles)` (§4.3). El primer `triggered` marca `firstTriggerIndex` y `initialTriggerInfo = {triggered, reason, skillHint, t, angles}`.
4. **Ventana de acción**:
   - Con gatillo: `actionStart = max(0.04, t_gatillo - 0.10)`. `lastActiveIdx` = última muestra desde el gatillo que esté `triggered` **o** tenga `kneeMin < 155`. `actionEnd = min(dur - 0.04, scan[min(len-1, lastActiveIdx+1)].t)`. Si `actionEnd - actionStart < 0.5` → `actionEnd = min(dur - 0.04, actionStart + 1.8)`.
   - Sin gatillo: `actionStart = max(0.05, dur*0.08)`, `actionEnd = min(dur-0.05, dur*0.92)`.
5. **8 timestamps equiespaciados**: `t_k = actionStart + (actionEnd - actionStart) * k/7`.
6. Para cada `t_k`: seek, canvas 640×360, detección, ángulos, copia con esqueleto dibujado, JPEG calidad 0.85.
7. Nombres de fase según `skillHint` del gatillo (`Equilibrio Estático Unipodal`, `Salto Horizontal` o genérico) — ver tabla en `script.js:1826`.
8. Al final: si el docente eligió habilidad → `assignKeyframeMilestones(frames, habilidad)`; si no → `classifySkillFromKinematics(aggregateVideoTelemetry(frames), '')` y luego hitos.

Estructura `Frame`:

```jsonc
{
  "time": "1.23s", "timestampNum": 1.23,
  "phase": "Fase 1: Ángulo Inicial (...)",
  "data": "<base64 JPEG sin prefijo>",       // se envía a Gemini
  "previewUrl": "data:image/jpeg;base64,...", // con esqueleto
  "mime": "image/jpeg",
  "landmarks": [ {x,y,z,visibility} × 33 ] | null,
  "angles": { ...computeJointAngles... } | null,
  "isInitialTrigger": bool, "triggerInfo": {...} | null,
  // añadidos por assignKeyframeMilestones:
  "isMilestonePeak": bool, "isSubMilestone": bool, "isFinalMilestone": bool,
  "milestoneBadge": str|null, "milestoneTitle": str, "milestoneDesc": str, "milestoneColor": "#hex"
}
```

### 4.2 Imagen: `extractImageKeyframe(file)` (`script.js:1926`)

Un solo `Frame` con `time = "0.0s"`, `phase = "Postura Estática"`, sin gatillo.

### 4.3 Gatillo de inicio: `checkExerciseTriggerPose(a, prev)` (`script.js:1620`)

Se evalúa **en orden**; el primero que se cumple gana:

| # | Condición | `skillHint` |
|---|---|---|
| 0 | (`unipodalFootRaised` o `ankleYDiff >= 0.035`) **y** (`unipodalSupportKnee` o `kneeMax`) `>= 148` | Equilibrio Estático Unipodal |
| 1 | `kneeMin <= 138` y `kneeDiff <= 18` y `ankleYDiff < 0.030` y no `unipodalFootRaised` | Salto Horizontal |
| 2 | `hipAngle >= 22` o `ankleXDiff >= 0.14` | Carrera |
| 3 | `wristAboveShoulder` o (`elbowDiff >= 26` y `elbowMin <= 110`) | Lanzamiento Sobre Hombro |
| 4 | `ankleYDiff >= 0.055` y `kneeDiff >= 28` y (`isLegStraddle` o `ankleXDiff >= 0.12`) | Patear |
| 5 | `wristDist <= 0.28` y `70 <= elbowAvg <= 125` | Recepción y Atrape |
| 6 | `trunkLean >= 12` | Carrera |
| 7 | con `prev`: `|Δ kneeMin| >= 12` o `|Δ hipAngle| >= 10` o `|Δ trunkLean| >= 7` | Cinemática Dinámica |

> El `skillHint` solo cambia los nombres de fase de los fotogramas; **no** decide la habilidad final.

## 5. Agregación de telemetría: `aggregateVideoTelemetry(frames)` (`script.js:2617`)

Toma `validAngles = [f.angles for f in frames if f.angles]`.

### 5.1 Sin ningún landmark → valores por defecto ficticios

```json
{"hasLandmarks": false, "minKneeAngle": 108, "maxKneeAngle": 168, "avgElbowAngle": 94,
 "maxElbowAngle": 110, "minElbowAngle": 80, "avgTrunkAngle": 8, "maxHipAngle": 36,
 "maxWristAboveShoulder": false, "minWristDist": 0.4, "avgAnkleYDiff": 0.02, "maxAnkleYDiff": 0.04,
 "maxAnkleXDiff": 0.08, "maxAnkleDist": 0.20, "hasStraddleKickFrame": false, "unipodalHoldFrames": 0,
 "unipodalHoldRatio": 0, "avgShoulderTilt": 2.0, "maxShoulderTilt": 4.0, "avgHipTilt": 2.0,
 "unipodalMaintainedFrames": 0, "unipodalRaisedFrames": 0, "avgSupportKnee": 165,
 "transientKickPeak": false, "avgKneeDiff": 10, "maxKneeDiff": 18, "maxHipDiff": 15,
 "avgElbowDiff": 12, "maxElbowDiff": 20, "ankleDistAvg": 0.25, "hipDisplacement": 0.15,
 "flightDetected": false, "flightFrames": [], "symmetryScore": 86,
 "samplingMethod": "Adaptativo por Diferencial de Luminancia"}
```

> El motor local ya **no** diagnostica con estos valores: lanza el error "No se detectó a la persona…" (corregido en `script.js` y en `backend/biomecanica`). Se conservan porque `assignKeyframeMilestones` y el prompt de Gemini aún pueden recibirlos.

### 5.2 Con landmarks

| Campo | Cálculo |
|---|---|
| `minKneeAngle` | `min(kneeMin)` |
| `maxKneeAngle` | `max(kneeMax)` |
| `avgElbowAngle` | `round(mean(elbowAvg))` |
| `maxElbowAngle` / `minElbowAngle` | `max(elbowMax or elbowAvg)` / `min(elbowMin or elbowAvg)` |
| `avgTrunkAngle` | `round(mean(trunkLean))` |
| `maxHipAngle` | `max(hipAngle)` |
| `avgShoulderTilt` | `round1(mean(shoulderTilt))`; `maxShoulderTilt = max` |
| `avgHipTilt` | `round1(mean(hipTilt))` |
| `unipodalMaintainedFrames` | nº con `unipodalMaintained` |
| `unipodalRaisedFrames` | nº con `unipodalFootRaised` |
| `avgSupportKnee` | `round(mean(unipodalSupportKnee))` de los fotogramas con pie elevado; si no hay, `maxKneeAngle` (o 165) |
| `maxKneeDiff`, `avgKneeDiff` | max / media de `kneeDiff` (media **sin redondear**) |
| `maxHipDiff` | `max(hipDiff, 0)` |
| `maxElbowDiff`, `avgElbowDiff` | idem con `elbowDiff` |
| `maxAnkleYDiff`, `avgAnkleYDiff` | idem con `ankleYDiff` |
| `maxAnkleXDiff` | `max(ankleXDiff, 0)` |
| `maxAnkleDist`, `ankleDistAvg` | max / media de `ankleDist` (default 0.25) |
| `minWristDist` | `min(wristDist)` (default 0.5) |
| `maxWristAboveShoulder` | algún fotograma con `wristAboveShoulder` |
| `unipodalHoldFrames` | nº de fotogramas con **isLifted y hasSupport**, donde `isLifted = unipodalFootRaised or ankleYDiff >= 0.035 or (kneeMax >= 145 and kneeMin <= 135 and kneeDiff >= 20)` y `hasSupport = kneeMax >= 145 or unipodalSupportKnee >= 145` |
| `unipodalHoldRatio` | `unipodalHoldFrames / len(validAngles)` |
| `straddleFrames` | fotogramas con `isLegStraddle and ankleXDiff >= 0.14 and kneeDiff >= 25 and ankleYDiff >= 0.04` |
| `hasStraddleKickFrame` | `len(straddleFrames) >= 1 and unipodalHoldRatio < 0.40` |
| `transientKickPeak` | `1 <= len(straddleFrames) <= 2 and unipodalHoldRatio < 0.40` |
| `groundLevelY` | `max(max(lAnkleY, rAnkleY))` de todos los fotogramas |
| `flightFrames` | índices **1-based** (sobre `validAngles`) donde `lAnkleY < ground - 0.045` y `rAnkleY < ground - 0.045` |
| `bipodalFlightFrames` | de los anteriores, los que además cumplen `ankleYDiff <= 0.065 and kneeDiff <= 32`. **Se fuerza a 0** si `unipodalHoldRatio >= 0.25 or unipodalHoldFrames >= 2 or unipodalMaintainedFrames >= 1` |
| `flightDetected` | `len(flightFrames) > 0 and bipodalFlightFrames > 0` |
| `bipodalFlightDetected` | `bipodalFlightFrames > 0` |
| `rapidKneeDelta` | máximo `|Δ lKnee|` o `|Δ rKnee|` entre fotogramas consecutivos |
| `hipDisplacement` | `hypot(Δ midHipX, Δ midHipY)` entre primer y último fotograma válido (default 0.02) |
| `symmetryScore` | `clamp(round(100 - avgKneeDiff * 0.7), 65, 98)` |

## 6. Clasificador de habilidad: `classifySkillFromKinematics(t, userText)` (`script.js:2810`)

### 6.1 Prioridad 1: palabras clave en las observaciones del docente

Se busca (en minúsculas, por subcadena) **en este orden**, y la primera coincidencia gana:

| Palabras | Habilidad |
|---|---|
| estatico, estático, flamenco, parado, equilibrio estatico | Equilibrio Estático Unipodal |
| dinamico, dinámico, linea, línea, viga, caminar linea | Equilibrio Dinámico |
| pate, chut, balon, balón, pelota, futbol, fútbol, golpe, remat, tiro | Patear |
| lanz, arroja, tirar, lanzamiento, sobre hombro | Lanzamiento Sobre Hombro |
| atrap, recep, coger, recibir, guante | Recepción y Atrape |
| pata sola, salto unipodal, unipodal, un solo pie, un pie, cojito | Salto Unipodal |
| salto horizontal, salto largo, saltar, brinc, salto | Salto Horizontal |
| marcha, caminar, paso, caminata | Marcha |
| corre, carrera, sprint, velocidad, trote | Carrera |

> Ojo: "pelota" o "tiro" disparan **Patear** antes que Lanzamiento/Atrape; "parado" dispara Equilibrio Estático.

Si no hay landmarks (`hasLandmarks = false`) → **Carrera**.

### 6.2 Prioridad 2: puntuación ponderada (todas empiezan en 0)

**A. Equilibrio Estático Unipodal**
- +200 si `unipodalHoldFrames >= 2` o `unipodalHoldRatio >= 0.25`
- +60 si `avgKneeDiff >= 15`
- +70 si `avgAnkleYDiff >= 0.035` o `maxAnkleYDiff >= 0.04`
- +60 si no `bipodalFlightDetected`
- +100 si `hipDisplacement <= 0.08`
- +160 si `unipodalMaintainedFrames >= 1` o (`unipodalRaisedFrames >= 2` y `avgShoulderTilt <= 10`)

**B. Patear**
- Solo si `unipodalHoldRatio < 0.45` y no `bipodalFlightDetected` y `unipodalMaintainedFrames < 2`:
  +150 `transientKickPeak` · +90 `hasStraddleKickFrame` · +50 `maxAnkleXDiff >= 0.14` · +40 `maxAnkleYDiff >= 0.05` · +35 (`maxHipAngle >= 18` o `maxHipDiff >= 15`) · +25 `rapidKneeDelta >= 14` · +25 no `maxWristAboveShoulder` · +20 `minWristDist > 0.18`
- −300 si `bipodalFlightDetected`
- −200 si `unipodalMaintainedFrames >= 2`

**C. Lanzamiento Sobre Hombro**
- `isLocomotion = maxHipAngle >= 26 or maxAnkleXDiff >= 0.11 or flightDetected`
- Si `maxWristAboveShoulder and not isLocomotion and maxElbowDiff >= 26`: +150, +35 si `maxElbowAngle >= 135`, +20 si `maxHipAngle >= 18`

**D. Recepción y Atrape**
- +160 `minWristDist <= 0.26` · +40 `70 <= avgElbowAngle <= 130` · +30 (no `maxWristAboveShoulder` y `avgKneeDiff < 25`)

**E. Salto Horizontal**
- +220 `bipodalFlightDetected` · +120 `hipDisplacement >= 0.12` · +90 (`minKneeAngle <= 135` y `avgKneeDiff <= 18` y `unipodalHoldRatio < 0.25`)
- −350 si `hipDisplacement < 0.08` y no `bipodalFlightDetected`
- −350 si `unipodalHoldRatio >= 0.25` o `unipodalHoldFrames >= 2` o `unipodalRaisedFrames >= 2`

**F. Salto Unipodal**
- +150 (`flightDetected` y `avgAnkleYDiff >= 0.07`) · +35 (`flightDetected` y `maxKneeDiff >= 20`)

**G. Equilibrio Dinámico**
- +120 (no `flightDetected` y `ankleDistAvg <= 0.18` y `avgTrunkAngle <= 8` y `unipodalHoldRatio < 0.3`)
- +35 (`minKneeAngle >= 120` y (`minWristDist >= 0.45` o `avgElbowAngle >= 105`) y `unipodalHoldRatio < 0.3`)

**H. Marcha**
- +110 (no `flightDetected` y `minKneeAngle >= 112` y `avgTrunkAngle <= 9` y `unipodalHoldRatio < 0.3` y no `transientKickPeak`)
- +35 (no `flightDetected` y `avgKneeDiff < 20` y `avgAnkleYDiff < 0.04` y `unipodalHoldRatio < 0.3`)

**I. Carrera**
- +130 (`maxHipAngle >= 24` o `maxAnkleXDiff >= 0.10`) · +50 (`minKneeAngle <= 124` y `unipodalHoldRatio < 0.35`) · +50 `flightDetected` · +30 (`65 <= avgElbowAngle <= 125` y `unipodalHoldRatio < 0.35`)

**Ganador**: se recorre el diccionario en el orden *Equilibrio Estático, Patear, Lanzamiento, Recepción, Salto Horizontal, Salto Unipodal, Equilibrio Dinámico, Marcha, Carrera* y gana el primero con puntaje **estrictamente mayor** (`maxScore` arranca en −1; los empates los gana el que aparece antes). Si todos son < 0 → Carrera. En Python usar un `dict` (conserva el orden de inserción) y la misma comparación `>`.

## 7. Máquinas de estado (FSM) por habilidad (`script.js:1002`)

Cada FSM recorre los fotogramas en orden (`procesarFrame(idx, t, landmarks, angles)`), avanza como máximo **un estado por fotograma**, guarda `transiciones[]` y un conjunto `fasesCumplidas`. **Solo se usa para el texto del resumen** ("Ciclo de fases completadas") y el prompt de Gemini; no afecta al puntaje.

Selección (`createFSMForSkill`, por subcadena en minúsculas): `"salto horizontal"` o (`"salto"` sin `"unipodal"`) → Salto Horizontal; `pate` → Patear; `corre`/`carrera` → Carrera; `lanz`/`arroja`/`hombro` → Lanzar; `atrap`/`recep` → Atrapar; `unipodal`+`salto` → Salto Unipodal; `estatico`/`estático`/`flamenco` → Eq. Estático; `dinamico`/`dinámico`/`linea`/`viga` → Eq. Dinámico; resto → Marcha.

| FSM | Estados y transición |
|---|---|
| **Salto Horizontal** | REPOSO (guarda `yCaderaInicial`) → CONTRAMOVIMIENTO si rodilla2D < 142 o `kneeMin` < 142 → PROPULSIÓN si rodilla2D > 110 y yCadera < yIni + 0.02 → VUELO si rodilla2D > 158 y (yCadera < yIni − 0.035 o `flightDetected`*) → ATERRIZAJE si yCadera ≥ yIni − 0.02 y rodilla2D < 155. Fases: REPOSO, CONTRAMOVIMIENTO, PROPULSION, VUELO, ATERRIZAJE |
| **Patear** | APROXIMACION → APOYO_CARGA si `isLegStraddle` o `kneeDiff >= 20` o `ankleXDiff >= 0.08` → PENDULO_GOLPEO si `ankleXDiff >= 0.11` o `hipAngle >= 17` → IMPACTO si `ankleXDiff >= 0.13` o (`isLegStraddle` y `kneeMax >= 148`) → RECOBRO (siguiente fotograma) |
| **Carrera** | INICIO_PROPULSION → TRACCION_METATARSAL si `trunkLean >= 10` o `ankleXDiff >= 0.10` → MAXIMA_ZANCADA_VUELO si `hipAngle >= 25` o `flightDetected`* o `ankleXDiff >= 0.13` → RECOBRO_RECIPROCO |
| **Lanzar** | PREPARACION → ARMADO_POSTERIOR si `wristAboveShoulder` o (`elbowDiff >= 22` y `elbowMin <= 112`) → SOLTADA_LANZAMIENTO si `elbowMax >= 135` y `wristAboveShoulder` → DESACELERACION |
| **Atrapar** | ESPERA → APROXIMACION_MANOS si `70 <= elbowAvg <= 130` → CONTACTO_ATRAPE si `wristDist <= 0.28` → AMORTIGUACION_PECHO |
| **Salto Unipodal** | APOYO_UNIPODAL → FLEXION_IMPULSO si `kneeMin <= 140` y `ankleYDiff >= 0.035` → VUELO_UNIPODAL si `ankleYDiff >= 0.05` y `kneeDiff >= 25` → ATERRIZAJE_UNIPODAL si `kneeMin <= 150` |
| **Eq. Estático** | INICIO_BIPODAL → ELEVACION_PIERNA si pie levantado (`unipodalFootRaised` o (`kneeMax>=145` y `kneeMin<=125` y `kneeDiff>=30`) o `ankleYDiff>=0.04`) → contador `holdCount++` cuando `unipodalMaintained` o (doblada y elevada) o (`unipodalFootRaised` y `shoulderTilt <= 10`); con `holdCount >= 2` → SOSTEN_FLAMENCO |
| **Eq. Dinámico** | INICIO_EJE → PASO_TANDEM → CONTROL_EQUILIBRIO (incondicional, un paso por fotograma) |
| **Marcha** | INICIO_CONTACTO → PASAJE_TALON → DESPEGUE_OSCILACION (incondicional) |

\* `angles.flightDetected` **no existe** en el objeto de ángulos por fotograma (es un campo de la telemetría agregada), así que esas ramas nunca se activan. Ver doc 07.

## 8. Hitos visuales por fotograma: `assignKeyframeMilestones` (`script.js:2079`)

Solo presentación (tarjetas de la tira de fotogramas y prompt de Gemini). Regla general: fotograma 0 = "🎯 Ángulo Inicial", último = "🏁 …" (final), y un **pico** elegido así:

| Habilidad | Fotograma pico |
|---|---|
| Patear | max `ankleXDiff*1.6 + (0.08 si straddle) + kneeDiff/180*0.3 + ankleYDiff*0.4` |
| Salto Horizontal | min promedio `(lAnkleY + rAnkleY)/2` (excluye primero y último); además "🦿 Aterrizaje" = min `kneeMin` después del pico |
| Carrera | max `hipAngle + ankleXDiff*130` |
| Lanzamiento | max `(60 si wristAboveShoulder) + elbowMax + elbowDiff*0.5` (excluye extremos) |
| Atrape | min `wristDist` |
| Salto Unipodal | max `ankleYDiff*120 + kneeDiff*0.6` (excluye extremos) |
| Eq. Estático | max `kneeDiff*0.8 + ankleYDiff*140 + (50 si mantenido / 20 si pie elevado) − shoulderTilt*1.5` |
| Eq. Dinámico, Marcha | fotograma central `floor(n/2)` |

Los títulos, descripciones y colores exactos están en `script.js:2104-2497`; se pueden mover a una tabla de configuración.

## 9. Motor local: `runLocalBiomechanicalEngine(skillCode, grade, obsText, frames)` (`script.js:3925`)

1. `t = aggregateVideoTelemetry(frames)`.
2. Resolver habilidad: si `skillCode != 'auto'` → mapa de códigos/alias (`skillMap`, `script.js:3926`) o búsqueda por subcadena. Si queda vacío → `classifySkillFromKinematics(t, obsText)` y `es_deteccion_automatica = True`.
3. `fsm = executeFSMAnalysis(frames, habilidad)`; `t.fsmPhases = list(fsm.fasesCumplidas)`.
4. Para cada uno de los 5 criterios de `biomechanicalRulesTable[habilidad]` (doc 03) evaluar → `puntaje` 0/1 y, si falla, un `error`.
5. `porcentaje = round(aprobados / 5 * 100)`; **estadio**: `>= 80` Maduro, `< 40` Inicial, si no Elemental.
6. Construir el JSON `Diagnostico` (§10).

## 10. Contrato de salida `Diagnostico` (común a motor local y Gemini)

```jsonc
{
  "habilidad_detectada": "Salto Horizontal",          // uno de los 9 nombres canónicos
  "es_deteccion_automatica": true,
  "componente_hmb": "[HMB-L] Locomoción",              // | "[HMB-M] Manipulación" | "[HMB-E] Estabilidad-Equilibrio"
  "prueba_nro": 3,                                       // solo motor local
  "puntaje_obtenido": "4/5",
  "bateria_referencia": "Batería de Habilidades Motrices Básicas (5-11 años) · ...",
  "edad_calibrada": "Grado 2º de Primaria (7 años)",     // etiqueta de getGradeAndCycle
  "estadio_gallahue": "Inicial|Elemental|Maduro",
  "porcentaje_madurez": 80,
  "resumen_biomecanico": "texto con **markdown**",
  "criterios": [
    {"criterio": "...", "fase": "Carga", "puntaje": 1, "medido": "104°", "umbral": "≤ 110°", "observacion": "..."}
  ],
  "analisis_articular": {"angulos_principales": "...", "cadena_cinetica": "...", "apoyo_y_base": "..."},
  "errores_criticos": [{"error": "...", "impacto_biomecanico": "..."}],   // si no hay: "Sin fallos biomecánicos críticos"
  "frases_profe": ["...", "..."],
  "telemetria_medida": { ...§5... , "fsm": {...}, "fsmPhases": [...] },
  "modelo_utilizado": "gemini-2.0-flash"                 // solo Gemini
}
```

## 11. `codigodelsalto.py` (referencia original)

Script de escritorio con webcam (`cv2.VideoCapture(0)`) que implementa una **FSM temporal** de equilibrio unipodal: BIPEDESTACIÓN → ESTABILIZANDO (pie izq. elevado y rodilla apoyo > 165°) → MANTENIMIENTO ESTÁTICO (tilts < 6° durante > 1 s) → PÉRDIDA DE EQUILIBRIO (pie baja, hombros > 15°, caderas > 12° o rodilla < 150°) → reset. Imprime el tiempo logrado.

Problemas a no copiar:
- `calcular_angulo` está mal: `np.arctan2(c-b, c-b)` pasa vectores en lugar de `(y, x)`. Usar la versión de §2.2.
- Solo considera el pie **izquierdo** elevado.
- El nombre del archivo dice "salto" pero el contenido es equilibrio.

En la migración, esta FSM temporal (con segundos reales) es **mejor** que la versión por fotograma del JS para medir los "5 segundos" que pide la batería: con video en el servidor se puede procesar a FPS completos.
