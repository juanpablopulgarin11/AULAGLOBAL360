"""Extracción de fotogramas desde video o foto (evolución de ``extractAdaptiveVideoKeyframes``
y ``extractImageKeyframe``, ``script.js:1708-1982``).

Requiere ``opencv-python-headless`` y ``numpy``; el detector por defecto usa ``mediapipe``.
Estas dependencias se importan aquí y no en el resto de ``biomecanica``, que sigue siendo
Python puro. El detector se inyecta (``rgb -> landmarks | None``) para poder probar la
lógica sin el modelo.

Mejoras respecto al navegador (la lógica de gatillo, ventana y fases es la misma):

- **Encuadre sin deformación**: la imagen se ajusta a 640×360 conservando su proporción
  (bandas negras). Para videos 16:9 el resultado es idéntico al JS; en videos verticales ya
  no se estiran los ángulos. Los landmarks quedan en coordenadas del lienzo 16:9, que es el
  espacio en el que se calibraron los umbrales.
- **Tiempos exactos por fotograma** (videos de celular con frecuencia variable).
- **Escaneo denso** (15 muestras/s) con gatillo confirmado en 2 muestras seguidas.
- **Suavizado**: cada fotograma final es la mediana de 3 fotogramas contiguos.
- **Control de calidad**: se descartan las poses con el cuerpo casi invisible y se generan
  advertencias para el docente.
"""
from __future__ import annotations

import bisect
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
from .jsutil import js_round

ANCHO, ALTO = 640, 360
CALIDAD_JPEG = 85
DURACION_MAX_S = 20.0
DURACION_MIN_S = 0.6
PASO_ESCANEO_S = 1 / 15          # el JS usaba ~0.19 s (12–24 muestras en total)
LAG_DELTA_S = 0.1875             # referencia del gatillo por cambio angular (equivale al paso del JS)
CONFIRMACION_GATILLO = 2         # muestras seguidas que deben cumplir el gatillo
MAX_MUESTRAS_ESCANEO = 300
VECINOS_SUAVIZADO = 1            # fotogramas a cada lado para la mediana (3 en total)
VISIBILIDAD_MIN_CUERPO = 0.35    # misma referencia que el dibujo del esqueleto en el JS
ARTICULACIONES_NUCLEO = [11, 12, 23, 24, 25, 26, 27, 28]

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
# Lienzo, calidad y suavizado
# --------------------------------------------------------------------------------------
@dataclass
class Lienzo:
    """Imagen ajustada a 640×360 sin deformar y la región que ocupa el contenido real."""
    imagen: np.ndarray            # 640×360 con bandas negras
    contenido: np.ndarray         # el contenido sin bandas (donde se detecta la pose)
    x0: int
    y0: int


def a_lienzo(bgr: np.ndarray) -> Lienzo:
    """Ajusta la imagen a 640×360 sin deformarla (bandas negras donde sobra espacio)."""
    h, w = bgr.shape[:2]
    escala = min(ANCHO / w, ALTO / h)
    nw, nh = max(1, js_round(w * escala)), max(1, js_round(h * escala))   # igual que Math.round del JS
    contenido = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_AREA)
    if (nw, nh) == (ANCHO, ALTO):
        return Lienzo(contenido, contenido, 0, 0)
    imagen = np.zeros((ALTO, ANCHO, 3), dtype=np.uint8)
    x0, y0 = (ANCHO - nw) // 2, (ALTO - nh) // 2
    imagen[y0:y0 + nh, x0:x0 + nw] = contenido
    return Lienzo(imagen, contenido, x0, y0)


def visibilidad_nucleo(landmarks: Optional[Landmarks]) -> float:
    if not landmarks or len(landmarks) < 33:
        return 0.0
    return float(np.mean([landmarks[i].get("visibility", 1.0) or 0.0 for i in ARTICULACIONES_NUCLEO]))


def angulos_si_visible(landmarks: Optional[Landmarks]) -> Optional[Dict[str, Any]]:
    """Ángulos solo si el cuerpo (hombros, caderas, rodillas, tobillos) es razonablemente visible."""
    if not landmarks or visibilidad_nucleo(landmarks) < VISIBILIDAD_MIN_CUERPO:
        return None
    return compute_joint_angles(landmarks)


