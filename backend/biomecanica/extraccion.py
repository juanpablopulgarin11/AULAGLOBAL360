"""Extracción de fotogramas desde video o foto (port de ``extractAdaptiveVideoKeyframes`` y
``extractImageKeyframe``, ``script.js:1708-1982``).

Requiere ``opencv-python-headless`` y ``numpy``; el detector por defecto usa ``mediapipe``.
Estas dependencias se importan aquí y no en el resto de ``biomecanica``, que sigue siendo
Python puro.

El detector se inyecta (cualquier callable ``rgb -> landmarks | None``) para poder probar la
lógica de ventanas y fases sin el modelo.

Diferencia inevitable con el navegador: el *seek* de OpenCV y el de ``<video>`` no caen
exactamente en el mismo fotograma, así que la paridad aquí se valida a nivel de habilidad y
estadio, no de ángulos exactos (docs/06 §7).
"""
from __future__ import annotations

import math
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple, Union

import cv2
import numpy as np

from .angulos import compute_joint_angles
from .gatillo import check_exercise_trigger_pose
from .hitos import assign_keyframe_milestones

# Igual que el JS: todo se lleva a 640×360 antes de detectar. Deforma videos verticales
# (docs/07 #2), pero cambiarlo altera los ángulos calibrados: se hará en un cambio aparte.
ANCHO, ALTO = 640, 360
CALIDAD_JPEG = 85
DURACION_MAX_S = 20.0
DURACION_MIN_S = 0.6

Landmarks = List[Dict[str, float]]
Detector = Callable[[np.ndarray], Optional[Landmarks]]

FASES = {
    "Equilibrio Estático Unipodal": [
        "Fase 1: Inicio de Elevación Podal", "Fase 2: Ajuste y Elevación de Pierna Libre",
        "Fase 3: Búsqueda de Estabilidad Postural", "Fase 4: Alineación de Hombros y Tronco",
        "Fase 5: Sostén Estático Cumbre (Flamenco)", "Fase 6: Control Postural Continuo",
        "Fase 7: Mantenimiento del Equilibrio", "Fase 8: Cierre y Retorno Bipodal",
    ],
    "Salto Horizontal": [
        "Fase 1: Flexión Preparatoria Bípode", "Fase 2: Impulso y Extensión Triple", "Fase 3: Despegue del Suelo",
        "Fase 4: Proyección Aérea", "Fase 5: Ápice de Vuelo Bipodal", "Fase 6: Descenso y Preparación al Contacto",
        "Fase 7: Contacto de Ambos Pies", "Fase 8: Amortiguación y Frenado",
    ],
    None: [
        "Fase 1: Preparación / Inicio", "Fase 2: Transición y Carga Motriz", "Fase 3: Desarrollo del Movimiento",
        "Fase 4: Aceleración y Ajuste Postural", "Fase 5: Punto Culminante del Gesto",
        "Fase 6: Continuación del Movimiento", "Fase 7: Fase de Contacto o Sostén", "Fase 8: Conclusión y Estabilización",
    ],
}


class ArchivoIlegible(ValueError):
    """OpenCV no pudo decodificar el archivo."""


