"""Material de clase: qué reemplaza a lo que el docente no tiene y cómo se usa lo que sí tiene.

Lo comparten la planeación (textos de las partes inicial, central y final) y el montaje 3D, para que
lo que dice la sesión y lo que muestra el modelado coincidan. Los nombres son los de «Configurar
clase» (``apps.planeacion.models.MATERIALES``).

Criterio: un objeto solo se usa donde tiene función (Batería HMB y libros de la carpeta Data). Los
balones entran en las partes inicial y final solo en las pruebas de manipulación; las colchonetas,
en la vuelta a la calma (estiramientos en el suelo) o donde el texto ya las usa.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Dict, Iterable, List, Optional, Sequence

MANIPULATIVAS = {"Lanzamiento Sobre Hombro", "Recepción y Atrape", "Patear"}
# Marcas de suelo, en orden de preferencia, para lo que señala un punto (conos, platillos, postes)
MARCAS = ("Conos", "Platillos", "Aros")


def _norm(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode().lower()


def disponibles(materiales: Optional[Iterable[str]]) -> List[str]:
    return [m for m in (materiales or []) if m]


def tiene(materiales: Sequence[str], nombre: str) -> bool:
    return _norm(nombre) in {_norm(m) for m in materiales}


def marca(materiales: Sequence[str], excepto: str = "") -> Optional[str]:
    """La marca de suelo que hay: conos, platillos o aros (en ese orden); ``None`` si no hay ninguna."""
    return next((m for m in MARCAS if m != excepto and tiene(materiales, m)), None)


# ---------------------------------------------------------------- sustitutos en el texto

# (singular, plural, género) de cada material y de cada sustituto, para reescribir con artículos
FORMAS = {
    "Conos": ("cono", "conos", "m"), "Platillos": ("platillo", "platillos", "m"), "Aros": ("aro", "aros", "m"),
    "Cuerdas": ("cuerda", "cuerdas", "f"), "Balones": ("balón", "balones", "m"),
    "Colchonetas": ("colchoneta", "colchonetas", "f"), "Bancos suecos": ("banco sueco", "bancos suecos", "m"),
    "Vallas bajas": ("valla", "vallas", "f"), "Picas o postes": ("poste", "postes", "m"),
    "Mini-porterías": ("mini-portería", "mini-porterías", "f"),
}
TIZA = {
    "Conos": ("marca de tiza", "marcas de tiza", "f"),
    "Platillos": ("marca de tiza", "marcas de tiza", "f"),
    "Aros": ("círculo de tiza", "círculos de tiza", "m"),
    "Cuerdas": ("línea de tiza", "líneas de tiza", "f"),
    "Balones": ("pelota de papel", "pelotas de papel", "f"),
    "Colchonetas": ("zona de césped", "zonas de césped", "f"),
    "Bancos suecos": ("línea doble de tiza", "líneas dobles de tiza", "f"),
    "Vallas bajas": ("línea roja de tiza", "líneas rojas de tiza", "f"),
    "Picas o postes": ("marca de tiza", "marcas de tiza", "f"),
    "Mini-porterías": ("portería de dos marcas", "porterías de dos marcas", "f"),
}


def sustituto(material: str, materiales: Sequence[str]) -> Optional[str]:
    """Material del docente que reemplaza a ``material`` (``None`` = un sustituto de tiza o papel).

    Conos, platillos y postes → otra marca de suelo; colchonetas → aros (el aro marca dónde caer o
    pararse sobre césped); vallas → cuerdas; porterías → dos marcas."""
    if material in ("Conos", "Platillos", "Picas o postes", "Mini-porterías"):
        return marca(materiales, excepto=material)
    if material == "Colchonetas" and tiene(materiales, "Aros"):
        return "Aros"
    if material == "Vallas bajas" and tiene(materiales, "Cuerdas"):
        return "Cuerdas"
    return None


def _formas_de(material: str, materiales: Sequence[str]):
    nuevo = sustituto(material, materiales)
    if material == "Mini-porterías" and nuevo:
        s, p, _ = FORMAS[nuevo]
        return (f"portería de dos {p}", f"porterías de dos {p}", "f")
    if material == "Vallas bajas" and nuevo == "Cuerdas":
        return ("cuerda en el piso", "cuerdas en el piso", "f")
    return FORMAS[nuevo] if nuevo else TIZA[material]


ARTICULOS = {("m", "s"): ("el", "un", "del", "al"), ("f", "s"): ("la", "una", "de la", "a la"),
             ("m", "p"): ("los", "unos", "de los", "a los"), ("f", "p"): ("las", "unas", "de las", "a las")}


def reemplazar_material(texto: str, material: str, materiales: Sequence[str]) -> str:
    """Cambia ``material`` por su sustituto en el texto, ajustando artículos y contracciones."""
    sing, plur, gen = FORMAS[material]
    n_sing, n_plur, n_gen = _formas_de(material, materiales)
    for numero, viejo, nuevo in (("p", plur, n_plur), ("s", sing, n_sing)):
        art_v, art_n = ARTICULOS[(gen, numero)], ARTICULOS[(n_gen, numero)]
        raiz = re.escape(viejo).replace("ó", "[oó]").replace("í", "[ií]")
        for v, n in sorted(zip(art_v, art_n), key=lambda par: -len(par[0])):
            texto = re.sub(rf"\b{v} {raiz}\b", f"{n} {nuevo}", texto, flags=re.I)
        texto = re.sub(rf"\b{raiz}\b", nuevo, texto, flags=re.I)
    if n_gen != gen:                           # concordancia del adjetivo que sigue: «balón quieto» → «pelota quieta»
        a, b = ("o", "a") if n_gen == "f" else ("a", "o")
        for forma in (n_sing, n_plur):
            texto = re.sub(rf"\b({re.escape(forma)}) (quiet|detenid|parad|pegad|controlad|nuev|pequeñ|grande?)({a})(s?)\b",
                           lambda m: f"{m.group(1)} {m.group(2)}{b}{m.group(4)}", texto, flags=re.I)
    # «platillos y conos» → «platillos y platillos» → «platillos»
    texto = re.sub(rf"\b({re.escape(n_plur)}) (?:y|o) \1\b", r"\1", texto, flags=re.I)
    texto = re.sub(rf"\b({re.escape(n_sing)}) (?:y|o) \1\b", r"\1", texto, flags=re.I)
    if n_sing == "aro":                        # sobre una colchoneta → dentro de un aro
        for v, n in (("sobre el aro", "dentro del aro"), ("sobre los aros", "dentro de los aros"),
                     ("sobre un aro", "dentro de un aro"), ("sobre unos aros", "dentro de unos aros"),
                     ("sobre aros", "dentro de los aros"), ("en el aro", "dentro del aro")):
            texto = re.sub(rf"\b{v}\b", n, texto, flags=re.I)
    return texto


def mencionados(texto: str) -> List[str]:
    t = _norm(texto)
    return [m for m, (s, p, _) in FORMAS.items() if re.search(rf"\b(?:{re.escape(_norm(s))}|{re.escape(_norm(p))})\b", t)]


# ---------------------------------------------------------------- uso del material elegido

SENAL = r"senal|rojo|silbat|pito|congel|estatua|frenar|frena|deten|quiet|semaforo|tambor|musica"
CIRCULO = r"circulo|corro|ronda"
PAREJAS = r"pareja"

# Cómo se integra cada material en las partes inicial y final (Pérez Feito y Unidad «El arte de marchar»).
USOS = {
    ("inicial", "Aros", "senal"): "Se reparten aros de colores por la cancha: a la señal de parar, cada estudiante frena dentro de "
                                  "un aro del color que nombre el docente y allí hace la tarea del juego (postura o movilidad) hasta oír «verde».",
    ("inicial", "Aros", "circulo"): "Cada estudiante se ubica dentro de un aro para formar el círculo: el aro marca su espacio.",
    ("inicial", "Aros", "general"): "Se reparten aros por el espacio como «casas»: al desplazarse se pasa por dentro de ellos sin "
                                    "pisar el borde y, a cada pausa, cada uno busca una casa libre.",
    ("inicial", "Conos", "senal"): "Se reparten conos de colores por el espacio: a la señal, cada uno va a tocar un cono del color "
                                   "nombrado y se queda quieto a su lado.",
    ("inicial", "Conos", "general"): "Los conos delimitan el espacio de juego en las esquinas y en la mitad de cada lado.",
    ("inicial", "Platillos", "senal"): "Se reparten platillos por el piso: a la señal, cada uno frena con un pie sobre un platillo.",
    ("inicial", "Platillos", "general"): "Se reparten platillos por el piso para esquivarlos al desplazarse.",
    ("inicial", "Cuerdas", "general"): "Se tienden algunas cuerdas en el piso: al desplazarse se pasan por encima sin pisarlas.",
    ("inicial", "Balones", "general"): "Cada pareja tiene un balón: quien lo lleva se desplaza con él y lo entrega a la señal.",
    ("final", "Aros", "general"): "Cada estudiante hace la vuelta a la calma dentro de su aro, que marca su espacio personal.",
    ("final", "Colchonetas", "general"): "Los estiramientos en el suelo se hacen sobre colchonetas (una para cada dos o tres estudiantes).",
    ("final", "Balones", "general"): "Automasaje: cada uno rueda un balón bajo la planta del pie y por los muslos, sin presionar las rodillas.",
    ("final", "Cuerdas", "general"): "Estiramiento de la parte trasera del muslo sentados, con la cuerda en la planta del pie y la "
                                     "rodilla estirada, sin rebotes.",
    ("final", "Conos", "general"): "Los conos marcan el círculo de la vuelta a la calma; al terminar, cada grupo recoge los suyos.",
}
PRIORIDAD = {"inicial": ("Aros", "Platillos", "Conos", "Cuerdas", "Balones"),
             "final": ("Colchonetas", "Aros", "Cuerdas", "Balones", "Conos")}


def _formato(texto: str) -> str:
    t = _norm(texto)
    if re.search(CIRCULO, t):
        return "circulo"
    if re.search(SENAL, t):
        return "senal"
    return "general"


def usos_del_material(texto: str, parte: str, materiales: Sequence[str], habilidad: str, maximo: int = 2) -> List[str]:
    """Frases que integran el material elegido en la parte inicial o final (no repite lo que el texto ya usa)."""
    ya = set(mencionados(texto))
    formato = _formato(texto)
    salida = []
    for m in PRIORIDAD.get(parte, ()):
        if len(salida) >= maximo or not tiene(materiales, m) or m in ya:
            continue
        if m == "Balones" and habilidad not in MANIPULATIVAS:
            continue                                    # sin balones para correr, saltar o equilibrarse
        frase = USOS.get((parte, m, formato)) or USOS.get((parte, m, "general"))
        if frase:
            salida.append(frase)
    return salida


# Movilidades mal descritas en planeaciones guardadas antes de la corrección del banco: la rodilla es
# una bisagra (solo flexión y extensión) y al lanzar el codo sube a la altura del hombro.
CORRECCIONES = [
    (r"[Mm]over tobillos y rodillas en c[ií]rculos suaves",
     "Movilidad articular: flexionar y extender suavemente las rodillas (la rodilla solo se dobla y se estira, no gira) "
     "y llevar los tobillos en flexión y extensión, de punta a talón"),
    (r"\brodillas? en c[ií]rculos?", "rodillas en flexión y extensión"),
    (r"codos? a la altura de las orejas", "codos a la altura de los hombros"),
    (r"codo a la oreja", "codo a la altura del hombro"),
]


def corregir_biomecanica(texto: str) -> str:
    for patron, correcto in CORRECCIONES:
        texto = re.sub(patron, correcto, texto)
    return texto


def adaptar_texto(texto: str, parte: str, materiales: Optional[Iterable[str]], habilidad: str) -> str:
    """Texto de una parte de la sesión con el material del docente: reemplaza lo que no tiene y
    agrega cómo usar lo que sí tiene. Sin configuración de materiales solo se corrige la biomecánica."""
    texto = corregir_biomecanica(texto)
    mats = disponibles(materiales)
    if not mats:
        return texto
    for m in mencionados(texto):
        if not tiene(mats, m):
            texto = reemplazar_material(texto, m, mats)
    if parte in ("inicial", "final"):
        extra = usos_del_material(texto, parte, mats, habilidad)
        if extra:
            texto = texto.rstrip() + " " + " ".join(extra)
    return texto


def nota_de_montaje(distribucion: str, materiales: Optional[Iterable[str]]) -> str:
    """«Montaje con tu material: …» para lo que la distribución nombra y el docente no tiene."""
    mats = disponibles(materiales)
    if not mats:
        return ""
    cambios = []
    for m in mencionados(distribucion):
        if not tiene(mats, m):
            cambios.append(f"en lugar de {FORMAS[m][1]}, {_formas_de(m, mats)[1]}")
    return ("Montaje con tu material: " + "; ".join(cambios) + ".") if cambios else ""
