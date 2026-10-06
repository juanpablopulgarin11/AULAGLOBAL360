# 03 · Reglas de evaluación de la Batería HMB

Fuente en código: `biomechanicalRulesTable` (`script.js:2954`).
Fuente científica: `Data/Dialnet-DisenoYValidacionDeUnaBateriaDeHabilidadesMotrices-7925607 (4).md` (González Palacio, Montoya Grisales, Cardona, Marín & Muñoz, 2021).
Datos en formato máquina: [`datos/bateria_hmb_reglas.json`](datos/bateria_hmb_reglas.json).

## 1. Modelo de cada regla

Cada habilidad tiene `componente`, `prueba_nro` (número en la batería original), `puntaje_max = 5`, `protocolo`, 5 `criterios` y 2 `frases` ("El lenguaje del profe"). Cada criterio tiene:

- `criterio` (texto) y `fase`.
- `evaluar(t)`: función sobre la **telemetría agregada** `t` (doc 02 §5) que devuelve `puntaje` (0/1), `medido` (texto con el valor), `umbral` (texto), `observacion` (texto según aprobado/fallido) y `error` (`{error, impacto_biomecanico}` solo si falla).

En Python se recomienda un **modelo de datos + función de condición** (ver doc 06 §5). Las condiciones son expresiones simples sobre `t`, fáciles de escribir como funciones o como un mini-DSL.

## 2. Cobertura respecto a la batería original

La batería tiene **16 pruebas (78 puntos)**. La app implementa **9 habilidades** y unifica lateralidad (derecha/izquierda):

| Prueba original | ¿Implementada? | Nombre en la app |
|---|---|---|
| 1 Marcha | ✅ | Marcha |
| 2 Correr | ✅ | Carrera |
| 3 Salto horizontal pies juntos | ✅ | Salto Horizontal |
| 4–5 Salto unipodal der./izq. | ✅ (sin lado) | Salto Unipodal (`prueba_nro` 4) |
| 6 Lanzamiento bimanual sobre la cabeza | ❌ | — |
| 7–8 Lanzamiento unimanual der./izq. | ✅ (sin lado) | Lanzamiento Sobre Hombro (7) |
| 9 Atrapar bimanual | ✅ | Recepción y Atrape |
| 10–11 Patear der./izq. | ✅ (sin lado) | Patear (10) |
| 12–13 Recepción y parada con pie (0–4 pts) | ❌ | — |
| 14 Equilibrio dinámico | ✅ | Equilibrio Dinámico |
| 15–16 Equilibrio estático unipodal der./izq. | ✅ (sin lado) | Equilibrio Estático Unipodal (15) |

Baremo de la batería (total 78 pts): **Inicial** 0–31 (< 40 %), **Elemental** 32–62 (41–79 %), **Maduro** 63–78 (80–100 %). La app aplica los mismos cortes de porcentaje **por habilidad** (sobre 5 criterios): ≥ 80 % Maduro, < 40 % Inicial.

## 3. Reglas por habilidad

Notación: `t.x` = campo de telemetría agregada. "⚠" marca diferencias entre el texto del umbral mostrado al docente y la condición real del código.

### 3.1 Carrera — [HMB-L] Locomoción · prueba 2
**Protocolo:** Desplazamiento en carrera de 18 metros con retorno al cono de inicio.

| # | Fase | Criterio | Condición (pasa = 1) | Umbral mostrado | Error si falla |
|---|---|---|---|---|---|
| 1 | Sincronía | Brazos en arco desde hombros flexionados ~90° en oposición | `75 <= avgElbowAngle <= 110` | 75° a 110° | Braceo desalineado o codos hiperextendidos |
| 2 | Postura | Tronco con ligera inclinación hacia adelante | `4 <= avgTrunkAngle <= 16` | 5° a 16° ⚠ (código usa 4) | Tronco hiperextendido o flexionado en exceso |
| 3 | Propulsión | Pierna de apoyo amortigua y propulsa | `maxHipAngle >= 32` | Apertura cadera ≥ 32° | Propulsión incompleta y tiempo de apoyo excesivo |
| 4 | Recobro | Pierna de recobro flexionada, talón a glúteos | `minKneeAngle <= 95` | ≤ 95° | Recobro de rodilla bajo / insuficiente |
| 5 | Vuelo | Fase aérea definida | `flightDetected` | Fase aérea evidente | Ausencia de fase de vuelo definida |

Frases: "¡Imagina que el piso es una nube y tus pies son plumas que no deben hacer ruido!" · "¡Codos en caja fuerte (a 90 grados) impulsando directo hacia la meta!"

