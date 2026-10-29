# 09 · Planeación personalizada por habilidad y por resultado

**Estado:** implementado en `backend/` (Django). El generador v1 (`biomecanica/didactica.py`, `generar_unidad_v1`) se conserva sin cambios para la paridad con `generateDidacticPlan` de la web (rama `main`).

## 1. Qué fallaba

- La web solo tiene sesiones para 3 habilidades: Carrera, Salto Horizontal y Lanzamiento.
- Las otras 6 recibían las 12 sesiones de **Carrera**: Marcha, Salto Unipodal, Equilibrio Dinámico, Equilibrio Estático, Atrape y Patear. Por ejemplo, un niño evaluado en pateo recibía un plan de carrera.
- Los textos de la unidad eran genéricos; solo cambiaba el nombre de la habilidad:
  - pregunta problematizadora, objetivos, indicadores;
  - tarea para la casa, evaluación;
  - consignas por defecto, que eran de salto.
- Las sesiones de refuerzo se elegían por coincidencia de palabras entre el error y el texto de la sesión.

## 2. Banco de sesiones (`docs/datos/plantillas_progresion.json`)

- **108 sesiones:** 12 por cada una de las 9 habilidades, en las 4 fases pedagógicas.
- **Sesiones nuevas:** las 72 de las 6 habilidades que faltaban se redactaron con los libros de la carpeta `Data/`. Cada una cita su referente en el campo `fuente`. Las fuentes son:
  - la Unidad «El arte de marchar»;
  - Pérez Feito, 6-7 y 8-9 años: equilibrio con bancos suecos, escondite inglés, pilla a la pata coja, rayuela, juegos de lanzamiento y recepción, iniciación al fútbol;
  - Piñón y Pérez, 10-11 años: equilibrio dinámico, conducción y golpeo del balón;
  - Castañer y Camerino: equilibrio estático y dinámico, manipulación, saltos;
  - el protocolo de cada prueba de la batería.
- **Criterios por sesión:** cada sesión declara en `criterios` qué criterios de la batería trabaja (1 a 5, en el orden de `biomecanica/reglas.py`).
  - Una prueba verifica que cada criterio se trabaje en al menos 2 sesiones además del festival final.
  - Las 36 sesiones de la web conservan su texto; solo se les agregaron `criterios` y `fuente`.
- **Estructura de las sesiones nuevas:**
  - la central trae una actividad principal con variantes (a, b, c), como en los libros;
  - la última sesión es un festival con coevaluación y la prueba de la batería.

## 3. Generador personalizado (`biomecanica/didactica_v2.py`)

| | v1 (web) | v2 (Django) |
|---|---|---|
| Sesiones | Banco de la habilidad o Carrera | Banco propio de la habilidad |
| Refuerzos | Palabras en común con el error | **Criterios no logrados** en la evaluación: una sesión por criterio (hasta 3), la más temprana y focalizada que lo trabaje, justo después de la sesión 1 |
| Plan del salón | Errores consolidados por palabras | Errores consolidados → criterio de la batería, del más al menos frecuente |
| Textos de la unidad | Genéricos | Por habilidad: pregunta problematizadora, objetivo general, estándar motriz, indicadores de saber y hacer, tarea para la casa y consignas de la batería |
| Objetivos específicos | Fijos | Nombran los criterios por mejorar, los logrados que se consolidan y los que quedan por confirmar en clase |
| Evaluación formativa | Genérica | Lista de cotejo con los 5 criterios de la prueba, coevaluación y nueva grabación al final del período |
| Punto de partida | — | `diagnostico_base`: puntaje, estadio, % de madurez, logrados, por mejorar y por confirmar |
| MEN | — | Desempeño del Documento 15 según el ciclo (1.º-3.º y 4.º-5.º) |

**Sesiones guardadas:** `Sesion` guarda `criterios` y `fuente`, y `criterios_detalle` marca cuál es el criterio reforzado.

**Página de la unidad:** muestra el punto de partida (logrado, por mejorar, por confirmar). En cada sesión muestra los criterios que trabaja como etiquetas, con la reforzada resaltada, y su referente.

**Word de la planeación:** agrega la tabla «Punto de partida» y, en cada sesión, las filas «Criterios de la batería que trabaja» y «Referente».

## 4. Montaje 3D

Cada sesión nueva tiene un montaje distinto dentro de su habilidad: no se repite la receta.

**Recetas nuevas** (`apps/planeacion/montaje.py`):

