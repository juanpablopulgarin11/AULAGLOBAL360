"""Serie cinemática del video completo (motor v2).

El motor v1 (paridad con ``script.js``) califica con 8 fotogramas sueltos: a ~4 fotogramas por
segundo no puede ver un vuelo de 0,1 s, contar tres saltos seguidos ni medir 5 segundos de
equilibrio. Aquí se usa la pose de todo el video (≈30 muestras/s) para detectar **eventos**:
contacto de cada pie con el suelo, fases de vuelo, despegues y aterrizajes, apoyos unipodales
sostenidos, desplazamiento, velocidades de muñecas y tobillos, y el lado (derecho/izquierdo) que
ejecuta el gesto.

Unidades: los landmarks llegan normalizados al lienzo 16:9 de 640×360 (``extraccion.py``); se
pasan a píxeles del lienzo (espacio isótropo) y las distancias se expresan en **largos de
pierna** (cadera → tobillo), así los umbrales no dependen de la distancia a la cámara ni de la
estatura. ``y`` crece hacia abajo. «Izquierdo/derecho» son los del estudiante (MediaPipe).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

ANCHO, ALTO = 640, 360
VISIBILIDAD_MIN = 0.3
HUECO_MAX_S = 0.25            # huecos de detección que se interpolan
CONTACTO_TOL = 0.10           # pie apoyado: a menos de 10 % de pierna del suelo…
QUIETO_VY = 1.0               # …y casi quieto en vertical (piernas/s): el pie de apoyo no sube ni baja
VUELO_ALTURA = 0.05           # en el vuelo ambos pies están al menos un poco sobre el suelo
ELEVADO_VUELO = 0.08          # pie en el aire para contar vuelo
ELEVADO_SOSTEN = 0.12         # pie libre claramente elevado (equilibrio / pata sola)
SINCRONIA_S = 0.10            # despegue/aterrizaje «simultáneo» de ambos pies
VUELO_MIN_S = 0.05            # un vuelo dura al menos esto (descarta el temblor o el zoom de la cámara)

P = {
    "nariz": 0, "oreja_i": 7, "oreja_d": 8,
    "hombro_i": 11, "hombro_d": 12, "codo_i": 13, "codo_d": 14, "muneca_i": 15, "muneca_d": 16,
    "cadera_i": 23, "cadera_d": 24, "rodilla_i": 25, "rodilla_d": 26, "tobillo_i": 27, "tobillo_d": 28,
    "talon_i": 29, "talon_d": 30, "punta_i": 31, "punta_d": 32,
}
LADOS = {"i": "izquierdo", "d": "derecho"}
OTRO = {"i": "d", "d": "i"}
NUCLEO = [11, 12, 23, 24, 25, 26, 27, 28]

Muestra = Tuple[float, Optional[List[Dict[str, float]]]]


def _rachas(mask: np.ndarray) -> List[Tuple[int, int]]:
    """Intervalos [ini, fin] (inclusive) donde ``mask`` es verdadero."""
    rachas, ini = [], None
    for i, v in enumerate(mask):
        if v and ini is None:
            ini = i
        elif not v and ini is not None:
            rachas.append((ini, i - 1))
            ini = None
    if ini is not None:
        rachas.append((ini, len(mask) - 1))
    return rachas


def _angulo(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
    """Ángulo ABC en grados para series de puntos (n, 2)."""
    ba, bc = a - b, c - b
    cos = np.sum(ba * bc, axis=1) / (np.linalg.norm(ba, axis=1) * np.linalg.norm(bc, axis=1) + 1e-9)
    return np.degrees(np.arccos(np.clip(cos, -1, 1)))


def _mediana_movil(x: np.ndarray, k: int = 3) -> np.ndarray:
    if len(x) < k:
        return x
    r = k // 2
    pad = np.pad(x, [(r, r)] + [(0, 0)] * (x.ndim - 1), mode="edge")
    ventanas = np.stack([pad[i:i + len(x)] for i in range(k)])
    with np.errstate(all="ignore"):
        return np.nanmedian(ventanas, axis=0)


def _r(x: Any, nd: int = 2) -> Any:
    if x is None:
        return None
    if isinstance(x, (bool, np.bool_)):
        return bool(x)
    if isinstance(x, (int, np.integer)):
        return int(x)
    if isinstance(x, (float, np.floating)):
        return None if not np.isfinite(x) else round(float(x), nd)
    return x


@dataclass
class Serie:
    t: np.ndarray                 # (n,) segundos
    pts: np.ndarray               # (n, 33, 2) píxeles del lienzo, NaN si no visible
    valido: np.ndarray            # (n,) pose del núcleo disponible
    z: Optional[np.ndarray] = None   # (n, 33) profundidad relativa de MediaPipe en píxeles (escala de x)

    @classmethod
    def desde_muestras(cls, muestras: Sequence[Muestra]) -> "Serie":
        orden = sorted((m for m in muestras), key=lambda m: m[0])
        n = len(orden)
        t = np.array([m[0] for m in orden], dtype=float)
        pts = np.full((n, 33, 2), np.nan)
        z = np.full((n, 33), np.nan)
        for i, (_, lm) in enumerate(orden):
            if not lm or len(lm) < 33:
                continue
            for j, p in enumerate(lm[:33]):
                vis = p.get("visibility", 1.0)
                if vis is None or vis >= VISIBILIDAD_MIN:
                    pts[i, j] = (p["x"] * ANCHO, p["y"] * ALTO)
                    z[i, j] = (p.get("z") or 0.0) * ANCHO
        serie = cls(t, pts, np.zeros(n, dtype=bool), z)
        serie._interpolar_huecos()
        # Mediana de ~0,07 s contra el temblor de MediaPipe; con pocas muestras/s no se suaviza
        # (a 15 fps una mediana de 3 muestras ya aplanaría un lanzamiento de 0,15 s)
        k = 3 if serie.fps >= 24 else 1
        if k > 1:
            serie.pts = _mediana_movil(serie.pts, k)
        serie.z = _mediana_movil(serie.z, 5 if serie.fps >= 24 else 3)
        serie.valido = ~np.isnan(serie.pts[:, NUCLEO, 0]).any(axis=1)
        return serie

    def _interpolar_huecos(self) -> None:
        if len(self.t) < 2:
            return
        for j in range(33):
            for c in range(2):
                v = self.pts[:, j, c]
                nan = np.isnan(v)
                if nan.all() or not nan.any():
                    continue
                for ini, fin in _rachas(nan):
                    if ini == 0 or fin == len(v) - 1:
                        continue
                    if self.t[fin + 1] - self.t[ini - 1] <= HUECO_MAX_S:
                        a, b = ini - 1, fin + 1
                        v[ini:fin + 1] = np.interp(self.t[ini:fin + 1], [self.t[a], self.t[b]], [v[a], v[b]])
                self.pts[:, j, c] = v

    # -------------------------------------------------------------- acceso
    def p(self, nombre: str) -> np.ndarray:
        return self.pts[:, P[nombre]]

    def medio(self, a: str, b: str) -> np.ndarray:
        return (self.p(a) + self.p(b)) / 2

    @property
    def n(self) -> int:
        return len(self.t)

    @property
    def fps(self) -> float:
        return float(1 / np.median(np.diff(self.t))) if self.n > 1 else 0.0


def calcular_cinematica(muestras: Sequence[Muestra]) -> Dict[str, Any]:
    """Métricas temporales del gesto. ``suficiente`` es falso si no hay pose para medir."""
    s = Serie.desde_muestras(muestras)
    if s.n < 5 or s.valido.sum() < 5:
        return {"suficiente": False, "muestras": int(s.n), "con_pose": int(s.valido.sum())}
    return _Calculo(s).resultado()


class _Calculo:
    def __init__(self, s: Serie) -> None:
        self.s = s
        self.dt = np.gradient(s.t) if s.n > 1 else np.ones(s.n)
        cad = s.medio("cadera_i", "cadera_d")
        tob = s.medio("tobillo_i", "tobillo_d")
        hom = s.medio("hombro_i", "hombro_d")
        self.cadera, self.hombro = cad, hom
        self.L = float(np.nanmedian(np.linalg.norm(cad - tob, axis=1)))          # largo de pierna (px)
        self.L = self.L if np.isfinite(self.L) and self.L > 5 else 100.0
        self.torso = float(np.nanmedian(np.linalg.norm(hom - cad, axis=1)))
        self.vista = self._vista()
        self.dir = self._direccion()
        self._pies()

    # -------------------------------------------------------------- geometría general
    def _vista(self) -> str:
        """Perfil si los hombros casi se superponen; frontal si se ven anchos."""
        ancho = np.linalg.norm(self.s.p("hombro_i") - self.s.p("hombro_d"), axis=1)
        r = float(np.nanmedian(ancho)) / (self.torso or 1)
        return "perfil" if r < 0.35 else ("frontal" if r > 0.6 else "diagonal")

    def _direccion(self) -> int:
        """+1 si avanza (o mira) hacia +x, -1 hacia -x."""
        x = self.cadera[:, 0]
        ok = np.where(~np.isnan(x))[0]
        if len(ok) >= 2 and abs(x[ok[-1]] - x[ok[0]]) > 0.3 * self.L:
            return 1 if x[ok[-1]] > x[ok[0]] else -1
        nariz, orejas = self.s.p("nariz")[:, 0], self.s.medio("oreja_i", "oreja_d")[:, 0]
        d = np.nanmedian(nariz - orejas)
        return 1 if (np.isnan(d) or d >= 0) else -1

    def _pies(self) -> None:
        s, L = self.s, self.L
        self.bajo = {}
        for lado in "id":
            ys = np.stack([s.p(f"tobillo_{lado}")[:, 1], s.p(f"talon_{lado}")[:, 1], s.p(f"punta_{lado}")[:, 1]])
            with np.errstate(all="ignore"):
                self.bajo[lado] = _mediana_movil(np.nanmax(ys, axis=0), 3)
        ambos = np.fmax(self.bajo["i"], self.bajo["d"])
        # Suelo: el punto más bajo de los pies en una ventana de ±0,6 s (en locomoción algún pie toca)
        r = max(1, int(round(0.6 * s.fps)))
        suelo = np.full(s.n, np.nan)
        for k in range(s.n):
            ventana = ambos[max(0, k - r):k + r + 1]
            if not np.isnan(ventana).all():
                suelo[k] = np.nanmax(ventana)
        self.suelo = suelo
        self.altura = {l: (suelo - self.bajo[l]) / L for l in "id"}            # >0: pie sobre el suelo
        # Velocidad vertical de cada pie (suavizada): apoyado = cerca del suelo y casi quieto
        k = _ventana(s.fps, 0.15)
        self.vy = {l: np.abs(np.gradient(_media_movil(self.bajo[l], k), s.t)) / L if s.n > 2 else np.zeros(s.n)
                   for l in "id"}
        # Estados estables: se ignoran parpadeos de ~0,04 s (ruido de la detección)
        n = max(1, int(round(0.04 * s.fps)))
        self.contacto = {l: _estable((self.altura[l] <= CONTACTO_TOL) & (self.vy[l] <= QUIETO_VY), n) for l in "id"}
        self.en_aire = {l: _estable(self.altura[l] > ELEVADO_VUELO, n) for l in "id"}
        self.elevado = {l: _estable(self.altura[l] > ELEVADO_SOSTEN, n) for l in "id"}
        # Vuelo: ningún pie apoyado y ambos algo despegados (en carrera el pie delantero va casi
        # rozando el suelo, así que no se exige que ambos estén altos)
        self.vuelo = (~self.contacto["i"] & ~self.contacto["d"] & (self.altura["i"] > VUELO_ALTURA)
                      & (self.altura["d"] > VUELO_ALTURA) & s.valido)

    # -------------------------------------------------------------- series de ángulos
    def rodilla(self, lado: str) -> np.ndarray:
        s = self.s
        return _angulo(s.p(f"cadera_{lado}"), s.p(f"rodilla_{lado}"), s.p(f"tobillo_{lado}"))

    def p3(self, nombre: str) -> np.ndarray:
        """Punto con profundidad (x, y, z); de perfil la z de MediaPipe es poco fiable y se usa 2D."""
        xy = self.s.p(nombre)
        if self.vista == "perfil" or self.s.z is None:
            return xy
        return np.concatenate([xy, self.s.z[:, P[nombre]][:, None]], axis=1)

    def codo(self, lado: str) -> np.ndarray:
        # De frente la flexión del codo va hacia la cámara: sin profundidad el antebrazo queda en escorzo
        return _angulo(self.p3(f"hombro_{lado}"), self.p3(f"codo_{lado}"), self.p3(f"muneca_{lado}"))

    def flexion_cadera(self, lado: str) -> np.ndarray:
        """0° con el muslo alineado al tronco; crece al llevar la rodilla adelante o atrás."""
        s = self.s
        return 180 - _angulo(s.p(f"hombro_{lado}"), s.p(f"cadera_{lado}"), s.p(f"rodilla_{lado}"))

    def muslo_adelante(self, lado: str) -> np.ndarray:
        """Ángulo con signo del muslo respecto a la vertical (+ hacia la dirección de avance)."""
        d = self.s.p(f"rodilla_{lado}") - self.s.p(f"cadera_{lado}")
        return np.degrees(np.arctan2(self.dir * d[:, 0], d[:, 1]))

    def tronco(self) -> np.ndarray:
        """Inclinación del tronco respecto a la vertical; + hacia adelante (en perfil)."""
        d = self.hombro - self.cadera
        ang = np.degrees(np.arctan2(d[:, 0], -d[:, 1]))
        return ang * self.dir if self.vista != "frontal" else np.abs(ang)

    def inclinacion_hombros(self) -> np.ndarray:
        d = self.s.p("hombro_d") - self.s.p("hombro_i")
        return np.degrees(np.abs(np.arctan2(d[:, 1], np.abs(d[:, 0]) + 1e-9)))

    def velocidad(self, xy: np.ndarray) -> np.ndarray:
        """Rapidez en largos de pierna por segundo (posición suavizada: el ruido no infla la velocidad)."""
        if self.s.n < 3:
            return np.zeros(self.s.n)
        k = _ventana(self.s.fps, 0.1)       # ~0,1 s: atenúa el ruido sin borrar un lanzamiento de 0,15 s
        suave = np.stack([_media_movil(xy[:, 0], k), _media_movil(xy[:, 1], k)], axis=1)
        v = np.gradient(suave, self.s.t, axis=0)
        return np.linalg.norm(v, axis=1) / self.L

    def adelante(self, xy: np.ndarray, ref: np.ndarray) -> np.ndarray:
        """Distancia (en piernas) de ``xy`` por delante de ``ref`` en la dirección de avance."""
        return self.dir * (xy[:, 0] - ref[:, 0]) / self.L

    # -------------------------------------------------------------- eventos
    def _vuelos(self) -> List[Dict[str, Any]]:
        s, vuelos = self.s, []
        minimo = max(1, int(round(VUELO_MIN_S * s.fps)))
        for ini, fin in _rachas(self.vuelo):
            if ini == 0 or fin == s.n - 1:
                continue        # un vuelo debe empezar y terminar dentro del video
            if fin - ini + 1 < minimo:
                continue        # una sola muestra «en el aire» suele ser temblor de la cámara
            ult = {l: self._ultimo(self.contacto[l], ini - 1) for l in "id"}
            prim = {l: self._primero(self.contacto[l], fin + 1) for l in "id"}
            # Pie(s) de despegue: los que tocaron el suelo por última vez justo antes del vuelo
            # (las muestras de transición no cuentan ni como apoyo ni como aire)
            margen = SINCRONIA_S + 0.15
            t_ult = {l: s.t[k] for l, k in ult.items() if k is not None and s.t[ini] - s.t[k] <= margen}
            t_pri = {l: s.t[k] for l, k in prim.items() if k is not None and s.t[k] - s.t[fin] <= margen}
            antes = {l: l in t_ult and max(t_ult.values()) - t_ult[l] <= SINCRONIA_S for l in "id"}
            despues = {l: l in t_pri and t_pri[l] - min(t_pri.values()) <= SINCRONIA_S for l in "id"}
            sinc_desp = all(v is not None for v in ult.values()) and abs(s.t[ult["i"]] - s.t[ult["d"]]) <= SINCRONIA_S
            sinc_ater = all(v is not None for v in prim.values()) and abs(s.t[prim["i"]] - s.t[prim["d"]]) <= SINCRONIA_S
            vuelos.append({
                "ini": ini, "fin": fin, "t": float(s.t[ini]), "duracion": float(s.t[fin] - s.t[ini] + np.median(self.dt)),
                "antes": antes, "despues": despues, "despegue_bipodal": bool(sinc_desp), "aterrizaje_bipodal": bool(sinc_ater),
                "avance": float(self.adelante(self.cadera[fin + 1:fin + 2], self.cadera[ini - 1:ini])[0])
                if not np.isnan(self.cadera[[ini - 1, fin + 1], 0]).any() else 0.0,
            })
        return vuelos

    @staticmethod
    def _ultimo(mask: np.ndarray, desde: int) -> Optional[int]:
        for k in range(desde, -1, -1):
            if mask[k]:
                return k
        return None

    @staticmethod
    def _primero(mask: np.ndarray, desde: int) -> Optional[int]:
        for k in range(desde, len(mask)):
            if mask[k]:
                return k
        return None

    def _saltos_mismo_pie(self, vuelos: List[Dict[str, Any]]) -> Tuple[int, Optional[str]]:
        """Máximo de saltos consecutivos despegando y cayendo en el mismo pie sin apoyar el otro."""
        mejor, lado_mejor, racha, lado, fin_ant = 0, None, 0, None, None
        for v in vuelos:
            pies_antes = [l for l in "id" if v["antes"][l]]
            pies_desp = [l for l in "id" if v["despues"][l]]
            es_hop = len(pies_antes) == 1 and pies_antes == pies_desp
            otro_libre = es_hop and (fin_ant is None or not self.contacto[OTRO[pies_antes[0]]][fin_ant:v["ini"]].any())
            if es_hop and otro_libre and (lado in (None, pies_antes[0])) and racha > 0:
                racha += 1
            elif es_hop:
                racha = 1
            else:
                racha = 0
            lado = pies_antes[0] if es_hop else None
            fin_ant = v["fin"] + 1
            if racha > mejor:
                mejor, lado_mejor = racha, lado
        return mejor, (LADOS[lado_mejor] if lado_mejor else None)

    def _apoyo_unipodal(self) -> Dict[str, Any]:
        """Tramo más largo sobre un pie con el otro claramente elevado (sin vuelo)."""
        s, mejor = self.s, {"segundos": 0.0, "lado": None, "ini": None, "fin": None}
        for apoyo in "id":
            mask = self.contacto[apoyo] & self.elevado[OTRO[apoyo]] & s.valido
            # tolera cortes de hasta 0,15 s (ruido de la detección), no un apoyo real del otro pie
            for ini, fin in _rachas(_cerrar(mask, max(1, int(round(0.15 * s.fps))))):
                seg = float(s.t[fin] - s.t[ini] + np.median(self.dt))
                if seg > mejor["segundos"]:
                    mejor = {"segundos": seg, "lado": apoyo, "ini": ini, "fin": fin}
        return mejor

    def _contactos(self) -> Dict[str, List[int]]:
        """Índices donde cada pie vuelve a apoyar (inicio de contacto)."""
        salida = {}
        for l in "id":
            c = self.contacto[l] & self.s.valido
            salida[l] = [i for i in range(1, self.s.n) if c[i] and not c[i - 1]]
        return salida

    # -------------------------------------------------------------- resultado
    def resultado(self) -> Dict[str, Any]:
        s, L = self.s, self.L
        vuelos = self._vuelos()
        hops, lado_hop = self._saltos_mismo_pie(vuelos)
        uni = self._apoyo_unipodal()
        contactos = self._contactos()
        vel_cadera = self.velocidad(self.cadera)
        movimiento = vel_cadera > 0.4
        x = self.cadera[:, 0]
        ok = np.where(~np.isnan(x))[0]
        desplazamiento = float(self.dir * (x[ok[-1]] - x[ok[0]]) / L) if len(ok) >= 2 else 0.0

        rod = {l: self.rodilla(l) for l in "id"}
        cod = {l: self.codo(l) for l in "id"}
        fcad = {l: self.flexion_cadera(l) for l in "id"}
        tronco = self.tronco()
        incl = self.inclinacion_hombros()
        v_mun = {l: self.velocidad(s.p(f"muneca_{l}")) for l in "id"}
        v_tob = {l: self.velocidad(s.p(f"tobillo_{l}")) for l in "id"}

        r: Dict[str, Any] = {
            "suficiente": True, "version": 2,
            "muestras": s.n, "con_pose": int(s.valido.sum()), "fps_analisis": _r(s.fps, 1),
            "duracion_s": _r(float(s.t[-1] - s.t[0]), 2), "vista": self.vista,
            "direccion": "derecha" if self.dir > 0 else "izquierda",
            "largo_pierna_px": _r(L, 1),
            "desplazamiento_piernas": _r(desplazamiento),
            "velocidad_max_piernas_s": _r(np.nanmax(vel_cadera) if len(vel_cadera) else 0),
            "vuelos": len(vuelos),
            "vuelo_max_s": _r(max((v["duracion"] for v in vuelos), default=0.0)),
            "vuelos_bipodales": sum(1 for v in vuelos if v["despegue_bipodal"] and v["aterrizaje_bipodal"]),
            "saltos_mismo_pie": hops, "lado_saltos": lado_hop,
            "apoyo_unipodal_s": _r(uni["segundos"]), "pie_apoyo": LADOS.get(uni["lado"]) if uni["lado"] else None,
            "contactos_pie": {LADOS[l]: len(v) for l, v in contactos.items()},
        }

        # Alternancia de pies entre vuelos (carrera) y doble apoyo (marcha)
        alternos = 0
        for a, b in zip(vuelos, vuelos[1:]):
            pa = [l for l in "id" if a["despues"][l]]
            pb = [l for l in "id" if b["antes"][l]]
            if len(pa) == 1 and len(pb) == 1 and pa != [l for l in "id" if a["antes"][l]]:
                alternos += 1
        r["vuelos_alternos"] = alternos
        moviendo = movimiento & s.valido
        doble = self.contacto["i"] & self.contacto["d"] & moviendo
        r["doble_apoyo_frac"] = _r(doble.sum() / moviendo.sum()) if moviendo.sum() >= 3 else None

        # Talón → punta al apoyar (solo se ve de perfil)
        if self.vista != "frontal":
            golpes, talon = 0, 0
            for l, idxs in contactos.items():
                for i in idxs:
                    th, pu = s.p(f"talon_{l}")[i, 1], s.p(f"punta_{l}")[i, 1]
                    if np.isnan(th) or np.isnan(pu):
                        continue
                    golpes += 1
                    talon += th >= pu + 0.01 * L
            r["talon_primero_frac"] = _r(talon / golpes) if golpes >= 2 else None
        else:
            r["talon_primero_frac"] = None

        # Ángulos del movimiento
        r["codo_mediana"] = _r(np.nanmedian(np.concatenate([cod["i"][moviendo], cod["d"][moviendo]]))) if moviendo.sum() >= 3 \
            else _r(np.nanmedian(np.concatenate([cod["i"], cod["d"]])))
        r["tronco_mediana"] = _r(np.nanmedian(tronco[moviendo])) if moviendo.sum() >= 3 else _r(np.nanmedian(tronco))
        r["tronco_max_abs"] = _r(np.nanmax(np.abs(tronco)))
        r["inclinacion_hombros_mediana"] = _r(np.nanmedian(incl))
        r["inclinacion_hombros_max"] = _r(np.nanpercentile(incl[~np.isnan(incl)], 90)) if (~np.isnan(incl)).any() else None
        r["rodilla_min"] = _r(np.nanmin(np.concatenate([rod["i"], rod["d"]])))
        # Recobro: flexión mínima de la rodilla de la pierna que va en el aire
        recobro = [rod[l][self.en_aire[l] & s.valido] for l in "id"]
        recobro = np.concatenate(recobro)
        r["recobro_rodilla_min"] = _r(np.nanmin(recobro)) if recobro.size else None
        # Amortiguación del apoyo: flexión de la rodilla que está en el suelo mientras se avanza
        apoyo = [rod[l][self.contacto[l] & moviendo] for l in "id"]
        apoyo = np.concatenate(apoyo)
        r["rodilla_apoyo_min"] = _r(np.nanmin(apoyo)) if apoyo.size else None
        r["oposicion_brazos"] = self._oposicion(moviendo)

        r.update(self._salto(vuelos, rod, cod))
        r.update(self._sosten(uni, rod, cod, tronco, incl))
        r.update(self._pata_sola(vuelos, rod, fcad, hops))
        r.update(self._lanzamiento(v_mun, cod))
        r.update(self._pateo(v_tob, fcad, tronco))
        r.update(self._atrape(cod))
        r.update(self._linea(tronco, incl))
        return r

    def _oposicion(self, moviendo: np.ndarray) -> Optional[float]:
        """Correlación entre el avance de cada brazo y el de la pierna contraria (perfil)."""
        if self.vista == "frontal" or moviendo.sum() < 6:
            return None
        s, cad = self.s, self.cadera
        valores = []
        for brazo in "id":
            m = self.adelante(s.p(f"muneca_{brazo}"), self.hombro)
            p = self.adelante(s.p(f"tobillo_{OTRO[brazo]}"), cad)
            ok = moviendo & ~np.isnan(m) & ~np.isnan(p)
            if ok.sum() >= 6 and np.std(m[ok]) > 1e-3 and np.std(p[ok]) > 1e-3:
                valores.append(np.corrcoef(m[ok], p[ok])[0, 1])
        return _r(float(np.mean(valores))) if valores else None

    def _salto(self, vuelos, rod, cod) -> Dict[str, Any]:
        s = self.s
        principales = [v for v in vuelos if v["despegue_bipodal"]] or vuelos
        if not principales:
            return {"salto": None}
        v = max(principales, key=lambda x: x["duracion"])
        ini, fin = v["ini"], v["fin"]
        prep = slice(max(0, ini - int(0.8 * s.fps)), ini)
        desp = slice(max(0, ini - int(0.15 * s.fps)), ini + 1)
        ater = slice(fin + 1, min(s.n, fin + 1 + int(0.35 * s.fps)))
        tras = slice(fin + 1, min(s.n, fin + 1 + int(1.0 * s.fps)))
        rodillas = np.fmin(rod["i"], rod["d"])
        rodillas_max = np.fmax(rod["i"], rod["d"])
        munecas = s.medio("muneca_i", "muneca_d")
        brazos_atras = self.adelante(munecas, self.cadera)[prep]
        brazos_arriba = (self.hombro[:, 1] - munecas[:, 1]) / self.L         # >0: muñecas sobre hombros
        brazos_adelante = self.adelante(munecas, self.hombro)
        pasos_extra = sum(1 for l in "id" for i in range(tras.start + 1 + int(SINCRONIA_S * s.fps), tras.stop)
                          if self.contacto[l][i] and not self.contacto[l][i - 1])
        vuelos_extra = sum(1 for w in vuelos if tras.start <= w["ini"] < tras.stop)
        manos_suelo = bool(np.nanmax(munecas[tras, 1] - self.suelo[tras] + 0.15 * self.L, initial=-1) > 0) \
            if tras.stop > tras.start else False
        return {"salto": {
            "duracion_s": _r(v["duracion"]), "avance_piernas": _r(v["avance"]),
            "despegue_bipodal": v["despegue_bipodal"], "aterrizaje_bipodal": v["aterrizaje_bipodal"],
            "rodilla_preparacion": _r(np.nanmin(rodillas[prep])) if prep.stop > prep.start else None,
            "brazos_atras": _r(np.nanmin(brazos_atras)) if brazos_atras.size else None,
            "rodilla_despegue": _r(np.nanmax(rodillas_max[desp])),
            "brazos_despegue_arriba": _r(np.nanmax(brazos_arriba[desp.start:fin + 1])),
            "brazos_despegue_adelante": _r(np.nanmax(brazos_adelante[desp.start:fin + 1])),
            "rodilla_aterrizaje": _r(np.nanmin(rodillas[ater])) if ater.stop > ater.start else None,
            "pasos_tras_aterrizar": pasos_extra, "vuelos_tras_aterrizar": vuelos_extra,
            "manos_al_suelo": manos_suelo,
            "tronco_tras_aterrizar": _r(np.nanmax(np.abs(self.tronco()[tras]))) if tras.stop > tras.start else None,
        }}

    def _sosten(self, uni, rod, cod, tronco, incl) -> Dict[str, Any]:
        if not uni["lado"]:
            return {"sosten": None}
        s, a, l = self.s, uni["lado"], OTRO[uni["lado"]]
        tramo = slice(uni["ini"], uni["fin"] + 1)
        munecas_bajas = []
        for lado in "id":
            m, h, c = s.p(f"muneca_{lado}")[tramo], s.p(f"hombro_{lado}")[tramo], s.p(f"cadera_{lado}")[tramo]
            # brazo «a los costados»: muñeca por debajo del hombro y cerca de la línea de la cadera
            bajo = (m[:, 1] - h[:, 1]) > 0.45 * self.torso
            cerca = np.abs(m[:, 0] - c[:, 0]) < 0.6 * self.torso
            munecas_bajas.append(bajo & cerca)
        brazos = np.mean(munecas_bajas[0] & munecas_bajas[1]) if self.torso else 0
        libre_rod = rod[l][tramo]
        rodilla_libre_arriba = (s.p(f"rodilla_{a}")[tramo, 1] - s.p(f"rodilla_{l}")[tramo, 1]) / self.L
        return {"sosten": {
            "segundos": _r(uni["segundos"]), "pie_apoyo": LADOS[a],
            "brazos_costados_frac": _r(brazos),
            "tronco_max": _r(np.nanmax(np.abs(tronco[tramo]))),
            "inclinacion_hombros_max": _r(np.nanpercentile(incl[tramo], 90)) if (~np.isnan(incl[tramo])).any() else None,
            "rodilla_apoyo": _r(np.nanmedian(rod[a][tramo])),
            "rodilla_libre": _r(np.nanmedian(libre_rod)),
            "rodilla_libre_elevada": _r(np.nanmedian(rodilla_libre_arriba)),
        }}

    def _pata_sola(self, vuelos, rod, fcad, hops) -> Dict[str, Any]:
        if hops < 1:
            return {"pata_sola": None}
        s = self.s
        recepciones, controladas = 0, 0
        lados = []
        for v in vuelos:
            pies = [l for l in "id" if v["despues"][l]]
            if len(pies) != 1:
                continue
            l = pies[0]
            lados.append(l)
            recepciones += 1
            ater = slice(v["fin"] + 1, min(s.n, v["fin"] + 1 + int(0.3 * s.fps)))
            flex = np.nanmin(rod[l][ater]) if ater.stop > ater.start else np.nan
            otro_apoya = self.contacto[OTRO[l]][ater].any()
            controladas += bool(np.isfinite(flex) and flex <= 160 and not otro_apoya)
        apoyo = max(set(lados), key=lados.count) if lados else "d"
        libre = OTRO[apoyo]
        rango_libre = float(np.nanmax(fcad[libre]) - np.nanmin(fcad[libre])) if (~np.isnan(fcad[libre])).any() else 0.0
        return {"pata_sola": {
            "recepciones": recepciones, "recepciones_controladas": controladas,
            "rango_cadera_libre": _r(rango_libre), "pie": LADOS[apoyo],
        }}

    def _lanzamiento(self, v_mun, cod) -> Dict[str, Any]:
        s = self.s
        picos = {l: (np.nanmax(v) if (~np.isnan(v)).any() else 0.0) for l, v in v_mun.items()}
        brazo = max(picos, key=picos.get)
        k = int(np.nanargmax(v_mun[brazo])) if picos[brazo] > 0 else 0
        alrededor = slice(max(0, k - int(0.10 * s.fps)), min(s.n, k + int(0.15 * s.fps) + 1))
        antes = slice(max(0, k - int(0.8 * s.fps)), min(s.n, k + int(0.1 * s.fps) + 1))
        mun, hom = s.p(f"muneca_{brazo}"), s.p(f"hombro_{brazo}")
        sobre_hombro = bool(np.nanmax((hom[antes, 1] - mun[antes, 1]) / self.L, initial=-1) > 0.05)
        # Sentido del lanzamiento: hacia donde se mueve la muñeca en el pico
        vx = np.gradient(mun[:, 0], s.t)[k] if s.n > 1 else 0
        sentido = 1 if vx >= 0 else -1
        contra = OTRO[brazo]
        pie_c = s.p(f"tobillo_{contra}")[k, 0]
        pie_m = s.p(f"tobillo_{brazo}")[k, 0]
        adelantado = _r(sentido * (pie_c - pie_m) / self.L) if not (np.isnan(pie_c) or np.isnan(pie_m)) else None
        ancho = np.linalg.norm(s.p("hombro_i") - s.p("hombro_d"), axis=1) / self.L
        ventana = slice(max(0, k - int(0.6 * s.fps)), min(s.n, k + int(0.3 * s.fps) + 1))
        rot = float(np.nanmax(ancho[ventana]) - np.nanmin(ancho[ventana])) if (~np.isnan(ancho[ventana])).any() else 0.0
        return {"lanzamiento": {
            "brazo": LADOS[brazo], "velocidad_muneca": _r(picos[brazo]), "t_suelta": _r(float(s.t[k])),
            "muneca_sobre_hombro": sobre_hombro,
            "codo_suelta": _r(np.nanmax(cod[brazo][alrededor])),
            "pie_contrario_adelante": adelantado,
            "rotacion_tronco": _r(rot),
        }}

    def _pateo(self, v_tob, fcad, tronco) -> Dict[str, Any]:
        s = self.s
        picos = {l: (np.nanmax(v) if (~np.isnan(v)).any() else 0.0) for l, v in v_tob.items()}
        pierna = max(picos, key=picos.get)
        k = int(np.nanargmax(v_tob[pierna])) if picos[pierna] > 0 else 0
        apoyo = OTRO[pierna]
        ventana = slice(max(0, k - int(0.5 * s.fps)), min(s.n, k + int(0.5 * s.fps) + 1))
        brazo = s.p(f"muneca_{apoyo}")            # brazo contrario a la pierna que patea
        avance_brazo = self.adelante(brazo, self.hombro)[ventana]
        tob = self.adelante(s.p(f"tobillo_{pierna}"), self.cadera)
        despues = slice(k, min(s.n, k + int(0.25 * s.fps) + 1))
        retorno = slice(k, min(s.n, k + int(1.2 * s.fps) + 1))
        return {"pateo": {
            "pierna": LADOS[pierna], "velocidad_tobillo": _r(picos[pierna]), "t_impacto": _r(float(s.t[k])),
            "apoyo_firme": bool(self.contacto[apoyo][k]),
            "rango_cadera": _r(float(np.nanmax(fcad[pierna][ventana]) - np.nanmin(fcad[pierna][ventana])))
            if (~np.isnan(fcad[pierna][ventana])).any() else None,
            "rango_brazo_contrario": _r(float(np.nanmax(avance_brazo) - np.nanmin(avance_brazo))) if (~np.isnan(avance_brazo)).any() else None,
            "tronco_impacto": _r(float(tronco[k])) if np.isfinite(tronco[k]) else None,
            "seguimiento": _r(float(np.nanmax(tob[despues]) - tob[k])) if np.isfinite(tob[k]) else None,
            "retorna_al_suelo": bool(self.contacto[pierna][retorno][1:].any()) if retorno.stop - retorno.start > 1 else False,
        }}

    def _atrape(self, cod) -> Dict[str, Any]:
        s = self.s
        ancho_hombros = np.linalg.norm(s.p("hombro_i") - s.p("hombro_d"), axis=1)
        ref = np.nanmedian(ancho_hombros) if (~np.isnan(ancho_hombros)).any() else self.torso * 0.5
        ref = ref if self.vista != "perfil" else self.torso * 0.5
        dist = np.linalg.norm(s.p("muneca_i") - s.p("muneca_d"), axis=1) / (ref or 1)
        if np.isnan(dist).all():
            return {"atrape": None}
        # Contacto: la primera vez que las manos llegan cerca de su distancia mínima (no el mínimo
        # absoluto, que con ruido puede caer mucho después de atrapar)
        minimo = float(np.nanmin(dist))
        k = int(np.argmax(dist <= minimo + 0.1))
        antes = slice(max(0, k - int(0.4 * s.fps)), max(1, k))
        despues = slice(k, min(s.n, k + int(0.5 * s.fps) + 1))
        codos = _media_movil(np.fmin(cod["i"], cod["d"]), 3)
        flex = float(codos[k] - np.nanmin(codos[despues])) if np.isfinite(codos[k]) else 0.0
        return {"atrape": {
            "manos_juntas": _r(float(dist[k])), "t_contacto": _r(float(s.t[k])),
            "codos_espera": _r(np.nanmedian(np.concatenate([cod["i"][antes], cod["d"][antes]]))),
            "flexion_amortigua": _r(flex),
        }}

    def _linea(self, tronco, incl) -> Dict[str, Any]:
        """Equilibrio dinámico: postura, brazos y oscilación lateral mientras camina."""
        s = self.s
        cruz = []
        for lado in "id":
            m, h = s.p(f"muneca_{lado}"), s.p(f"hombro_{lado}")
            # brazos «en cruz»: muñeca a la altura del hombro y separada lateralmente del cuerpo
            cruz.append((np.abs(m[:, 1] - h[:, 1]) < 0.35 * self.torso) & (np.abs(m[:, 0] - h[:, 0]) > 0.6 * self.torso))
        x_cad = self.cadera[:, 0] / self.L
        oscilacion = float(np.nanstd(x_cad - _mediana_movil(x_cad, 9))) if self.vista == "frontal" else None
        ancho_paso = np.abs(s.p("tobillo_i")[:, 0] - s.p("tobillo_d")[:, 0]) / self.L
        return {"linea": {
            "brazos_cruz_frac": _r(float(np.mean(cruz[0] | cruz[1]))) if self.vista != "perfil" else None,
            "oscilacion_lateral": _r(oscilacion, 3),
            "ancho_paso": _r(np.nanmedian(ancho_paso)) if self.vista == "frontal" else None,
        }}


def _ventana(fps: float, segundos: float) -> int:
    """Número impar de muestras que cubre ``segundos`` (1 = sin suavizar)."""
    k = int(round(segundos * fps))
    return max(1, k if k % 2 else k + 1) if k > 1 else 1


def _media_movil(x: np.ndarray, k: int) -> np.ndarray:
    if len(x) < k:
        return x
    r = k // 2
    pad = np.pad(x, (r, r), mode="edge")
    with np.errstate(all="ignore"):
        return np.nanmean(np.stack([pad[i:i + len(x)] for i in range(k)]), axis=0)


def _estable(mask: np.ndarray, n: int) -> np.ndarray:
    """Une huecos de hasta ``n`` muestras y descarta rachas de hasta ``n`` muestras (histéresis temporal)."""
    salida = _cerrar(mask, n)
    for ini, fin in _rachas(salida):
        if fin - ini + 1 <= n and 0 < ini and fin < len(mask) - 1:
            salida[ini:fin + 1] = False
    return salida


def _cerrar(mask: np.ndarray, hueco: int) -> np.ndarray:
    """Une rachas separadas por huecos de hasta ``hueco`` muestras."""
    salida = mask.copy()
    for ini, fin in _rachas(~mask):
        if ini > 0 and fin < len(mask) - 1 and fin - ini + 1 <= hueco:
            salida[ini:fin + 1] = True
    return salida