### 3.2 Salto Horizontal — [HMB-L] · prueba 3
**Protocolo:** Salto bipodal hacia adelante sobrepasando línea marcada con pies al ancho de hombros.

| # | Fase | Criterio | Condición | Umbral mostrado | Error si falla |
|---|---|---|---|---|---|
| 1 | Carga | Flexiona rodillas (≤ 110°) y lleva brazos atrás | `minKneeAngle <= 112` | ≤ 110° ⚠ | Carga elástica insuficiente en contramovimiento |
| 2 | Despegue | Extensión vigorosa de rodillas (≥ 155°) | `maxKneeAngle >= 155` | ≥ 155° | Extensión terminal incompleta en despegue |
| 3 | Vuelo | Fase aérea con desplazamiento adelante | `flightDetected or maxHipAngle >= 30` | Trayectoria parabólica aérea | Parábola de vuelo deficiente o rasante |
| 4 | Aterrizaje | Cae con ambas piernas amortiguando (≤ 135°) | `minKneeAngle <= 135 and symmetryScore >= 65` | Flexión ≤ 135° y apoyo simultáneo | Aterrizaje rígido o asincrónico |
| 5 | Recepción | Mantiene el equilibrio al aterrizar | `avgTrunkAngle <= 16` | Estabilidad axial ≤ 16° | Pérdida de equilibrio post-aterrizaje |

Frases: "¡Aterriza suavemente como un gato ninja, que nadie escuche tus pasos!" · "¡Lanza tus brazos al cielo como si fueras a tocar las estrellas en el despegue!"

### 3.3 Marcha — [HMB-L] · prueba 1
**Protocolo:** Caminar 9 metros hacia adelante tocando el cono y retornar al cono de inicio (total 18m).

| # | Fase | Criterio | Condición | Umbral mostrado | Error si falla |
|---|---|---|---|---|---|
| 1 | Sincronía | Balanceo libre de brazos en oposición | `avgElbowAngle >= 100 and symmetryScore >= 68` | Balanceo alternado relajado | Falta de balanceo libre en brazos |
| 2 | Postura | Tronco erguido | `avgTrunkAngle <= 8` | ≤ 8° | Tronco inclinado o postura colapsada |
| 3 | Apoyo | Transfiere peso talón a punta | `maxHipAngle >= 24` | Apertura cadera ≥ 24° | Contacto podal plano o sin rodillo talón-punta |
| 4 | Transición | Fase de doble apoyo | `not flightDetected` | Contacto podal continuo sin vuelo | Pérdida de fase de doble apoyo |
| 5 | Dirección | Pies en línea continua hacia el cono | `symmetryScore >= 72` | Simetría ≥ 72% | Desviación lateral de la línea de progresión |

Frases: "¡Camina como un rey o reina con su corona erguida mirando al horizonte!" · "¡Tus brazos son péndulos de reloj que se mueven suaves al compás!"

### 3.4 Salto Unipodal — [HMB-L] · prueba 4
**Protocolo:** Avanzar realizando tres saltos consecutivos con el pie de apoyo (pata sola).

| # | Fase | Criterio | Condición | Umbral mostrado | Error si falla |
|---|---|---|---|---|---|
| 1 | Equilibrio | Brazos flexionados adelante dando estabilidad | `60 <= avgElbowAngle <= 125` | 60° a 125° | Falta de acción estabilizadora de brazos |
| 2 | Postura | Tronco levemente inclinado adelante | `4 <= avgTrunkAngle <= 18` | 4° a 18° | Alineación deficiente de tronco en salto unipodal |
| 3 | Propulsión | Pierna libre oscila en péndulo | `maxHipAngle >= 26` | Apertura cadera ≥ 26° | Ausencia de balanceo pendular en pierna libre |
| 4 | Amortiguación | Control postural en cada aterrizaje | `minKneeAngle <= 140` | Flexión rodilla ≤ 140° | Amortiguación deficiente en aterrizaje unipodal |
| 5 | Continuidad | Tres saltos consecutivos sobre el mismo pie | `flightDetected or maxKneeAngle >= 150` | 3 despegues aéreos consecutivos | Falta de continuidad en los 3 saltos unipodales |

Frases: "¡Salta como un resorte alegre manteniendo el pie firme y ágil!" · "¡Tu pierna en el aire es una vela de barco que te impulsa hacia adelante!"

### 3.5 Lanzamiento Sobre Hombro — [HMB-M] Manipulación · prueba 7
**Protocolo:** Lanzamiento unimanual de pelota sobre el hombro hacia aro ubicado a 5m de distancia y 1.5m de altura.

