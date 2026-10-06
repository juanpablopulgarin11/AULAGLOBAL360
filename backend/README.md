# backend · Motor biomecánico en Python

Fase 1 de la migración a Django ([docs/06](../docs/06_PLAN_MIGRACION_DJANGO.md)): el motor de `script.js` portado a **Python puro** (sin Django ni dependencias externas), verificado contra el JavaScript original.

## Estructura

```
backend/
├── biomecanica/
│   ├── jsutil.py        # Math.round, formateo de números y `||` como en JS
│   ├── landmarks.py     # Punto e índices de MediaPipe Pose
│   ├── geometria.py     # ángulo 3D, ángulo 2D, inclinación horizontal
│   ├── angulos.py       # compute_joint_angles, analizar_equilibrio
│   ├── gatillo.py       # ángulo inicial del ejercicio
│   ├── telemetria.py    # agregación de los fotogramas
│   ├── clasificador.py  # detección automática de la habilidad
│   ├── fsm.py           # 9 máquinas de estado
│   ├── hitos.py         # etiquetas visuales por fotograma
│   ├── habilidades.py   # catálogo, alias y grados MEN
│   ├── reglas.py        # 45 criterios de la Batería HMB
│   └── motor_local.py   # run_local_engine → Diagnostico
└── tests/
    ├── golden/generar_dorados.js   # ejecuta el script.js real y guarda entradas/salidas
    ├── golden/dorados.json
    ├── test_paridad.py             # Python == JS en 91 casos sintéticos + 301 de geometría
    └── test_motor.py               # pruebas de comportamiento legibles
```

## Uso

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install pytest
.venv/bin/python -m pytest -q          # pyproject.toml ya agrega backend/ al path
```

```python
from biomecanica import compute_joint_angles, run_local_engine, assign_keyframe_milestones

# landmarks: 33 puntos de MediaPipe (objetos con .x .y .z, dicts o listas [x, y, z, vis])
frames = [{"timestampNum": t, "time": f"{t:.2f}s", "landmarks": lm, "angles": compute_joint_angles(lm)}
          for t, lm in muestras]
assign_keyframe_milestones(frames, None)          # None = detección automática
diagnostico = run_local_engine("auto", "7_anos", "observaciones del docente", frames)
```

`run_local_engine` lanza `SinPersonaDetectada` si ningún fotograma tiene landmarks.

## Paridad con el JavaScript

Si cambia la lógica de `script.js` mientras dure la migración, regenerar los dorados y volver a correr las pruebas:

```bash
node backend/tests/golden/generar_dorados.js     # desde la raíz del repo
```

Los dorados usan poses sintéticas deterministas (10 escenarios × 9 semillas + un caso sin persona). Antes de cambiar umbrales conviene agregar landmarks de **videos reales** de cada habilidad (ver docs/06 §7).

Diferencias intencionales respecto al JS del commit `72e7a88` (ya aplicadas también en `script.js`, así que la paridad se mantiene):

- Sin landmarks → error en vez de un diagnóstico con valores inventados.
- `edad_calibrada` usa la etiqueta del grado ("Grado 2º de Primaria (7 años)") en vez de `"9 11_anos"`.

## Pendiente (fases siguientes)

- Extracción de fotogramas desde video con `opencv` + `mediapipe` (fase 3).
- Generador de unidad didáctica y exportes `.docx` (fase 4).
- Proyecto Django, modelos y tareas Celery (fases 0, 2, 5–7).
