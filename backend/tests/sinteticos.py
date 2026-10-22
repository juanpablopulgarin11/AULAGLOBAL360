"""Movimientos sintéticos con cinemática directa para probar el motor v2 sin videos.

Una figura de proporciones infantiles (pierna = 1 unidad) se anima con ángulos articulares en
función del tiempo y se proyecta al lienzo 640×360 como 33 landmarks de MediaPipe. La altura
de la cadera se ajusta para que el pie más bajo toque el suelo, más un ``despegue`` que crea los
vuelos. Así cada prueba conoce la respuesta correcta (vuelos, apoyos, lado, segundos…).
"""
from __future__ import annotations

import math
from typing import Callable, Dict, List, Optional, Tuple

ESCALA = 120          # píxeles por largo de pierna
SUELO = 330           # y del suelo en el lienzo
FPS = 30

Muestras = List[Tuple[float, List[Dict[str, float]]]]


def _pt(x: float, y: float, z: float = 0.0) -> Dict[str, float]:
    return {"x": x / 640, "y": y / 360, "z": z / 640, "visibility": 0.99}


def _sen(g: float) -> float:
    return math.sin(math.radians(g))


def _cos(g: float) -> float:
    return math.cos(math.radians(g))


def _pierna(cadera: Tuple[float, float], muslo: float, rodilla: float, pie: float, d: int):
    """Rodilla, tobillo, talón y punta (unidades de pierna, y hacia arriba)."""
    rx, ry = cadera[0] + 0.5 * _sen(muslo) * d, cadera[1] - 0.5 * _cos(muslo)
    ax, ay = rx + 0.5 * _sen(muslo - rodilla) * d, ry - 0.5 * _cos(muslo - rodilla)
    talon = (ax - 0.06 * _cos(pie) * d, ay - 0.04 - 0.06 * _sen(pie))
    punta = (ax + 0.16 * _cos(pie) * d, ay - 0.05 + 0.16 * _sen(pie))
    return (rx, ry), (ax, ay), talon, punta


def _brazo(hombro: Tuple[float, float], brazo: float, codo: float, d: int):
    ex, ey = hombro[0] + 0.33 * _sen(brazo) * d, hombro[1] - 0.33 * _cos(brazo)
    wx, wy = ex + 0.30 * _sen(brazo + codo) * d, ey - 0.30 * _cos(brazo + codo)
    return (ex, ey), (wx, wy)


def figura(x: float, a: Dict[str, float], despegue: float = 0.0, d: int = 1, vista: str = "perfil") -> List[Dict[str, float]]:
    """Landmarks de la figura. ``a``: tronco, muslo_i/d, rodilla_i/d, pie_i/d, brazo_i/d, codo_i/d,
    rotacion (hombros), y en vista frontal muneca_sep (separación de muñecas)."""
    g = lambda k, v=0.0: a.get(k, v)  # noqa: E731
    lat = {"i": 0.03, "d": -0.03} if vista == "perfil" else {"i": 0.13, "d": -0.13}
    hom_lat = {"i": 0.03 + 0.15 * _sen(g("rotacion")), "d": -0.03 - 0.15 * _sen(g("rotacion"))} \
        if vista == "perfil" else {"i": 0.18, "d": -0.18}
    piernas = {}
    for l in "id":
        piernas[l] = _pierna((lat[l], 0.0), g(f"muslo_{l}"), g(f"rodilla_{l}"), g(f"pie_{l}"), d)
        if vista == "frontal":       # de frente la parte sagital no se ve: x lateral fija
            r, t, ta, pu = piernas[l]
            piernas[l] = ((lat[l], r[1]), (lat[l], t[1]), (lat[l] - 0.02, ta[1]), (lat[l] + 0.02, pu[1]))
    bajo = min(min(p[1][1], p[2][1], p[3][1]) for p in piernas.values())
    cy = -bajo + despegue                       # la cadera queda a la altura que deja el pie más bajo en el suelo

    def px(p):
        return x * ESCALA + p[0] * ESCALA * (1 if vista == "frontal" else 1), SUELO - (p[1] + cy) * ESCALA

    tronco = g("tronco")
    hom_c = (0.6 * _sen(tronco) * d, 0.6 * _cos(tronco))
    lm = [None] * 33
    for l, idx in (("i", (23, 25, 27, 29, 31)), ("d", (24, 26, 28, 30, 32))):
        r, t, ta, pu = piernas[l]
        for j, p in zip(idx, ((lat[l], 0.0), r, t, ta, pu)):
            lm[j] = _pt(*px(p))
    for l, idx in (("i", (11, 13, 15)), ("d", (12, 14, 16))):
        hombro = (hom_c[0] + hom_lat[l], hom_c[1])
        if vista == "frontal":
            # de frente: la flexión del codo lleva el antebrazo hacia la cámara (z negativa)
            sep = g("muneca_sep", 0.22)
            lado = 1 if l == "i" else -1
            codo = (hombro[0], hombro[1] - 0.33)
            lateral = lado * sep - codo[0]
            r = math.sqrt(max(0.01, 0.09 - lateral ** 2))           # lo que queda del antebrazo tras ir al centro
            muneca = (lado * sep, codo[1] - r * _cos(g(f"codo_{l}")), -r * _sen(g(f"codo_{l}")))
        else:
            codo, muneca = _brazo(hombro, g(f"brazo_{l}"), g(f"codo_{l}"), d)
        for j, p in zip(idx, (hombro, codo, muneca)):
            x_px, y_px = px(p)
            lm[j] = _pt(x_px, y_px, (p[2] if len(p) > 2 else 0.0) * ESCALA)
    cabeza = (hom_c[0] + 0.04 * d, hom_c[1] + 0.18)
    lm[0] = _pt(*px(cabeza))
    for j in range(1, 11):
        lm[j] = _pt(*px((cabeza[0] - (0.03 * d if j in (7, 8) else 0), cabeza[1] + 0.02)))
    for j, src in ((17, 15), (19, 15), (21, 15), (18, 16), (20, 16), (22, 16)):
        lm[j] = dict(lm[src])
    return lm