def mediana_landmarks(muestras: Sequence[Optional[Landmarks]]) -> Optional[Landmarks]:
    """Mediana punto a punto de varias detecciones (atenúa el temblor de MediaPipe)."""
    validas = [m for m in muestras if m and len(m) >= 33]
    if not validas:
        return None
    if len(validas) == 1:
        return validas[0]
    arr = np.array([[[p["x"], p["y"], p.get("z") or 0.0, p.get("visibility", 1.0) or 0.0] for p in m[:33]] for m in validas])
    med = np.median(arr, axis=0)
    return [{"x": float(x), "y": float(y), "z": float(z), "visibility": float(v)} for x, y, z, v in med]


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
        return (p.get("visibility") or 1) > VISIBILIDAD_MIN_CUERPO

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


def _armar_fotograma(lienzo: Lienzo, landmarks: Optional[Landmarks], t: float, fase: str) -> Dict[str, Any]:
    angles = angulos_si_visible(landmarks)
    return {
        "time": f"{t:.2f}s",
        "timestampNum": t,
        "phase": fase,
        "landmarks": landmarks,
        "angles": angles,
        "visibilidad": round(visibilidad_nucleo(landmarks), 3),
        "isInitialTrigger": False,
        "triggerInfo": None,
        "imagen_jpeg": _jpeg(lienzo.imagen),
        "imagen_esqueleto_jpeg": _jpeg(dibujar_esqueleto(lienzo.imagen, landmarks, angles)),
    }


def _detectar(detector: Detector, lienzo: Lienzo) -> Optional[Landmarks]:
    """Detecta sobre el contenido sin bandas (la persona se ve más grande) y expresa los
    landmarks en coordenadas del lienzo 16:9, el espacio en que se calibraron los umbrales."""
    lm = detector(cv2.cvtColor(lienzo.contenido, cv2.COLOR_BGR2RGB))
    if not lm or (lienzo.x0 == 0 and lienzo.y0 == 0):
        return lm
    nh, nw = lienzo.contenido.shape[:2]
    sx, sy = nw / ANCHO, nh / ALTO
    ox, oy = lienzo.x0 / ANCHO, lienzo.y0 / ALTO
    # z de MediaPipe usa la escala de x (ancho de la imagen): se ajusta igual que x
    return [{**p, "x": p["x"] * sx + ox, "y": p["y"] * sy + oy, "z": (p.get("z") or 0.0) * sx} for p in lm]


# --------------------------------------------------------------------------------------
# Video
# --------------------------------------------------------------------------------------
class LectorVideo:
    """Acceso por tiempo a un video con los tiempos reales de cada fotograma.

    Un primer recorrido (``grab``, sin convertir imágenes) registra la marca de tiempo de cada
    fotograma; así los saltos son exactos aunque el celular grabe con frecuencia variable.
    """

    def __init__(self, ruta: Union[str, Path]) -> None:
        self.cap = cv2.VideoCapture(str(ruta))
        if not self.cap.isOpened():
            raise ArchivoIlegible(f"No se pudo abrir el video: {Path(ruta).name}")
        if hasattr(cv2, "CAP_PROP_ORIENTATION_AUTO"):
            self.cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)   # videos de celular grabados en vertical
        self.fps_declarado = self.cap.get(cv2.CAP_PROP_FPS) or 0.0
        self.tiempos: List[float] = []
        limite_s = DURACION_MAX_S + 1
        while self.cap.grab():
            t = self.cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
            if self.tiempos and t <= self.tiempos[-1]:   # marcas no monótonas: se reconstruyen
                t = self.tiempos[-1] + (1 / self.fps_declarado if self.fps_declarado > 0 else 1 / 30)
            self.tiempos.append(t)
            if t > limite_s:
                break
        if not self.tiempos:
            raise ArchivoIlegible("El video no tiene fotogramas legibles")
        paso = float(np.median(np.diff(self.tiempos))) if len(self.tiempos) > 1 else (1 / (self.fps_declarado or 30))
        self.fps = 1 / paso if paso > 0 else (self.fps_declarado or 30.0)
        self.duracion = self.tiempos[-1] - self.tiempos[0] + paso
        self.t0 = self.tiempos[0]
        self._actual = -1
        self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        ok, primero = self.cap.read()
        if not ok:
            raise ArchivoIlegible("No se pudo leer el primer fotograma")
        self.alto, self.ancho = primero.shape[:2]
        self._actual = 0

    @property
    def n(self) -> int:
        return len(self.tiempos)

    def indice_en(self, t: float) -> int:
        """Fotograma visible en el instante ``t`` (último con marca ≤ t)."""
        return max(0, min(self.n - 1, bisect.bisect_right(self.tiempos, self.t0 + t + 1e-6) - 1))

    def leer(self, idx: int) -> np.ndarray:
        idx = max(0, min(self.n - 1, idx))
        if self._actual < idx <= self._actual + 90:
            # Avanzar descartando es más barato que saltar (el salto decodifica desde un fotograma clave)
            while self._actual + 1 < idx:
                if not self.cap.grab():
                    break
                self._actual += 1
        if idx != self._actual + 1:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = self.cap.read()
        if not ok or frame is None:
            raise ArchivoIlegible(f"No se pudo leer el fotograma {idx}")
        self._actual = idx
        return frame

    def close(self) -> None:
        self.cap.release()