# --------------------------------------------------------------------------------------
# Detector MediaPipe
# --------------------------------------------------------------------------------------
class DetectorMediaPipe:
    """``PoseLandmarker`` en modo IMAGE con la misma configuración del navegador."""

    def __init__(self, modelo: Union[str, Path], usar_gpu: bool = False) -> None:
        from mediapipe.tasks.python.core.base_options import BaseOptions
        from mediapipe.tasks.python.vision import PoseLandmarker, PoseLandmarkerOptions, RunningMode

        if not Path(modelo).exists():
            raise FileNotFoundError(f"No existe el modelo de pose: {modelo} (ejecuta manage.py descargar_modelo_pose)")
        delegado = BaseOptions.Delegate.GPU if usar_gpu else BaseOptions.Delegate.CPU
        opciones = PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(modelo), delegate=delegado),
            running_mode=RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._landmarker = PoseLandmarker.create_from_options(opciones)
        self._gpu = usar_gpu
        self._lock = threading.Lock()   # el landmarker no es seguro entre hilos

    def __call__(self, rgb: np.ndarray) -> Optional[Landmarks]:
        import mediapipe as mp

        if self._gpu:   # el backend Metal de macOS solo acepta RGBA
            imagen = mp.Image(image_format=mp.ImageFormat.SRGBA,
                              data=np.ascontiguousarray(cv2.cvtColor(rgb, cv2.COLOR_RGB2RGBA)))
        else:
            imagen = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        with self._lock:
            resultado = self._landmarker.detect(imagen)
        if not resultado.pose_landmarks:
            return None
        return [{"x": p.x, "y": p.y, "z": p.z, "visibility": p.visibility} for p in resultado.pose_landmarks[0]]

    def close(self) -> None:
        self._landmarker.close()


_detectores: Dict[str, DetectorMediaPipe] = {}
_detectores_lock = threading.Lock()


def detector_mediapipe(modelo: Union[str, Path], usar_gpu: bool = False) -> DetectorMediaPipe:
    """Un detector por proceso (cargar el modelo cuesta ~1 s).

    En macOS mediapipe 1.x solo funciona con ``usar_gpu=True`` (con CPU aborta el proceso al
    abrir el grafo); en servidores Linux sin GPU se usa CPU.
    """
    clave = f"{modelo}|{usar_gpu}"
    with _detectores_lock:
        if clave not in _detectores:
            _detectores[clave] = DetectorMediaPipe(modelo, usar_gpu=usar_gpu)
        return _detectores[clave]


# --------------------------------------------------------------------------------------
# Imagen: redimensionado, esqueleto y JPEG
# --------------------------------------------------------------------------------------
def _a_lienzo(bgr: np.ndarray) -> np.ndarray:
    return cv2.resize(bgr, (ANCHO, ALTO), interpolation=cv2.INTER_AREA)


def _jpeg(bgr: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, CALIDAD_JPEG])
    if not ok:
        raise ValueError("No se pudo codificar el fotograma en JPEG")
    return buf.tobytes()


CONEXIONES = [(11, 12), (11, 23), (12, 24), (23, 24), (11, 13), (13, 15), (12, 14), (14, 16),
              (23, 25), (25, 27), (27, 29), (29, 31), (24, 26), (26, 28), (28, 30), (30, 32), (0, 11), (0, 12)]
ARTICULACIONES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
CIAN, MAGENTA, BLANCO = (212, 245, 0), (153, 72, 236), (255, 255, 255)   # BGR de #00F5D4, #EC4899


