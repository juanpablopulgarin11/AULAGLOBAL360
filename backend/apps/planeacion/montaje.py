"""Montaje 3D de una sesión: convierte el texto de «Montaje» (distribución del espacio) en una
escena con medidas que ``planeacion/montaje.html`` dibuja con Three.js.

El docente puede editar el texto (y la IA puede redactarlo), así que no se guarda una escena fija
por plantilla: se elige una receta por palabras clave (carriles, estaciones, pared, slalom…) y se
usan las medidas que aparezcan en el texto (``12x12 metros``, ``a 5, 10 y 15 metros``,
``cada 2 metros``, ``80 cm``); lo que falte toma valores seguros para primaria.

Coordenadas en metros: ``x`` a lo ancho, ``z`` a lo largo, ``y`` hacia arriba; origen en el centro
del área. Las actividades avanzan hacia ``-z`` y las hileras esperan en ``+z``.
"""
from __future__ import annotations

import math
import re
import unicodedata
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

NUM = r"\d+(?:[.,]\d+)?"
PALABRAS = {"dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9,
            "diez": 10, "once": 11, "doce": 12}
MATERIALES_BASE = ["Conos", "Aros", "Cuerdas", "Balones", "Colchonetas"]
COLORES_FILA = ["azul", "rojo", "verde", "amarillo", "morado", "naranja", "rosa", "celeste"]
SEPARACION_FILA = 0.8

# Elemento de la escena → material que el docente debe alistar (unidades por elemento)
MATERIAL_DE = {"cono": ("Conos", 1), "castillo": ("Conos", 6), "aro": ("Aros", 1), "cuerda": ("Cuerdas", 1),
               "balon": ("Balones", 1), "colchoneta": ("Colchonetas", 1), "valla": ("Mini-vallas u obstáculos bajos", 1),
               "poste": ("Postes o conos altos", 1), "diana": ("Dianas", 1), "cinta": ("Cinta elástica o lana", 1),
               "banco": ("Bancos suecos o tablones", 1), "porteria": ("Mini-porterías", 1),
               "platillo": ("Platillos (conos planos)", 1), "bolo": ("Bolos", 1)}
SUSTITUTOS = {
    "Conos": "botellas plásticas con un poco de arena",
    "Aros": "círculos dibujados con tiza",
    "Cuerdas": "líneas de tiza o cinta de enmascarar",
    "Balones": "pelotas de papel periódico y cinta",
    "Colchonetas": "zona de césped blando o colchonetas viejas dobladas",
    "Mini-vallas u obstáculos bajos": "una cuerda apoyada sobre dos conos o botellas acostadas",
    "Postes o conos altos": "sillas o palos de escoba sobre un cono",
    "Dianas": "círculos de papel de colores pegados con cinta",
    "Cinta elástica o lana": "una cuerda o lana amarrada entre dos postes",
    "Bancos suecos o tablones": "una línea doble de tiza de 20 cm de ancho o un tablón firme sobre el piso",
    "Mini-porterías": "dos conos o dos maletas separados 1,5 m",
    "Platillos (conos planos)": "tapas de cartón o círculos de tiza",
    "Bolos": "botellas plásticas con un poco de agua o arena",
}


# ---------------------------------------------------------------- lectura del texto

