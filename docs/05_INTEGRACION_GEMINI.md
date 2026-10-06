# 05 · Integración con Gemini Vision

## 1. Cómo funciona hoy

Todo ocurre **en el navegador**, con la clave de Google AI Studio que el docente pega en el panel (se guarda en `localStorage`, texto plano, y viaja en la query string `?key=`).

### 1.1 Listado de modelos (`refreshGeminiModels`, `script.js:481`)

1. `GET https://generativelanguage.googleapis.com/v1beta/models?key=…`; si no trae modelos, prueba `/v1/models`.
2. Filtra los que tienen `generateContent` en `supportedGenerationMethods`.
3. Ordena por prioridad de nombre: `2.0-flash` (100) > `1.5-flash-latest` (85) > `1.5-flash` (80) > `1.5-pro` (60) > cualquier `flash` (40) > resto (10).
4. Cachea en `localStorage['aula360_gemini_models_cache']`.

### 1.2 Selección de endpoint (`getGeminiCandidateEndpoints`, `script.js:4053`)

Orden de candidatos:
1. El último que funcionó (`cachedGeminiEndpoint`).
2. Modelo fijado por el docente → `[v1beta, v1]`.
3. Lista cacheada.
4. Lista en vivo (mismo orden de prioridad).
5. Respaldo fijo: `gemini-2.0-flash` (v1beta), `gemini-1.5-flash` (v1 y v1beta), `gemini-1.5-flash-latest`, `gemini-2.0-flash-exp`.

> Esos nombres de modelo están codificados y envejecen; en Django el modelo debe ser **configurable** (variable de entorno / settings).

Errores tratados: `API_KEY_INVALID` / "API key not valid" → mensaje de clave inválida; `SERVICE_DISABLED` / "has not been used" → API no habilitada. Un 404 / "not found" / "not supported" pasa al siguiente candidato.

### 1.3 Llamada (`callGeminiVision`, `script.js:4130`)

1. Calcula la telemetría local, sugiere habilidad con el clasificador y ejecuta la FSM (doc 02).
2. Construye el **system prompt** (`script.js:4163`) con:
   - Rol: biomecánico deportivo y docente experto en desarrollo motor infantil (Batería HMB + Gallahue).
   - Si es automático: definición de las 9 habilidades y reglas críticas (no confundir equilibrio estático con salto horizontal o patear; salto exige traslación; brazos arriba al correr no es lanzamiento) y la instrucción de que **lo visual tiene prioridad** sobre lo numérico.
   - Si es dirigido: "Habilidad específica seleccionada por el docente: X".
   - Telemetría medida: edad, fases FSM, desplazamiento de cadera (< 0.08 = "nulo, descartar salto"), sostén unipodal, inclinación de hombros, rodilla mín., codo medio, tronco, cadera máx., muñeca sobre hombro, distancia entre muñecas (< 0.26 = manos en copa), asimetría de tobillos y rodillas, vuelo bipodal, simetría.
   - El **esquema JSON** exacto que debe devolver (igual a `Diagnostico`, doc 02 §10, sin `medido`/`umbral`).
3. `contents.parts` = texto introductorio + por cada fotograma: `"Fotograma #i (t) - [etiqueta de hito]:"` + `inlineData` JPEG base64.
4. `generationConfig = {temperature: 0.1, responseMimeType: "application/json"}`.
5. `POST …/{version}/models/{model}:generateContent?key=…`; extrae `candidates[0].content.parts[0].text`, limpia cercas ```` ```json ```` (`cleanJSON`) y hace `JSON.parse`.
6. Añade `telemetria_medida`, `es_deteccion_automatica`, `modelo_utilizado`.

### 1.4 Respaldo

Si Gemini falla por cualquier motivo, `sendMsg` muestra un aviso y ejecuta `runLocalBiomechanicalEngine` con los mismos fotogramas.

> El prompt referencia `telemetry.singleSupportKick`, que **no existe** → siempre dice "NO". Ver doc 07.

## 2. Recomendación para Django

| Aspecto | Hoy | En Django |
|---|---|---|
| Clave | En el navegador de cada docente | `GEMINI_API_KEY` en variables de entorno del servidor (o por institución, cifrada en BD) |
| SDK | `fetch` manual | SDK oficial `google-genai` (`from google import genai`) |
| Modelo | Lista dinámica + nombres fijos | `settings.GEMINI_MODEL` con lista de respaldo configurable |
| Salida | `JSON.parse` sin validar | Validar con **Pydantic** (`response_schema`) y, si no valida, reintentar o caer al motor local |
| Ejecución | Síncrona en el navegador | Tarea **Celery** (la llamada tarda segundos) |
| Prompt | Cadena embebida en JS | Plantilla Django/Jinja en `templates/prompts/gemini_diagnostico.txt`, versionada |
| Trazabilidad | Ninguna | Guardar `modelo_utilizado`, versión de prompt, tokens y latencia en el modelo `Evaluacion` |

Esquema Pydantic sugerido:

```python
from typing import Literal
from pydantic import BaseModel, Field

Habilidad = Literal["Carrera", "Salto Horizontal", "Marcha", "Salto Unipodal",
                    "Lanzamiento Sobre Hombro", "Recepción y Atrape", "Patear",
                    "Equilibrio Dinámico", "Equilibrio Estático Unipodal"]

class Criterio(BaseModel):
    criterio: str
    fase: str
    puntaje: Literal[0, 1]
    observacion: str
    medido: str | None = None
    umbral: str | None = None

class ErrorCritico(BaseModel):
    error: str
    impacto_biomecanico: str

class AnalisisArticular(BaseModel):
    angulos_principales: str
    cadena_cinetica: str
    apoyo_y_base: str

class Diagnostico(BaseModel):
    habilidad_detectada: Habilidad
    es_deteccion_automatica: bool
    componente_hmb: str
    bateria_referencia: str
    puntaje_obtenido: str
    edad_calibrada: str
    estadio_gallahue: Literal["Inicial", "Elemental", "Maduro"]
    porcentaje_madurez: int = Field(ge=0, le=100)
    resumen_biomecanico: str
    criterios: list[Criterio]
    analisis_articular: AnalisisArticular
    errores_criticos: list[ErrorCritico]
    frases_profe: list[str]
```

**Privacidad**: se envían imágenes de menores de edad a un servicio externo. En la versión Django conviene pedir consentimiento explícito (Ley 1581 de 2012 de protección de datos en Colombia), registrar quién lo autorizó y permitir desactivar el motor en la nube por institución.