def animar(dur: float, fn: Callable[[float], Tuple[float, Dict[str, float], float]], d: int = 1,
           vista: str = "perfil") -> Muestras:
    """``fn(t) -> (x_cadera, ángulos, despegue)`` muestreado a 30 fps."""
    salida = []
    for k in range(int(dur * FPS) + 1):
        t = k / FPS
        x, ang, desp = fn(t)
        salida.append((t, figura(x, ang, desp, d, vista)))
    return salida


def _mezcla(t: float, t0: float, t1: float, a: float, b: float) -> float:
    if t <= t0:
        return a
    if t >= t1:
        return b
    u = (t - t0) / (t1 - t0)
    return a + (b - a) * (3 * u * u - 2 * u ** 3)


# ------------------------------------------------------------------ gestos
def _inicio(d: int, recorrido: float) -> float:
    """x inicial para que el recorrido quede dentro del lienzo (5,3 piernas de ancho)."""
    return 0.4 if d > 0 else 0.4 + recorrido


def correr(dur: float = 1.2, velocidad: float = 3.5, frec: float = 1.5, d: int = 1) -> Muestras:
    x0 = _inicio(d, velocidad * dur)

    def fn(t):
        f = 2 * math.pi * frec * t
        ang = {"tronco": 9}
        for l, fase in (("i", 0.0), ("d", math.pi)):
            ph = f + fase
            ang[f"muslo_{l}"] = 40 * math.sin(ph)
            # recobro: la rodilla se flexiona mientras el muslo avanza; en apoyo, leve amortiguación
            ang[f"rodilla_{l}"] = 15 + 85 * max(0.0, math.cos(ph)) ** 1.5 + 25 * max(0.0, -math.cos(ph))
            ang[f"pie_{l}"] = 10 * math.sin(ph)
            ang[f"brazo_{'d' if l == 'i' else 'i'}"] = 35 * math.sin(ph)     # brazo contrario a la pierna
        ang["codo_i"] = ang["codo_d"] = 90
        despegue = 0.16 * max(0.0, -math.cos(2 * f + 0.5) - 0.35)          # vuelo con las piernas abiertas
        return x0 + d * velocidad * t, ang, despegue
    return animar(dur, fn, d)


def caminar(dur: float = 3.5, velocidad: float = 1.1, frec: float = 0.9, d: int = 1) -> Muestras:
    x0 = _inicio(d, velocidad * dur)

    def fn(t):
        f = 2 * math.pi * frec * t
        ang = {"tronco": 2}
        for l, fase in (("i", 0.0), ("d", math.pi)):
            ph = f + fase
            ang[f"muslo_{l}"] = 22 * math.sin(ph)
            ang[f"rodilla_{l}"] = 5 + 55 * max(0.0, math.cos(ph)) ** 2
            ang[f"pie_{l}"] = 18 * math.sin(ph)                               # punta arriba al llevar la pierna adelante
            ang[f"brazo_{'d' if l == 'i' else 'i'}"] = 22 * math.sin(ph)
        ang["codo_i"] = ang["codo_d"] = 20
        return x0 + d * velocidad * t, ang, 0.0
    return animar(dur, fn, d)


