"""Fotogramas clave anclados a eventos reales del video (motor v2).

El v1 elegía 8 fotogramas equiespaciados en una ventana y luego «adivinaba» cuál era el pico
del gesto: siempre marcaba un «⚾ Lanzamiento evidenciado» aunque nadie lanzara. Aquí los
fotogramas se toman en los instantes que midió ``serie`` (despegue, vuelo, aterrizaje, suelta,
impacto, inicio y fin del apoyo en un pie…) y solo se etiquetan si el gesto ocurrió de verdad
(mismas comprobaciones que ``reglas_v2``). El resto se reparte en la ventana de acción.

Los diccionarios usan las claves de hitos del v1 (``isMilestonePeak``, ``milestoneBadge``…)
porque las leen la plantilla, el Word y el prompt de Gemini.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from .habilidades import (
    ATRAPE, CARRERA, EQ_DINAMICO, EQ_ESTATICO, LANZAMIENTO, MARCHA, PATEAR, SALTO_HORIZONTAL,
    SALTO_UNIPODAL,
)
from .reglas_v2 import _atrapa, _camina, _corre, _lanza, _patea, _salto, _sosten

C = Dict[str, Any]
COLOR = {"inicial": "#0D9488", "pico": "#F59E0B", "sub": "#10B981", "final": "#6366F1"}
SEPARACION_MIN_S = 0.07


def _m(t: Optional[float], tipo: str, badge: str, titulo: str, desc: str) -> Optional[C]:
    return None if t is None else {"t": float(t), "tipo": tipo, "badge": badge, "titulo": titulo, "desc": desc}


def _eventos(cin: C, habilidad: str) -> List[C]:
    """Momentos característicos de la prueba (vacío si el gesto no se detectó)."""
    ev: List[Optional[C]] = []
    if habilidad == SALTO_HORIZONTAL and _salto(cin):
        s = cin["salto"]
        ap = (s["t_despegue"] + s["t_aterrizaje"]) / 2
        ev += [_m(s.get("t_preparacion"), "inicial", "🎯 CARGA", "Impulso preparatorio", "Flexión de rodillas y brazos atrás"),
               _m(s["t_despegue"], "sub", "🛫 DESPEGUE", "Despegue bipodal", "Extensión de tobillos, rodillas y cadera"),
               _m(ap, "pico", "★ VUELO", "Fase aérea", "Ambos pies en el aire, avance del cuerpo"),
               _m(s["t_aterrizaje"], "sub", "🛬 CAÍDA", "Aterrizaje", "Contacto de ambos pies y amortiguación"),
               _m(s["t_aterrizaje"] + 0.5, "final", "🏁 EQUILIBRIO", "Estabilización", "Control al caer, sin pasos de ajuste")]
    elif habilidad == SALTO_UNIPODAL and (cin.get("saltos_mismo_pie") or 0) >= 1:
        pie = cin.get("lado_saltos") or ""
        vuelos = [v for v in cin.get("eventos_vuelo") or [] if not v["bipodal"]][:3]
        for i, v in enumerate(vuelos):
            ev += [_m(v["despegue"], "inicial" if i == 0 else "sub", f"🛫 SALTO {i + 1}", f"Despegue {i + 1}", f"Impulso sobre el pie {pie}"),
                   _m(v["apice"], "pico" if i == 1 or len(vuelos) == 1 else "sub", f"★ VUELO {i + 1}", "Fase aérea", "Pierna libre en péndulo"),
                   _m(v["aterrizaje"], "final" if i == len(vuelos) - 1 else "sub", f"🛬 CAÍDA {i + 1}", f"Recepción {i + 1}",
                      f"Cae sobre el pie {pie} sin apoyar el otro")]
    elif habilidad == CARRERA and _corre(cin):
        vuelos = (cin.get("eventos_vuelo") or [])[:3]
        apoyos = (cin.get("apoyos") or [])[:3]
        ev += [_m(v["apice"], "pico" if i == 0 else "sub", "★ VUELO", "Fase aérea", "Ningún pie toca el suelo") for i, v in enumerate(vuelos)]
        ev += [_m(a["t"], "sub", "👣 APOYO", f"Apoyo pie {a['pie']}", "Amortiguación y propulsión") for a in apoyos]
    elif habilidad in (MARCHA, EQ_DINAMICO) and _camina(cin):
        apoyos = (cin.get("apoyos") or [])[:5]
        for i, a in enumerate(apoyos):
            ev.append(_m(a["t"], "pico" if i == len(apoyos) // 2 else "sub", "👣 PASO", f"Apoyo pie {a['pie']}",
                         "Contacto talón-punta y doble apoyo" if habilidad == MARCHA else "Pie sobre la línea"))
    elif habilidad == EQ_ESTATICO and _sosten(cin):
        s = cin["sosten"]
        t0, t1 = s["t_ini"], s["t_fin"]
        ev += [_m(t0, "inicial", "🦶 INICIO", "Inicio del apoyo", f"Se para sobre el pie {s['pie_apoyo']}"),
               _m(t0 + 1.0, "sub", "⏱ 1 s", "Ajuste postural", "Brazos a los costados, tronco vertical"),
               _m((t0 + min(t1, t0 + 5)) / 2, "pico", "🦩 SOSTÉN", "Sostén unipodal", "Rodilla libre adelante, talón atrás")]
        if s["segundos"] >= 5:
            ev.append(_m(t0 + 5.0, "sub", "✓ 5 s", "Cinco segundos cumplidos", "Prueba completa de la batería"))
        ev.append(_m(t1, "final", "🏁 FIN", "Fin del apoyo", f"{s['segundos']:.1f} s sobre un pie"))
    elif habilidad == LANZAMIENTO and _lanza(cin):
        l = cin["lanzamiento"]
        ev += [_m(l["t_armado"], "inicial", "🎯 ARMADO", "Armado del brazo", f"Brazo {l['brazo']} atrás, codo flexionado"),
               _m(l["t_suelta"], "pico", "⚾ SUELTA", "Liberación", "Máxima velocidad y extensión del codo"),
               _m(l["t_suelta"] + 0.15, "sub", "↗ EXTENSIÓN", "Extensión completa", "Rotación del tronco"),
               _m(l["t_suelta"] + 0.45, "final", "🏁 SEGUIMIENTO", "Acompañamiento", "El brazo cruza el cuerpo")]
    elif habilidad == PATEAR and _patea(cin):
        p = cin["pateo"]
        ev += [_m(p["t_armado"], "inicial", "🎯 ARMADO", "Armado de la pierna", f"Pierna {p['pierna']} atrás, apoyo firme"),
               _m(p["t_impacto"], "pico", "⚽ IMPACTO", "Golpeo", "Máxima velocidad del pie"),
               _m(p["t_impacto"] + 0.2, "sub", "↗ SEGUIMIENTO", "Seguimiento", "La pierna continúa tras el golpeo"),
               _m(p["t_impacto"] + 0.8, "final", "🏁 RETORNO", "Retorno a la base", "Vuelve con control al suelo")]
    elif habilidad == ATRAPE and _atrapa(cin):
        a = cin["atrape"]
        ev += [_m(a["t_contacto"] - 0.4, "inicial", "👀 ESPERA", "Postura de espera", "Brazos semiflexionados al frente"),
               _m(a["t_contacto"], "pico", "🤲 CONTACTO", "Recepción", "Las manos se juntan sobre la pelota"),
               _m(a["t_contacto"] + 0.3, "sub", "↘ AMORTIGUA", "Amortiguación", "Los brazos ceden hacia el cuerpo"),
               _m(a["t_contacto"] + 0.7, "final", "🏁 RETENCIÓN", "Retención", "Pelota asegurada")]
    return [e for e in ev if e is not None]


def momentos_clave(cin: C, habilidad: str, duracion: float, n: int = 8) -> List[C]:
    """``n`` instantes ordenados: los eventos de la prueba y, para completar, cuadros repartidos
    en la ventana de acción. Sin gesto detectado, se reparten en todo el video y sin etiquetas."""
    margen = 0.04
    eventos = sorted((e for e in _eventos(cin, habilidad) if margen <= e["t"] <= duracion - margen), key=lambda e: e["t"])
    elegidos: List[C] = []
    for e in eventos:
        if all(abs(e["t"] - x["t"]) >= SEPARACION_MIN_S for x in elegidos) and len(elegidos) < n:
            elegidos.append(e)
    if not elegidos:      # sin gesto: cuadros equiespaciados en todo el video, sin etiquetas
        ini, fin = margen, max(margen, duracion - margen)
        return [{"t": ini + (fin - ini) * i / max(1, n - 1), "tipo": None} for i in range(n)]
    ini, fin = max(margen, elegidos[0]["t"] - 0.4), min(duracion - margen, elegidos[-1]["t"] + 0.4)
    while len(elegidos) < n:          # se rellena donde haya más espacio libre
        puntos = sorted([ini, fin] + [e["t"] for e in elegidos])
        a, b = max(zip(puntos, puntos[1:]), key=lambda p: p[1] - p[0])
        elegidos.append({"t": (a + b) / 2, "tipo": None})
    return sorted(elegidos, key=lambda e: e["t"])[:n]


def etiquetar_fotogramas(frames: Sequence[Dict[str, Any]], momentos: Sequence[C], gesto: bool) -> None:
    """Escribe en cada fotograma el hito del momento más cercano (claves del v1)."""
    for idx, f in enumerate(frames):
        t = float(f.get("timestampNum") or 0.0)
        m = min(momentos, key=lambda x: abs(x["t"] - t)) if momentos else None
        evento = m if (m and m.get("tipo") and abs(m["t"] - t) <= 0.06) else None
        tipo = evento["tipo"] if evento else None
        f["isMilestonePeak"] = tipo == "pico"
        f["isSubMilestone"] = tipo == "sub"
        f["isFinalMilestone"] = tipo == "final"
        f["isInitialTrigger"] = tipo == "inicial"
        f["milestoneBadge"] = evento["badge"] if evento else None
        f["milestoneTitle"] = evento["titulo"] if evento else f"Cuadro #{idx + 1}"
        f["milestoneDesc"] = evento["desc"] if evento else (
            f"Secuencia del gesto · {t:.2f} s" if gesto else f"No se detectó el gesto característico · {t:.2f} s")
        f["milestoneColor"] = COLOR.get(tipo, "#64748B")
        f["phase"] = evento["titulo"] if evento else f.get("phase") or f"Cuadro {idx + 1}"
