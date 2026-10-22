"""Prompt del sistema para Gemini (evolución de ``callGeminiVision``, ``script.js:4144-4214``).

Motor v2: la pose del video completo ya calificó lo que puede medir; Gemini recibe esos
resultados como hechos y califica solo los criterios visuales (pelota, agarre, manos, mirada,
línea en el piso), además de redactar el resumen y las consignas para el niño.
"""
from __future__ import annotations

from typing import Any, Dict, Optional


VERSION_PROMPT = "2026.10-v2"

DIRIGIDA = 'Habilidad Específica Seleccionada por el Docente: "{habilidad}". Evalúa estrictamente los criterios de esta habilidad.'


ETIQUETA_FUENTE = {1: "LOGRADO (1)", 0: "EN PROCESO (0)"}


def _eventos(cin: Dict[str, Any]) -> str:
    if not cin.get("suficiente"):
        return "- No hubo suficientes muestras con el cuerpo visible para medir eventos."
    s, sos, lz, pt = cin.get("salto") or {}, cin.get("sosten") or {}, cin.get("lanzamiento") or {}, cin.get("pateo") or {}
    return "\n".join([
        f"- Video analizado: {cin.get('duracion_s')} s a {cin.get('fps_analisis')} muestras/s, toma de {cin.get('vista')}.",
        f"- Desplazamiento: {cin.get('desplazamiento_piernas')} largos de pierna hacia la {cin.get('direccion')}.",
        f"- Fases aéreas (ambos pies en el aire): {cin.get('vuelos')} ({cin.get('vuelos_bipodales')} con despegue y caída bipodal, "
        f"{cin.get('vuelos_alternos')} alternando pies).",
        f"- Saltos seguidos sobre el mismo pie: {cin.get('saltos_mismo_pie')} (pie {cin.get('lado_saltos') or '—'}).",
        f"- Apoyo sobre un solo pie sostenido: {cin.get('apoyo_unipodal_s')} s (pie {cin.get('pie_apoyo') or '—'}).",
        f"- Salto: avance {s.get('avance_piernas', '—')} piernas, rodillas al preparar {s.get('rodilla_preparacion', '—')}°, "
        f"al caer {s.get('rodilla_aterrizaje', '—')}°." if s else "- Salto con despegue bipodal: no detectado.",
        f"- Lanzamiento: brazo {lz.get('brazo')}, muñeca sobre el hombro: {'sí' if lz.get('muneca_sobre_hombro') else 'no'}, "
        f"velocidad {lz.get('velocidad_muneca')} piernas/s.",
        f"- Golpeo con el pie: pierna {pt.get('pierna')}, velocidad del tobillo {pt.get('velocidad_tobillo')} piernas/s, "
        f"apoyo firme: {'sí' if pt.get('apoyo_firme') else 'no'}.",
        f"- Sostén unipodal: {sos.get('segundos', 0)} s, brazos a los costados {sos.get('brazos_costados_frac', '—')}." if sos else "",
    ])


def construir_prompt_v2(diag: Dict[str, Any], habilidad_dirigida: Optional[str], grado: str, n: int) -> str:
    """Prompt del motor v2: la pose ya midió lo que puede medir; Gemini califica lo visual."""
    t = diag["telemetria_medida"]
    cin = t.get("cinematica") or {}
    det = diag.get("deteccion") or {}
    habilidad = diag["habilidad_detectada"]
    lineas = []
    for i, c in enumerate(diag["criterios"], 1):
        if c.get("puntaje") is None:
            lineas.append(f"  {i}. [{c['fase']}] {c['criterio']} → POR CONFIRMAR CON LAS IMÁGENES: {c.get('mira', '')}")
        else:
            lineas.append(f"  {i}. [{c['fase']}] {c['criterio']} → MEDIDO CON LA POSE: {ETIQUETA_FUENTE[c['puntaje']]} "
                          f"({c.get('medido', '')}). Copia este puntaje tal cual.")
    if habilidad_dirigida:
        instruccion = DIRIGIDA.format(habilidad=habilidad_dirigida)
    else:
        cambio = ("El motor está SEGURO de esta habilidad: no la cambies." if det.get("confianza") == "alta" else
                  "Si las imágenes muestran CLARAMENTE otra de las 9 habilidades, escribe esa en habilidad_detectada; "
                  "en ese caso califica sus 5 criterios con las imágenes (el servidor volverá a medir los de pose).")
        instruccion = (f"Detección automática del motor: \"{habilidad}\" (confianza {det.get('confianza', '—')}: "
                       f"{det.get('motivo', '')}). {cambio}")
    return f"""Eres un Biomecánico Deportivo y Docente Experto en Desarrollo Motor Infantil. Evalúas la Batería Validada de Habilidades Motrices Básicas para Niños entre 5 y 11 Años (González Palacio, Montoya Grisales et al., 2021 · Dialnet 7925607) con los estadios de Gallahue.

{instruccion}
Edad calibrada: {grado}. Recibes {n} fotogramas clave del gesto en orden cronológico.

EVENTOS MEDIDOS EN EL VIDEO COMPLETO CON MEDIAPIPE POSE (hechos, no los contradigas):
{_eventos(cin)}

CRITERIOS OFICIALES DE LA BATERÍA para "{habilidad}" (devuelve los 5, en este orden y con este mismo texto):
{chr(10).join(lineas)}

REGLAS:
1. Los criterios MEDIDOS CON LA POSE ya están calificados con el video completo: copia su puntaje.
2. Los criterios POR CONFIRMAR dependen de lo que solo se ve en la imagen (pelota, agarre, manos, mirada, línea en el piso): califícalos 1 solo si se ve con claridad en los fotogramas; si no se alcanza a ver, califica 0 y explícalo en la observación.
3. No inventes ángulos: en las observaciones cita el número de fotograma.

Responde EXCLUSIVAMENTE con un objeto JSON con: habilidad_detectada (uno de los 9 nombres exactos), resumen_biomecanico (2 a 4 frases para el docente, citando el fotograma cumbre), criterios (lista de 5 objetos con criterio, fase, puntaje 0/1 y observacion), analisis_articular (angulos_principales, cadena_cinetica, apoyo_y_base), errores_criticos (lista de objetos con error e impacto_biomecanico) y frases_profe (2 metáforas visuales para el niño)."""