@dataclass
class ResultadoExtraccion:
    frames: List[Dict[str, Any]]
    duracion: float
    ventana: Tuple[float, float]
    gatillo: Optional[Dict[str, Any]] = None
    muestras_escaneo: int = 0
    con_persona: int = 0
    advertencias: List[str] = field(default_factory=list)
    meta: Dict[str, Any] = field(default_factory=dict)


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


def _escanear(lector: LectorVideo, detector: Detector, dur: float):
    """Muestrea el video y devuelve (escaneo, índice del primer gatillo confirmado, info)."""
    pasos = max(12, min(MAX_MUESTRAS_ESCANEO, math.floor(dur / PASO_ESCANEO_S)))
    dt = dur / (pasos + 1)
    lag = max(1, round(LAG_DELTA_S / dt))
    escaneo: List[Tuple[float, Optional[Dict[str, Any]], Dict[str, Any]]] = []
    for i in range(pasos + 1):
        t = i * dt
        landmarks = _detectar(detector, a_lienzo(lector.leer(lector.indice_en(min(t, dur - 0.05)))))
        angles = angulos_si_visible(landmarks)
        trig: Dict[str, Any] = {"triggered": False}
        if angles:
            # Referencia para el gatillo por cambio angular: la muestra con pose ~0.19 s antes
            prev = next((escaneo[j][1] for j in range(i - lag, -1, -1) if escaneo[j][1]), None)
            trig = check_exercise_trigger_pose(angles, prev)
        escaneo.append((t, angles, trig))

    for i in range(len(escaneo)):
        racha = escaneo[i:i + CONFIRMACION_GATILLO]
        if len(racha) == CONFIRMACION_GATILLO and all(r[2].get("triggered") for r in racha):
            return escaneo, i, {**escaneo[i][2], "t": escaneo[i][0]}
    # Video muy corto o gesto muy breve: se acepta un gatillo aislado
    for i, (t, _, trig) in enumerate(escaneo):
        if trig.get("triggered"):
            return escaneo, i, {**trig, "t": t}
    return escaneo, -1, None


def _advertencias(lector: Optional[LectorVideo], frames: List[Dict[str, Any]], duracion_real: float) -> List[str]:
    avisos: List[str] = []
    if lector is not None:
        if duracion_real < 1.0:
            avisos.append("El video dura menos de 1 segundo; graba de 3 a 5 segundos para capturar el gesto completo.")
        if duracion_real > DURACION_MAX_S:
            avisos.append(f"El video dura {duracion_real:.0f} s; solo se analizaron los primeros {DURACION_MAX_S:.0f} s.")
        if lector.alto > lector.ancho:
            avisos.append("Video vertical: se analizó sin deformarlo, pero la grabación horizontal de perfil da mejores medidas.")
        if lector.fps < 20:
            avisos.append(f"Frecuencia baja ({lector.fps:.0f} fps): los gestos rápidos pueden quedar entre fotogramas.")
    con_pose = [f for f in frames if f["landmarks"]]
    validos = [f for f in frames if f["angles"]]
    if con_pose and len(validos) < len(frames):
        avisos.append(f"En {len(frames) - len(validos)} de {len(frames)} fotogramas el cuerpo no se ve completo; "
                      "esos fotogramas no se usaron para medir.")
    tobillos_ocultos = sum(1 for f in con_pose if min(f["landmarks"][27].get("visibility", 1), f["landmarks"][28].get("visibility", 1)) < 0.5)
    if con_pose and tobillos_ocultos > len(con_pose) / 2:
        avisos.append("Los pies quedan fuera del encuadre o tapados: aléjate para que se vea el cuerpo completo.")
    alturas = []
    for f in validos:
        ys = [f["landmarks"][i]["y"] for i in (0, 27, 28)]
        alturas.append(max(ys) - min(ys))
    if alturas and float(np.median(alturas)) < 0.4:
        avisos.append("La persona se ve pequeña en el encuadre; acércate un poco (cuerpo completo ocupando casi todo el alto).")
    return avisos