def salto_horizontal(d: int = 1, con_brazos: bool = True) -> Muestras:
    def fn(t):
        rod = _mezcla(t, 0.5, 0.9, 10, 95)
        rod = _mezcla(t, 0.9, 1.05, rod, 3) if t > 0.9 else rod
        rod = _mezcla(t, 1.05, 1.35, 3, 25) if 1.05 < t <= 1.45 else rod
        rod = _mezcla(t, 1.45, 1.65, 25, 100) if t > 1.45 else rod
        rod = _mezcla(t, 1.9, 2.4, 100, 10) if t > 1.9 else rod
        muslo = rod * 0.45
        brazo = 0.0
        if con_brazos:
            brazo = _mezcla(t, 0.5, 0.9, 0, -55)
            brazo = _mezcla(t, 0.9, 1.1, -55, 150) if t > 0.9 else brazo
            brazo = _mezcla(t, 1.1, 1.6, 150, 50) if t > 1.1 else brazo
        tronco = _mezcla(t, 0.5, 0.9, 3, 35) if t <= 1.0 else _mezcla(t, 1.0, 1.2, 35, 10)
        despegue = 0.0
        if 1.05 < t < 1.45:
            u = (t - 1.05) / 0.4
            despegue = 0.32 * 4 * u * (1 - u)
        x = 1.0 + _mezcla(t, 1.0, 1.5, 0, 1.3)
        ang = {"tronco": tronco, "brazo_i": brazo, "brazo_d": brazo, "codo_i": 15, "codo_d": 15}
        for l in "id":
            ang[f"muslo_{l}"], ang[f"rodilla_{l}"] = muslo, rod
        return x, ang, despegue
    return animar(2.8, fn, d)


