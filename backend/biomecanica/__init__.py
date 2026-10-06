"""Motor biomecánico de AULA GLOBAL 360 en Python puro (sin Django).

Port fiel de ``script.js``; la paridad se verifica con ``tests/test_paridad.py``.

Uso típico::

    from biomecanica import compute_joint_angles, run_local_engine

    frames = [{"timestampNum": t, "landmarks": lm, "angles": compute_joint_angles(lm)} for t, lm in muestras]
    diagnostico = run_local_engine("auto", "7_anos", "", frames)
"""
from .angulos import analizar_equilibrio, compute_joint_angles
from .clasificador import classify_skill
from .fsm import crear_fsm, ejecutar_fsm
from .gatillo import check_exercise_trigger_pose
from .habilidades import HABILIDADES, grado_y_ciclo, resolver_habilidad
from .hitos import assign_keyframe_milestones
from .motor_local import VERSION_MOTOR, SinPersonaDetectada, estadio_gallahue, run_local_engine
from .reglas import REGLAS, obtener_regla
from .telemetria import aggregate_video_telemetry

__all__ = [
    "HABILIDADES", "REGLAS", "VERSION_MOTOR", "SinPersonaDetectada",
    "aggregate_video_telemetry", "analizar_equilibrio", "assign_keyframe_milestones",
    "check_exercise_trigger_pose", "classify_skill", "compute_joint_angles", "crear_fsm",
    "ejecutar_fsm", "estadio_gallahue", "grado_y_ciclo", "obtener_regla", "resolver_habilidad",
    "run_local_engine",
]