| # | Fase | Criterio | Condición | Umbral mostrado | Error si falla |
|---|---|---|---|---|---|
| 1 | Liberación | Extensión total del brazo al soltar | `maxElbowAngle >= 145 or avgElbowAngle >= 80` | ≥ 145° extensión ⚠ | Lanzamiento en empuje sin extensión de palanca |
| 2 | Torsión | Rotación axial del tronco | `avgTrunkAngle >= 5` | Rotación tronco evidente | Ausencia de rotación de tronco |
| 3 | Apoyo | Pierna contralateral adelantada | `maxHipAngle >= 28` | Paso contralateral ≥ 28° | Paso homolateral o base paralela estrecha |
| 4 | Control | Control manual del móvil | `avgElbowAngle >= 70` | Control digital firme | Pérdida de control manual |
| 5 | Dirección | La pelota avanza hacia el objetivo | `symmetryScore >= 65` | Trayectoria frontal hacia la meta | Desviación direccional del móvil |

Frases: "¡Apunta con el hombro contrario como si fueras un arquero afinando la diana!" · "¡Gira tu cintura como si desataras un resorte gigante para lanzar lejos y certero!"

### 3.6 Recepción y Atrape — [HMB-M] · prueba 9
**Protocolo:** Atrapar bimanualmente pelota plástica lanzada por el evaluador en parábola a 3 metros de distancia.

| # | Fase | Criterio | Condición | Umbral mostrado | Error si falla |
|---|---|---|---|---|---|
| 1 | Anticipación | Seguimiento visual continuo | `avgTrunkAngle <= 15` | Fijación visual ininterrumpida | Pérdida de seguimiento visual anticipatorio |
| 2 | Espera | Brazos semiflexionados (75°–135°) | `75 <= avgElbowAngle <= 135` | 75° a 135° | Brazos rígidos en fase de espera |
| 3 | Contacto | Manos en copa | `symmetryScore >= 70` | Manos en copa simétrica | Atrapada corporal o manos sin forma de copa |
| 4 | Amortiguación | Flexión elástica de brazos | `minKneeAngle <= 150 or avgElbowAngle <= 120` | Flexión amortiguadora sincrónica | Falta de amortiguación cinética en miembros superiores |
| 5 | Retención | Mantiene la pelota asegurada | `avgTrunkAngle <= 14` | Dominio final del móvil | Escape del móvil post-contacto |

Frases: "¡Tus manos son una cesta mágica suave que abraza el balón!" · "¡Cede con tus brazos hacia el pecho como si atraparas un huevo de cristal sin romperlo!"

### 3.7 Patear — [HMB-M] · prueba 10
**Protocolo:** Ubicado a un paso de una pelota estática, patear hacia una meta situada a 5 metros de distancia.

| # | Fase | Criterio | Condición | Umbral mostrado | Error si falla |
|---|---|---|---|---|---|
| 1 | Equilibrio | Brazo contralateral en péndulo | `avgElbowAngle >= 70 and symmetryScore >= 65` | Brazo opuesto pendular activo | Falta de contrapeso con brazo contralateral |
| 2 | Postura | Ligera flexión anterior del tronco | `4 <= avgTrunkAngle <= 18` | 4° a 18° | Tronco hiperextendido hacia atrás al patear |
| 3 | Impulso | Péndulo amplio desde la cadera | `maxHipAngle >= 32` | Apertura cadera ≥ 32° | Patrón de patada segmentario limitado a la rodilla |
| 4 | Desaceleración | Seguimiento y retorno con control | `minKneeAngle <= 135` | Seguimiento y retorno suave | Frenado hiperextendido sin seguimiento |
| 5 | Efectividad | Golpe nítido hacia el objetivo | `symmetryScore >= 68` | Progresión frontal hacia la meta | Impacto descentrado del móvil |

Frases: "¡Patea con el empeine como si enviaras una carta al cielo!" · "¡Acompaña el disparo con tu cuerpo como un cohete que sigue volando suave después del despegue!"

### 3.8 Equilibrio Dinámico — [HMB-E] Estabilidad-Equilibrio · prueba 14
**Protocolo:** Caminar sobre una línea de 5 cm de ancho por 9 metros de largo hasta el final del recorrido.