def dibujar_esqueleto(bgr: np.ndarray, landmarks: Optional[Landmarks], angles: Optional[Dict[str, Any]]) -> np.ndarray:
    """Copia de ``bgr`` con el esqueleto y los ángulos principales (``drawPoseSkeleton``)."""
    img = bgr.copy()
    if not landmarks or len(landmarks) < 33:
        return img
    h, w = img.shape[:2]

    def visible(p):
        return (p.get("visibility") or 1) > 0.35

    def pt(p):
        return int(round(p["x"] * w)), int(round(p["y"] * h))

    for i, j in CONEXIONES:
        if visible(landmarks[i]) and visible(landmarks[j]):
            cv2.line(img, pt(landmarks[i]), pt(landmarks[j]), CIAN, 3, cv2.LINE_AA)
    for i in ARTICULACIONES:
        if visible(landmarks[i]):
            cv2.circle(img, pt(landmarks[i]), 5, MAGENTA, -1, cv2.LINE_AA)
            cv2.circle(img, pt(landmarks[i]), 5, BLANCO, 1, cv2.LINE_AA)
    if angles:
        cv2.rectangle(img, (6, h - 26), (300, h - 6), (42, 23, 15), -1)
        texto = f"Rodilla {angles['kneeMin']} | Codo {angles['elbowAvg']} | Tronco {angles['trunkLean']} (grados)"
        cv2.putText(img, texto, (10, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (248, 189, 56), 1, cv2.LINE_AA)
    return img


def _fotograma(bgr: np.ndarray, detector: Detector, t: float, fase: str) -> Dict[str, Any]:
    lienzo = _a_lienzo(bgr)
    landmarks = detector(cv2.cvtColor(lienzo, cv2.COLOR_BGR2RGB))
    angles = compute_joint_angles(landmarks) if landmarks else None
    return {
        "time": f"{t:.2f}s",
        "timestampNum": t,
        "phase": fase,
        "landmarks": landmarks,
        "angles": angles,
        "isInitialTrigger": False,
        "triggerInfo": None,
        "imagen_jpeg": _jpeg(lienzo),
        "imagen_esqueleto_jpeg": _jpeg(dibujar_esqueleto(lienzo, landmarks, angles)),
    }


# --------------------------------------------------------------------------------------
# Video
# --------------------------------------------------------------------------------------
class LectorVideo:
    """Acceso aleatorio por tiempo a un video con OpenCV."""

    def __init__(self, ruta: Union[str, Path]) -> None:
        self.cap = cv2.VideoCapture(str(ruta))
        if not self.cap.isOpened():
            raise ArchivoIlegible(f"No se pudo abrir el video: {Path(ruta).name}")
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 0.0
        self.n = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if self.fps <= 0 or self.n <= 0:
            self._contar()
        if self.n <= 0:
            raise ArchivoIlegible("El video no tiene fotogramas legibles")
        self.duracion = self.n / self.fps

    def _contar(self) -> None:
        n, ultimo_ms = 0, 0.0
        while True:
            ok = self.cap.grab()
            if not ok:
                break
            n += 1
            ultimo_ms = self.cap.get(cv2.CAP_PROP_POS_MSEC)
        self.n = n
        self.fps = self.fps if self.fps > 0 else (n / (ultimo_ms / 1000) if ultimo_ms > 0 else 30.0)
        self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    def en(self, t: float) -> np.ndarray:
        """Fotograma visible en el instante ``t`` (como ``video.currentTime = t``)."""
        idx = max(0, min(self.n - 1, int(math.floor(t * self.fps))))
        for intento in (idx, idx - 1, 0):
            if intento < 0:
                continue
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, intento)
            ok, frame = self.cap.read()
            if ok and frame is not None:
                return frame
        raise ArchivoIlegible(f"No se pudo leer el fotograma en t={t:.2f}s")

    def close(self) -> None:
        self.cap.release()


@dataclass
class ResultadoExtraccion:
    frames: List[Dict[str, Any]]
    duracion: float
    ventana: Tuple[float, float]
    gatillo: Optional[Dict[str, Any]] = None
    muestras_escaneo: int = 0
    con_persona: int = field(default=0)


def ventana_de_accion(escaneo: Sequence[Tuple[float, Optional[Dict[str, Any]], Dict[str, Any]]], dur: float,
                      primer_gatillo: int) -> Tuple[float, float]:
    """Delimita la acción a partir del ángulo inicial (``script.js:1782-1809``)."""
    if primer_gatillo == -1:
        return max(0.05, dur * 0.08), min(dur - 0.05, dur * 0.92)
    t_gatillo = escaneo[primer_gatillo][0]
    inicio = max(0.04, t_gatillo - 0.10)
    ultimo = primer_gatillo
    for i in range(primer_gatillo, len(escaneo)):
        _, angles, trig = escaneo[i]
        if trig.get("triggered"):
            ultimo = i
        elif angles and angles["kneeMin"] < 155:
            ultimo = i
    fin = min(dur - 0.04, escaneo[min(len(escaneo) - 1, ultimo + 1)][0])
    if fin - inicio < 0.5:
        fin = min(dur - 0.04, inicio + 1.8)
    return inicio, fin