| Receta | Montaje | Habilidades |
|---|---|---|
| `senderos` | Líneas de tiza recta, curva y zigzag | Marcha, Salto Unipodal, Eq. Dinámico |
| `linea_9m` | Línea de 9 m de la prueba, con diana a la altura de los ojos | Marcha, Eq. Dinámico |
| `bancos`, `bancos_cuadro`, `bancos_paralelos` | Bancos suecos en fila, en cuadrado a 90° y paralelos | Equilibrio |
| `parejas` | Parejas enfrentadas a una o varias distancias | Marcha, Equilibrio, Atrape, Patear |
| `corro` | Corros o rondos con uno al centro | Eq. Estático, Atrape, Patear |
| `porterias` | Mini-porterías a 5 m (prueba 10) | Patear |
| `bolos` | Bolos en triángulo | Patear |
| `pie_apoyo` | Huella del pie de apoyo junto al balón y puerta de conos | Patear |
| `estatuas` | Un aro por estudiante | Salto Unipodal, Eq. Estático, Atrape, Patear |
| `laberinto` | Platillos y conos al azar | Marcha, Eq. Dinámico |
| `estrella` | Radios desde un aro central | Eq. Dinámico, Atrape |
| `escondite` | Escondite inglés | Equilibrio |
| `colchonetas_circulo` | Prueba 15 en tríos alrededor del docente | Eq. Estático |
| `pasos` | Huellas alternas (talón-punta) o de un solo pie | Marcha, Salto Unipodal |
| `rebote` | Pared de rebote para atrapar o patear | Atrape, Patear |

**Elementos 3D nuevos** (`static/js/montaje3d-escena.js`): banco sueco, mini-portería con red, platillo y bolo. Están en el visor y en las fotos del Word.

**Ubicación de los estudiantes:** las recetas pueden ubicarlos en puestos exactos (parejas, corros, colchonetas) en lugar de hileras.

**Recetas existentes ajustadas:**
- El campo métrico rotula la línea según la acción: lanzamiento, pateo o pase.
- Los cuadrantes no ponen balones en sesiones de marcha o equilibrio.
- La escalera y la rayuela leen los peldaños, la separación y las islas del texto.

**Compatibilidad:** las escenas de las 36 sesiones de la web no cambian, salvo una frase neutra en los cuadrantes de Lanzamiento.

## 4.1 Objetos coherentes con la prueba y con el material del docente

**Primer filtro, la habilidad** (`montaje.PROPIOS_DE`):
- Cada objeto solo aparece en las pruebas donde tiene función, salvo que el texto del montaje lo pida.
- No hay balones para marchar o correr, ni colchonetas en carrera, marcha o equilibrio dinámico.
- Las colchonetas quedan en los saltos (zonas de caída) y en el equilibrio estático, porque la prueba 15 se hace descalzo sobre colchoneta.
- Bancos suecos solo en equilibrio (Pérez Feito); porterías y bolos solo en pateo; dianas en lanzamiento y pateo.

**Lo que no debe faltar:**
- Las pruebas de manipulación (lanzar, atrapar, patear) siempre tienen su balón en cada carril, recorrido, mini-cancha o estación.
- Las recetas ya no agregan por defecto vallas tras las hileras de aros, colchonetas en la rayuela (la tradicional es de tiza), postes altos en un slalom de conos ni conos junto a los bancos.

**Segundo filtro, el material marcado** en «Configurar clase» (`adaptar_a_materiales`):
- Los materiales configurables son: conos, aros, cuerdas, balones, colchonetas, platillos, bancos suecos, vallas bajas, picas o postes y mini-porterías.
- Lo que el docente no marcó se dibuja con su sustituto real:

| No marcado | Se dibuja |
|---|---|
| Aros | Círculos de tiza |
| Cuerdas | Líneas de tiza |
| Balones | Pelotas de papel periódico |
| Colchonetas | Zona de césped o piso blando |
| Bancos suecos | Línea doble de tiza de 20 cm |
| Conos, postes o porterías | Platillos o conos si los hay; si no, cruces de tiza |
| Vallas | Una cuerda entre dos conos, o una línea roja |

- El montaje avisa cada sustitución, y los pasos que nombran el material llevan la nota.
- La lista de material solo pide lo que el docente tiene, más los metros de tiza.

**Sin configuración** (lista vacía), el montaje queda como lo describe el texto.

## 5. Desplegar

```bash
cd backend
.venv/bin/python manage.py migrate          # criterios y fuente en plantillas y sesiones
.venv/bin/python manage.py cargar_catalogo  # carga las 108 sesiones
```

Las planeaciones guardadas antes del cambio conservan sus sesiones: no tienen criterios ni punto de partida. Para obtener la versión personalizada, se vuelve a generar la planeación desde la evaluación.