def pata_sola(pie: str = "d", saltos: int = 3, d: int = 1) -> Muestras:
    libre = "i" if pie == "d" else "d"
    ciclo = 0.55

    def fn(t):
        ang = {"tronco": 9, f"muslo_{libre}": 35 + 15 * math.sin(2 * math.pi * t / ciclo), f"rodilla_{libre}": 95,
               "brazo_i": 25, "brazo_d": 25, "codo_i": 90, "codo_d": 90}
        despegue, avance = 0.0, 0.0
        k = int((t - 0.4) // ciclo) if t >= 0.4 else -1
        if 0 <= k < saltos:
            u = (t - 0.4 - k * ciclo) / ciclo
            if 0.25 < u < 0.75:
                despegue = 0.22 * 4 * ((u - 0.25) / 0.5) * (1 - (u - 0.25) / 0.5)
            ang[f"rodilla_{pie}"] = 45 if u < 0.25 or u > 0.85 else 12
            avance = (k + min(1.0, max(0.0, (u - 0.25) / 0.5))) * 0.55
        elif k >= saltos:
            avance = saltos * 0.55
        return 1.0 + avance, ang, despegue
    return animar(0.4 + saltos * ciclo + 0.6, fn, d)


def equilibrio(pie: str = "d", segundos: float = 6.0, brazos_abiertos: bool = False, d: int = 1) -> Muestras:
    libre = "i" if pie == "d" else "d"

    def fn(t):
        sube = _mezcla(t, 0.3, 0.6, 0, 1) * (1 - _mezcla(t, 0.5 + segundos, 0.8 + segundos, 0, 1))
        ang = {"tronco": 1.5 * math.sin(t * 3), f"muslo_{libre}": 45 * sube,
               f"rodilla_{libre}": 95 * sube,
               "brazo_i": 85 if brazos_abiertos else 5, "brazo_d": 85 if brazos_abiertos else 5, "codo_i": 8, "codo_d": 8}
        return 2.0, ang, 0.0
    return animar(segundos + 1.3, fn, d)


def quieto_dos_pies(d: int = 1) -> Muestras:
    """Postura de estocada (como la foto de yoga): dos pies en el suelo, sin moverse."""
    def fn(t):
        return 2.0, {"muslo_i": 30, "rodilla_i": 60, "muslo_d": -30, "rodilla_d": 0,
                     "brazo_i": 90, "brazo_d": -90, "codo_i": 0, "codo_d": 0, "tronco": 0}, 0.0
    return animar(3.0, fn, d)


def lanzar(brazo: str = "d", d: int = 1) -> Muestras:
    otro = "i" if brazo == "d" else "d"
    adelante = otro                     # pie contrario al brazo, adelantado

    def fn(t):
        b = _mezcla(t, 0.4, 0.9, 0, -140)
        b = _mezcla(t, 1.0, 1.15, -140, -275) if t > 1.0 else b
        b = _mezcla(t, 1.15, 1.6, -275, -330) if t > 1.15 else b
        codo = _mezcla(t, 0.4, 0.9, 10, 100)
        codo = _mezcla(t, 1.0, 1.12, 100, 2) if t > 1.0 else codo
        rot = _mezcla(t, 0.4, 0.9, 0, -50)
        rot = _mezcla(t, 1.0, 1.2, -50, 45) if t > 1.0 else rot
        ang = {"tronco": _mezcla(t, 1.0, 1.2, 0, 12), f"brazo_{brazo}": b, f"codo_{brazo}": codo,
               f"brazo_{otro}": 30, f"codo_{otro}": 20, "rotacion": rot,
               f"muslo_{adelante}": 18, f"muslo_{brazo}": -18}
        return 2.0, ang, 0.0
    return animar(2.0, fn, d)


def patear(pierna: str = "d", d: int = 1) -> Muestras:
    apoyo = "i" if pierna == "d" else "d"

    def fn(t):
        m = _mezcla(t, 0.3, 0.6, 0, -35)
        m = _mezcla(t, 0.6, 0.78, -35, 75) if t > 0.6 else m
        m = _mezcla(t, 0.78, 0.95, 75, 85) if t > 0.78 else m
        m = _mezcla(t, 1.0, 1.4, 85, 0) if t > 1.0 else m
        r = _mezcla(t, 0.3, 0.6, 0, 95)
        r = _mezcla(t, 0.6, 0.78, 95, 8) if t > 0.6 else r
        r = _mezcla(t, 1.0, 1.4, 8, 0) if t > 1.0 else r
        brazo = _mezcla(t, 0.5, 0.8, -20, 55)
        brazo = _mezcla(t, 1.0, 1.4, 55, 0) if t > 1.0 else brazo
        ang = {"tronco": _mezcla(t, 0.6, 0.8, 0, 12), f"muslo_{pierna}": m, f"rodilla_{pierna}": r,
               f"muslo_{apoyo}": 0, f"rodilla_{apoyo}": 8, f"brazo_{apoyo}": brazo, f"brazo_{pierna}": -15,
               "codo_i": 30, "codo_d": 30}
        # la cadera se ajusta al pie de apoyo (el que patea no debe definir el suelo)
        return 2.0 + _mezcla(t, 0.2, 0.6, 0, 0.3), ang, 0.0
    return animar(1.8, fn, d)


def atrapar() -> Muestras:
    def fn(t):
        sep = _mezcla(t, 0.6, 1.0, 0.30, 0.05)
        codo = _mezcla(t, 0.3, 0.6, 20, 70)
        codo = _mezcla(t, 1.0, 1.3, codo, 95) if t > 1.0 else codo
        return 2.0, {"brazo_i": 60, "brazo_d": 60, "codo_i": codo, "codo_d": codo, "muneca_sep": sep,
                     "muslo_i": 5, "muslo_d": 5, "rodilla_i": 10, "rodilla_d": 10}, 0.0
    return animar(1.8, fn, vista="frontal")


def con_ruido(muestras: Muestras, px: float = 1.5, temblor: float = 0.015, semilla: int = 3) -> Muestras:
    """Ruido de detección de MediaPipe (``px`` píxeles) y temblor/zoom de una cámara en la mano."""
    import random

    rnd = random.Random(semilla)
    salida = []
    for t, lm in muestras:
        zoom = 1 + temblor * math.sin(2 * math.pi * 1.3 * t) + rnd.gauss(0, temblor / 4)
        dx, dy = rnd.gauss(0, temblor * 40), rnd.gauss(0, temblor * 40)
        nuevo = []
        for p in lm:
            x = (p["x"] * 640 - 320) * zoom + 320 + dx + rnd.gauss(0, px)
            y = (p["y"] * 360 - 180) * zoom + 180 + dy + rnd.gauss(0, px)
            nuevo.append({**p, "x": x / 640, "y": y / 360})
        salida.append((t, nuevo))
    return salida
