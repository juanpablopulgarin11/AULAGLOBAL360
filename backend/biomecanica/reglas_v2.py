"""Criterios de la Batería HMB medidos sobre la serie del video completo (motor v2).

Mismos textos, fases y errores que ``reglas.py`` (catálogo y documentos no cambian); lo que
cambia es **cómo** se decide cada criterio:

- Se mide sobre eventos reales (``serie.calcular_cinematica``): vuelos, apoyos, saltos sobre el
  mismo pie, segundos en un pie, velocidad y lado del brazo o la pierna que ejecuta.
- **El gesto tiene que ocurrir.** Sin vuelo no hay salto; sin brazo por encima del hombro no hay
  lanzamiento; sin apoyo unipodal sostenido no hay equilibrio. Ya no se aprueba por la postura.
- ``fuente = "visual"``: lo que la pose no puede ver (pelota, agarre, manos en copa, mirada,
  pies sobre la línea). Lo califica Gemini o el docente; el motor local lo deja **por confirmar**.
- ``puntaje = None`` también cuando la toma no permite medirlo (p. ej. el braceo de frente).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

from .habilidades import (
    ATRAPE, CARRERA, EQ_DINAMICO, EQ_ESTATICO, LANZAMIENTO, MARCHA, PATEAR, SALTO_HORIZONTAL,
    SALTO_UNIPODAL,
)
from .reglas import REGLAS

C = Dict[str, Any]
Resultado = Tuple[Optional[int], str, str]          # (puntaje, medido, observación)
POSE, VISUAL = "pose", "visual"


def _g(x: Any, unidad: str = "°") -> str:
    if x is None:
        return "—"
    if isinstance(x, float):
        x = round(x, 1) if abs(x) < 10 else round(x)
    return f"{x}{unidad}"


def _fem(lado: Optional[str]) -> str:
    return {"derecho": "derecha", "izquierdo": "izquierda"}.get(lado or "", lado or "")


def _si(cond: bool, ok: str, falla: str, medido: str) -> Resultado:
    return (1 if cond else 0), medido, (ok if cond else falla)


def _no_medible(motivo: str) -> Resultado:
    return None, "No medible en esta toma", motivo


def _sin_gesto(gesto: str) -> Resultado:
    return 0, "Gesto no detectado", f"No se observó {gesto} en el video, así que el criterio no puede darse por logrado."


@dataclass(frozen=True)
class CriterioV2:
    fuente: str
    umbral: str
    evaluar: Optional[Callable[[C], Resultado]] = None
    mira: str = ""            # qué debe observar la IA o el docente (criterios visuales)


# ------------------------------------------------------------------------------- Carrera
def _corre(c: C) -> bool:
    return (c.get("desplazamiento_piernas") or 0) >= 1.5 and (c.get("velocidad_max_piernas_s") or 0) >= 1.5


def _carrera_brazos(c: C) -> Resultado:
    if not _corre(c):
        return _sin_gesto("una carrera (desplazamiento sostenido)")
    codo, op = c.get("codo_mediana"), c.get("oposicion_brazos")
    ok = codo is not None and 70 <= codo <= 110 and (op is None or op >= 0.3)
    medido = f"Codo {_g(codo)}" + (f" · oposición brazo-pierna {op:+.2f}" if op is not None else " · oposición no visible de frente")
    return _si(ok, "Braceo flexionado cerca de 90° y en oposición a las piernas.",
               "El braceo no mantiene los codos cerca de 90° o no se opone a las piernas.", medido)


def _carrera_tronco(c: C) -> Resultado:
    if not _corre(c):
        return _sin_gesto("una carrera")
    tr = c.get("tronco_mediana")
    return _si(tr is not None and 4 <= tr <= 17, f"Tronco inclinado {_g(tr)} hacia adelante, dentro del rango fisiológico.",
               f"Inclinación del tronco de {_g(tr)} (esperado ≈5° a 16° hacia adelante).", f"{_g(tr)} hacia adelante")


def _carrera_apoyo(c: C) -> Resultado:
    if not _corre(c):
        return _sin_gesto("una carrera")
    r, v = c.get("rodilla_apoyo_min"), c.get("vuelos") or 0
    ok = r is not None and 115 <= r <= 168 and v >= 1
    return _si(ok, f"La rodilla de apoyo amortigua ({_g(r)}) y el impulso produce fase aérea.",
               f"Apoyo rígido o sin impulso suficiente (rodilla de apoyo {_g(r)}, {v} vuelos).",
               f"Rodilla en apoyo {_g(r)} · {v} vuelos")


def _carrera_recobro(c: C) -> Resultado:
    if not _corre(c):
        return _sin_gesto("una carrera")
    r = c.get("recobro_rodilla_min")
    return _si(r is not None and r <= 95, f"Recobro marcado: la rodilla llega a {_g(r)}.",
               f"Recobro insuficiente: la rodilla solo llega a {_g(r)} (esperado ≤ 95°).", f"Rodilla de recobro {_g(r)}")


def _carrera_vuelo(c: C) -> Resultado:
    if not _corre(c):
        return _sin_gesto("una carrera")
    v, alt, dur = c.get("vuelos") or 0, c.get("vuelos_alternos") or 0, c.get("vuelo_max_s")
    if v == 0 and (c.get("fps_analisis") or 0) < 20:
        return _no_medible("El video tiene muy pocos fotogramas por segundo para ver la fase aérea.")
    return _si(v >= 2, f"{v} fases aéreas (máx. {_g(dur, ' s')}) con apoyos alternos.",
               "No hay fase aérea clara entre los apoyos (patrón rasante).", f"{v} vuelos ({alt} alternos)")


# ------------------------------------------------------------------------------- Salto horizontal
def _salto(c: C) -> Optional[C]:
    """Hubo salto: despegue con los dos pies, vuelo de al menos 0,1 s y algo de avance."""
    s = c.get("salto")
    ok = s and s.get("despegue_bipodal") and (s.get("duracion_s") or 0) >= 0.1 and (s.get("avance_piernas") or 0) >= 0.2
    return s if ok else None


def _salto_impulso(c: C) -> Resultado:
    s = _salto(c)
    if not s:
        return _sin_gesto("un despegue con los dos pies")
    r, b = s.get("rodilla_preparacion"), s.get("brazos_atras")
    if c.get("vista") == "frontal":
        return _si(r is not None and r <= 115, f"Flexión preparatoria de rodillas a {_g(r)} (los brazos no se ven de frente).",
                   f"Flexión preparatoria insuficiente ({_g(r)}).", f"Rodillas {_g(r)} · brazos no visibles de frente")
    ok = r is not None and r <= 115 and b is not None and b <= -0.05
    return _si(ok, f"Carga con rodillas a {_g(r)} y brazos atrás.",
               f"Carga incompleta: rodillas {_g(r)} (≤ 110°) y brazos {'atrás' if (b or 0) <= -0.05 else 'sin llevar atrás'}.",
               f"Rodillas {_g(r)} · brazos {_g(b, ' piernas')} respecto a la cadera")


def _salto_extension(c: C) -> Resultado:
    s = _salto(c)
    if not s:
        return _sin_gesto("un despegue con los dos pies")
    r = s.get("rodilla_despegue")
    brazos = (s.get("brazos_despegue_arriba") or -1) > 0 or (s.get("brazos_despegue_adelante") or 0) > 0.3
    return _si(r is not None and r >= 155 and brazos, f"Extensión explosiva ({_g(r)}) con brazos proyectados.",
               f"Despegue sin extensión completa ({_g(r)}) o sin proyectar los brazos.",
               f"Rodillas {_g(r)} al despegar · brazos {'arriba/adelante' if brazos else 'sin proyectar'}")


def _salto_vuelo(c: C) -> Resultado:
    s = _salto(c)
    if not s:
        return _sin_gesto("una fase de vuelo con despegue bipodal")
    av, du = s.get("avance_piernas") or 0, s.get("duracion_s")
    return _si(av >= 0.4, f"Vuelo de {_g(du, ' s')} avanzando {av:.1f} largos de pierna.",
               f"Vuelo sin desplazamiento hacia adelante ({av:.1f} piernas).", f"Vuelo {_g(du, ' s')} · avance {av:.1f} piernas")


def _salto_aterrizaje(c: C) -> Resultado:
    s = _salto(c)
    if not s:
        return _sin_gesto("un salto con caída")
    r = s.get("rodilla_aterrizaje")
    ok = s.get("aterrizaje_bipodal") and r is not None and r <= 135
    return _si(ok, f"Cae con ambos pies a la vez y amortigua flexionando a {_g(r)}.",
               f"Caída {'con ambos pies' if s.get('aterrizaje_bipodal') else 'escalonada'} y rodillas a {_g(r)} (≤ 135°).",
               f"Caída {'simultánea' if s.get('aterrizaje_bipodal') else 'no simultánea'} · rodillas {_g(r)}")


def _salto_equilibrio(c: C) -> Resultado:
    s = _salto(c)
    if not s:
        return _sin_gesto("un aterrizaje")
    pasos, extra, manos = s.get("pasos_tras_aterrizar") or 0, s.get("vuelos_tras_aterrizar") or 0, s.get("manos_al_suelo")
    ok = pasos <= 1 and extra == 0 and not manos
    detalle = f"{pasos} pasos de ajuste" + (" · apoya las manos" if manos else "")
    return _si(ok, "Se estabiliza al caer sin pasos de desequilibrio ni apoyar las manos.",
               f"Pierde el equilibrio al caer ({detalle}).", detalle)


# ------------------------------------------------------------------------------- Marcha
def _camina(c: C) -> bool:
    return (c.get("desplazamiento_piernas") or 0) >= 1.0 and (c.get("vuelos") or 0) == 0


def _marcha_brazos(c: C) -> Resultado:
    if not _camina(c):
        return _sin_gesto("una marcha (desplazamiento sin fases aéreas)")
    op, codo = c.get("oposicion_brazos"), c.get("codo_mediana")
    if op is None:
        return _no_medible("El balanceo de los brazos se evalúa grabando de perfil.")
    return _si(op >= 0.3 and (codo or 0) >= 100, "Brazos sueltos que se balancean en oposición a las piernas.",
               "El balanceo de los brazos no se opone a las piernas o van rígidos.", f"Oposición {op:+.2f} · codo {_g(codo)}")


def _marcha_tronco(c: C) -> Resultado:
    if not _camina(c):
        return _sin_gesto("una marcha")
    tr = c.get("tronco_mediana")
    return _si(tr is not None and abs(tr) <= 8, f"Tronco erguido ({_g(tr)}).", f"Tronco inclinado {_g(tr)} (≤ 8°).", _g(tr))


def _marcha_talon(c: C) -> Resultado:
    if not _camina(c):
        return _sin_gesto("una marcha")
    f = c.get("talon_primero_frac")
    if f is None:
        return _no_medible("El apoyo talón-punta se ve grabando de perfil con los pies visibles.")
    return _si(f >= 0.5, f"Apoya primero el talón en {round(f * 100)}% de los pasos.",
               f"Solo {round(f * 100)}% de los pasos inicia con el talón.", f"{round(f * 100)}% de apoyos de talón")


def _marcha_doble_apoyo(c: C) -> Resultado:
    if not _camina(c):
        return _sin_gesto("una marcha sin fase aérea")
    f = c.get("doble_apoyo_frac")
    if f is None:
        return _no_medible("No hubo suficiente desplazamiento para medir los apoyos.")
    return _si(f >= 0.05, f"Hay doble apoyo en {round(f * 100)}% del recorrido.", "No se observa fase de doble apoyo.",
               f"Doble apoyo {round(f * 100)}%")


# ------------------------------------------------------------------------------- Salto unipodal
def _uni_brazos(c: C) -> Resultado:
    if (c.get("saltos_mismo_pie") or 0) < 1:
        return _sin_gesto("saltos sobre un pie")
    codo = c.get("codo_mediana")
    return _si(codo is not None and 60 <= codo <= 125, f"Brazos flexionados ({_g(codo)}) acompañando el salto.",
               f"Brazos {'extendidos' if (codo or 0) > 125 else 'muy cerrados'} ({_g(codo)}).", f"Codo {_g(codo)}")


def _uni_tronco(c: C) -> Resultado:
    if (c.get("saltos_mismo_pie") or 0) < 1:
        return _sin_gesto("saltos sobre un pie")
    tr = c.get("tronco_mediana")
    return _si(tr is not None and 3 <= tr <= 18, f"Tronco levemente adelante ({_g(tr)}) y estable.",
               f"Tronco {_g(tr)} (esperado 4° a 18° adelante).", _g(tr))


def _uni_pierna_libre(c: C) -> Resultado:
    p = c.get("pata_sola")
    if not p:
        return _sin_gesto("saltos sobre un pie")
    r = p.get("rango_cadera_libre")
    return _si(r is not None and r >= 20, f"La pierna libre oscila {_g(r)} acompañando la progresión.",
               f"La pierna libre casi no oscila ({_g(r)}).", f"Oscilación de la pierna libre {_g(r)}")


def _uni_control(c: C) -> Resultado:
    p = c.get("pata_sola")
    if not p:
        return _sin_gesto("saltos sobre un pie")
    n, ok = p.get("recepciones") or 0, p.get("recepciones_controladas") or 0
    return _si(n >= 2 and ok >= n * 2 / 3, f"Controla {ok} de {n} recepciones.",
               f"Recepciones inestables ({ok} de {n} controladas).", f"{ok}/{n} recepciones controladas")


def _uni_tres(c: C) -> Resultado:
    n, lado = c.get("saltos_mismo_pie") or 0, c.get("lado_saltos")
    medido = f"{n} saltos seguidos" + (f" sobre el pie {lado}" if lado else "")
    return _si(n >= 3, f"Tres despegues y caídas consecutivas sobre el pie {lado}.",
               f"Solo {n} saltos seguidos sobre el mismo pie (se requieren 3 sin apoyar el otro).", medido)


# ------------------------------------------------------------------------------- Lanzamiento
def _lanza(c: C) -> Optional[C]:
    l = c.get("lanzamiento")
    return l if l and (l.get("velocidad_muneca") or 0) >= 4 and l.get("muneca_sobre_hombro") else None


def _lanz_codo(c: C) -> Resultado:
    l = _lanza(c)
    if not l:
        return _sin_gesto("un lanzamiento por encima del hombro")
    r = l.get("codo_suelta")
    return _si(r is not None and r >= 150, f"El codo se extiende a {_g(r)} al soltar (brazo {l['brazo']}).",
               f"Extensión incompleta del codo al soltar ({_g(r)}, esperado ≥ 150°).", f"Codo {_g(r)} · brazo {l['brazo']}")


def _lanz_rotacion(c: C) -> Resultado:
    l = _lanza(c)
    if not l:
        return _sin_gesto("un lanzamiento por encima del hombro")
    r = l.get("rotacion_tronco") or 0
    return _si(r >= 0.15, "El tronco rota acompañando la aceleración del brazo.",
               "Lanza solo con el brazo, sin rotación del tronco.", f"Rotación de hombros {r:.2f}")


def _lanz_pie(c: C) -> Resultado:
    l = _lanza(c)
    if not l:
        return _sin_gesto("un lanzamiento por encima del hombro")
    p = l.get("pie_contrario_adelante")
    if p is None:
        return _no_medible("No se ven ambos pies en el momento de soltar.")
    otro = "izquierdo" if l["brazo"] == "derecho" else "derecho"
    return _si(p >= 0.15, f"Adelanta el pie {otro} (contrario al brazo que lanza).",
               f"El pie {otro} no queda adelantado al soltar ({p:+.2f} piernas).", f"Pie {otro} {p:+.2f} piernas adelante")


# ------------------------------------------------------------------------------- Atrape
def _atrapa(c: C) -> Optional[C]:
    a = c.get("atrape")
    return a if a and (a.get("manos_juntas") or 9) <= 0.6 else None


def _atr_brazos(c: C) -> Resultado:
    a = _atrapa(c)
    if not a:
        return _sin_gesto("una recepción con las dos manos")
    r = a.get("codos_espera")
    return _si(r is not None and 75 <= r <= 140, f"Brazos semiflexionados ({_g(r)}) esperando la pelota.",
               f"Brazos {'rígidos' if (r or 0) > 140 else 'muy recogidos'} ({_g(r)}).", f"Codos {_g(r)}")


def _atr_amortigua(c: C) -> Resultado:
    a = _atrapa(c)
    if not a:
        return _sin_gesto("una recepción con las dos manos")
    f = a.get("flexion_amortigua") or 0
    return _si(f >= 15, f"Flexiona los brazos {_g(f)} al recibir, absorbiendo el impacto.",
               f"Recibe con los brazos rígidos (solo {_g(f)} de flexión).", f"Flexión al recibir {_g(f)}")


# ------------------------------------------------------------------------------- Patear
def _patea(c: C) -> Optional[C]:
    p = c.get("pateo")
    return p if p and (p.get("velocidad_tobillo") or 0) >= 4 and p.get("apoyo_firme") else None


def _pat_brazo(c: C) -> Resultado:
    p = _patea(c)
    if not p:
        return _sin_gesto("un golpeo con el pie desde un apoyo firme")
    r = p.get("rango_brazo_contrario") or 0
    return _si(r >= 0.25, "El brazo contrario se proyecta equilibrando el golpeo.",
               "El brazo contrario no acompaña el golpeo.", f"Recorrido del brazo contrario {r:.2f} piernas")


def _pat_tronco(c: C) -> Resultado:
    p = _patea(c)
    if not p:
        return _sin_gesto("un golpeo con el pie")
    tr = p.get("tronco_impacto")
    return _si(tr is not None and 3 <= tr <= 25, f"Leve flexión del tronco al impacto ({_g(tr)}).",
               f"Tronco {_g(tr)} al impacto (esperado una leve inclinación adelante).", _g(tr))


def _pat_pendular(c: C) -> Resultado:
    p = _patea(c)
    if not p:
        return _sin_gesto("un golpeo con el pie")
    r = p.get("rango_cadera")
    return _si(r is not None and r >= 45, f"Péndulo amplio desde la cadera ({_g(r)}) con la pierna {_fem(p['pierna'])}.",
               f"Recorrido corto de la pierna ({_g(r)}, esperado ≥ 45°).", f"Recorrido de cadera {_g(r)} · pierna {_fem(p['pierna'])}")


def _pat_seguimiento(c: C) -> Resultado:
    p = _patea(c)
    if not p:
        return _sin_gesto("un golpeo con el pie")
    ok = (p.get("seguimiento") or 0) >= 0.1 and p.get("retorna_al_suelo")
    return _si(ok, "La pierna continúa tras el golpeo y vuelve con control al suelo.",
               "La pierna frena en el impacto o no retorna con control.",
               f"Seguimiento {(p.get('seguimiento') or 0):.2f} piernas · {'retorna' if p.get('retorna_al_suelo') else 'no retorna'}")


# ------------------------------------------------------------------------------- Equilibrio dinámico
def _eqd_tronco(c: C) -> Resultado:
    if not _camina(c):
        return _sin_gesto("un desplazamiento caminando")
    tr = c.get("tronco_mediana")
    return _si(tr is not None and abs(tr) <= 7, f"Tronco erguido ({_g(tr)}).", f"Tronco inclinado {_g(tr)} (≤ 7°).", _g(tr))


def _eqd_brazos(c: C) -> Resultado:
    if not _camina(c):
        return _sin_gesto("un desplazamiento caminando")
    f = (c.get("linea") or {}).get("brazos_cruz_frac")
    if f is None:
        return _no_medible("Los brazos en cruz se ven grabando de frente.")
    return _si(f <= 0.2, "Brazos coordinados sin abrirlos en cruz.", f"Abre los brazos en cruz {round(f * 100)}% del recorrido.",
               f"Brazos en cruz {round(f * 100)}%")


def _eqd_lateral(c: C) -> Resultado:
    if not _camina(c):
        return _sin_gesto("un desplazamiento caminando")
    osc = (c.get("linea") or {}).get("oscilacion_lateral")
    if osc is None:
        return _no_medible("El balanceo lateral se ve grabando de frente.")
    inc = c.get("inclinacion_hombros_max") or 0
    return _si(osc <= 0.04 and inc <= 8, "Avanza sin balanceos laterales.", "Se balancea hacia los lados al avanzar.",
               f"Oscilación {osc:.3f} piernas · hombros {_g(inc)}")


# ------------------------------------------------------------------------------- Equilibrio estático
def _sosten(c: C) -> Optional[C]:
    s = c.get("sosten")
    return s if s and (s.get("segundos") or 0) >= 1.0 else None


def _eqe_brazos(c: C) -> Resultado:
    s = _sosten(c)
    if not s:
        return _sin_gesto("un apoyo sostenido sobre un pie")
    f = s.get("brazos_costados_frac") or 0
    return _si(f >= 0.7, "Brazos relajados a los costados.", f"Usa los brazos para compensar ({round((1 - f) * 100)}% del tiempo).",
               f"Brazos a los costados {round(f * 100)}%")


def _eqe_sagital(c: C) -> Resultado:
    s = _sosten(c)
    if not s:
        return _sin_gesto("un apoyo sostenido sobre un pie")
    tr = s.get("tronco_max")
    return _si(tr is not None and tr <= 8, f"Tronco vertical (máx. {_g(tr)}).", f"Oscila adelante-atrás hasta {_g(tr)} (≤ 8°).",
               f"Inclinación máxima {_g(tr)}")


def _eqe_lateral(c: C) -> Resultado:
    s = _sosten(c)
    if not s:
        return _sin_gesto("un apoyo sostenido sobre un pie")
    if c.get("vista") == "perfil":
        return _no_medible("La inclinación lateral se ve grabando de frente.")
    inc = s.get("inclinacion_hombros_max")
    return _si(inc is not None and inc <= 8.5, f"Hombros nivelados (máx. {_g(inc)}).", f"Se inclina hacia un lado hasta {_g(inc)} (≤ 8,5°).",
               f"Inclinación de hombros {_g(inc)}")


def _eqe_apoyo(c: C) -> Resultado:
    s = _sosten(c)
    if not s:
        return _sin_gesto("un apoyo sostenido sobre un pie")
    r = s.get("rodilla_apoyo")
    return _si(r is not None and r >= 155, f"Pierna de apoyo ({s['pie_apoyo']}) firme y extendida ({_g(r)}).",
               f"Pierna de apoyo flexionada ({_g(r)}, esperado ≥ 155°).", f"Rodilla de apoyo {_g(r)} · pie {s['pie_apoyo']}")


def _eqe_cinco(c: C) -> Resultado:
    s = c.get("sosten") or {}
    seg, dur = s.get("segundos") or 0.0, c.get("duracion_s") or 0.0
    rod = s.get("rodilla_libre")
    if seg < 5 and dur < 5.5:
        return 0, f"{seg:.1f} s en un pie", f"El video dura {dur:.1f} s: graba al menos 6 segundos para medir los 5 s de la prueba."
    ok = seg >= 5 and rod is not None and rod <= 125
    return _si(ok, f"Sostiene la pierna libre flexionada {seg:.1f} s sin apoyarla.",
               f"Sostiene {seg:.1f} s (se requieren 5 s continuos con la rodilla libre flexionada).",
               f"{seg:.1f} s sobre el pie {s.get('pie_apoyo') or '—'} · rodilla libre {_g(rod)}")


def _visual(mira: str) -> CriterioV2:
    return CriterioV2(VISUAL, "Observación visual (IA o docente)", None, mira)


REGLAS_V2: Dict[str, List[CriterioV2]] = {
    CARRERA: [
        CriterioV2(POSE, "Codo 70°–110° y oposición ≥ 0,3", _carrera_brazos),
        CriterioV2(POSE, "≈5° a 16° hacia adelante", _carrera_tronco),
        CriterioV2(POSE, "Rodilla de apoyo 115°–168° y fase aérea", _carrera_apoyo),
        CriterioV2(POSE, "Rodilla de recobro ≤ 95°", _carrera_recobro),
        CriterioV2(POSE, "≥ 2 fases aéreas", _carrera_vuelo),
    ],
    SALTO_HORIZONTAL: [
        CriterioV2(POSE, "Rodillas ≤ 110° y brazos atrás", _salto_impulso),
        CriterioV2(POSE, "Rodillas ≥ 155° al despegar y brazos proyectados", _salto_extension),
        CriterioV2(POSE, "Vuelo bipodal con avance ≥ 0,4 piernas", _salto_vuelo),
        CriterioV2(POSE, "Caída simultánea y rodillas ≤ 135°", _salto_aterrizaje),
        CriterioV2(POSE, "≤ 1 paso de ajuste, sin manos al suelo", _salto_equilibrio),
    ],
    MARCHA: [
        CriterioV2(POSE, "Oposición brazo-pierna ≥ 0,3 (perfil)", _marcha_brazos),
        CriterioV2(POSE, "≤ 8° de inclinación", _marcha_tronco),
        CriterioV2(POSE, "≥ 50% de apoyos con el talón (perfil)", _marcha_talon),
        CriterioV2(POSE, "Doble apoyo presente, sin vuelo", _marcha_doble_apoyo),
        _visual("¿Los pies avanzan sobre una línea recta continua hacia el cono, sin desviarse?"),
    ],
    SALTO_UNIPODAL: [
        CriterioV2(POSE, "Codo 60°–125°", _uni_brazos),
        CriterioV2(POSE, "4° a 18° adelante", _uni_tronco),
        CriterioV2(POSE, "Oscilación de la pierna libre ≥ 20°", _uni_pierna_libre),
        CriterioV2(POSE, "≥ 2/3 de recepciones controladas", _uni_control),
        CriterioV2(POSE, "3 saltos seguidos sobre el mismo pie", _uni_tres),
    ],
    LANZAMIENTO: [
        CriterioV2(POSE, "Codo ≥ 150° al soltar", _lanz_codo),
        CriterioV2(POSE, "Rotación de hombros ≥ 0,15", _lanz_rotacion),
        CriterioV2(POSE, "Pie contrario ≥ 0,15 piernas adelante", _lanz_pie),
        _visual("¿Sostiene la pelota con firmeza, sin que se resbale antes de soltarla?"),
        _visual("¿La pelota sale en línea directa hacia el aro o la diana?"),
    ],
    ATRAPE: [
        _visual("¿Sigue la pelota con la mirada desde que la lanzan hasta que la toca?"),
        CriterioV2(POSE, "Codos 75°–140° en espera", _atr_brazos),
        _visual("¿Las manos forman una copa, con pulgares y meñiques enfrentados?"),
        CriterioV2(POSE, "Flexión de brazos ≥ 15° al recibir", _atr_amortigua),
        _visual("¿Retiene la pelota entre las manos sin que rebote en el cuerpo ni se caiga?"),
    ],
    PATEAR: [
        CriterioV2(POSE, "Recorrido del brazo contrario ≥ 0,25 piernas", _pat_brazo),
        CriterioV2(POSE, "Tronco 3°–25° al impacto", _pat_tronco),
        CriterioV2(POSE, "Recorrido de cadera ≥ 45°", _pat_pendular),
        CriterioV2(POSE, "Seguimiento y retorno al suelo", _pat_seguimiento),
        _visual("¿Golpea la pelota de forma limpia y esta avanza de frente hacia la meta?"),
    ],
    EQ_DINAMICO: [
        _visual("¿Mira al frente, sin fijar la cabeza hacia los pies?"),
        CriterioV2(POSE, "≤ 7° de inclinación", _eqd_tronco),
        CriterioV2(POSE, "Brazos en cruz ≤ 20% (de frente)", _eqd_brazos),
        CriterioV2(POSE, "Oscilación lateral ≤ 0,04 piernas (de frente)", _eqd_lateral),
        _visual("¿Los pies se apoyan siempre dentro de la línea de 5 cm durante todo el recorrido?"),
    ],
    EQ_ESTATICO: [
        CriterioV2(POSE, "Brazos a los costados ≥ 70% del tiempo", _eqe_brazos),
        CriterioV2(POSE, "Inclinación sagital ≤ 8°", _eqe_sagital),
        CriterioV2(POSE, "Inclinación lateral ≤ 8,5° (de frente)", _eqe_lateral),
        CriterioV2(POSE, "Rodilla de apoyo ≥ 155°", _eqe_apoyo),
        CriterioV2(POSE, "≥ 5 s continuos con la rodilla libre flexionada", _eqe_cinco),
    ],
}

assert all(len(REGLAS_V2[h]) == len(REGLAS[h].criterios) for h in REGLAS), "REGLAS_V2 debe seguir el orden del catálogo"


def evaluar_criterios(habilidad: str, cin: C, t_v1: Optional[C] = None) -> List[Dict[str, Any]]:
    """Criterios de ``habilidad`` con puntaje 1, 0 o ``None`` (por confirmar) y su fuente."""
    salida = []
    for base, c2 in zip(REGLAS[habilidad].criterios, REGLAS_V2[habilidad]):
        if c2.fuente == VISUAL:
            puntaje, medido, obs = None, "Requiere observación visual", f"Por confirmar: {c2.mira}"
        else:
            puntaje, medido, obs = c2.evaluar(cin)
            if puntaje is None:
                obs = f"Por confirmar: {obs}"
        salida.append({
            "criterio": base.texto, "fase": base.fase, "puntaje": puntaje,
            "fuente": c2.fuente if puntaje is not None else ("visual" if c2.fuente == VISUAL else "pose"),
            "pendiente": puntaje is None, "medido": medido, "umbral": c2.umbral, "observacion": obs,
            "mira": c2.mira or obs.removeprefix("Por confirmar: "),
        })
    return salida


def errores_de(habilidad: str, criterios: List[Dict[str, Any]], t_v1: Optional[C] = None) -> List[Dict[str, str]]:
    """Error e impacto de la batería para cada criterio calificado con 0 (lo califique la pose, la IA o el docente)."""
    salida = []
    for base, c in zip(REGLAS[habilidad].criterios, criterios):
        if c.get("puntaje") != 0:
            continue
        impacto = base.impacto
        if callable(impacto):
            try:
                impacto = impacto(t_v1) if t_v1 else ""
            except (KeyError, TypeError):
                impacto = ""
        salida.append({"error": base.error, "impacto_biomecanico": impacto or base.error})
    return salida