| # | Fase | Criterio | Condición | Umbral mostrado | Error si falla |
|---|---|---|---|---|---|
| 1 | Orientación | Mirada al frente | `avgTrunkAngle <= 8` | Orientación cefálica horizontal | Mirada fija hacia el suelo |
| 2 | Postura | Tronco erguido | `avgTrunkAngle <= 7` | ≤ 7° | Tronco desalineado o colapso postural |
| 3 | Sincronía | Brazos coordinados sin abrirse en cruz | `avgElbowAngle >= 100 and symmetryScore >= 75` | Brazos relajados sin abducción en cruz | Brazos en cruz compensatorios |
| 4 | Estabilidad | No se inclina ni tambalea | `symmetryScore >= 80` | Simetría lateral ≥ 80% | Oscilación lateral excesiva |
| 5 | Precisión | Pies sobre la línea de 5 cm | `maxHipAngle <= 35 and symmetryScore >= 75` | Apoyo 100% sobre la línea | Pérdida de la línea de soporte |

Frases: "¡Imagina que caminas sobre una cuerda de oro como un hábil equilibrista!" · "¡Fija tus ojos en la meta como un halcón y tu cuerpo te seguirá con suavidad!"

### 3.9 Equilibrio Estático Unipodal — [HMB-E] · prueba 15
**Protocolo:** Parado descalzo sobre colchoneta en apoyo unipodal durante 5 segundos con rodilla libre al frente y talón atrás.

| # | Fase | Criterio | Condición | Umbral mostrado | Error si falla |
|---|---|---|---|---|---|
| 1 | Reposo | Brazos relajados, sin aleteos | `avgElbowAngle >= 120` | ≥ 120° | Aleteo compensatorio de brazos |
| 2 | Sagital | Sin inclinarse adelante–atrás | `avgTrunkAngle <= 6` | ≤ 6° | Oscilación anteroposterior del tronco |
| 3 | Frontal | Sin inclinarse de lado a lado | `(avgShoulderTilt is None or avgShoulderTilt <= 8.5) and symmetryScore >= 80` | Oscilación ≤ 8.5° y Simetría ≥ 80% | Inclinación lateral o caída pélvica |
| 4 | Sustentación | Pierna de apoyo extendida | `(avgSupportKnee if avgSupportKnee > 0 else maxKneeAngle) >= 155` | ≥ 155° ⚠ (el criterio dice ≥ 160°) | Rodilla de apoyo flexionada o inestable |
| 5 | Sostenimiento | Pierna libre sostenida 5 s | `unipodalMaintainedFrames >= 2 or unipodalHoldFrames >= 2 or minKneeAngle <= 120` | Flexión anterior sostenida y pie elevado | Pérdida de suspensión en pierna libre |

Frases: "¡Eres un árbol milenario con raíces profundas que el viento no puede mover!" · "¡Respira hondo y sostén tu rodilla en el aire como un flamenco elegante!"

## 4. Textos `medido` y `observacion`

Son plantillas con los valores interpolados, p. ej. Carrera #1:

- `medido`: `"{avgElbowAngle}°"`
- `observacion` (pasa): `"Braceo coordinado en plano sagital con codos en ángulo maduro ({avgElbowAngle}°)."`
- `observacion` (falla): `"Apertura o rigidez excesiva de codos durante el braceo: {avgElbowAngle}° (requerido ~90°)."`
- `impacto_biomecanico` (falla): `"Codos a {avgElbowAngle}° generan torque asimétrico y desestabilizan el plano sagital."`

Las 45 plantillas están en `script.js:2954-3922`. Para la migración se recomienda pasarlas a la base de datos (campos `observacion_ok`, `observacion_falla`, `medido_tpl`) con sintaxis `str.format` / plantillas Django, y que el script de importación las lea del JSON (las que tienen interpolación hay que copiarlas a mano o con una pasada de regex sobre `script.js`).

## 5. Observaciones de validez (para revisar con el equipo pedagógico)

- Varios criterios se evalúan con un **proxy** que no mide lo que dice el criterio: p. ej. "seguimiento visual" (Atrape #1) y "mirada al frente" (Eq. Dinámico #1) usan la inclinación del tronco; "la pelota avanza hacia el objetivo" usa la simetría de rodillas; "manos en copa" usa `symmetryScore`. No hay detección de pelota ni de manos.
- `symmetryScore` depende solo de la diferencia media entre rodillas y está acotado a [65, 98], por lo que la condición `symmetryScore >= 65` **siempre se cumple** (Lanzamiento #5 pasa siempre; en Patear #1 y Salto Horizontal #4 solo decide la otra parte).
- Las reglas se evalúan sobre agregados de los 8 fotogramas (mín./máx./media), no sobre la fase concreta (p. ej. el "aterrizaje" usa el mínimo global de rodilla, que también puede salir de la carga).
- Los 5 segundos del equilibrio estático no se miden con tiempo real.

Estas limitaciones conviene resolverlas **después** de lograr paridad en Python (primero mismos resultados, luego mejoras con pruebas).