def _norm(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", sin_tildes.lower())


def _f(s: str) -> float:
    return float(s.replace(",", "."))


def _cantidad(t: str, *sustantivos: str) -> Optional[int]:
    """«4 carriles», «seis postes», «6 aros consecutivos» → número."""
    patron = rf"\b(\d+|{'|'.join(PALABRAS)})\s+(?:{'|'.join(sustantivos)})\b"
    m = re.search(patron, t)
    if not m:
        return None
    return int(m.group(1)) if m.group(1).isdigit() else PALABRAS[m.group(1)]


def _dimensiones(t: str) -> Optional[Tuple[float, float]]:
    """«12x12 metros» → (ancho, largo) con el lado mayor a lo largo."""
    m = re.search(rf"({NUM})\s*[x×]\s*({NUM})\s*(?:m\b|metros)", t)
    if not m:
        return None
    a, b = _f(m.group(1)), _f(m.group(2))
    return min(a, b), max(a, b)


def _listas_tras_a(t: str) -> List[List[float]]:
    """Cada «a 5, 10 y 15 metros» / «a 1.2m, 1.8m y 2.4m» / «a 80 cm» → lista en metros."""
    item = rf"{NUM}\s*(?:cm|m)?"
    listas = []
    for m in re.finditer(rf"\ba\s+({item}(?:\s*(?:,|y)\s*{item})*)\s*(metros|m|cm)?\b", t):
        unidad = m.group(2) or ("cm" if "cm" in m.group(1) else "m" if re.search(r"\dm", m.group(1)) else None)
        if not unidad:
            continue
        factor = 0.01 if unidad == "cm" else 1.0
        listas.append([_f(n) * factor for n in re.findall(NUM, m.group(1))])
    return listas


def _metros_tras(t: str, patron: str) -> Optional[float]:
    m = re.search(rf"{patron}\s*({NUM})\s*(metros|m|cm)\b", t)
    if not m:
        return None
    return _f(m.group(1)) * (0.01 if m.group(2) == "cm" else 1.0)


def _materiales_en(t: str) -> List[str]:
    return [m for m in MATERIALES_BASE if _norm(m) in t]


def _nombres_estaciones(original: str, t: str) -> List[str]:
    """«Estación 1: Zancadas…; Estación 2: …», «estaciones de lanzamiento (precisión, distancia…)»
    o «estaciones con pelotas de tenis, balones de espuma y vóley» → nombres."""
    explicitas = re.findall(r"Estaci[oó]n\s*\d+\s*:\s*([^;.]+)", original, re.I)
    if explicitas:
        return [n.strip() for n in explicitas]
    m = re.search(r"estaciones[^()]*\(([^)]+)\)", original, re.I) or \
        re.search(r"estaciones\s+(?:de\s+\w+\s+)?(?:de|con)\s+([^.()]+)", original, re.I)
    if not m:
        return []
    partes = [p.strip() for p in re.split(r",\s*|\s+y\s+", m.group(1)) if p.strip()]
    return partes if len(partes) >= 2 else []


def _m(v: float) -> str:
    """1.2 → «1,2 m»; 0.8 → «80 cm»."""
    if v < 1:
        return f"{round(v * 100):d} cm"
    return f"{round(v, 2):g}".replace(".", ",") + " m"


def _redondear(v: Any) -> Any:
    if isinstance(v, float):
        return round(v, 2)
    if isinstance(v, (list, tuple)):
        return [_redondear(x) for x in v]
    if isinstance(v, dict):
        return {k: _redondear(x) for k, x in v.items()}
    return v


# ---------------------------------------------------------------- escena

class Escena:
    def __init__(self, estudiantes: int):
        self.ancho = 0.0
        self.largo = 0.0
        self.estudiantes = estudiantes
        self.elementos: List[Dict[str, Any]] = []
        self.cotas: List[Dict[str, Any]] = []
        self.pasos: List[str] = []
        self.filas: List[Dict[str, Any]] = []
        self.disperso = False
        self.puestos: List[Dict[str, Any]] = []
        self.organizar = "hileras"
        self.docente: Optional[Dict[str, Any]] = None
        self.resumen = ""
        self.receta = ""
        self.avisos: List[str] = []

    # -- construcción
    def ajustar(self, ancho: float, largo: float) -> None:
        self.ancho, self.largo = max(self.ancho, ancho), max(self.largo, largo)

    def paso(self, texto: str) -> int:
        self.pasos.append(texto)
        return len(self.pasos) - 1

    def add(self, tipo: str, paso: int, **datos: Any) -> None:
        self.elementos.append({"tipo": tipo, "paso": paso, **datos})

    def cono(self, p: int, x: float, z: float, color: str = "naranja") -> None:
        self.add("cono", p, x=x, z=z, color=color)

    def aro(self, p: int, x: float, z: float, color: str = "amarillo", etiqueta: Optional[str] = None) -> None:
        self.add("aro", p, x=x, z=z, color=color, **({"etiqueta": etiqueta} if etiqueta else {}))

    def linea(self, p: int, puntos: Sequence[Tuple[float, float]], color: str = "blanco", grosor: float = 0.06) -> None:
        self.add("linea", p, puntos=[list(q) for q in puntos], color=color, grosor=grosor)

    def cuerda(self, p: int, puntos: Sequence[Tuple[float, float]], color: str = "amarillo", ondulada: bool = False) -> None:
        self.add("cuerda", p, puntos=[list(q) for q in puntos], color=color, ondulada=ondulada)

    def zona(self, p: int, x: float, z: float, ancho: float, largo: float, color: str, etiqueta: Optional[str] = None) -> None:
        self.add("zona", p, x=x, z=z, ancho=ancho, largo=largo, color=color, **({"etiqueta": etiqueta} if etiqueta else {}))

    def etiqueta(self, p: int, x: float, z: float, texto: str, y: float = 0.4) -> None:
        self.add("etiqueta", p, x=x, z=z, y=y, texto=texto)

    def cota(self, p: int, desde: Sequence[float], hasta: Sequence[float], texto: Optional[str] = None) -> None:
        """Cota entre dos puntos ``(x, y, z)``; sin texto muestra la distancia."""
        d = math.dist(desde, hasta)
        self.cotas.append({"paso": p, "desde": list(desde), "hasta": list(hasta), "texto": texto or _m(d)})

    def fila(self, x: float, z: float, dx: float = 0.0, dz: float = 1.0, columnas: int = 1) -> None:
        """Punto donde arranca una hilera y hacia dónde crece (se espera mirando en sentido contrario)."""
        self.filas.append({"x": x, "z": z, "dx": dx, "dz": dz, "columnas": columnas})

    def puesto(self, x: float, z: float, mira: Tuple[float, float], grupo: int = 0) -> None:
        """Lugar exacto de un estudiante (parejas, corros, estrellas…) mirando hacia ``mira``."""
        self.puestos.append({"x": x, "z": z, "rot": math.atan2(mira[0] - x, mira[1] - z),
                             "color": COLORES_FILA[grupo % len(COLORES_FILA)]})

    def delimitar(self, p: int, color: str = "blanco") -> None:
        a, l = self.ancho / 2, self.largo / 2
        self.linea(p, [(-a, -l), (a, -l), (a, l), (-a, l), (-a, -l)], color=color, grosor=0.08)
        for x, z in ((-a, -l), (a, -l), (a, l), (-a, l)):
            self.cono(p, x, z, "rojo")
        self.cota(p, (-a, 0, l + 0.9), (a, 0, l + 0.9))
        self.cota(p, (-a - 0.9, 0, l), (-a - 0.9, 0, -l))

    # -- ubicación de estudiantes y docente
    def _ubicar_estudiantes(self) -> List[Dict[str, Any]]:
        n = self.estudiantes
        if self.puestos:
            return self.puestos[:n] + self._dispersos(n)[len(self.puestos):]
        if self.disperso or not self.filas:
            return self._dispersos(n)
        k = len(self.filas)
        salida = []
        for i, f in enumerate(self.filas):
            cuantos = n // k + (1 if i < n % k else 0)
            perp = (-f["dz"], f["dx"])
            cols = f["columnas"] if cuantos <= 8 else max(f["columnas"], 2)   # hileras largas: en parejas
            for j in range(cuantos):
                fila, col = divmod(j, cols)
                lateral = (col - (cols - 1) / 2) * 0.7
                x = f["x"] + f["dx"] * SEPARACION_FILA * fila + perp[0] * lateral
                z = f["z"] + f["dz"] * SEPARACION_FILA * fila + perp[1] * lateral
                salida.append({"x": x, "z": z, "rot": math.atan2(-f["dx"], -f["dz"]),
                               "color": COLORES_FILA[i % len(COLORES_FILA)]})
        return salida

    def _dispersos(self, n: int) -> List[Dict[str, Any]]:
        a, l = max(self.ancho / 2 - 1, 1), max(self.largo / 2 - 1, 1)
        cols = max(1, round(math.sqrt(n * a / l)))
        filas = math.ceil(n / cols)
        salida = []
        semilla = 7
        for j in range(n):
            semilla = (semilla * 1103515245 + 12345) % 2 ** 31
            jx, jz = (semilla % 100) / 100 - 0.5, ((semilla // 100) % 100) / 100 - 0.5
            c, r = j % cols, j // cols
            x = -a + (c + 0.5 + jx * 0.6) * (2 * a / cols)
            z = -l + (r + 0.5 + jz * 0.6) * (2 * l / filas)
            salida.append({"x": x, "z": z, "rot": math.atan2(-x, -z), "color": COLORES_FILA[j % 2]})
        return salida

    def como_dict(self, materiales_elegidos: Iterable[str], minutos_central: Optional[int]) -> Dict[str, Any]:
        n = self.estudiantes
        if self.puestos:
            p_est = self.paso(f"Ubica a los {n} estudiantes: {self.organizar}.")
        elif self.disperso or not self.filas:
            p_est = self.paso(f"Distribuye a los {n} estudiantes por todo el espacio{self.organizar_extra()}.")
        else:
            k = len(self.filas)
            minimo, maximo = n // k, math.ceil(n / k)
            cuantos = f"{minimo}" if minimo == maximo else f"{minimo} o {maximo}"
            p_est = self.paso(f"Organiza a los {n} estudiantes en {k} {self.organizar} ({cuantos} por grupo).")
        if self.docente is None:
            self.docente = {"x": self.ancho / 2 + 1.5, "z": 0.0,
                            "consejo": "Ubícate por fuera del costado largo, a mitad del espacio: todo el grupo queda "
                                       "frente a ti y nadie trabaja a tu espalda."}
        p_doc = self.paso(self.docente["consejo"])
        estudiantes = [{**e, "paso": p_est} for e in self._ubicar_estudiantes()]
        docente = {**self.docente, "paso": p_doc}
        docente.setdefault("mira", [0.0, 0.0])
        return _redondear({
            "receta": self.receta,
            "resumen": self.resumen,
            "area": {"ancho": self.ancho, "largo": self.largo, "texto": f"{_m(self.ancho)} × {_m(self.largo)}"},
            "elementos": self.elementos,
            "cotas": self.cotas,
            "pasos": self.pasos,
            "estudiantes": estudiantes,
            "docente": docente,
            "materiales": self._materiales(materiales_elegidos),
            "avisos": self.avisos,
            "minutos_central": minutos_central,
        })

    def organizar_extra(self) -> str:
        return "" if self.organizar == "hileras" else f" ({self.organizar})"

    def _materiales(self, elegidos: Iterable[str]) -> List[Dict[str, Any]]:
        elegidos = {_norm(e) for e in elegidos}
        cuenta: Dict[str, int] = {}
        metros_linea = 0.0
        for e in self.elementos:
            if e["tipo"] in MATERIAL_DE:
                nombre, unidades = MATERIAL_DE[e["tipo"]]
                cuenta[nombre] = cuenta.get(nombre, 0) + unidades
            if e["tipo"] == "cinta":
                cuenta["Postes o conos altos"] = cuenta.get("Postes o conos altos", 0) + 2
            if e["tipo"] == "linea":
                metros_linea += sum(math.dist(a, b) for a, b in zip(e["puntos"], e["puntos"][1:]))
            if e["tipo"] == "huella":
                metros_linea += 0.3
        salida = []
        for nombre, cantidad in cuenta.items():
            item = {"nombre": nombre, "cantidad": cantidad}
            base = nombre in MATERIALES_BASE
            if (base and elegidos and _norm(nombre) not in elegidos) or not base:
                item["sustituto"] = SUSTITUTOS.get(nombre, "")
                item["elegido"] = False if base else None
            salida.append(item)
        salida.sort(key=lambda m: -m["cantidad"])
        if metros_linea:
            salida.append({"nombre": "Tiza o cinta de enmascarar", "cantidad": math.ceil(metros_linea),
                           "unidad": "m de líneas"})
        return salida


# ---------------------------------------------------------------- piezas reutilizables

def _pistas(esc: Escena, p: int, n: int, w: float, largo: float, *, atras: float = 4.0, frente: float = 2.0,
            salida: Optional[str] = "Salida", llegada: Optional[str] = "Llegada", lineas: bool = True,
            fila_columnas: int = 1) -> Tuple[List[float], float, float]:
    """``n`` pistas paralelas de ancho ``w`` y largo ``largo``. Devuelve (centros x, z salida, z llegada)."""
    total = n * w
    esc.ajustar(total + 4, largo + atras + frente)
    z0 = (largo + atras + frente) / 2 - atras
    z1 = z0 - largo
    x0 = -total / 2
    centros = [x0 + w * (i + 0.5) for i in range(n)]
    if lineas:
        for i in range(n + 1):
            x = x0 + i * w
            esc.linea(p, [(x, z0), (x, z1)])
            esc.cono(p, x, z0)
            esc.cono(p, x, z1)
        if salida:
            esc.linea(p, [(x0, z0), (-x0, z0)], grosor=0.1)
            esc.etiqueta(p, x0 - 0.9, z0, salida)
        if llegada:
            esc.linea(p, [(x0, z1), (-x0, z1)], grosor=0.1)
            esc.etiqueta(p, x0 - 0.9, z1, llegada)
        esc.cota(p, (x0, 0, z0 + 0.5), (x0 + w, 0, z0 + 0.5))
        esc.cota(p, (-x0 + 0.6, 0, z0), (-x0 + 0.6, 0, z1))
    for cx in centros:
        esc.fila(cx, z0 + 0.7, columnas=fila_columnas)
    return centros, z0, z1


def _carriles_por_grupo(esc: Escena, minimo: int = 3, maximo: int = 6, por_fila: int = 6) -> int:
    return max(minimo, min(maximo, math.ceil(esc.estudiantes / por_fila)))


def _docente_costado(esc: Escena, z: float, consejo: str, lado: float = 1.0) -> None:
    esc.docente = {"x": lado * (esc.ancho / 2 + 1.2), "z": z, "consejo": consejo, "mira": [0.0, z]}


# ---------------------------------------------------------------- recetas

def _carriles(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    relevos, salto, lanz = "relevo" in t, "salto" in t, "lanzamiento" in t
    castillo, pasillo = "castillo" in t, "pasillo" in t
    dims = _dimensiones(t)
    listas = _listas_tras_a(t)
    largo = _metros_tras(t, r"\bde")
    nombre = "pasillos" if pasillo else "pistas" if ("pista" in t) else "carriles"
    n = _cantidad(t, "carriles", "pistas", "pasillos") or (3 if pasillo and not lanz else 4)
    w = 2.0 if (relevos or salto) else 1.5
    if dims:
        n = min(n, max(2, int((dims[0] - 2) // w)))
        largo = largo or max(6.0, dims[1] - 5)
    distancia_castillo = listas[0][0] if (castillo and listas) else 8.0
    if castillo:
        largo = 3 + distancia_castillo + 1.5
    metas = next((lst for lst in listas if len(lst) > 1), []) if "meta" in t else []
    if not largo:
        largo = max(metas) if metas else 10.0
    frente = 10.0 if (lanz and not castillo) else 2.0

    if dims:
        esc.ajustar(*dims)
        p0 = esc.paso(f"Delimita el espacio de {_m(dims[0])} × {_m(dims[1])} con conos rojos en las esquinas.")
        esc.delimitar(p0)
    paralelos = "paralelas" if nombre == "pistas" else "paralelos"
    p = esc.paso(f"Traza {n} {nombre} {paralelos} de {_m(w)} de ancho y {_m(largo)} de largo con tiza o cinta; "
                 f"marca cada esquina con un cono.")
    llegada = "Línea de lanzamiento" if (lanz and not castillo) else None if castillo else "Llegada"
    centros, z0, z1 = _pistas(esc, p, n, w, largo, frente=frente, llegada=llegada)
    if dims:
        esc.ancho, esc.largo = max(esc.ancho, dims[0]), max(esc.largo, dims[1])
    esc.resumen = f"{n} {nombre} de {_m(largo)}"

    if "aceleracion" in t:
        pz = esc.paso("Pinta con tiza de color los primeros 4 m de cada carril: es la zona de aceleración.")
        for i, cx in enumerate(centros):
            esc.zona(pz, cx, z0 - 2, w - 0.2, 4, COLORES_FILA[i % len(COLORES_FILA)])
        esc.cota(pz, (centros[0] - w / 2 - 0.5, 0, z0), (centros[0] - w / 2 - 0.5, 0, z0 - 4))
    if metas:
        colores = ["amarillo", "naranja", "rojo", "morado"]
        pm = esc.paso("Pon un cono de meta en cada carril a " + ", ".join(_m(d) for d in metas[:-1])
                      + f" y {_m(metas[-1])} de la salida (un color por distancia).")
        for k, d in enumerate(metas):
            for cx in centros:
                esc.cono(pm, cx, z0 - d, colores[k % len(colores)])
            if abs(d - largo) < 0.01:   # ya la muestra la cota del largo del carril
                continue
            esc.cota(pm, (centros[-1] + w / 2 + 1.4 + k * 0.5, 0, z0), (centros[-1] + w / 2 + 1.4 + k * 0.5, 0, z0 - d))
    if relevos and not castillo:
        entrega = _metros_tras(t, r"entrega[^.]*?de") or 3.0
        pe = esc.paso(f"Marca los primeros {_m(entrega)} de cada pista como zona de entrega (amarilla) y pon un cono "
                      f"de giro al final: se corre de ida y vuelta y el testigo se entrega solo dentro de la zona.")
        for cx in centros:
            esc.zona(pe, cx, z0 - entrega / 2, w - 0.2, entrega, "amarillo", "Entrega")
            esc.cono(pe, cx, z1 + 0.4, "azul")
        esc.cota(pe, (centros[0] - w / 2 - 0.5, 0, z0), (centros[0] - w / 2 - 0.5, 0, z0 - entrega))
    if pasillo and ("obstaculo" in t or "valla" in t):
        sep = next((lst[0] for lst in listas if len(lst) == 1), 1.2)
        po = esc.paso(f"Ubica mini-obstáculos en cada pasillo separados {_m(sep)} entre sí, empezando a 1,5 m de la salida.")
        cantidad = max(3, min(8, int((largo - 2.5) // sep) + 1))
        for cx in centros:
            for k in range(cantidad):
                esc.add("valla", po, x=cx, z=z0 - 1.5 - k * sep, ancho=w * 0.6, alto=0.15)
        esc.cota(po, (centros[0] + w / 2 - 0.1, 0.2, z0 - 1.5), (centros[0] + w / 2 - 0.1, 0.2, z0 - 1.5 - sep))
    if "rio" in t:
        pr = esc.paso("En cada pasillo arma 3 «ríos» con dos cuerdas atravesadas, cada vez más anchos (60, 80 y 100 cm), "
                      "y pon un aro como «piedra» entre río y río.")
        anchos = [0.6, 0.8, 1.0]
        for cx in centros:
            for k, a in enumerate(anchos):
                zr = z0 - 2 - k * (largo - 3) / 3
                esc.cuerda(pr, [(cx - w / 2 + 0.15, zr), (cx + w / 2 - 0.15, zr)], "azul")
                esc.cuerda(pr, [(cx - w / 2 + 0.15, zr - a), (cx + w / 2 - 0.15, zr - a)], "azul")
                esc.zona(pr, cx, zr - a / 2, w - 0.3, a, "celeste")
                if k < len(anchos) - 1:
                    esc.aro(pr, cx, zr - a - (largo - 3) / 6 + a / 2)
        for k, a in enumerate(anchos):
            zr = z0 - 2 - k * (largo - 3) / 3
            esc.cota(pr, (centros[0] - w / 2 - 0.4, 0, zr), (centros[0] - w / 2 - 0.4, 0, zr - a))
    if lanz and not castillo:
        pl = esc.paso("Detrás de la línea de lanzamiento queda la zona de caída (roja): nadie entra hasta la señal "
                      "«¡a recoger!». Deja 3 balones al inicio de cada pasillo.")
        esc.zona(pl, 0, z1 - frente / 2, n * w, frente - 0.5, "rojo", "Zona de caída")
        for cx in centros:
            for k in range(3):
                esc.add("balon", pl, x=cx - 0.5 + k * 0.25, z=z0 + 0.3, color="rojo")
        _docente_costado(esc, z1 + 1, "Párate al costado de la línea de lanzamiento: ves la carrera, el lanzamiento y "
                                      "controlas que nadie entre a la zona de caída.")
    if castillo:
        zl = z0 - 3
        pc = esc.paso(f"Traza la línea de lanzamiento a 3 m de la salida y arma un castillo de 6 conos en cada pista "
                      f"a {_m(distancia_castillo)} de esa línea.")
        for cx in centros:
            esc.linea(pc, [(cx - w / 2, zl), (cx + w / 2, zl)], "amarillo", 0.08)
            esc.add("castillo", pc, x=cx, z=zl - distancia_castillo)
            for k in range(2):
                esc.add("balon", pc, x=cx - 0.3 + k * 0.6, z=z0 + 0.3, color="rojo")
        esc.etiqueta(pc, centros[0] - w / 2 - 1.2, zl, "Lanzamiento")
        esc.cota(pc, (centros[0] - w / 2 - 0.6, 0, zl), (centros[0] - w / 2 - 0.6, 0, zl - distancia_castillo))
        _docente_costado(esc, zl - distancia_castillo / 2, "Párate al costado, a la altura de los castillos: ves los "
                                                           "lanzamientos y evitas que alguien cruce mientras se lanza.")
    if relevos:
        esc.organizar = "equipos en hilera detrás de la salida"
    if esc.docente is None:
        _docente_costado(esc, (z0 + z1) / 2, f"Ubícate al costado, a mitad de los {nombre}: ves todas las salidas y "
                                             "llegadas sin dar la espalda a ningún grupo.")


def _slalom(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    postes = _cantidad(t, "postes", "conos") or 6
    sep = _metros_tras(t, "cada") or 2.0
    n = _carriles_por_grupo(esc, 2, 4, 8)
    largo = sep * (postes - 1) + 3
    p = esc.paso(f"Arma {n} recorridos de slalom paralelos separados 3 m, cada uno de {_m(largo)}.")
    centros, z0, z1 = _pistas(esc, p, n, 3.0, largo, llegada="Llegada")
    pp = esc.paso(f"En cada recorrido pon {postes} postes en zigzag cada {_m(sep)} a lo largo, alternando "
                  f"60 cm a la izquierda y a la derecha del centro.")
    for cx in centros:
        for k in range(postes):
            z = z0 - 1.5 - k * sep
            esc.add("poste", pp, x=cx + (0.6 if k % 2 else -0.6), z=z, alto=1.0)
    esc.cota(pp, (centros[0] - 1.4, 0, z0 - 1.5), (centros[0] - 1.4, 0, z0 - 1.5 - sep))
    esc.cota(pp, (centros[0] - 0.6, 0, z0 - 1.5 + 0.4), (centros[0] + 0.6, 0, z0 - 1.5 + 0.4))
    if "transversal" in t or "marca" in t:
        pm = esc.paso("Traza una marca transversal de tiza en cada poste: ahí se baja la cadera y se cambia de dirección.")
        for cx in centros:
            for k in range(postes):
                z = z0 - 1.5 - k * sep
                esc.linea(pm, [(cx - 1.1, z), (cx + 1.1, z)], "amarillo", 0.05)
    esc.resumen = f"{n} slaloms de {postes} postes cada {_m(sep)}"
    _docente_costado(esc, (z0 + z1) / 2, "Ubícate al costado, frente al tercer poste: ahí ves la mayoría de cambios "
                                         "de dirección y puedes corregir la flexión de rodillas.")


def _pared(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    dims = _dimensiones(t)
    listas = _listas_tras_a(t)
    ojos = "ojos" in t
    suspendidos = "suspendid" in t or "marcas metricas" in t
    alturas = next((lst for lst in listas if len(lst) > 1 and all(v < 3 for v in lst)), None) if "aro" in t else None
    lineas = next((lst for lst in listas if all(v >= 2 for v in lst)), None) or ([4.0] if alturas else [3.0, 5.0])
    ancho = dims[0] if dims else 10.0
    largo = dims[1] if dims else 8.0
    if not (ojos or suspendidos):
        largo = max(largo, max(lineas) + 4)
    esc.ajustar(ancho, largo)
    zp = -esc.largo / 2
    p = esc.paso(f"Elige una pared lisa y sin ventanas de al menos {_m(esc.ancho)} de ancho; despeja "
                 f"{_m(esc.largo)} frente a ella.")
    esc.add("pared", p, x=0, z=zp - 0.1, ancho=esc.ancho, alto=3.0)
    columnas = max(3, min(6, int(esc.ancho // 2)))
    xs = [-(columnas - 1) + 2 * i for i in range(columnas)]

    if ojos:
        alto = 1.2
        pd = esc.paso(f"Pega {columnas} dianas o tarjetas de colores en la pared a {_m(alto)} del piso (altura de los "
                      f"ojos de los niños), separadas 2 m.")
        for x in xs:
            esc.add("diana", pd, x=x, y=alto, z=zp, radio=0.2, pared=True)
        esc.cota(pd, (xs[0] - 0.7, 0, zp + 0.05), (xs[0] - 0.7, alto, zp + 0.05))
        pl = esc.paso("Traza la línea de salida al fondo y una línea de frenado a 2 m de la pared (nunca se corre "
                      "hasta tocarla).")
        z0, zf = esc.largo / 2 - 1.5, zp + 2
        esc.linea(pl, [(-esc.ancho / 2 + 0.5, z0), (esc.ancho / 2 - 0.5, z0)], grosor=0.1)
        esc.linea(pl, [(-esc.ancho / 2 + 0.5, zf), (esc.ancho / 2 - 0.5, zf)], "rojo", 0.1)
        esc.etiqueta(pl, -esc.ancho / 2 - 0.3, z0, "Salida")
        esc.etiqueta(pl, -esc.ancho / 2 - 0.3, zf, "Frenado")
        esc.cota(pl, (esc.ancho / 2 + 0.6, 0, zf), (esc.ancho / 2 + 0.6, 0, zp))
        esc.cota(pl, (esc.ancho / 2 + 0.6, 0, z0), (esc.ancho / 2 + 0.6, 0, zf))
        for x in xs:
            esc.fila(x, z0 + 0.6)
        if dims:
            esc.delimitar(pl)
        esc.resumen = f"Pared con {columnas} dianas a {_m(alto)}"
    elif suspendidos:
        pf = esc.paso("Pinta franjas de colores en la pared: verde de 1,5 a 2 m, amarilla de 2 a 2,5 m y roja de "
                      "2,5 a 3 m.")
        for y0, color in ((1.5, "verde"), (2.0, "amarillo"), (2.5, "rojo")):
            esc.add("franja", pf, x=0, z=zp, y0=y0, y1=y0 + 0.5, ancho=esc.ancho - 1, color=color)
        esc.cota(pf, (-esc.ancho / 2 + 0.2, 0, zp + 0.05), (-esc.ancho / 2 + 0.2, 1.5, zp + 0.05))
        colgados = [1.6, 1.8, 2.0, 2.2]
        zc = zp + 1.5
        pb = esc.paso("Tiende una cuerda entre dos postes a 2,6 m de altura y 1,5 m de la pared, y suspende balones "
                      "a 1,6 m, 1,8 m, 2 m y 2,2 m del piso.")
        esc.add("cinta", pb, desde=[-esc.ancho / 2 + 1, zc], hasta=[esc.ancho / 2 - 1, zc], altura=2.6)
        for k, x in enumerate(xs):
            esc.add("balon", pb, x=x, z=zc, y=colgados[k % len(colgados)], colgado=2.6, color="amarillo")
        esc.cota(pb, (xs[0] + 0.4, 0, zc), (xs[0] + 0.4, colgados[0], zc))
        pc = esc.paso("Pon una colchoneta debajo de cada balón para caer suave.")
        for x in xs:
            esc.add("colchoneta", pc, x=x, z=zc, ancho=1.0, largo=1.6)
            esc.fila(x, zc + 2)
        esc.resumen = f"Pared métrica y {columnas} balones suspendidos"
    else:
        if alturas:
            pa = esc.paso("Cuelga aros en la pared a " + ", ".join(_m(a) for a in alturas[:-1])
                          + f" y {_m(alturas[-1])} del piso; los más altos dan más puntos.")
            for x in xs[:-1]:
                for k, a in enumerate(alturas):
                    esc.add("aro", pa, x=x, y=a, z=zp + 0.05, color=["verde", "amarillo", "rojo"][k % 3], pared=True)
            for k, a in enumerate(alturas):
                esc.etiqueta(pa, xs[-1], zp + 0.1, f"{(k + 1) * 10} pts", y=a)
                esc.cota(pa, (xs[0] - 0.6 - k * 0.3, 0, zp + 0.05), (xs[0] - 0.6 - k * 0.3, a, zp + 0.05))
        else:
            pd = esc.paso(f"Pega {columnas} dianas circulares en la pared a 1,5 m del piso, separadas 2 m.")
            for x in xs:
                esc.add("diana", pd, x=x, y=1.5, z=zp, radio=0.35, pared=True)
            esc.cota(pd, (xs[0] - 0.7, 0, zp + 0.05), (xs[0] - 0.7, 1.5, zp + 0.05))
        pl = esc.paso("Traza líneas de lanzamiento a " + " y ".join(_m(d) for d in lineas) + " de la pared "
                      "(se empieza en la más cercana y se pasa a la siguiente al acertar 3 veces).")
        colores = ["amarillo", "naranja", "rojo"]
        for k, d in enumerate(lineas):
            esc.linea(pl, [(-esc.ancho / 2 + 0.5, zp + d), (esc.ancho / 2 - 0.5, zp + d)], colores[k % 3], 0.08)
            esc.cota(pl, (esc.ancho / 2 + 0.5 + k * 0.5, 0, zp), (esc.ancho / 2 + 0.5 + k * 0.5, 0, zp + d))
        pb = esc.paso("Deja un cesto con balones de goma o pelotas de espuma junto a cada hilera.")
        for x in xs:
            esc.add("balon", pb, x=x + 0.5, z=zp + max(lineas) + 0.4, color="rojo")
            esc.fila(x, zp + max(lineas) + 0.7)
        esc.resumen = "Pared de lanzamiento con líneas a " + " y ".join(_m(d) for d in lineas)
    _docente_costado(esc, 0, "Párate a un costado, entre las hileras y la pared: ves la técnica de perfil y "
                             "nadie lanza mientras alguien recoge.")


def _zonas_lanzamiento(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    lado = (_dimensiones(t) or (6.0, 6.0))[0]
    n = 4
    gap = 2.0
    esc.ajustar(2 * lado + gap + 1, 2 * lado + gap + 1)
    p = esc.paso(f"Marca {n} zonas cuadradas de {_m(lado)} × {_m(lado)} con conos, separadas {_m(gap)} entre sí "
                 f"(pasillo de seguridad).")
    centros = [(sx * (lado + gap) / 2, sz * (lado + gap) / 2) for sz in (-1, 1) for sx in (-1, 1)]
    for i, (cx, cz) in enumerate(centros):
        esc.zona(p, cx, cz, lado, lado, COLORES_FILA[i], f"Zona {i + 1}")
        for dx in (-1, 1):
            for dz in (-1, 1):
                esc.cono(p, cx + dx * lado / 2, cz + dz * lado / 2)
    esc.cota(p, (centros[2][0] - lado / 2, 0, centros[2][1] + lado / 2 + 0.6), (centros[2][0] + lado / 2, 0, centros[2][1] + lado / 2 + 0.6))
    esc.cota(p, (centros[2][0] + lado / 2, 0, centros[2][1]), (centros[3][0] - lado / 2, 0, centros[3][1]))
    pl = esc.paso("En cada zona traza una línea de lanzamiento a 1 m del borde y pon 3 conos-blanco al fondo; "
                  "deja los balones de goma junto a la línea.")
    for cx, cz in centros:
        zl = cz + lado / 2 - 1
        esc.linea(pl, [(cx - lado / 2 + 0.3, zl), (cx + lado / 2 - 0.3, zl)], "amarillo", 0.08)
        for k in (-1, 0, 1):
            esc.cono(pl, cx + k * 1.2, cz - lado / 2 + 0.8, "azul")
        for k in range(3):
            esc.add("balon", pl, x=cx - 0.4 + k * 0.4, z=zl + 0.4, color="rojo")
        esc.fila(cx, zl + 0.5, dz=1, columnas=3)
    esc.cota(pl, (centros[0][0] + lado / 2 + 0.3, 0, centros[0][1] + lado / 2 - 1), (centros[0][0] + lado / 2 + 0.3, 0, centros[0][1] - lado / 2 + 0.8))
    esc.organizar = "grupos (uno por zona)"
    esc.resumen = f"{n} zonas de {_m(lado)} × {_m(lado)}"
    esc.docente = {"x": 0.0, "z": 0.0, "consejo": "Párate en el cruce de los pasillos de seguridad: ves las 4 zonas "
                                                  "girando apenas la cabeza.", "mira": [0.0, 1.0]}


def _perimetral(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    ancho, largo = _dimensiones(t) or (15.0, 20.0)
    esc.ajustar(ancho, largo)
    p = esc.paso(f"Marca un recorrido rectangular de {_m(ancho)} × {_m(largo)} con un cono cada 5 m.")
    a, l = ancho / 2, largo / 2
    esc.linea(p, [(-a, -l), (a, -l), (a, l), (-a, l), (-a, -l)], "blanco", 0.08)
    perimetro = []
    for x0, z0, x1, z1 in ((-a, l, a, l), (a, l, a, -l), (a, -l, -a, -l), (-a, -l, -a, l)):
        tramo = math.dist((x0, z0), (x1, z1))
        for k in range(int(tramo // 5)):
            f = k * 5 / tramo
            perimetro.append((x0 + (x1 - x0) * f, z0 + (z1 - z0) * f))
    for x, z in perimetro:
        esc.cono(p, x, z)
    esc.cota(p, (-a, 0, l + 0.9), (a, 0, l + 0.9))
    esc.cota(p, (-a - 0.9, 0, l), (-a - 0.9, 0, -l))
    pf = esc.paso("Dibuja flechas en el piso para que todos corran en el mismo sentido.")
    for (x0, z0), (x1, z1) in (((-a + 2, l - 1.2), (a - 2, l - 1.2)), ((a - 1.2, l - 2), (a - 1.2, -l + 2)),
                               ((a - 2, -l + 1.2), (-a + 2, -l + 1.2)), ((-a + 1.2, -l + 2), (-a + 1.2, l - 2))):
        esc.add("flecha", pf, puntos=[[x0, z0], [x1, z1]], color="azul")
    pm = esc.paso("Pon un cartel «Tómate el pulso» en cada esquina: ahí se cuentan las pulsaciones 10 segundos.")
    for x, z in ((-a, -l), (a, -l), (a, l), (-a, l)):
        esc.add("poste", pm, x=x * 1.08, z=z * 1.06, alto=1.2, marca=1.1, color="rojo")
        esc.etiqueta(pm, x * 1.08, z * 1.06, "♥ Pulso", y=1.5)
    ph = esc.paso("Arma la zona de hidratación por fuera del recorrido, en la mitad de un costado largo.")
    esc.zona(ph, a + 2.2, 0, 2.5, 3, "celeste", "Hidratación")
    # un grupo por lado, en fila india mirando en el sentido de la carrera (la cabeza a 60 % del lado)
    for (x0, z0), (x1, z1) in (((-a, l - 0.6), (a, l - 0.6)), ((a - 0.6, l), (a - 0.6, -l)),
                               ((a, -l + 0.6), (-a, -l + 0.6)), ((-a + 0.6, -l), (-a + 0.6, l))):
        d = math.dist((x0, z0), (x1, z1))
        ux, uz = (x1 - x0) / d, (z1 - z0) / d
        esc.fila(x0 + ux * d * 0.6, z0 + uz * d * 0.6, dx=-ux, dz=-uz)
    esc.organizar = "grupos repartidos a lo largo del recorrido"
    esc.ajustar(ancho + 7, largo + 2)
    esc.resumen = f"Recorrido perimetral de {_m(2 * (ancho + largo))}"
    esc.docente = {"x": 0.0, "z": 0.0, "consejo": "Párate en el centro del recorrido y gira con el grupo: los ves a "
                                                  "todos y puedes preguntar «¿puedes hablar sin ahogarte?».",
                   "mira": [0.0, 1.0]}


def _estacion(esc: Escena, p: int, cx: float, cz: float, nombre: str, i: int, s: float) -> None:
    """Contenido de una estación de ~3 × 3 m centrada en (cx, cz); la actividad avanza hacia -z."""
    n = _norm(nombre)
    esc.zona(p, cx, cz, 3.4 * s, 3.4 * s, COLORES_FILA[i % len(COLORES_FILA)])
    titulo = nombre if nombre.startswith("Estación") else f"{i + 1} · {nombre[:1].upper()}{nombre[1:]}"
    esc.etiqueta(p, cx, cz - 2.0 * s, titulo, y=0.6)
    z = lambda d: cz + d * s  # noqa: E731
    x = lambda d: cx + d * s  # noqa: E731
    if re.search(r"banco", n):
        esc.add("banco", p, x=cx, z=z(0.1), largo=2.6 * s, rot=0.0)
    elif re.search(r"porteri|\bgol\b|remate", n):
        esc.add("porteria", p, x=cx, z=z(-1.3), ancho=1.2, alto=0.8)
        esc.add("balon", p, x=cx, z=z(1.0), color="blanco")
    elif re.search(r"\bbolos?\b", n):
        for k, dx in enumerate((-0.3, 0, 0.3, -0.15, 0.15, 0)):
            esc.add("bolo", p, x=x(dx), z=z(-1.1 - (0 if k < 3 else 0.25 if k < 5 else 0.5)))
        esc.add("balon", p, x=cx, z=z(1.1), color="blanco")
    elif re.search(r"huella|talon|pie de apoyo", n):
        for k in range(6):
            esc.add("huella", p, x=cx + (0.1 if k % 2 else -0.1), z=z(1.2 - k * 0.45), lado="der" if k % 2 else "izq", rot=0.0)
    elif re.search(r"linea|sendero|cuerda floja", n):
        esc.linea(p, [(cx, z(1.4)), (cx, z(-1.4))], "blanco", 0.05)
        esc.cono(p, cx, z(-1.6), "naranja")
    elif re.search(r"pareja|recepcion|atrape", n):
        esc.linea(p, [(x(-1), z(1.1)), (x(1), z(1.1))], "blanco", 0.06)
        esc.linea(p, [(x(-1), z(-1.1)), (x(1), z(-1.1))], "blanco", 0.06)
        esc.add("balon", p, x=cx, z=z(1.3), color="amarillo")
    elif re.search(r"estatua|un pie|unipodal|equilibrio", n):
        for dx, dz in ((-0.8, -0.8), (0.8, -0.8), (-0.8, 0.8), (0.8, 0.8)):
            esc.add("colchoneta", p, x=x(dx), z=z(dz), ancho=0.9 * s, largo=0.9 * s)
    elif re.search(r"cruz|diagonal", n):
        for dx, dz in ((0, 0), (-0.75, -0.75), (0.75, -0.75), (-0.75, 0.75), (0.75, 0.75)):
            esc.aro(p, x(dx), z(dz), "verde")
    elif re.search(r"aro|zancada|hilera", n):
        for k in range(4):
            esc.aro(p, cx, z(1.1 - k * 0.75))
    elif re.search(r"zigzag|slalom|cono", n):
        for k in range(4):
            esc.cono(p, x(0.5 if k % 2 else -0.5), z(1.2 - k * 0.8))
    elif re.search(r"valla|lateral", n):
        esc.linea(p, [(cx, z(1.3)), (cx, z(-1.3))], "amarillo", 0.06)
        for k in range(2):
            esc.add("valla", p, x=cx, z=z(0.6 - k * 1.2), ancho=0.6, alto=0.2)
    elif re.search(r"sprint|velocidad", n):
        esc.linea(p, [(x(-1), z(1.3)), (x(1), z(1.3))], "blanco", 0.06)
        esc.cono(p, x(-0.8), z(-1.3), "verde")
        esc.cono(p, x(0.8), z(-1.3), "verde")
    elif re.search(r"giro|desaceler|frenada", n):
        esc.zona(p, cx, z(-0.6), 1.2 * s, 1.0 * s, "rojo", "Frena")
        esc.cono(p, cx, z(-1.4), "azul")
    elif re.search(r"precision|diana", n):
        esc.linea(p, [(x(-1), z(1.2)), (x(1), z(1.2))], "amarillo", 0.06)
        esc.add("diana", p, x=cx, y=1.0, z=z(-1.4), radio=0.35, soporte=True)
    elif re.search(r"distancia", n):
        esc.linea(p, [(x(-1), z(1.3)), (x(1), z(1.3))], "blanco", 0.06)
        for k, color in enumerate(("amarillo", "naranja", "rojo")):
            esc.linea(p, [(x(-1), z(0.3 - k)), (x(1), z(0.3 - k))], color, 0.05)
    elif re.search(r"movimiento", n):
        for k in range(3):
            esc.cono(p, x(-1.1 + k * 1.1), z(1.2), "verde")
        esc.add("diana", p, x=cx, y=1.0, z=z(-1.4), radio=0.3, soporte=True)
    elif re.search(r"estrateg", n):
        esc.add("diana", p, x=x(-0.8), y=1.0, z=z(-1.4), radio=0.25, soporte=True)
        esc.add("diana", p, x=x(0.8), y=1.0, z=z(-1.4), radio=0.25, soporte=True)
        esc.cono(p, cx, z(0), "azul")
    elif re.search(r"tenis|espuma|saquito|voley|pelota|balon", n):
        for k in range(3):
            esc.add("balon", p, x=x(-0.4 + k * 0.4), z=z(1.2), color=["amarillo", "rojo", "azul"][k])
        esc.add("diana", p, x=cx, y=1.0, z=z(-1.4), radio=0.35, soporte=True)
    elif re.search(r"braceo", n):
        for dx, dz in ((-0.7, -0.7), (0.7, -0.7), (-0.7, 0.7), (0.7, 0.7)):
            esc.aro(p, x(dx), z(dz), "celeste")
    elif re.search(r"cuerda", n):
        esc.cuerda(p, [(x(-1.2), z(0.1)), (x(1.2), z(0.1))], "azul")
        esc.cuerda(p, [(x(-1.2), z(-0.7)), (x(1.2), z(-0.7))], "azul")
    elif re.search(r"colchoneta|frontal|salto", n):
        esc.linea(p, [(x(-0.8), z(1.1)), (x(0.8), z(1.1))], "blanco", 0.06)
        esc.add("colchoneta", p, x=cx, z=z(-0.4), ancho=1.0 * s, largo=2.0 * s)
    else:
        for dx, dz in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            esc.cono(p, x(dx), z(dz), "azul")


def _circuito(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    nombres = _nombres_estaciones(o, t)
    n = _cantidad(t, "estaciones") or (len(nombres) if nombres else None)
    if "todas las" in t and not nombres:
        nombres = [f"Estación de {m.lower()}" for m in (_materiales_en(t) or MATERIALES_BASE)]
        n = n or len(nombres)
    n = max(2, min(8, n or 4))
    if len(nombres) < n:
        # «4 estaciones de braceo estático y en desplazamiento»: todas comparten el tema
        tema = re.search(r"estaciones\s+(?:de\s+)?([^.,(:]+)", o, re.I)
        nombres = [tema.group(1).strip() if tema else f"Estación {k + 1}" for k in range(n)]
    nombres = nombres[:n]
    cols = 2 if n <= 4 else math.ceil(n / 2)
    filas = math.ceil(n / cols)
    dims = _dimensiones(t)
    celda_w, celda_l = 6.0, 7.5
    if dims:
        celda_w, celda_l = dims[1] / cols, dims[0] / filas
    s = max(0.6, min(1.0, celda_w / 6.0, celda_l / 7.5))
    esc.ajustar(cols * celda_w, filas * celda_l)
    p = esc.paso(f"Delimita el espacio de {_m(esc.ancho)} × {_m(esc.largo)} y divídelo en {n} estaciones "
                 f"(una por cuadro, numeradas en el sentido de rotación).")
    esc.delimitar(p)
    # orden en «serpiente» para que la rotación forme un circuito cerrado
    celdas = []
    for r in range(filas):
        fila = [(c, r) for c in range(cols)]
        celdas.extend(fila if r % 2 == 0 else fila[::-1])
    posiciones = []
    for k in range(n):
        c, r = celdas[k]
        cx = -esc.ancho / 2 + (c + 0.5) * celda_w
        cz = -esc.largo / 2 + (r + 0.5) * celda_l - 0.4 * s
        posiciones.append((cx, cz))
    for k, ((cx, cz), nombre) in enumerate(zip(posiciones, nombres)):
        pk = esc.paso(f"Estación {k + 1} · {nombre}: arma el material como se ve en el cuadro {k + 1}.")
        _estacion(esc, pk, cx, cz, nombre, k, s)
        esc.fila(cx, cz + 2.4 * s, columnas=3 if esc.estudiantes / n > 5 else 2)
    pr = esc.paso("Señala la rotación con flechas en el piso (cada grupo pasa a la estación siguiente).")
    for k in range(n):
        (x0, z0), (x1, z1) = posiciones[k], posiciones[(k + 1) % n]
        if n == 2 and k == 1:
            break
        dx, dz = x1 - x0, z1 - z0
        d = math.hypot(dx, dz) or 1
        ux, uz = dx / d, dz / d
        esc.add("flecha", pr, puntos=[[x0 + ux * 2.0 * s, z0 + uz * 2.0 * s], [x1 - ux * 2.0 * s, z1 - uz * 2.0 * s]], color="azul")
    minutos = ctx.get("minutos_central")
    if minutos:
        esc.pasos[pr] += f" Con {minutos} min de parte central: cambio cada {max(1, minutos // n)} min."
    esc.organizar = "grupos, uno por estación"
    esc.resumen = f"Circuito de {n} estaciones"
    esc.docente = {"x": 0.0, "z": 0.0 if filas > 1 else esc.largo / 2 + 1.2,
                   "consejo": "Párate en el centro del circuito: con solo girar ves todas las estaciones; da la señal "
                              "de rotación con el silbato.", "mira": [0.0, -1.0]}


def _postes(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    n = _carriles_por_grupo(esc, 4, 6, 5)
    sep = 2.0
    esc.ajustar(n * sep + 2, 8.0)
    zp = -esc.largo / 2
    p = esc.paso(f"Frente a una pared, pon {n} postes o conos altos en línea, separados {_m(sep)} y a 3 m de la pared.")
    esc.add("pared", p, x=0, z=zp - 0.1, ancho=esc.ancho, alto=3.0)
    xs = [-(n - 1) * sep / 2 + i * sep for i in range(n)]
    zl = zp + 3
    for x in xs:
        esc.add("poste", p, x=x, z=zl, alto=1.4, marca=1.0, color="rojo")
    esc.cota(p, (xs[0], 0, zl + 0.4), (xs[1], 0, zl + 0.4))
    esc.cota(p, (xs[-1] + 0.6, 0, zp), (xs[-1] + 0.6, 0, zl))
    pm = esc.paso("Marca cada poste con cinta roja a 1 m del piso (altura del hombro): el codo debe llegar ahí al armar.")
    esc.cota(pm, (xs[0] + 0.25, 0, zl), (xs[0] + 0.25, 1.0, zl))
    pd = esc.paso("Pega una marca alta en la pared frente a cada poste, a 2 m del piso: es el objetivo del lanzamiento.")
    for x in xs:
        esc.add("diana", pd, x=x, y=2.0, z=zp, radio=0.25, pared=True)
    for x in xs:
        esc.fila(x + 0.4, zl + 1.0)
    esc.resumen = f"{n} postes con marca de codo frente a la pared"
    _docente_costado(esc, zl, "Ubícate al costado de la línea de postes: de perfil se ve mejor si el codo sube "
                              "hasta la marca.")


def _serpiente(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    n = _carriles_por_grupo(esc, 3, 4, 7)
    p = esc.paso(f"Arma {n} estaciones de «serpiente» separadas 3 m: una cuerda de 4 m en el piso con un ayudante "
                 f"en cada punta que la mueve suave, a ras de suelo.")
    centros, z0, z1 = _pistas(esc, p, n, 3.0, 7.0, lineas=False)
    for cx in centros:
        zc = z0 - 2.0
        puntos = [(cx - 1.5 + k * 0.5, zc + 0.25 * math.sin(k * 1.4)) for k in range(7)]
        esc.cuerda(p, puntos, "rojo", ondulada=True)
        esc.cono(p, cx - 1.6, zc, "azul")
        esc.cono(p, cx + 1.6, zc, "azul")
        esc.linea(p, [(cx - 0.8, z0), (cx + 0.8, z0)], "blanco", 0.08)
    esc.cota(p, (centros[0] - 1.5, 0, z0 - 2.6), (centros[0] + 1.5, 0, z0 - 2.6), "~4 m de cuerda")
    pr = esc.paso("Detrás de cada serpiente, un pasillo de salto rítmico: 4 aros seguidos cada 80 cm.")
    for cx in centros:
        for k in range(4):
            esc.aro(pr, cx, z0 - 3.5 - k * 0.8)
    esc.cota(pr, (centros[-1] + 0.6, 0, z0 - 3.5), (centros[-1] + 0.6, 0, z0 - 4.3))
    esc.resumen = f"{n} serpientes + pasillo rítmico"
    _docente_costado(esc, z0 - 2, "Ubícate al costado, a la altura de las cuerdas: marcas el ritmo de la serpiente "
                                  "y ves si caen con los dos pies.")


def _cintas(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    alto = next((lst[0] for lst in _listas_tras_a(t) if lst[0] < 3), 1.5)
    n = _carriles_por_grupo(esc, 3, 5, 6)
    p = esc.paso(f"Traza {n} líneas de salto separadas 2,5 m.")
    centros, z0, z1 = _pistas(esc, p, n, 2.5, 4.0, lineas=False)
    for cx in centros:
        esc.linea(p, [(cx - 0.8, z0), (cx + 0.8, z0)], "blanco", 0.1)
    pc = esc.paso(f"A 1 m de cada línea, tiende una cinta entre dos postes a {_m(alto)} de altura: se salta "
                  f"intentando tocarla con las manos.")
    for cx in centros:
        esc.add("cinta", pc, desde=[cx - 0.9, z0 - 1], hasta=[cx + 0.9, z0 - 1], altura=alto)
    esc.cota(pc, (centros[0] - 1.1, 0, z0 - 1), (centros[0] - 1.1, alto, z0 - 1))
    esc.cota(pc, (centros[0] + 1.1, 0, z0), (centros[0] + 1.1, 0, z0 - 1))
    pz = esc.paso("Deja 2 m libres para caer (colchoneta si el piso es duro).")
    for cx in centros:
        esc.add("colchoneta", pz, x=cx, z=z0 - 2.4, ancho=1.2, largo=1.8)
    esc.resumen = f"{n} líneas con cinta a {_m(alto)}"
    _docente_costado(esc, z0 - 1, "Ubícate al costado de las cintas: de perfil ves si los brazos van de atrás "
                                  "hacia arriba.")


def _rayuela(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    islas = max(6, min(18, _cantidad(t, "islas") or 12))
    cols = 3
    filas = math.ceil(islas / cols)
    p = esc.paso(f"Arma una cuadrícula de {cols} × {filas} «islas» alternando colchonetas y aros numerados del 1 al "
                 f"{islas}; deja entre 1 y 1,5 m de «agua» entre islas.")
    alto = filas * 2.6
    esc.ajustar(10.0, alto + 3.6)
    arriba = alto / 2 - 1.2
    k = 0
    for r in range(filas):
        for c in range(cols):
            if k >= islas:
                break
            x = (c - 1) * 2.6
            z = arriba - r * 2.6 - (0.3 if c == 1 else 0)
            k += 1
            if (r + c) % 2 == 0:
                esc.add("colchoneta", p, x=x, z=z, ancho=1.2, largo=1.2)
                esc.etiqueta(p, x, z, str(k), y=0.3)
            else:
                esc.aro(p, x, z, "amarillo", str(k))
    esc.cota(p, (-2.6 + 0.6, 0.1, arriba), (-0.6, 0.1, arriba - 0.3), None)
    esc.cota(p, (-2.6, 0.1, arriba - 0.6), (-2.6, 0.1, arriba - 2.6 + 0.6))
    pa = esc.paso("Pinta de azul el «agua» y marca la orilla de salida con una línea; la isla final con conos verdes.")
    esc.zona(pa, 0, arriba - (filas - 1) * 1.3 - 0.4, 8.0, alto + 0.2, "celeste", None)
    esc.linea(pa, [(-4, arriba + 2.2), (4, arriba + 2.2)], "blanco", 0.1)
    esc.etiqueta(pa, -4.6, arriba + 2.2, "Orilla")
    for x in (-1, 1):
        esc.cono(pa, x * 1.2, arriba - (filas - 1) * 2.6 - 2.1, "verde")
    for x in (-2.6, 0, 2.6):
        esc.fila(x, arriba + 2.8)
    esc.resumen = f"Rayuela de {islas} islas"
    _docente_costado(esc, 0, "Ubícate a un costado de la cuadrícula, a la mitad: ves cada salto y cuentas los "
                             "2 segundos de equilibrio en la isla.")


def _escalera(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    n = _carriles_por_grupo(esc, 3, 5, 7)
    peldanos = _cantidad(t, "peldanos") or 8
    sep = _metros_tras(t, "cada") or 0.45
    aros = "aro" in t
    tramo = (peldanos - 1) * sep
    p = esc.paso(f"Dibuja con tiza {n} escaleras de {peldanos} peldaños (70 cm de ancho, {_m(sep)} entre peldaños), "
                 "separadas 2,5 m.")
    centros, z0, z1 = _pistas(esc, p, n, 2.5, tramo + (5.85 if aros else 1.5), lineas=False)
    for cx in centros:
        esc.linea(p, [(cx - 0.35, z0), (cx - 0.35, z0 - tramo)], "amarillo", 0.05)
        esc.linea(p, [(cx + 0.35, z0), (cx + 0.35, z0 - tramo)], "amarillo", 0.05)
        for k in range(peldanos):
            esc.linea(p, [(cx - 0.35, z0 - k * sep), (cx + 0.35, z0 - k * sep)], "amarillo", 0.05)
    esc.cota(p, (centros[0] - 0.6, 0, z0), (centros[0] - 0.6, 0, z0 - sep))
    esc.cota(p, (centros[0] - 0.35, 0, z0 + 0.35), (centros[0] + 0.35, 0, z0 + 0.35))
    if aros:
        pa = esc.paso("Después de cada escalera pon 4 aros con separación progresiva: 60, 80, 100 y 120 cm.")
        for cx in centros:
            z = z0 - tramo - 1.0
            for k, s_aro in enumerate((0, 0.6, 0.8, 1.0)):
                z -= s_aro + (0.6 if k else 0)
                esc.aro(pa, cx, z)
        z = z0 - tramo - 1.0
        esc.cota(pa, (centros[-1] + 0.6, 0, z - 0.3), (centros[-1] + 0.6, 0, z - 0.9))
    esc.resumen = f"{n} escaleras" + ("" if peldanos == 8 else f" de {peldanos} peldaños") + (" + aros progresivos" if aros else "")
    _docente_costado(esc, z0 - 3, "Ubícate al costado, al final de las escaleras: ahí se ve si mantienen la postura "
                                  "al aumentar la velocidad.")


def _hileras(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    aros = _cantidad(t, "aros") or 6
    sep_vallas = next((lst[0] for lst in _listas_tras_a(t) if lst[0] < 2), 0.8)
    n = _carriles_por_grupo(esc, 3, 5, 7)
    p = esc.paso(f"Pon {n} hileras de {aros} aros consecutivos (tocándose), separadas 2,5 m.")
    largo = aros * 0.65 + 1.5 + 4 * sep_vallas
    centros, z0, z1 = _pistas(esc, p, n, 2.5, largo, lineas=False)
    for cx in centros:
        for k in range(aros):
            esc.aro(p, cx, z0 - 0.35 - k * 0.65, ["amarillo", "rojo"][k % 2])
    pv = esc.paso(f"Al final de cada hilera, deja 1,5 m y pon 4 mini-vallas de espuma separadas {_m(sep_vallas)}.")
    for cx in centros:
        zv = z0 - aros * 0.65 - 1.5
        for k in range(4):
            esc.add("valla", pv, x=cx, z=zv - k * sep_vallas, ancho=0.6, alto=0.2)
    zv = z0 - aros * 0.65 - 1.5
    esc.cota(pv, (centros[0] - 0.6, 0.2, zv), (centros[0] - 0.6, 0.2, zv - sep_vallas))
    esc.cota(pv, (centros[0] + 0.6, 0, z0 - aros * 0.65), (centros[0] + 0.6, 0, zv))
    esc.resumen = f"{n} hileras de {aros} aros + vallas a {_m(sep_vallas)}"
    _docente_costado(esc, z0 - aros * 0.65, "Ubícate al costado, entre aros y vallas: escuchas si caen suave y "
                                            "ves el rebote al siguiente aro.")


def _despegue(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    sep = _metros_tras(t, "cada") or 2.0
    n = max(4, min(8, math.ceil(esc.estudiantes / 4)))
    p = esc.paso(f"Marca {n} zonas de despegue en línea, separadas {_m(sep)} (una tira de cinta de 1 m en el piso).")
    total = (n - 1) * sep
    esc.ajustar(total + 4, 8.0)
    z0 = 1.5
    xs = [-total / 2 + i * sep for i in range(n)]
    for x in xs:
        esc.linea(p, [(x - 0.5, z0), (x + 0.5, z0)], "blanco", 0.1)
        esc.cono(p, x - 0.6, z0, "naranja")
    esc.cota(p, (xs[0], 0, z0 + 0.5), (xs[1], 0, z0 + 0.5))
    pz = esc.paso("Delante de cada marca deja 2,5 m libres para caer; señálalos con dos conos al fondo.")
    for x in xs:
        esc.zona(pz, x, z0 - 1.5, 1.2, 2.5, "verde")
        esc.cono(pz, x - 0.6, z0 - 2.8, "verde")
        esc.cono(pz, x + 0.6, z0 - 2.8, "verde")
    esc.cota(pz, (xs[-1] + 0.9, 0, z0), (xs[-1] + 0.9, 0, z0 - 2.5))
    for x in xs:
        esc.fila(x, z0 + 1.0)
    esc.resumen = f"{n} zonas de despegue cada {_m(sep)}"
    esc.docente = {"x": xs[0] - 2.5, "z": z0 - 1.0, "consejo": "Ubícate al extremo de la fila de despegues, de perfil "
                   "a los niños: así ves rodillas, talones y brazos de todos a la vez.", "mira": [0.0, z0 - 1.0]}


def _despegue_distancias(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    distancias = next((lst for lst in _listas_tras_a(t) if len(lst) > 1), [0.5, 1.0, 1.5])
    n = _carriles_por_grupo(esc, 4, 6, 6)
    p = esc.paso(f"Arma {n} estaciones separadas 2,5 m, cada una con una línea de despegue.")
    centros, z0, z1 = _pistas(esc, p, n, 2.5, max(distancias) + 2, lineas=False)
    for cx in centros:
        esc.linea(p, [(cx - 0.7, z0), (cx + 0.7, z0)], "blanco", 0.1)
    pd = esc.paso("Pon dianas de distancia (líneas de color o aros) a " + ", ".join(_m(d) for d in distancias[:-1])
                  + f" y {_m(distancias[-1])} de la línea de despegue.")
    colores = ["verde", "amarillo", "rojo", "morado"]
    for cx in centros:
        for k, d in enumerate(distancias):
            esc.linea(pd, [(cx - 0.6, z0 - d), (cx + 0.6, z0 - d)], colores[k % 4], 0.08)
    for k, d in enumerate(distancias):
        esc.cota(pd, (centros[0] - 0.9 - k * 0.35, 0, z0), (centros[0] - 0.9 - k * 0.35, 0, z0 - d))
    esc.resumen = f"{n} estaciones con dianas a " + ", ".join(_m(d) for d in distancias)
    _docente_costado(esc, z0 - 1, "Ubícate al costado de las estaciones, a la altura de las dianas: de perfil se ve "
                                  "la triple extensión al despegar.")


def _huellas(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    n = _carriles_por_grupo(esc, 4, 6, 5)
    sep = 2.0
    total = (n - 1) * sep
    esc.ajustar(total + 4, 10.0)
    z0 = 2.0
    xs = [-total / 2 + i * sep for i in range(n)]
    p = esc.paso(f"Dibuja {n} pares de huellas separados {_m(sep)}: pie derecho atrás y pie izquierdo 60 cm adelante "
                 f"(para diestros; al revés para zurdos).")
    for x in xs:
        esc.add("huella", p, x=x + 0.15, z=z0 + 0.3, lado="der", rot=0.5)
        esc.add("huella", p, x=x - 0.1, z=z0 - 0.3, lado="izq", rot=0.2)
    esc.cota(p, (xs[0] + 0.5, 0, z0 + 0.3), (xs[0] + 0.5, 0, z0 - 0.3))
    pd = esc.paso("A 5 m de las huellas pon un cono-diana por puesto para lanzar las pelotas de espuma.")
    for x in xs:
        esc.cono(pd, x, z0 - 5, "azul")
    esc.cota(pd, (xs[-1] + 0.8, 0, z0), (xs[-1] + 0.8, 0, z0 - 5))
    for x in xs:
        esc.fila(x, z0 + 1.2)
    esc.resumen = f"{n} puestos con huellas contralaterales"
    _docente_costado(esc, z0, "Ubícate al costado de la línea de huellas: así ves de perfil el paso con el pie "
                              "contrario y el giro de la cadera.")


def _caida(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    n = _carriles_por_grupo(esc, 3, 5, 6)
    p = esc.paso(f"Pon {n} colchonetas (o zonas de césped) separadas 2,5 m, delimitadas con 4 conos cada una.")
    centros, z0, z1 = _pistas(esc, p, n, 2.5, 3.0, lineas=False)
    for cx in centros:
        esc.add("colchoneta", p, x=cx, z=z0 - 1.6, ancho=1.2, largo=2.0)
        for dx in (-0.8, 0.8):
            for dz in (-0.4, -2.8):
                esc.cono(p, cx + dx, z0 + dz, "naranja")
    pl = esc.paso("Traza la línea de salto a 50 cm del borde de cada colchoneta.")
    for cx in centros:
        esc.linea(pl, [(cx - 0.6, z0), (cx + 0.6, z0)], "blanco", 0.1)
    esc.cota(pl, (centros[0] - 1.0, 0, z0), (centros[0] - 1.0, 0, z0 - 0.6))
    esc.resumen = f"{n} zonas de caída acolchadas"
    _docente_costado(esc, z0 - 1.6, "Ubícate al costado de las colchonetas: escuchas si el aterrizaje es silencioso "
                                    "y ves si doblan tobillos, rodillas y cadera.")


def _campo_metrico(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    cada = _metros_tras(t, "cada") or 2.0
    hasta = _metros_tras(t, r"hasta(?:\s+los)?") or 20.0
    ancho = 10.0
    accion = "pateo" if re.search(r"pate|golpe", t) else "pase" if re.search(r"atrap|pase", t) else "lanzamiento"
    esc.ajustar(ancho + 2, hasta + 6)
    z0 = esc.largo / 2 - 4
    p = esc.paso(f"Traza la línea de {accion} de {_m(ancho)} y marca líneas cada {_m(cada)} hasta los {_m(hasta)}.")
    esc.linea(p, [(-ancho / 2, z0), (ancho / 2, z0)], "blanco", 0.12)
    esc.etiqueta(p, -ancho / 2 - 1.2, z0, accion.capitalize())
    d = cada
    colores = ["amarillo", "naranja", "rojo", "morado", "azul"]
    while d <= hasta + 1e-6:
        esc.linea(p, [(-ancho / 2, z0 - d), (ancho / 2, z0 - d)], colores[int(d // 4) % 5], 0.05)
        if round(d) % 4 == 0 or d == cada:
            esc.etiqueta(p, ancho / 2 + 0.6, z0 - d, _m(d), y=0.2)
        esc.cono(p, -ancho / 2, z0 - d, "naranja")
        d += cada
    esc.cota(p, (-ancho / 2 - 0.6, 0, z0), (-ancho / 2 - 0.6, 0, z0 - cada))
    esc.cota(p, (-ancho / 2 - 1.4, 0, z0), (-ancho / 2 - 1.4, 0, z0 - hasta))
    ps = esc.paso(f"Zona de seguridad: nadie pasa la línea de {accion} hasta la señal «¡a recoger!».")
    esc.zona(ps, 0, z0 - hasta / 2, ancho, hasta, "rojo")
    xs = [-3.75, -1.25, 1.25, 3.75]
    for x in xs:
        esc.add("balon", ps, x=x, z=z0 + 0.3, color="rojo")
        esc.fila(x, z0 + 0.8)
    esc.resumen = f"Campo de {_m(hasta)} con marcas cada {_m(cada)}"
    verbo = {"lanzamiento": "lanzar", "pateo": "patear", "pase": "pasar"}[accion]
    _docente_costado(esc, z0 - 1, f"Párate al costado de la línea de {accion}, nunca en el campo: das la señal "
                                  f"de {verbo} y de recoger.")


def _refugios(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    ancho, largo = _dimensiones(t) or (15.0, 20.0)
    esc.ajustar(ancho, largo)
    p = esc.paso(f"Delimita el espacio de {_m(ancho)} × {_m(largo)} con conos en las esquinas y en la mitad de cada lado.")
    esc.delimitar(p)
    for x, z in ((0, -largo / 2), (0, largo / 2), (-ancho / 2, 0), (ancho / 2, 0)):
        esc.cono(p, x, z)
    pr = esc.paso("Marca 4 refugios de 2 × 2 m a 2 m de cada esquina (zonas verdes) y uno en el centro.")
    for x, z in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        esc.zona(pr, x * (ancho / 2 - 3), z * (largo / 2 - 3), 2, 2, "verde", "Refugio")
    esc.zona(pr, 0, 0, 2, 2, "verde", "Refugio")
    esc.cota(pr, (-ancho / 2, 0, -largo / 2 + 3), (-ancho / 2 + 2, 0, -largo / 2 + 3))
    esc.disperso = True
    esc.organizar = "cazadores con peto rojo y guardianes en azul"
    esc.resumen = f"Espacio de {_m(ancho)} × {_m(largo)} con 5 refugios"


def _cuadrantes(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    ancho, largo = _dimensiones(t) or (10.0, 15.0)
    esc.ajustar(ancho, largo)
    p = esc.paso(f"Delimita la cancha de {_m(ancho)} × {_m(largo)}.")
    esc.delimitar(p)
    pc = esc.paso("Divídela en 4 cuadrantes con dos líneas por el centro; un grupo en cada cuadrante.")
    esc.linea(pc, [(0, -largo / 2), (0, largo / 2)], "amarillo", 0.08)
    esc.linea(pc, [(-ancho / 2, 0), (ancho / 2, 0)], "amarillo", 0.08)
    for i, (x, z) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        esc.zona(pc, x * ancho / 4, z * largo / 4, ancho / 2 - 0.2, largo / 2 - 0.2, COLORES_FILA[i], "ABCD"[i])
        if not re.search(r"march|camin|equilibr|estatua|pata coja", t):
            esc.add("balon", pc, x=x * ancho / 4, z=z * largo / 4, color="amarillo")
    esc.disperso = True
    esc.organizar = "dos equipos repartidos en los cuadrantes"
    esc.resumen = f"Cancha de {_m(ancho)} × {_m(largo)} en cuadrantes"


def _ataque(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    w, l = 5.0, 8.0
    n = 4
    esc.ajustar(2 * w + 3, 2 * l + 3)
    p = esc.paso(f"Marca {n} mini-canchas de {_m(w)} × {_m(l)} con conos, separadas 3 m.")
    centros = [(sx * (w + 3) / 2, sz * (l + 3) / 2) for sz in (-1, 1) for sx in (-1, 1)]
    for cx, cz in centros:
        for dx in (-1, 1):
            for dz in (-1, 1):
                esc.cono(p, cx + dx * w / 2, cz + dz * l / 2)
    esc.cota(p, (centros[2][0] - w / 2, 0, centros[2][1] + l / 2 + 0.5), (centros[2][0] + w / 2, 0, centros[2][1] + l / 2 + 0.5))
    esc.cota(p, (centros[2][0] - w / 2 - 0.5, 0, centros[2][1] + l / 2), (centros[2][0] - w / 2 - 0.5, 0, centros[2][1] - l / 2))
    pz = esc.paso("En cada una: mitad de atrás «zona de ataque» (2 atacantes), mitad de adelante «zona de defensa» "
                  "(1 defensor) y 2 dianas o arcos al fondo.")
    for cx, cz in centros:
        esc.zona(pz, cx, cz + l / 4, w - 0.2, l / 2 - 0.1, "azul", "Ataque")
        esc.zona(pz, cx, cz - l / 4, w - 0.2, l / 2 - 0.1, "rojo", "Defensa")
        esc.add("diana", pz, x=cx - 1.2, y=1.0, z=cz - l / 2 + 0.3, radio=0.3, soporte=True)
        esc.add("diana", pz, x=cx + 1.2, y=1.0, z=cz - l / 2 + 0.3, radio=0.3, soporte=True)
        esc.fila(cx + w / 2 + 0.6, cz + l / 2, dx=0, dz=-1)
    esc.organizar = "tríos (2 atacantes + 1 defensor) por mini-cancha y el resto esperando turno al costado"
    esc.resumen = f"{n} mini-canchas de ataque y defensa"
    esc.docente = {"x": 0.0, "z": 0.0, "consejo": "Párate en el cruce entre las 4 mini-canchas: ves todas las "
                                                  "decisiones de pase o lanzamiento.", "mira": [0.0, 1.0]}


# ---------------------------------------------------------------- recetas por habilidad (marcha, equilibrio,
# salto unipodal, atrape y pateo). Cada una sale de una tarea de los libros de la carpeta Data.

def _con_pelota(t: str) -> bool:
    return bool(re.search(r"pelota|balon|pase|patea|atrap", t))


def _senderos(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Huellas de tiza (Unidad «El arte de marchar»): una recta, una curva y una en zigzag."""
    largo = _metros_tras(t, r"\bde") or 9.0
    sep = 3.0
    p = esc.paso(f"Dibuja con tiza 3 senderos de {_m(largo)}: uno recto, uno en curva y uno en zigzag, separados {_m(sep)}.")
    centros, z0, z1 = _pistas(esc, p, 3, sep, largo, lineas=False)
    pasos = 12
    for k, cx in enumerate(centros):
        if k == 0:
            puntos = [(cx, z0), (cx, z1)]
        elif k == 1:
            puntos = [(cx + 0.8 * math.sin(i / pasos * 2 * math.pi), z0 - largo * i / pasos) for i in range(pasos + 1)]
        else:
            puntos = [(cx + (0.6 if i % 2 else -0.6) * (0 < i < 8), z0 - largo * i / 8) for i in range(9)]
        esc.linea(p, puntos, ["blanco", "amarillo", "celeste"][k], 0.07)
        esc.cono(p, cx, z0 + 0.3, "verde")
        esc.cono(p, cx, z1 - 0.3, "rojo")
        esc.etiqueta(p, cx, z1 - 0.9, ["Recto", "Curva", "Zigzag"][k])
    esc.cota(p, (centros[0] - 1.0, 0, z0), (centros[0] - 1.0, 0, z1))
    esc.cota(p, (centros[0], 0, z0 + 0.8), (centros[1], 0, z0 + 0.8))
    esc.resumen = f"3 senderos de tiza de {_m(largo)} (recto, curvo y zigzag)"
    _docente_costado(esc, (z0 + z1) / 2, "Ubícate al costado, a mitad de los senderos: de perfil ves el apoyo del pie, "
                                         "el tronco y el braceo de los tres grupos.")


def _linea_9m(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Prueba 1 y 14 de la batería: línea recta de 9 m (5 cm de ancho) con un cono al final."""
    n = _cantidad(t, "lineas") or _carriles_por_grupo(esc, 3, 5, 6)
    largo = _metros_tras(t, r"\bde") or 9.0
    sep = 2.0
    p = esc.paso(f"Pega {n} líneas rectas de cinta (5 cm de ancho) de {_m(largo)}, separadas {_m(sep)}, con un cono al final.")
    centros, z0, z1 = _pistas(esc, p, n, sep, largo, lineas=False, atras=4.0, frente=2.5)
    for cx in centros:
        esc.linea(p, [(cx, z0), (cx, z1)], "blanco", 0.05)
        esc.cono(p, cx, z1 - 0.3, "naranja")
        esc.linea(p, [(cx - 0.4, z0), (cx + 0.4, z0)], "verde", 0.08)
    esc.cota(p, (centros[0] - 0.7, 0, z0), (centros[0] - 0.7, 0, z1))
    esc.cota(p, (centros[0], 0, z0 + 0.5), (centros[1], 0, z0 + 0.5))
    if re.search(r"diana|mirada|tarjeta", t):
        pd = esc.paso("Al final de cada línea pon una tarjeta de color o diana a la altura de los ojos (1,2 m): "
                      "es el punto que se mira todo el recorrido.")
        for cx in centros:
            esc.add("diana", pd, x=cx, y=1.2, z=z1 - 0.9, radio=0.2)
        esc.cota(pd, (centros[-1] + 0.5, 0, z1 - 0.9), (centros[-1] + 0.5, 1.2, z1 - 0.9))
    esc.resumen = f"{n} líneas de {_m(largo)} (prueba de la batería)"
    _docente_costado(esc, z1 + 1.5, "Párate al final de las líneas, de frente a los niños: ves si los pies se salen "
                                    "de la línea y si la mirada va al cono y no al suelo.")


def _banco(esc: Escena, p: int, x: float, z: float, largo: float = 3.0, rot: float = 0.0) -> None:
    esc.add("banco", p, x=x, z=z, largo=largo, rot=rot)


def _bancos(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Pérez Feito (6-7 años, «Equilibrio estático y en altura»): bancos suecos en fila, uno detrás de otro."""
    bancos = _cantidad(t, "bancos") or 3
    n = 2 if esc.estudiantes > 12 else 1
    largo = bancos * 3.0
    p = esc.paso(f"Arma {n} recorrido{'s' if n > 1 else ''} de {bancos} bancos suecos uno tras otro "
                 f"({_m(largo)}), separados 3 m.")
    centros, z0, z1 = _pistas(esc, p, n, 3.5, largo + 1.0, lineas=False, atras=4.0, frente=3.0)
    for cx in centros:
        for k in range(bancos):
            _banco(esc, p, cx, z0 - 0.5 - 1.5 - k * 3.0)
        esc.linea(p, [(cx - 0.6, z0), (cx + 0.6, z0)], "blanco", 0.1)
    esc.cota(p, (centros[0] - 0.8, 0.3, z0 - 0.5), (centros[0] - 0.8, 0.3, z0 - 0.5 - largo))
    if "colchoneta" in t:
        pc = esc.paso("Al final de cada recorrido pon una colchoneta para bajar con un salto controlado.")
        for cx in centros:
            esc.add("colchoneta", pc, x=cx, z=z0 - 0.5 - largo - 1.1, ancho=1.2, largo=1.6)
    pa = esc.paso("Pon un ayudante a cada lado del primer banco (dar la mano solo si alguien la pide).")
    for cx in centros:
        esc.cono(pa, cx - 0.7, z0 - 1.0, "azul")
        esc.cono(pa, cx + 0.7, z0 - 1.0, "azul")
    esc.resumen = f"{n} recorrido{'s' if n > 1 else ''} de {bancos} bancos suecos"
    _docente_costado(esc, z0 - 0.5 - largo / 2, "Ubícate al costado, a mitad de los bancos y a un paso de ellos: "
                                                "puedes dar apoyo y ver si la mirada va al frente.")


def _bancos_cuadro(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Pérez Feito («Equilibrio dinámico»): cuatro bancos en ángulo de 90°; en cada lado se avanza distinto."""
    lado = 3.0
    n = 2 if esc.estudiantes > 14 else 1
    esc.ajustar(n * (lado + 4) + 2, lado + 7)
    p = esc.paso(f"Arma {n} cuadrado{'s' if n > 1 else ''} de 4 bancos suecos ({_m(lado)} por lado) unidos en "
                 "ángulo de 90°.")
    formas = ["Adelante", "Atrás", "Cuadrupedia", "De lado"]
    for i in range(n):
        cx = (i - (n - 1) / 2) * (lado + 4)
        a = lado / 2
        lados = [((cx - a, 0.0), 0.0), ((cx, -a), math.pi / 2), ((cx + a, 0.0), 0.0), ((cx, a), math.pi / 2)]
        for k, ((x, z), rot) in enumerate(lados):
            _banco(esc, p, x, z, lado, rot)
            dx, dz = x - cx, z
            d = math.hypot(dx, dz) or 1
            esc.etiqueta(p, cx + dx / d * (a + 0.8), dz / d * (a + 0.8), f"{k + 1} · {formas[k]}")
        esc.fila(cx - a, a + 1.2)
        esc.add("flecha", p, puntos=[[cx - a + 0.6, a - 0.4], [cx - a + 0.6, -a + 0.6]], color="azul")
    x0 = -(n - 1) / 2 * (lado + 4)
    esc.cota(p, (x0 - lado / 2, 0.3, -lado / 2 - 1.6), (x0 + lado / 2, 0.3, -lado / 2 - 1.6))
    esc.resumen = f"{n} cuadrado{'s' if n > 1 else ''} de 4 bancos a 90°"
    esc.docente = {"x": 0.0, "z": -lado / 2 - 2.5, "consejo": "Párate frente a la esquina de los bancos 2 y 3: ahí "
                   "cambian de forma de avanzar y es donde más se desequilibran.", "mira": [0.0, 0.0]}


def _bancos_paralelos(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Pérez Feito («Equilibrio estático y dinámico»): dos bancos paralelos a medio metro, un pie en cada uno."""
    n = _carriles_por_grupo(esc, 2, 3, 9)
    sep = 0.5
    p = esc.paso(f"Arma {n} pasillos de 2 bancos suecos paralelos separados {_m(sep)} (se avanza con un pie en cada banco).")
    centros, z0, z1 = _pistas(esc, p, n, 3.5, 4.0, lineas=False)
    for cx in centros:
        _banco(esc, p, cx - sep / 2 - 0.12, z0 - 2.0)
        _banco(esc, p, cx + sep / 2 + 0.12, z0 - 2.0)
        esc.linea(p, [(cx - 0.8, z0), (cx + 0.8, z0)], "blanco", 0.1)
    esc.cota(p, (centros[0] - sep / 2, 0.35, z0 - 0.7), (centros[0] + sep / 2, 0.35, z0 - 0.7))
    esc.resumen = f"{n} pasillos de bancos paralelos a {_m(sep)}"
    _docente_costado(esc, z0 - 2, "Ubícate al costado de los pasillos: ves si el tronco se mantiene erguido al "
                                  "repartir el peso entre los dos bancos.")


def _parejas(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Parejas enfrentadas a una o varias distancias (Pérez Feito, «Juegos de lanzamientos y recepciones»)."""
    distancias = next((lst for lst in _listas_tras_a(t) if all(v >= 1 for v in lst)), None) or [3.0]
    d = distancias[0]
    pares = math.ceil(esc.estudiantes / 2)
    cols = min(pares, 8)
    filas_par = math.ceil(pares / cols)
    sep, fondo = 1.6, max(distancias) + 3.0
    esc.ajustar(cols * sep + 3, filas_par * fondo + 2)
    p = esc.paso(f"Traza dos líneas enfrentadas a {_m(d)} por cada fila de parejas (una pareja cada {_m(sep)}).")
    colores = ["amarillo", "naranja", "rojo", "morado"]
    for r in range(filas_par):
        zc = (r - (filas_par - 1) / 2) * fondo
        x0, x1 = -cols * sep / 2, cols * sep / 2
        for k, dk in enumerate(distancias):
            for lado in (-1, 1):
                esc.linea(p, [(x0, zc + lado * dk / 2), (x1, zc + lado * dk / 2)], colores[k % 4] if k else "blanco", 0.07)
        for c in range(cols):
            if r * cols + c >= pares:
                break
            x = x0 + sep * (c + 0.5)
            esc.puesto(x, zc + d / 2 + 0.25, (x, zc), r * cols + c)
            esc.puesto(x, zc - d / 2 - 0.25, (x, zc), r * cols + c)
            if _con_pelota(t):
                esc.add("balon", p, x=x + 0.3, z=zc + d / 2 + 0.3, color="amarillo")
        for k, dk in enumerate(distancias):
            esc.cota(p, (x1 + 0.6 + 1.1 * k, 0, zc + dk / 2), (x1 + 0.6 + 1.1 * k, 0, zc - dk / 2))
    if len(distancias) > 1:
        esc.pasos[p] += " Líneas de color a " + ", ".join(_m(v) for v in distancias[1:]) + ": se pasa a la siguiente tras 5 aciertos."
    esc.organizar = f"{pares} parejas, una frente a la otra"
    esc.resumen = f"{pares} parejas enfrentadas a " + ", ".join(_m(v) for v in distancias)
    _docente_costado(esc, 0, "Recorre el costado de las parejas: de perfil ves la postura de espera y cómo ceden "
                             "los brazos al recibir.")


def _corro(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Corros de 6 con uno en el centro (Pérez Feito, 8-9 años, «Anticipación de trayectorias»; rondo de fútbol)."""
    por = _cantidad(t, "estudiantes", "alumnos", "ninos", "jugadores") or 6
    g = max(1, math.ceil(esc.estudiantes / por))
    radio = _metros_tras(t, r"radio(?:\s+de)?") or 2.5
    cols = min(g, 3)
    filas = math.ceil(g / cols)
    paso = 2 * radio + 3
    esc.ajustar(cols * paso + 1, filas * paso + 1)
    p = esc.paso(f"Dibuja {g} círculos de tiza de {_m(radio)} de radio separados 3 m (uno por corro) y un aro en el centro.")
    for i in range(g):
        cx = (i % cols - (cols - 1) / 2) * paso
        cz = (i // cols - (filas - 1) / 2) * paso
        puntos = [(cx + radio * math.cos(a * math.pi / 16), cz + radio * math.sin(a * math.pi / 16)) for a in range(33)]
        esc.linea(p, puntos, "blanco", 0.06)
        esc.aro(p, cx, cz, "rojo")
        esc.puesto(cx, cz, (cx, cz + 1), i)
        for k in range(por - 1):
            a = 2 * math.pi * k / (por - 1)
            esc.puesto(cx + radio * math.cos(a), cz + radio * math.sin(a), (cx, cz), i)
        if _con_pelota(t):
            esc.add("balon", p, x=cx + radio - 0.3, z=cz, color="amarillo")
    esc.cota(p, (-(cols - 1) / 2 * paso, 0, -(filas - 1) / 2 * paso), (-(cols - 1) / 2 * paso + radio, 0, -(filas - 1) / 2 * paso))
    esc.organizar = f"{g} corros de {por} (uno en el centro dentro del aro)"
    esc.resumen = f"{g} corros de {por} con uno al centro"
    esc.docente = {"x": 0.0, "z": filas * paso / 2 + 1.0, "consejo": "Ubícate por fuera, en el borde del espacio: ves "
                   "todos los corros y cambias al del centro cada minuto.", "mira": [0.0, 0.0]}


def _porterias(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Prueba 10 de la batería: patear a una meta a 5 m desde un paso de distancia del balón."""
    d = next((lst[0] for lst in _listas_tras_a(t) if lst[0] >= 2), 5.0)
    n = _carriles_por_grupo(esc, 3, 5, 6)
    p = esc.paso(f"Pon {n} mini-porterías de 1,5 m en línea, separadas 3 m.")
    centros, z0, z1 = _pistas(esc, p, n, 3.0, d + 1.0, lineas=False, frente=1.5)
    for cx in centros:
        esc.add("porteria", p, x=cx, z=z1 + 0.5, ancho=1.5, alto=0.9)
    pm = esc.paso(f"Frente a cada portería, a {_m(d)}, marca con tiza el punto del balón y una línea un paso atrás.")
    for cx in centros:
        zb = z1 + 0.5 + d
        esc.add("balon", pm, x=cx, z=zb, color="blanco")
        esc.linea(pm, [(cx - 0.5, zb + 0.6), (cx + 0.5, zb + 0.6)], "amarillo", 0.08)
        esc.fila(cx, zb + 1.3)
    esc.cota(pm, (centros[0] - 1.1, 0, z1 + 0.5), (centros[0] - 1.1, 0, z1 + 0.5 + d))
    esc.cota(pm, (centros[0] - 0.75, 0, z1 + 0.1), (centros[0] + 0.75, 0, z1 + 0.1))
    esc.resumen = f"{n} mini-porterías a {_m(d)}"
    _docente_costado(esc, z1 + 0.5 + d, "Ubícate al costado, a la altura de los balones: de perfil ves el péndulo de "
                                        "la pierna desde la cadera y el brazo contrario.")


def _bolos(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Pérez Feito (8-9 años, «Juegos de iniciación al fútbol»): derribar conos o bolos con el pie."""
    d = next((lst[0] for lst in _listas_tras_a(t) if lst[0] >= 2), 4.0)
    n = _carriles_por_grupo(esc, 3, 5, 6)
    p = esc.paso(f"Traza {n} pasillos de 2,5 m de ancho y pon 6 bolos en triángulo al fondo de cada uno, a {_m(d)} de la línea de pateo.")
    centros, z0, z1 = _pistas(esc, p, n, 2.5, d + 1.5, salida="Pateo", llegada=None)
    for cx in centros:
        zb = z0 - d
        for fila_b, cant in enumerate((3, 2, 1)):
            for k in range(cant):
                esc.add("bolo", p, x=cx + (k - (cant - 1) / 2) * 0.28, z=zb - 0.25 * (2 - fila_b))
        esc.add("balon", p, x=cx, z=z0 + 0.2, color="blanco")
    esc.cota(p, (centros[-1] + 1.5, 0, z0), (centros[-1] + 1.5, 0, z0 - d))
    esc.resumen = f"{n} pasillos de bolos a {_m(d)}"
    _docente_costado(esc, z0 - d / 2, "Ubícate al costado de los pasillos: ves el apoyo junto al balón y si el pie "
                                      "sigue hacia los bolos después del golpe.")


def _estatuas(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Un aro por estudiante repartido por el espacio (trabajo individual de equilibrio o autolanzamientos)."""
    ancho, largo = _dimensiones(t) or (12.0, 14.0)
    esc.ajustar(ancho, largo)
    p = esc.paso(f"Delimita {_m(ancho)} × {_m(largo)} y reparte {esc.estudiantes} aros dispersos, a 2 m o más uno de otro.")
    esc.delimitar(p)
    for k, e in enumerate(esc._dispersos(esc.estudiantes)):
        esc.aro(p, e["x"], e["z"], ["amarillo", "verde", "rojo", "celeste"][k % 4])
        esc.puesto(e["x"], e["z"], (0.0, 0.0), k % 2)
        if _con_pelota(t):
            esc.add("balon", p, x=e["x"] + 0.35, z=e["z"], color="amarillo")
    esc.organizar = "cada uno dentro de su aro"
    esc.resumen = f"{esc.estudiantes} aros dispersos en {_m(ancho)} × {_m(largo)}"
    esc.docente = {"x": 0.0, "z": largo / 2 + 1.2, "consejo": "Párate en el borde, a mitad del lado largo: todos te "
                   "ven al dar la señal y tú ves a todos.", "mira": [0.0, 0.0]}


def _laberinto(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Unidad «El arte de marchar», actividad «Laberinto postal»: platillos y conos para esquivar en zigzag."""
    ancho, largo = _dimensiones(t) or (10.0, 14.0)
    platillos = _cantidad(t, "platillos") or 16
    conos = _cantidad(t, "conos") or 8
    esc.ajustar(ancho, largo + 3)
    p = esc.paso(f"Delimita {_m(ancho)} × {_m(largo)} y reparte {platillos} platillos y {conos} conos al azar, "
                 "dejando al menos 1 m entre ellos.")
    a, l = ancho / 2, largo / 2
    esc.linea(p, [(-a, -l), (a, -l), (a, l), (-a, l), (-a, -l)], "blanco", 0.06)
    semilla = 11 + platillos
    puestos = []
    while len(puestos) < platillos + conos:
        semilla = (semilla * 1103515245 + 12345) % 2 ** 31
        x = -a + 0.8 + (semilla % 1000) / 1000 * (ancho - 1.6)
        z = -l + 0.8 + ((semilla // 1000) % 1000) / 1000 * (largo - 1.6)
        if all(math.dist((x, z), q) >= 1.1 for q in puestos):
            puestos.append((x, z))
    for k, (x, z) in enumerate(puestos):
        if k < platillos:
            esc.add("platillo", p, x=x, z=z, color=["amarillo", "naranja", "verde"][k % 3])
        else:
            esc.cono(p, x, z, "rojo")
    pe = esc.paso("Marca la entrada (verde) y la salida (roja) en lados opuestos.")
    esc.zona(pe, 0, l + 0.8, 3, 1.4, "verde", "Entrada")
    esc.zona(pe, 0, -l - 0.8, 3, 1.4, "rojo", "Salida")
    esc.cota(pe, (-a - 0.7, 0, l), (-a - 0.7, 0, -l))
    esc.fila(-0.6, l + 1.8)
    esc.fila(0.6, l + 1.8)
    esc.organizar = "parejas en dos hileras en la entrada"
    esc.resumen = f"Laberinto de {platillos} platillos y {conos} conos"
    _docente_costado(esc, 0, "Ubícate al costado del laberinto: ves de perfil la postura y si esquivan sin tocar.")


def _estrella(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Líneas que salen de un centro (estrella): se va y se vuelve por el radio; o pases desde el centro."""
    radios = _cantidad(t, "lineas", "radios", "puntas") or 6
    largo = _metros_tras(t, r"\bde") or 4.0
    esc.ajustar(2 * largo + 5, 2 * largo + 5)
    p = esc.paso(f"Desde un aro central traza {radios} líneas de {_m(largo)} en estrella, con un cono en cada punta.")
    esc.aro(p, 0, 0, "rojo")
    for k in range(radios):
        a = 2 * math.pi * k / radios
        ux, uz = math.cos(a), math.sin(a)
        esc.linea(p, [(ux * 0.4, uz * 0.4), (ux * largo, uz * largo)], ["amarillo", "blanco"][k % 2], 0.06)
        esc.cono(p, ux * (largo + 0.3), uz * (largo + 0.3), COLORES_FILA[k % len(COLORES_FILA)])
        esc.fila(ux * (largo + 0.9), uz * (largo + 0.9), dx=ux, dz=uz)
    esc.cota(p, (0, 0, 0), (largo, 0, 0))
    if _con_pelota(t):
        pb = esc.paso("Deja una pelota en el aro central: quien está en el centro la pasa a la primera persona de cada punta.")
        esc.add("balon", pb, x=0.2, z=0.0, color="amarillo")
    esc.resumen = f"Estrella de {radios} líneas de {_m(largo)}"
    esc.docente = {"x": 0.0, "z": largo + 2.2, "consejo": "Párate por fuera, entre dos puntas: ves de frente a la mitad "
                   "del grupo y de perfil a la otra mitad.", "mira": [0.0, 0.0]}


def _escondite(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Juego «El escondite inglés» (Pérez Feito, «Equilibrio y ajustes corporales»): congelarse en equilibrio."""
    ancho, largo = _dimensiones(t) or (12.0, 16.0)
    esc.ajustar(ancho, largo)
    p = esc.paso(f"Delimita {_m(ancho)} × {_m(largo)}; traza la línea de salida al fondo y una «pared» al frente.")
    a, l = ancho / 2, largo / 2
    esc.linea(p, [(-a, l - 1), (a, l - 1)], "blanco", 0.1)
    esc.etiqueta(p, -a - 0.6, l - 1, "Salida")
    esc.zona(p, 0, -l + 1, ancho - 1, 1.6, "amarillo", "Pared (el que cuenta)")
    esc.cota(p, (a + 0.6, 0, l - 1), (a + 0.6, 0, -l + 1.8))
    for k in range(esc.estudiantes):
        x = -a + 0.6 + (ancho - 1.2) * (k + 0.5) / esc.estudiantes
        esc.puesto(x, l - 0.6 - 0.5 * (k % 2), (x, -l), k % 2)
    pz = esc.paso("Pinta 3 franjas de tiza a lo largo: quien se mueve fuera de equilibrio vuelve a la franja anterior.")
    for k in range(1, 4):
        z = l - 1 - k * (largo - 3) / 4
        esc.linea(pz, [(-a, z), (a, z)], "amarillo", 0.05)
    esc.organizar = "todos en la línea de salida; uno cuenta de espaldas en la «pared»"
    esc.resumen = f"Escondite inglés en {_m(ancho)} × {_m(largo)}"
    esc.docente = {"x": a + 1.2, "z": -l + 2.5, "consejo": "Párate junto a quien cuenta: ves de frente quién queda "
                   "quieto en un pie y quién apoya otra parte.", "mira": [0.0, 0.0]}


def _colchonetas_circulo(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Prueba 15 de la batería (descalzo sobre colchoneta), en estaciones alrededor del docente."""
    k = max(4, min(8, math.ceil(esc.estudiantes / 3)))
    radio = max(3.0, k * 0.75)
    esc.ajustar(2 * radio + 4, 2 * radio + 4)
    p = esc.paso(f"Pon {k} colchonetas en círculo de {_m(radio)} de radio, con la cabecera mirando al centro.")
    for i in range(k):
        a = 2 * math.pi * i / k
        x, z = radio * math.cos(a), radio * math.sin(a)
        esc.add("colchoneta", p, x=x, z=z, ancho=1.0, largo=1.0)
        esc.puesto(x, z, (0.0, 0.0), i)
        for j, off in enumerate((-0.9, 0.9)):
            ox, oz = -math.sin(a) * off, math.cos(a) * off
            esc.puesto(x * 1.25 + ox, z * 1.25 + oz, (x, z), i)
    esc.cota(p, (0, 0, 0), (radio, 0, 0))
    esc.organizar = "tríos por colchoneta: uno ejecuta descalzo, uno cuenta los 5 segundos y uno observa la postura"
    esc.resumen = f"{k} colchonetas en círculo"
    esc.docente = {"x": 0.0, "z": 0.0, "consejo": "Párate en el centro del círculo: ves de frente a todos los que "
                   "ejecutan y das la señal de inicio y fin de los 5 segundos.", "mira": [0.0, 1.0]}


def _pasos(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Huellas pintadas: alternas talón-punta (marcha) o de un solo pie en grupos de tres (salto unipodal)."""
    un_pie = "un solo pie" in t
    sep = _metros_tras(t, "cada") or (0.6 if un_pie else 0.5)
    n = _carriles_por_grupo(esc, 3, 5, 6)
    cuantas = 9 if un_pie else 14
    largo = cuantas * sep + (0.6 * 2 if un_pie else 0) + 1
    p = esc.paso(f"Pinta {n} recorridos de huellas separados 2,5 m: "
                 + (f"3 grupos de 3 huellas del mismo pie, cada {_m(sep)}, con una pausa de 60 cm entre grupos."
                    if un_pie else f"{cuantas} huellas alternas izquierda-derecha, cada {_m(sep)}, a 10 cm de la línea central."))
    centros, z0, z1 = _pistas(esc, p, n, 2.5, largo, lineas=False)
    for cx in centros:
        z = z0 - 0.6
        for k in range(cuantas):
            if un_pie:
                esc.add("huella", p, x=cx, z=z, lado="der", rot=0.0)
                z -= sep + (0.6 if k % 3 == 2 else 0)
            else:
                esc.add("huella", p, x=cx + (0.1 if k % 2 else -0.1), z=z, lado="der" if k % 2 else "izq", rot=0.0)
                z -= sep
        esc.linea(p, [(cx - 0.5, z0), (cx + 0.5, z0)], "blanco", 0.1)
    esc.cota(p, (centros[0] - 0.7, 0, z0 - 0.6), (centros[0] - 0.7, 0, z0 - 0.6 - sep))
    esc.resumen = f"{n} recorridos de huellas {'de un solo pie' if un_pie else 'alternas'} cada {_m(sep)}"
    _docente_costado(esc, z0 - largo / 2, "Ubícate al costado de las huellas: de perfil ves si el pie entra por el "
                                          "talón y sale por la punta, o si cae suave sobre el mismo pie.")


def _rebote(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Pared de rebote: pases contra la pared y recepción (atrape) o golpeo con el pie (pateo)."""
    pie = bool(re.search(r"\bpie\b|patea|pateo|golpe", t))
    d = next((lst[0] for lst in _listas_tras_a(t) if lst[0] >= 1), 3.0)
    n = _carriles_por_grupo(esc, 4, 6, 5)
    sep = 2.2
    esc.ajustar(n * sep + 2, d + 6)
    zp = -esc.largo / 2
    p = esc.paso(f"Usa una pared lisa de al menos {_m(esc.ancho)}; marca {n} puestos frente a ella cada {_m(sep)}.")
    esc.add("pared", p, x=0, z=zp - 0.1, ancho=esc.ancho, alto=3.0)
    xs = [-(n - 1) * sep / 2 + i * sep for i in range(n)]
    if pie:
        pf = esc.paso("Pinta en la pared un rectángulo bajo de 1,2 m de ancho y 60 cm de alto por puesto: ahí debe pegar el balón.")
        for x in xs:
            esc.add("franja", pf, x=x, z=zp, y0=0.0, y1=0.6, ancho=1.2, color="amarillo")
        esc.cota(pf, (xs[0] - 0.8, 0, zp + 0.05), (xs[0] - 0.8, 0.6, zp + 0.05))
    else:
        pf = esc.paso("Pinta en la pared un recuadro de 1 m entre 1 y 2 m de altura por puesto: la pelota debe pegar ahí.")
        for x in xs:
            esc.add("franja", pf, x=x, z=zp, y0=1.0, y1=2.0, ancho=1.0, color="celeste")
        esc.cota(pf, (xs[0] - 0.8, 0, zp + 0.05), (xs[0] - 0.8, 1.0, zp + 0.05))
    pl = esc.paso(f"Traza la línea de trabajo a {_m(d)} de la pared y deja una pelota en cada puesto.")
    esc.linea(pl, [(-esc.ancho / 2 + 0.5, zp + d), (esc.ancho / 2 - 0.5, zp + d)], "blanco", 0.08)
    for x in xs:
        esc.add("balon", pl, x=x + 0.3, z=zp + d + 0.3, color="blanco" if pie else "amarillo")
        esc.fila(x, zp + d + 0.6)
    esc.cota(pl, (xs[-1] + 0.9, 0, zp), (xs[-1] + 0.9, 0, zp + d))
    esc.resumen = f"Pared de rebote con {n} puestos a {_m(d)}" + (" (con el pie)" if pie else "")
    _docente_costado(esc, zp + d / 2, "Ubícate a un costado, entre la pared y la línea: de perfil ves "
                     + ("el péndulo de la pierna y el seguimiento." if pie else "los brazos semiflexionados y cómo amortiguan."))


def _pie_apoyo(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Puestos de pateo con la huella del pie de apoyo junto al balón y una puerta de conos al frente."""
    d = next((lst[0] for lst in _listas_tras_a(t) if lst[0] >= 2), 4.0)
    n = _carriles_por_grupo(esc, 4, 6, 5)
    sep = 2.5
    total = (n - 1) * sep
    esc.ajustar(total + 4, d + 6)
    z0 = esc.largo / 2 - 3
    xs = [-total / 2 + i * sep for i in range(n)]
    p = esc.paso(f"Marca {n} puestos cada {_m(sep)}: el balón, la huella del pie de apoyo a su lado (a un palmo) y "
                 "la huella de la pierna que patea un paso atrás.")
    for x in xs:
        esc.add("balon", p, x=x, z=z0, color="blanco")
        esc.add("huella", p, x=x - 0.22, z=z0 + 0.05, lado="izq", rot=0.0)
        esc.add("huella", p, x=x + 0.05, z=z0 + 0.65, lado="der", rot=0.3)
        esc.fila(x, z0 + 1.4)
    esc.cota(p, (xs[0] - 0.6, 0, z0), (xs[0] - 0.6, 0, z0 + 0.65))
    pp = esc.paso(f"A {_m(d)} de cada balón arma una puerta de 2 conos separados 1,5 m.")
    for x in xs:
        esc.cono(pp, x - 0.75, z0 - d, "azul")
        esc.cono(pp, x + 0.75, z0 - d, "azul")
    esc.cota(pp, (xs[-1] + 1.1, 0, z0), (xs[-1] + 1.1, 0, z0 - d))
    esc.avisos.append("Las huellas están dibujadas para quien patea con la derecha: para los zurdos, la huella de apoyo va a la derecha del balón.")
    esc.resumen = f"{n} puestos de pie de apoyo con puerta a {_m(d)}"
    _docente_costado(esc, z0, "Ubícate al costado, a la altura de los balones: ves si el pie de apoyo queda al lado "
                              "del balón y si el brazo contrario se adelanta.")


OBJETOS = {"cuerdas": "cuerda", "aros": "aro", "conos": "cono", "colchonetas": "colchoneta", "balones": "balon",
           "vallas": "valla", "postes": "poste"}


def _distancia_libre(t: str) -> Optional[float]:
    """«a 3 metros de distancia», «separadas 2 m», «cada 1,5 metros» → metros."""
    return (_metros_tras(t, "cada") or _metros_tras(t, r"separad[oa]s?(?:\s+a)?(?:\s+unos?)?")
            or next((lst[0] for lst in _listas_tras_a(t) if len(lst) == 1), None))


def _objetos(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    """Texto libre del docente: «poner dos cuerdas a 3 metros de distancia», «5 aros separados 1 m»."""
    plural = next(m for m in OBJETOS if re.search(rf"\b{m[:-1]}", t))
    tipo = OBJETOS[plural]
    n = _cantidad(t, plural, plural[:-1] if plural.endswith("as") else plural) or 2
    n = max(1, min(12, n))
    d = _distancia_libre(t) or 1.0
    largo = d * (n - 1)
    filas = 2 if esc.estudiantes > 8 else 1
    esc.ajustar(8.0, largo + 9)
    z0 = (largo + 9) / 2 - 4
    paralelas = tipo == "cuerda"
    p = esc.paso(f"Pon {n} {plural} {'paralelas ' if paralelas else 'en línea '}separad{'as' if plural.endswith('as') else 'os'} "
                 f"{_m(d)} entre sí, empezando a 1 m de la línea de salida.")
    for k in range(n):
        z = z0 - 1 - k * d
        if tipo == "cuerda":
            esc.cuerda(p, [(-2.0, z), (2.0, z)], "amarillo")
        elif tipo == "colchoneta":
            esc.add("colchoneta", p, x=0, z=z, ancho=1.2, largo=1.0)
        elif tipo == "valla":
            esc.add("valla", p, x=0, z=z, ancho=0.8, alto=0.25)
        elif tipo == "poste":
            esc.add("poste", p, x=0, z=z, alto=1.0)
        elif tipo == "balon":
            esc.add("balon", p, x=0, z=z, color="rojo")
        elif tipo == "aro":
            esc.aro(p, 0, z)
        else:
            esc.cono(p, 0, z)
    if n > 1:
        esc.cota(p, (2.4, 0, z0 - 1), (2.4, 0, z0 - 1 - d))
    if paralelas and n == 2 and "salt" in t:
        esc.zona(p, 0, z0 - 1 - d / 2, 4.0, d, "celeste", "Zona a saltar")
    pl = esc.paso("Traza la línea de salida con tiza a 1 m del primer elemento.")
    esc.linea(pl, [(-2.0, z0), (2.0, z0)], grosor=0.1)
    esc.etiqueta(pl, -2.8, z0, "Salida")
    esc.cota(pl, (-2.4, 0, z0), (-2.4, 0, z0 - 1))
    for k in range(filas):
        esc.fila(-1.0 + 2.0 * k if filas > 1 else 0.0, z0 + 0.7)
    if esc.estudiantes / filas > 8:
        esc.avisos.append(f"Con {esc.estudiantes} estudiantes y un solo montaje, cada uno espera mucho su turno: "
                          f"considera armar 3 o 4 montajes iguales separados 3 m.")
    esc.resumen = f"{n} {plural} a {_m(d)}"
    _docente_costado(esc, z0 - 1 - largo / 2, "Ubícate al costado, a la altura del montaje: ves la salida y cada "
                                              "apoyo de los estudiantes sobre el material.")


def _area_generica(esc: Escena, t: str, o: str, ctx: Dict[str, Any]) -> None:
    ancho, largo = _dimensiones(t) or (10.0, 15.0)
    esc.ajustar(ancho, largo)
    p = esc.paso(f"Delimita un espacio de {_m(ancho)} × {_m(largo)} con conos en las esquinas.")
    esc.delimitar(p)
    mats = _materiales_en(t) or [m for m in ctx.get("materiales", []) if m in MATERIALES_BASE] or ["Conos", "Aros"]
    if len(mats) > 1 or "estacion" in t:
        cols = 2
        filas = math.ceil(len(mats) / cols)
        for k, m in enumerate(mats):
            c, r = k % cols, k // cols
            cx = -ancho / 2 + (c + 0.5) * ancho / cols
            cz = -largo / 2 + (r + 0.5) * largo / filas
            pk = esc.paso(f"Zona {k + 1}: arma el material ({m.lower()}).")
            _estacion(esc, pk, cx, cz, m.lower(), k, min(1.0, ancho / cols / 6))
            esc.fila(cx, cz + 2.1, columnas=2)
        esc.organizar = "grupos, uno por zona"
    else:
        esc.disperso = True
    esc.resumen = f"Espacio de {_m(ancho)} × {_m(largo)}"
    esc.avisos.append("El texto del montaje no trae una distribución reconocible; se muestra un espacio base. "
                      "Puedes precisarlo editando la sesión (p. ej. «4 carriles de 10 metros», «circuito de 4 estaciones»).")


Receta = Callable[[Escena, str, str, Dict[str, Any]], None]


def _sin_estaciones(aplica: Callable[[str], bool]) -> Callable[[str], bool]:
    return lambda t: "estacion" not in t and aplica(t)

RECETAS: List[Tuple[str, Callable[[str], bool], Receta]] = [
    # recetas por habilidad: frases propias de sus plantillas, se revisan primero; un circuito con una
    # estación «Bolos» o «Mini-portería» sigue siendo un circuito
    ("senderos", _sin_estaciones(lambda t: "sendero de lineas" in t), _senderos),
    ("linea_9m", _sin_estaciones(lambda t: bool(re.search(r"lineas? (?:rectas? )?de 9 metros", t))), _linea_9m),
    ("bancos_cuadro", _sin_estaciones(lambda t: "bancos suecos en cuadrado" in t), _bancos_cuadro),
    ("bancos_paralelos", _sin_estaciones(lambda t: "bancos suecos paralelos" in t), _bancos_paralelos),
    ("bancos", _sin_estaciones(lambda t: "bancos suecos" in t), _bancos),
    ("parejas", _sin_estaciones(lambda t: "parejas enfrentadas" in t), _parejas),
    ("corro", _sin_estaciones(lambda t: bool(re.search(r"\bcorros?\b|\brondos?\b", t))), _corro),
    ("porterias", _sin_estaciones(lambda t: bool(re.search(r"mini-? ?porteria", t))), _porterias),
    ("bolos", _sin_estaciones(lambda t: bool(re.search(r"\bbolos\b", t))), _bolos),
    ("estatuas", _sin_estaciones(lambda t: "aros dispersos" in t), _estatuas),
    ("laberinto", _sin_estaciones(lambda t: "laberinto" in t), _laberinto),
    ("estrella", _sin_estaciones(lambda t: "en estrella" in t), _estrella),
    ("escondite", _sin_estaciones(lambda t: "escondite" in t), _escondite),
    ("colchonetas_circulo", _sin_estaciones(lambda t: "colchonetas en circulo" in t), _colchonetas_circulo),
    ("pasos", _sin_estaciones(lambda t: bool(re.search(r"huellas de (?:pasos|un solo pie)", t))), _pasos),
    ("rebote", _sin_estaciones(lambda t: "pared de rebote" in t), _rebote),
    ("pie_apoyo", _sin_estaciones(lambda t: "pie de apoyo" in t), _pie_apoyo),
    ("despegue_distancias", lambda t: "despegue" in t and "distancia" in t, _despegue_distancias),
    ("despegue", lambda t: "despegue" in t, _despegue),
    ("slalom", lambda t: bool(re.search(r"slalom|zigzag", t)) and "estacion" not in t, _slalom),
    ("pared", lambda t: bool(re.search(r"\bpared\b|\bmural\b", t)) and "codo" not in t, _pared),
    ("zonas_lanzamiento", lambda t: "zonas de lanzamiento" in t, _zonas_lanzamiento),
    ("perimetral", lambda t: "perimetral" in t, _perimetral),
    ("circuito", lambda t: bool(re.search(r"estacion|circuito|\bgala\b|festival", t)), _circuito),
    ("postes", lambda t: "codo" in t or "conos altos" in t, _postes),
    ("serpiente", lambda t: bool(re.search(r"serpiente|oscilante", t)), _serpiente),
    ("cintas", lambda t: bool(re.search(r"cintas? elevad|cintas? suspendid", t)), _cintas),
    ("rayuela", lambda t: bool(re.search(r"rayuela|cuadricula|\bislas?\b", t)), _rayuela),
    ("carriles", lambda t: bool(re.search(r"castillo|carril|\bpistas?\b|pasillo|lineas? de salida", t)), _carriles),
    ("escalera", lambda t: "escalera" in t, _escalera),
    ("hileras", lambda t: bool(re.search(r"hilera|consecutiv", t)), _hileras),
    ("huellas", lambda t: "huella" in t, _huellas),
    ("caida", lambda t: bool(re.search(r"caida|colchoneta", t)), _caida),
    ("campo_metrico", lambda t: bool(re.search(r"campo abierto|zonas metricas|hasta los", t)), _campo_metrico),
    ("refugios", lambda t: "refugio" in t, _refugios),
    ("cuadrantes", lambda t: "cuadrante" in t, _cuadrantes),
    ("ataque", lambda t: bool(re.search(r"ataque|defensa", t)), _ataque),
    ("objetos", lambda t: any(re.search(rf"\b{m[:-1]}", t) for m in OBJETOS) and _distancia_libre(t) is not None,
     _objetos),
]


def construir_escena(texto: str, *, estudiantes: int = 24, materiales: Sequence[str] = (),
                     minutos_central: Optional[int] = None) -> Dict[str, Any]:
    """Escena 3D (dict serializable a JSON) para el texto de montaje de una sesión."""
    t = _norm(texto)
    esc = Escena(max(6, min(45, estudiantes)))
    ctx = {"materiales": list(materiales), "minutos_central": minutos_central}
    for nombre, aplica, receta in RECETAS:
        if aplica(t):
            esc.receta = nombre
            receta(esc, t, texto or "", ctx)
            break
    else:
        esc.receta = "generica"
        _area_generica(esc, t, texto or "", ctx)
    return esc.como_dict(materiales, minutos_central)
