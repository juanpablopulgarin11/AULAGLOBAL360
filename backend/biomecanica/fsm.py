"""Máquinas de estado cinemáticas por habilidad (port de ``script.js:1002-1340``).

Avanzan como máximo un estado por fotograma. Solo alimentan el texto de "fases completadas"
del resumen y del prompt; no afectan al puntaje.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from .geometria import angulo_2d
from .landmarks import NUM_LANDMARKS, Punto, normalizar


class FSMBase:
    nombre = ""
    estado_inicial = ""

    def __init__(self) -> None:
        self.estado = self.estado_inicial
        self.transiciones: List[Dict[str, Any]] = []
        self._fases: Dict[str, None] = {}   # conjunto ordenado por inserción, como Set de JS

    @property
    def fases_cumplidas(self) -> List[str]:
        return list(self._fases)

    def _fase(self, nombre: str) -> None:
        self._fases[nombre] = None

    def _ir(self, estado: str, idx: int, t: float, desc: str, fase: str, **extra: Any) -> None:
        self.estado = estado
        self.transiciones.append({"estado": estado, "idx": idx, "t": t, **extra, "desc": desc})
        self._fase(fase)

    def procesar_frame(self, idx: int, t: float, lm: Optional[List[Punto]], a: Optional[Dict[str, Any]]) -> None:
        if not lm or len(lm) < NUM_LANDMARKS or not a:
            return
        self._paso(idx, t, lm, a)

    def _paso(self, idx: int, t: float, lm: List[Punto], a: Dict[str, Any]) -> None:  # pragma: no cover
        raise NotImplementedError

    def to_dict(self) -> Dict[str, Any]:
        return {"nombre": self.nombre, "estado": self.estado, "transiciones": self.transiciones,
                "fasesCumplidas": self.fases_cumplidas}


class SaltoHorizontalFSM(FSMBase):
    nombre = "Salto Horizontal"
    estado_inicial = "REPOSO"

    def __init__(self) -> None:
        super().__init__()
        self.y_cadera_inicial: Optional[float] = None
        self.min_knee_angle = 180
        self.max_flight_elevation = 0.0

    def _paso(self, idx, t, lm, a):
        rodilla = angulo_2d(lm[24], lm[26], lm[28])
        y = (lm[23].y + lm[24].y) / 2
        self.min_knee_angle = min(self.min_knee_angle, rodilla)
        extra = {"anguloRodilla": rodilla, "yActualCadera": y}

        if self.estado == "REPOSO":
            if self.y_cadera_inicial is None:
                self.y_cadera_inicial = y
            self._fase("REPOSO")
            if rodilla < 142 or a["kneeMin"] < 142:
                self._ir("CONTRAMOVIMIENTO (BAJANDO)", idx, t, "Inicio de flexión preparatoria", "CONTRAMOVIMIENTO", **extra)
        elif self.estado == "CONTRAMOVIMIENTO (BAJANDO)":
            if rodilla > 110 and y < self.y_cadera_inicial + 0.02:
                self._ir("PROPULSIÓN (SUBIENDO)", idx, t, "Empuje y despegue simultáneo", "PROPULSION", **extra)
        elif self.estado == "PROPULSIÓN (SUBIENDO)":
            self.max_flight_elevation = max(self.max_flight_elevation, self.y_cadera_inicial - y)
            # El JS también miraba angles.flightDetected, que no existe por fotograma (rama muerta)
            if rodilla > 158 and y < self.y_cadera_inicial - 0.035:
                self._ir("EN EL AIRE (VUELO)", idx, t, "🦘 Vuelo Bipodal Evidenciado", "VUELO", **extra, isPeak=True)
        elif self.estado == "EN EL AIRE (VUELO)":
            if y >= self.y_cadera_inicial - 0.02 and rodilla < 155:
                self._ir("ATERRIZAJE", idx, t, "🦿 Aterrizaje y Amortiguación", "ATERRIZAJE", **extra, isSubPeak=True)


class PatearFSM(FSMBase):
    nombre = "Patear"
    estado_inicial = "APROXIMACION"

    def _paso(self, idx, t, lm, a):
        x_diff = a.get("ankleXDiff") or 0
        hip = a.get("hipAngle") or 0
        knee_diff = a.get("kneeDiff") or 0
        if self.estado == "APROXIMACION":
            self._fase("APROXIMACION")
            if a["isLegStraddle"] or knee_diff >= 20 or x_diff >= 0.08:
                self._ir("APOYO_CARGA", idx, t, "Apoyo monopodal y pierna atrás", "CARGA")
        elif self.estado == "APOYO_CARGA":
            if x_diff >= 0.11 or hip >= 17:
                self._ir("PENDULO_GOLPEO", idx, t, "Péndulo anterior hacia el balón", "PENDULO")
        elif self.estado == "PENDULO_GOLPEO":
            if x_diff >= 0.13 or (a["isLegStraddle"] and a["kneeMax"] >= 148):
                self._ir("IMPACTO", idx, t, "⚽ Pateada Evidenciada (Impacto)", "IMPACTO", isPeak=True)
        elif self.estado == "IMPACTO":
            self._ir("RECOBRO", idx, t, "Acompañamiento y frenado", "RECOBRO")


class CarreraFSM(FSMBase):
    nombre = "Carrera"
    estado_inicial = "INICIO_PROPULSION"

    def __init__(self) -> None:
        super().__init__()
        self.max_stride = 0

    def _paso(self, idx, t, lm, a):
        hip = a.get("hipAngle") or 0
        trunk = a.get("trunkLean") or 0
        self.max_stride = max(self.max_stride, hip)
        if self.estado == "INICIO_PROPULSION":
            self._fase("INICIO")
            if trunk >= 10 or a["ankleXDiff"] >= 0.10:
                self._ir("TRACCION_METATARSAL", idx, t, "Empuje y braceo enérgico", "TRACCION")
        elif self.estado == "TRACCION_METATARSAL":
            if hip >= 25 or a["ankleXDiff"] >= 0.13:
                self._ir("MAXIMA_ZANCADA_VUELO", idx, t, "🏃 Zancada y Vuelo Evidenciado", "VUELO_ZANCADA", isPeak=True)
        elif self.estado == "MAXIMA_ZANCADA_VUELO":
            self._ir("RECOBRO_RECIPROCO", idx, t, "Contacto y pasaje de rodilla libre", "RECOBRO")


class LanzarFSM(FSMBase):
    nombre = "Lanzamiento Sobre Hombro"
    estado_inicial = "PREPARACION"

    def _paso(self, idx, t, lm, a):
        wrist_high = a["wristAboveShoulder"]
        elbow_diff = a.get("elbowDiff") or 0
        if self.estado == "PREPARACION":
            self._fase("PREPARACION")
            if wrist_high or (elbow_diff >= 22 and a["elbowMin"] <= 112):
                self._ir("ARMADO_POSTERIOR", idx, t, "Armado tras la cabeza", "ARMADO")
        elif self.estado == "ARMADO_POSTERIOR":
            if a["elbowMax"] >= 135 and wrist_high:
                self._ir("SOLTADA_LANZAMIENTO", idx, t, "⚾ Lanzamiento Evidenciado (Soltada)", "SOLTADA", isPeak=True)
        elif self.estado == "SOLTADA_LANZAMIENTO":
            self._ir("DESACELERACION", idx, t, "Brazo cruza el torso y desacelera", "DESACELERACION")


class AtraparFSM(FSMBase):
    nombre = "Recepción y Atrape"
    estado_inicial = "ESPERA"

    def __init__(self) -> None:
        super().__init__()
        self.min_wrist = 1.0

    def _paso(self, idx, t, lm, a):
        w = a.get("wristDist") or 0.5
        self.min_wrist = min(self.min_wrist, w)
        if self.estado == "ESPERA":
            self._fase("ESPERA")
            if 70 <= a["elbowAvg"] <= 130:
                self._ir("APROXIMACION_MANOS", idx, t, "Brazos al frente en copa", "APROXIMACION")
        elif self.estado == "APROXIMACION_MANOS":
            if w <= 0.28:
                self._ir("CONTACTO_ATRAPE", idx, t, "🧤 Atrape Evidenciado (Manos en copa)", "CONTACTO", isPeak=True)
        elif self.estado == "CONTACTO_ATRAPE":
            self._ir("AMORTIGUACION_PECHO", idx, t, "Retención hacia el pecho", "AMORTIGUACION")


class SaltoUnipodalFSM(FSMBase):
    nombre = "Salto Unipodal"
    estado_inicial = "APOYO_UNIPODAL"

    def _paso(self, idx, t, lm, a):
        y_diff = a.get("ankleYDiff") or 0
        knee_diff = a.get("kneeDiff") or 0
        if self.estado == "APOYO_UNIPODAL":
            self._fase("APOYO")
            if a["kneeMin"] <= 140 and y_diff >= 0.035:
                self._ir("FLEXION_IMPULSO", idx, t, "Flexión preparatoria unipodal", "IMPULSO")
        elif self.estado == "FLEXION_IMPULSO":
            if y_diff >= 0.05 and knee_diff >= 25:
                self._ir("VUELO_UNIPODAL", idx, t, "🦿 Despegue Unipodal Evidenciado", "VUELO", isPeak=True)
        elif self.estado == "VUELO_UNIPODAL":
            if a["kneeMin"] <= 150:
                self._ir("ATERRIZAJE_UNIPODAL", idx, t, "Amortiguación sobre el mismo pie", "ATERRIZAJE")


class EquilibrioEstaticoFSM(FSMBase):
    nombre = "Equilibrio Estático Unipodal"
    estado_inicial = "INICIO_BIPODAL"

    def __init__(self) -> None:
        super().__init__()
        self.hold_count = 0

    def _paso(self, idx, t, lm, a):
        doblada = a["kneeMax"] >= 145 and a["kneeMin"] <= 125 and a["kneeDiff"] >= 30
        elevada = a["ankleYDiff"] >= 0.04
        pie_arriba = a["unipodalFootRaised"] or doblada or elevada
        if self.estado == "INICIO_BIPODAL":
            self._fase("INICIO")
            if pie_arriba:
                self._ir("ELEVACION_PIERNA", idx, t, "Despegue de la pierna libre", "ELEVACION")
        elif self.estado in ("ELEVACION_PIERNA", "SOSTEN_FLAMENCO"):
            if a["unipodalMaintained"] or (doblada and elevada) or (a["unipodalFootRaised"] and (a.get("shoulderTilt") or 0) <= 10):
                self.hold_count += 1
                if self.hold_count >= 2 and self.estado != "SOSTEN_FLAMENCO":
                    self._ir("SOSTEN_FLAMENCO", idx, t, "🦩 Sostén Unipodal Evidenciado", "SOSTEN", isPeak=True)


class EquilibrioDinamicoFSM(FSMBase):
    nombre = "Equilibrio Dinámico"
    estado_inicial = "INICIO_EJE"

    def _paso(self, idx, t, lm, a):
        if self.estado == "INICIO_EJE":
            self._fase("INICIO")
            self._ir("PASO_TANDEM", idx, t, "🧘 Pasaje en Línea Evidenciado", "PASO_TANDEM", isPeak=True)
        elif self.estado == "PASO_TANDEM":
            self._ir("CONTROL_EQUILIBRIO", idx, t, "Brazos equilibradores y control", "CONTROL")


class MarchaFSM(FSMBase):
    nombre = "Marcha"
    estado_inicial = "INICIO_CONTACTO"

    def _paso(self, idx, t, lm, a):
        if self.estado == "INICIO_CONTACTO":
            self._fase("CONTACTO")
            self._ir("PASAJE_TALON", idx, t, "🚶 Contacto y Pasaje Evidenciado", "PASAJE", isPeak=True)
        elif self.estado == "PASAJE_TALON":
            self._ir("DESPEGUE_OSCILACION", idx, t, "Transición continua del paso", "OSCILACION")


def crear_fsm(habilidad: Optional[str]) -> FSMBase:
    s = (habilidad or "").lower()
    if "salto horizontal" in s or ("salto" in s and "unipodal" not in s):
        return SaltoHorizontalFSM()
    if "pate" in s:
        return PatearFSM()
    if "corre" in s or "carrera" in s:
        return CarreraFSM()
    if "lanz" in s or "arroja" in s or "hombro" in s:
        return LanzarFSM()
    if "atrap" in s or "recep" in s:
        return AtraparFSM()
    if "unipodal" in s and "salto" in s:
        return SaltoUnipodalFSM()
    if "estatico" in s or "estático" in s or "flamenco" in s:
        return EquilibrioEstaticoFSM()
    if "dinamico" in s or "dinámico" in s or "linea" in s or "viga" in s:
        return EquilibrioDinamicoFSM()
    return MarchaFSM()


def ejecutar_fsm(frames: Sequence[Dict[str, Any]], habilidad: Optional[str]) -> FSMBase:
    fsm = crear_fsm(habilidad)
    for idx, f in enumerate(frames):
        lm, a = f.get("landmarks"), f.get("angles")
        if lm and a:
            fsm.procesar_frame(idx, f.get("timestampNum") or (idx * 0.2), normalizar(lm), a)
    return fsm