def extraer_video(ruta: Union[str, Path], detector: Detector, n: int = 8,
                  habilidad: Optional[str] = None) -> ResultadoExtraccion:
    """Escanea el video, localiza el ángulo inicial y extrae ``n`` fotogramas equiespaciados."""
    if n < 2:
        raise ValueError("Se necesitan al menos 2 fotogramas")
    lector = LectorVideo(ruta)
    try:
        dur = max(DURACION_MIN_S, min(lector.duracion, DURACION_MAX_S))

        def seek(t: float) -> np.ndarray:
            return lector.en(max(0.0, min(t, dur - 0.05)))

        # 1. Escaneo para encontrar el ángulo inicial del ejercicio
        pasos = min(24, max(12, math.floor(dur * 5)))
        dt = dur / (pasos + 1)
        escaneo: List[Tuple[float, Optional[Dict[str, Any]], Dict[str, Any]]] = []
        primer, info, prev = -1, None, None
        for i in range(pasos + 1):
            t = i * dt
            landmarks = detector(cv2.cvtColor(_a_lienzo(seek(t)), cv2.COLOR_BGR2RGB))
            angles = compute_joint_angles(landmarks) if landmarks else None
            trig: Dict[str, Any] = {"triggered": False}
            if angles:
                trig = check_exercise_trigger_pose(angles, prev)
                if trig["triggered"] and primer == -1:
                    primer, info = i, {**trig, "t": t}
                prev = angles
            escaneo.append((t, angles, trig))

        # 2. Ventana y 3. instantes equiespaciados desde el ángulo inicial
        inicio, fin = ventana_de_accion(escaneo, dur, primer)
        tiempos = [inicio + (fin - inicio) * k / (n - 1) for k in range(n)]

        pista = info["skillHint"] if info and info["skillHint"] in FASES else None
        fases = list(FASES[pista])
        if info:
            fases[0] = f"Fase 1: Ángulo Inicial ({info['reason']})"

        # 4. Fotogramas finales con pose, ángulos y esqueleto
        frames = []
        for k, t in enumerate(tiempos):
            f = _fotograma(seek(t), detector, t, fases[k] if k < len(fases) else f"Fase {k + 1}")
            if k == 0 and info:
                f["isInitialTrigger"], f["triggerInfo"] = True, info
            frames.append(f)
    finally:
        lector.close()

    assign_keyframe_milestones(frames, habilidad)
    return ResultadoExtraccion(frames=frames, duracion=dur, ventana=(inicio, fin), gatillo=info,
                               muestras_escaneo=len(escaneo), con_persona=sum(1 for f in frames if f["landmarks"]))


def extraer_imagen(origen: Union[str, Path, bytes], detector: Detector, habilidad: Optional[str] = None) -> ResultadoExtraccion:
    """Una foto fija → un único fotograma "Postura Estática"."""
    if isinstance(origen, (bytes, bytearray)):
        bgr = cv2.imdecode(np.frombuffer(origen, np.uint8), cv2.IMREAD_COLOR)
    else:
        bgr = cv2.imread(str(origen), cv2.IMREAD_COLOR)
    if bgr is None:
        raise ArchivoIlegible("No se pudo leer la imagen")
    f = _fotograma(bgr, detector, 0.0, "Postura Estática")
    f["time"] = "0.0s"
    frames = [f]
    assign_keyframe_milestones(frames, habilidad)
    return ResultadoExtraccion(frames=frames, duracion=0.0, ventana=(0.0, 0.0), con_persona=int(bool(f["landmarks"])))


EXTENSIONES_VIDEO = {".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv", ".3gp"}
EXTENSIONES_IMAGEN = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def tipo_de_archivo(nombre: str) -> Optional[str]:
    ext = Path(nombre).suffix.lower()
    if ext in EXTENSIONES_VIDEO:
        return "video"
    if ext in EXTENSIONES_IMAGEN:
        return "imagen"
    return None