def extraer_video(ruta: Union[str, Path], detector: Detector, n: int = 8,
                  habilidad: Optional[str] = None) -> ResultadoExtraccion:
    """Escanea el video, localiza el ángulo inicial y extrae ``n`` fotogramas equiespaciados."""
    if n < 2:
        raise ValueError("Se necesitan al menos 2 fotogramas")
    lector = LectorVideo(ruta)
    try:
        dur = max(DURACION_MIN_S, min(lector.duracion, DURACION_MAX_S))
        escaneo, primer, info = _escanear(lector, detector, dur)
        inicio, fin = ventana_de_accion(escaneo, dur, primer)
        tiempos = [inicio + (fin - inicio) * k / (n - 1) for k in range(n)]

        pista = info["skillHint"] if info and info["skillHint"] in FASES else None
        fases = list(FASES[pista])
        if info:
            fases[0] = f"Fase 1: Ángulo Inicial ({info['reason']})"

        frames = []
        for k, t in enumerate(tiempos):
            centro = lector.indice_en(min(max(t, 0.0), dur - 0.05))
            vecinos = range(max(0, centro - VECINOS_SUAVIZADO), min(lector.n, centro + VECINOS_SUAVIZADO + 1))
            lienzos = {i: a_lienzo(lector.leer(i)) for i in vecinos}
            landmarks = mediana_landmarks([_detectar(detector, lz) for lz in lienzos.values()])
            f = _armar_fotograma(lienzos[centro], landmarks, t, fases[k] if k < len(fases) else f"Fase {k + 1}")
            if k == 0 and info:
                f["isInitialTrigger"], f["triggerInfo"] = True, info
            frames.append(f)
        avisos = _advertencias(lector, frames, lector.duracion)
        meta = {"ancho": lector.ancho, "alto": lector.alto, "fps": round(lector.fps, 2),
                "duracion_s": round(lector.duracion, 3), "fotogramas": lector.n}
    finally:
        lector.close()

    assign_keyframe_milestones(frames, habilidad)
    return ResultadoExtraccion(frames=frames, duracion=dur, ventana=(inicio, fin), gatillo=info,
                               muestras_escaneo=len(escaneo), con_persona=sum(1 for f in frames if f["angles"]),
                               advertencias=avisos, meta=meta)


def extraer_imagen(origen: Union[str, Path, bytes], detector: Detector, habilidad: Optional[str] = None) -> ResultadoExtraccion:
    """Una foto fija → un único fotograma "Postura Estática"."""
    if isinstance(origen, (bytes, bytearray)):
        bgr = cv2.imdecode(np.frombuffer(origen, np.uint8), cv2.IMREAD_COLOR)
    else:
        bgr = cv2.imread(str(origen), cv2.IMREAD_COLOR)
    if bgr is None:
        raise ArchivoIlegible("No se pudo leer la imagen")
    lienzo = a_lienzo(bgr)
    f = _armar_fotograma(lienzo, _detectar(detector, lienzo), 0.0, "Postura Estática")
    f["time"] = "0.0s"
    frames = [f]
    avisos = _advertencias(None, frames, 0.0)
    if habilidad is None:
        avisos.append("Con una sola foto la detección automática es poco fiable; elige la habilidad o sube un video.")
    assign_keyframe_milestones(frames, habilidad)
    h, w = bgr.shape[:2]
    return ResultadoExtraccion(frames=frames, duracion=0.0, ventana=(0.0, 0.0), con_persona=int(bool(f["angles"])),
                               advertencias=avisos, meta={"ancho": w, "alto": h})


EXTENSIONES_VIDEO = {".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv", ".3gp"}
EXTENSIONES_IMAGEN = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def tipo_de_archivo(nombre: str) -> Optional[str]:
    ext = Path(nombre).suffix.lower()
    if ext in EXTENSIONES_VIDEO:
        return "video"
    if ext in EXTENSIONES_IMAGEN:
        return "imagen"
    return None
