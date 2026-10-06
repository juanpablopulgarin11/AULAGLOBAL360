"""Reglas cuantitativas de la Batería HMB (port de ``biomechanicalRulesTable``, ``script.js:2954``).

Batería de Habilidades Motrices Básicas para Niños entre 5 y 11 Años
(González Palacio, Montoya Grisales, Cardona, Marín & Muñoz, 2021 · Dialnet 7925607).

Cada criterio es dicotómico (1 = logrado, 0 = en proceso) y se evalúa sobre la telemetría
agregada ``t`` (ver ``telemetria.py``). Los textos se generan con los valores medidos.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Union

from .habilidades import (
    ATRAPE, CARRERA, EQ_DINAMICO, EQ_ESTATICO, LANZAMIENTO, MARCHA, PATEAR, SALTO_HORIZONTAL,
    SALTO_UNIPODAL,
)
from .jsutil import js_str as v

T = Dict[str, Any]
Texto = Union[str, Callable[[T], str]]


def _txt(x: Texto, t: T) -> str:
    return x(t) if callable(x) else x


@dataclass(frozen=True)
class Criterio:
    texto: str
    fase: str
    condicion: Callable[[T], bool]
    medido: Texto
    umbral: str
    observacion_ok: Texto
    observacion_falla: Texto
    error: str
    impacto: Texto

    def evaluar(self, t: T) -> Dict[str, Any]:
        ok = bool(self.condicion(t))
        return {
            "puntaje": 1 if ok else 0,
            "medido": _txt(self.medido, t),
            "umbral": self.umbral,
            "observacion": _txt(self.observacion_ok if ok else self.observacion_falla, t),
            "error": None if ok else {"error": self.error, "impacto_biomecanico": _txt(self.impacto, t)},
        }


@dataclass(frozen=True)
class ReglaHabilidad:
    componente: str
    prueba_nro: int
    puntaje_max: int
    protocolo: str
    criterios: List[Criterio]
    frases: List[str]


L, M, E = "[HMB-L] Locomoción", "[HMB-M] Manipulación", "[HMB-E] Estabilidad-Equilibrio"


def _vuelo_medido(t: T) -> str:
    return f"Confirmado (cuadros #{', '.join(v(x) for x in t['flightFrames'])})" if t["flightDetected"] else "No detectado"


def _tilt_str(t: T) -> str:
    return f"{v(t['avgShoulderTilt'])}°" if t.get("avgShoulderTilt") is not None else f"{v(100 - t['symmetryScore'])}%"


def _rodilla_apoyo(t: T) -> Any:
    return t["avgSupportKnee"] if (t.get("avgSupportKnee") is not None and t["avgSupportKnee"] > 0) else t["maxKneeAngle"]


def _hay_sosten(t: T) -> bool:
    return (t.get("unipodalMaintainedFrames") is not None and t["unipodalMaintainedFrames"] >= 2) or t["unipodalHoldFrames"] >= 2


REGLAS: Dict[str, ReglaHabilidad] = {
    CARRERA: ReglaHabilidad(L, 2, 5, "Desplazamiento en carrera de 18 metros con retorno al cono de inicio.", [
        Criterio(
            "Brazos en arco desde hombros flexionados ~90° en oposición coordinada a piernas", "Sincronía",
            lambda t: 75 <= t["avgElbowAngle"] <= 110,
            lambda t: f"{v(t['avgElbowAngle'])}°", "75° a 110°",
            lambda t: f"Braceo coordinado en plano sagital con codos en ángulo maduro ({v(t['avgElbowAngle'])}°).",
            lambda t: f"Apertura o rigidez excesiva de codos durante el braceo: {v(t['avgElbowAngle'])}° (requerido ~90°).",
            "Braceo desalineado o codos hiperextendidos",
            lambda t: f"Codos a {v(t['avgElbowAngle'])}° generan torque asimétrico y desestabilizan el plano sagital."),
        Criterio(
            "Tronco con ligera inclinación fisiológica hacia adelante (5°-16°)", "Postura",
            lambda t: 4 <= t["avgTrunkAngle"] <= 16,
            lambda t: f"{v(t['avgTrunkAngle'])}°", "5° a 16°",
            lambda t: f"Inclinación anatómica fisiológica del tronco: {v(t['avgTrunkAngle'])}° respecto a la vertical.",
            lambda t: f"Desalineación axial del tronco: registró {v(t['avgTrunkAngle'])}° respecto a la vertical.",
            "Tronco hiperextendido o flexionado en exceso",
            lambda t: f"Inclinación de {v(t['avgTrunkAngle'])}° desvía el vector de empuje horizontal del centro de masa."),
        Criterio(
            "Pierna de apoyo se flexiona en amortiguación y propulsa vigorosamente", "Propulsión",
            lambda t: t["maxHipAngle"] >= 32,
            lambda t: f"Zancada: {v(t['maxHipAngle'])}° · Simetría: {v(t['symmetryScore'])}%", "Apertura cadera ≥ 32°",
            lambda t: f"Potente empuje propulsivo con apertura articular de {v(t['maxHipAngle'])}°.",
            lambda t: f"Fase de propulsión corta o amortiguación rígida ({v(t['maxHipAngle'])}°).",
            "Propulsión incompleta y tiempo de apoyo excesivo",
            "Disminuye la velocidad de traslación y recarga la articulación patelofemoral."),
        Criterio(
            "Pierna de recobro marcadamente flexionada con talón próximo a glúteos (rodilla ≤ 95°)", "Recobro",
            lambda t: t["minKneeAngle"] <= 95,
            lambda t: f"{v(t['minKneeAngle'])}°", "≤ 95°",
            lambda t: f"Excelente flexión de rodilla recuperadora: {v(t['minKneeAngle'])}° (acorta brazo de palanca).",
            lambda t: f"Flexión de rodilla insuficiente en el recobro: {v(t['minKneeAngle'])}° (esperado ≤95°).",
            "Recobro de rodilla bajo / insuficiente",
            lambda t: f"Registró {v(t['minKneeAngle'])}°, aumentando el momento de inercia y ralentizando la zancada."),
        Criterio(
            "Fase aérea de vuelo definida (ambos pies sin tocar simultáneamente el suelo)", "Vuelo",
            lambda t: t["flightDetected"],
            _vuelo_medido, "Fase aérea evidente",
            lambda t: f"Fase aérea evidente confirmada en fotogramas clave #{', '.join(v(x) for x in t['flightFrames'])}.",
            "No se detecta despegue aéreo claro de ambos pies (patrón rasante).",
            "Ausencia de fase de vuelo definida",
            "Corresponde a un patrón elemental de marcha rápida sin aprovechamiento de energía elástica."),
    ], [
        "¡Imagina que el piso es una nube y tus pies son plumas que no deben hacer ruido!",
        "¡Codos en caja fuerte (a 90 grados) impulsando directo hacia la meta!",
    ]),

    SALTO_HORIZONTAL: ReglaHabilidad(L, 3, 5, "Salto bipodal hacia adelante sobrepasando línea marcada con pies al ancho de hombros.", [
        Criterio(
            "Genera impulso flexionando rodillas (≤ 110°) y llevando brazos hacia atrás", "Carga",
            lambda t: t["minKneeAngle"] <= 112,
            lambda t: f"{v(t['minKneeAngle'])}°", "≤ 110°",
            lambda t: f"Sentadilla elástica de carga óptima con flexión de rodilla a {v(t['minKneeAngle'])}°.",
            lambda t: f"Flexión preparatoria superficial ({v(t['minKneeAngle'])}° vs ≤110° requerido).",
            "Carga elástica insuficiente en contramovimiento",
            "No aprovecha el ciclo estiramiento-acortamiento de extensores de rodilla y cadera."),
        Criterio(
            "Extensión vigorosa de rodillas (≥ 155°) proyectando brazos hacia adelante y arriba", "Despegue",
            lambda t: t["maxKneeAngle"] >= 155,
            lambda t: f"{v(t['maxKneeAngle'])}°", "≥ 155°",
            lambda t: f"Excelente triple extensión propulsiva con rodillas a {v(t['maxKneeAngle'])}°.",
            lambda t: f"Extensión incompleta de rodillas al despegue ({v(t['maxKneeAngle'])}°).",
            "Extensión terminal incompleta en despegue",
            "Pérdida de vector horizontal y aceleración en la parábola de vuelo."),
        Criterio(
            "Existe fase aérea de vuelo con desplazamiento hacia adelante", "Vuelo",
            lambda t: t["flightDetected"] or t["maxHipAngle"] >= 30,
            lambda t: "Fase de vuelo confirmada" if (t["flightDetected"] or t["maxHipAngle"] >= 30) else "Vuelo rasante / no evidente",
            "Trayectoria parabólica aérea",
            "Fase de vuelo evidente con traslación anterior del centro de gravedad.",
            "Fase aérea casi nula o despegue asincrónico de pies.",
            "Parábola de vuelo deficiente o rasante",
            "Limita la distancia de proyección y la suspensión coordinada en el aire."),
        Criterio(
            "Despega y cae apoyando ambas piernas simultáneamente amortiguando rodillas (≤ 135°)", "Aterrizaje",
            lambda t: t["minKneeAngle"] <= 135 and t["symmetryScore"] >= 65,
            lambda t: f"Flexión: {v(t['minKneeAngle'])}° · Simetría: {v(t['symmetryScore'])}%", "Flexión ≤ 135° y apoyo simultáneo",
            lambda t: f"Aterrizaje bipodal reactivo y armónico con amortiguación a {v(t['minKneeAngle'])}°.",
            lambda t: f"Aterrizaje rígido o asimétrico con rodillas poco flexionadas ({v(t['minKneeAngle'])}°).",
            "Aterrizaje rígido o asincrónico",
            "Transmite fuerzas de reacción del suelo lesivas hacia rodillas y zona lumbar."),
        Criterio(
            "Logra mantener el equilibrio al aterrizar sin caídas ni pasos compensatorios", "Recepción",
            lambda t: t["avgTrunkAngle"] <= 16,
            lambda t: f"Inclinación tronco: {v(t['avgTrunkAngle'])}°", "Estabilidad axial ≤ 16°",
            "Estabilidad postural sólida al frenado sin pasos de desequilibrio.",
            "Inestabilidad o balanceo excesivo del tronco al contactar el suelo.",
            "Pérdida de equilibrio post-aterrizaje",
            "El centro de gravedad sobrepasa la base de sustentación requiriendo apoyos de auxilio."),
    ], [
        "¡Aterriza suavemente como un gato ninja, que nadie escuche tus pasos!",
        "¡Lanza tus brazos al cielo como si fueras a tocar las estrellas en el despegue!",
    ]),

    MARCHA: ReglaHabilidad(L, 1, 5, "Caminar 9 metros hacia adelante tocando el cono y retornar al cono de inicio (total 18m).", [
        Criterio(
            "Balanceo libre de los brazos en el plano sagital y en oposición a las piernas", "Sincronía",
            lambda t: t["avgElbowAngle"] >= 100 and t["symmetryScore"] >= 68,
            lambda t: f"Codos: {v(t['avgElbowAngle'])}° · Simetría: {v(t['symmetryScore'])}%", "Balanceo alternado relajado",
            lambda t: f"Oscilación pendular coordinada de brazos en oposición contralateral ({v(t['avgElbowAngle'])}°).",
            "Braceo bloqueado, sincinético o asimétrico durante la marcha.",
            "Falta de balanceo libre en brazos",
            "Impide compensar el momento torsional de la pelvis generado por la zancada."),
        Criterio(
            "La posición del tronco se mantiene erguida con alineación axial", "Postura",
            lambda t: t["avgTrunkAngle"] <= 8,
            lambda t: f"{v(t['avgTrunkAngle'])}°", "≤ 8° de inclinación",
            lambda t: f"Alineación axial erguida del tronco ({v(t['avgTrunkAngle'])}° respecto a la vertical).",
            lambda t: f"Inclinación excesiva hacia adelante o cifosis durante la marcha ({v(t['avgTrunkAngle'])}°).",
            "Tronco inclinado o postura colapsada",
            "Altera la línea de gravedad corporal provocando sobrecarga cervical y lumbar."),
        Criterio(
            "Transfiere el peso corporal de talón a punta de forma fluida", "Apoyo",
            lambda t: t["maxHipAngle"] >= 24,
            lambda t: f"Amplitud zancada: {v(t['maxHipAngle'])}°", "Apertura cadera ≥ 24°",
            "Régimen de contacto podal dinámico con apoyo secuencial talón-antepié.",
            "Apoyo plano rígido o paso corto sin adecuada fase propulsiva.",
            "Contacto podal plano o sin rodillo talón-punta",
            "Disminuye la disipación elástica de impacto en el arco plantar."),
        Criterio(
            "Existe fase de doble apoyo (ambos pies tocan simultáneamente el suelo en transición)", "Transición",
            lambda t: not t["flightDetected"],
            lambda t: "Doble apoyo conservado" if not t["flightDetected"] else "Fase de vuelo registrada (carrera involuntaria)",
            "Contacto podal continuo sin vuelo",
            "Fase de doble apoyo canónica presente en cada ciclo de zancada.",
            "Acelera a trote perdiendo la fase de doble apoyo característica de la marcha.",
            "Pérdida de fase de doble apoyo",
            "El estudiante corre en vez de marchar, alterando el patrón locomotor evaluado."),
        Criterio(
            "Los pies siguen una línea longitudinal continua en dirección al cono", "Dirección",
            lambda t: t["symmetryScore"] >= 72,
            lambda t: f"Simetría de paso: {v(t['symmetryScore'])}%", "Simetría ≥ 72%",
            "Trayectoria lineal rectilínea y apoyos orientados al cono guía.",
            "Desviaciones laterales de trayectoria o rotación externa exagerada de pies.",
            "Desviación lateral de la línea de progresión",
            "Indica desequilibrio en abductores de cadera o debilidad en musculatura estabilizadora."),
    ], [
        "¡Camina como un rey o reina con su corona erguida mirando al horizonte!",
        "¡Tus brazos son péndulos de reloj que se mueven suaves al compás!",
    ]),

    SALTO_UNIPODAL: ReglaHabilidad(L, 4, 5, "Avanzar realizando tres saltos consecutivos con el pie de apoyo (pata sola).", [
        Criterio(
            "Brazos se flexionan y desplazan hacia adelante proveyendo estabilidad", "Equilibrio",
            lambda t: 60 <= t["avgElbowAngle"] <= 125,
            lambda t: f"{v(t['avgElbowAngle'])}°", "60° a 125°",
            lambda t: f"Brazos en postura equilibradora activa con codos flexionados ({v(t['avgElbowAngle'])}°).",
            lambda t: f"Brazos caídos, pegados o rígidos en abducción descontrolada ({v(t['avgElbowAngle'])}°).",
            "Falta de acción estabilizadora de brazos",
            "Impide reajustar el centro de gravedad en el eje anteroposterior."),
        Criterio(
            "El tronco se mantiene levemente inclinado hacia adelante y alineado", "Postura",
            lambda t: 4 <= t["avgTrunkAngle"] <= 18,
            lambda t: f"{v(t['avgTrunkAngle'])}°", "4° a 18°",
            lambda t: f"Inclinación anterior fisiológica del tronco a {v(t['avgTrunkAngle'])}°.",
            lambda t: f"Tronco vertical rígido o hiperextendido hacia atrás ({v(t['avgTrunkAngle'])}°).",
            "Alineación deficiente de tronco en salto unipodal",
            "Dificulta la propulsión anterior y genera fuerzas de cizallamiento en la cadera de apoyo."),
        Criterio(
            "Pierna libre oscila hacia adelante en movimiento pendular rítmico", "Propulsión",
            lambda t: t["maxHipAngle"] >= 26,
            lambda t: f"Péndulo de pierna libre: {v(t['maxHipAngle'])}°", "Apertura cadera ≥ 26°",
            lambda t: f"Balanceo pendular activo de la extremidad libre ({v(t['maxHipAngle'])}°) facilitando el avance.",
            "Pierna libre estática, colgante o rígida sin contribuir al avance.",
            "Ausencia de balanceo pendular en pierna libre",
            "Obliga a la pierna de apoyo a realizar todo el trabajo mecánico sin ayuda inercial."),
        Criterio(
            "Logra mantener el control postural y equilibrio en cada aterrizaje", "Amortiguación",
            lambda t: t["minKneeAngle"] <= 140,
            lambda t: f"Flexión rodilla: {v(t['minKneeAngle'])}°", "Flexión rodilla ≤ 140°",
            lambda t: f"Recepción elástica con amortiguación reactiva en rodilla ({v(t['minKneeAngle'])}°).",
            "Aterrizaje rígido sobre pierna bloqueada o con tambaleo evidente.",
            "Amortiguación deficiente en aterrizaje unipodal",
            "Sobrecarga la articulación tibiotarsiana y el tendón rotuliano."),
        Criterio(
            "Despega y aterriza exitosamente tres veces consecutivas sobre el mismo pie", "Continuidad",
            lambda t: t["flightDetected"] or t["maxKneeAngle"] >= 150,
            lambda t: "Fase aérea consecutiva confirmada" if (t["flightDetected"] or t["maxKneeAngle"] >= 150) else "Sin despegue claro o apoyo contralateral",
            "3 despegues aéreos consecutivos",
            "Cadena de 3 saltos completada en apoyo unipodal estricto.",
            "Apoyo compensatorio de la pierna contralateral o discontinuidad en los saltos.",
            "Falta de continuidad en los 3 saltos unipodales",
            "Refleja déficit en la fuerza reactiva unilateral y el control neuromuscular."),
    ], [
        "¡Salta como un resorte alegre manteniendo el pie firme y ágil!",
        "¡Tu pierna en el aire es una vela de barco que te impulsa hacia adelante!",
    ]),

    LANZAMIENTO: ReglaHabilidad(M, 7, 5, "Lanzamiento unimanual de pelota sobre el hombro hacia aro ubicado a 5m de distancia y 1.5m de altura.", [
        Criterio(
            "Extensión total del brazo ejecutante en el momento de soltar la pelota", "Liberación",
            lambda t: t["maxElbowAngle"] >= 145 or t["avgElbowAngle"] >= 80,
            lambda t: f"Codo en suelta: {v(t['maxElbowAngle'])}°", "≥ 145° extensión",
            lambda t: f"Extensión terminal del codo amplia y fluida al soltar el móvil ({v(t['maxElbowAngle'])}°).",
            lambda t: f"Codo flexionado o lanzamiento empujado sin palanca terminal ({v(t['maxElbowAngle'])}°).",
            "Lanzamiento en empuje sin extensión de palanca",
            "Disminuye drásticamente la velocidad de salida de la pelota y la precisión."),
        Criterio(
            "Rotación axial armónica del tronco acompañando la aceleración del brazo", "Torsión",
            lambda t: t["avgTrunkAngle"] >= 5,
            lambda t: f"Inclinación / torsión tronco: {v(t['avgTrunkAngle'])}°", "Rotación tronco evidente",
            "Disociación y rotación escapular del tronco eficiente en el plano transversal.",
            "Lanzamiento rígidamente frontal sin rotación pélvica ni de cintura escapular.",
            "Ausencia de rotación de tronco",
            "Sobrecarga el manguito rotador al aislar la articulación glenohumeral."),
        Criterio(
            "Pierna contralateral claramente adelantada como base de sustentación", "Apoyo",
            lambda t: t["maxHipAngle"] >= 28,
            lambda t: f"Apertura base: {v(t['maxHipAngle'])}°", "Paso contralateral ≥ 28°",
            lambda t: f"Paso de avance contralateral consolidado con buena base de apoyo ({v(t['maxHipAngle'])}°).",
            lambda t: f"Lanzamiento a pies paralelos o con pie homolateral adelantado ({v(t['maxHipAngle'])}°).",
            "Paso homolateral o base paralela estrecha",
            "Bloquea la cadena cinética e impide transferir energía desde los pies al balón."),
        Criterio(
            "Manifiesta control manual del móvil sin resbalamientos durante la aceleración", "Control",
            lambda t: t["avgElbowAngle"] >= 70,
            lambda t: "Agarre y aceleración controlada" if t["avgElbowAngle"] >= 70 else "Agarre inseguro / suelta precoz",
            "Control digital firme",
            "Agarre seguro y control cinemático sostenido de la trayectoria del brazo.",
            "Pérdida precoz del control de la pelota antes de la fase de aceleración final.",
            "Pérdida de control manual",
            "Afecta la sincronización del punto de suelta y el ángulo de salida parabólico."),
        Criterio(
            "La pelota avanza hacia el frente en dirección al objetivo (aro o referencia)", "Dirección",
            lambda t: t["symmetryScore"] >= 65,
            lambda t: f"Simetría vectorial: {v(t['symmetryScore'])}%", "Trayectoria frontal hacia la meta",
            "Proyección directa hacia la diana con vector de fuerza anteroposterior.",
            "Desviación oblicua acentuada de la trayectoria del móvil.",
            "Desviación direccional del móvil",
            "El vector de aceleración final se disipa fuera del plano sagital objetivo."),
    ], [
        "¡Apunta con el hombro contrario como si fueras un arquero afinando la diana!",
        "¡Gira tu cintura como si desataras un resorte gigante para lanzar lejos y certero!",
    ]),

    ATRAPE: ReglaHabilidad(M, 9, 5, "Atrapar bimanualmente pelota plástica lanzada por el evaluador en parábola a 3 metros de distancia.", [
        Criterio(
            "Seguimiento visual continuo de la pelota desde su inicio hasta el contacto final", "Anticipación",
            lambda t: t["avgTrunkAngle"] <= 15,
            lambda t: "Seguimiento ocular sostenido" if t["avgTrunkAngle"] <= 15 else "Pérdida de fijación visual o esquiva",
            "Fijación visual ininterrumpida",
            "Atención visomotriz y seguimiento continuo de la parábola del móvil.",
            "Giro de cabeza o cierre ocular por reflejo de sobresalto ante el móvil.",
            "Pérdida de seguimiento visual anticipatorio",
            "Impide calcular la velocidad angular y el punto de intercepción espacial."),
        Criterio(
            "Brazos semiflexionados y relajados en actitud receptora de espera (75°-135°)", "Espera",
            lambda t: 75 <= t["avgElbowAngle"] <= 135,
            lambda t: f"{v(t['avgElbowAngle'])}°", "75° a 135°",
            lambda t: f"Postura preparatoria elástica con codos en ángulo de absorción ({v(t['avgElbowAngle'])}°).",
            lambda t: f"Brazos rígidos hiperextendidos o excesivamente adosados al tronco ({v(t['avgElbowAngle'])}°).",
            "Brazos rígidos en fase de espera",
            "Elimina los grados de libertad necesarios para corregir la intercepción."),
        Criterio(
            "Las manos adoptan forma de copa o recipiente con pulgares y meñiques opuestos", "Contacto",
            lambda t: t["symmetryScore"] >= 70,
            lambda t: f"Simetría manual: {v(t['symmetryScore'])}%", "Manos en copa simétrica",
            "Disposición espacial de manos en embudo receptor simétrico.",
            "Manos planas en aplauso o atrapada contra el pecho/abdomen.",
            "Atrapada corporal o manos sin forma de copa",
            "El impacto del móvil genera rebote contra la pared torácica en vez de retención digital."),
        Criterio(
            "Los dos brazos realizan flexión elástica absorbiendo la energía del móvil", "Amortiguación",
            lambda t: t["minKneeAngle"] <= 150 or t["avgElbowAngle"] <= 120,
            lambda t: "Amortiguación elástica de miembros superiores" if (t["minKneeAngle"] <= 150 or t["avgElbowAngle"] <= 120) else "Recepción rígida sin disipación",
            "Flexión amortiguadora sincrónica",
            "Retracción armónica de codos hacia el pecho amortiguando la fuerza del balón.",
            "Impacto seco sin retroceso de brazos provocando el rebote de la pelota.",
            "Falta de amortiguación cinética en miembros superiores",
            "La fuerza de impacto no se disipa progresivamente y expulsa la pelota de las manos."),
        Criterio(
            "Mantiene la pelota asegurada en sus dos manos sin rebote ni escape", "Retención",
            lambda t: t["avgTrunkAngle"] <= 14,
            lambda t: "Retención segura lograda" if t["avgTrunkAngle"] <= 14 else "Escape o caída del móvil",
            "Dominio final del móvil",
            "Retención bimanual firme y estable en el espacio anterior del cuerpo.",
            "El balón se le escapa o cae de las manos al momento de la captura.",
            "Escape del móvil post-contacto",
            "Déficit en la coordinación fina y presión digital coordinada."),
    ], [
        "¡Tus manos son una cesta mágica suave que abraza el balón!",
        "¡Cede con tus brazos hacia el pecho como si atraparas un huevo de cristal sin romperlo!",
    ]),

    PATEAR: ReglaHabilidad(M, 10, 5, "Ubicado a un paso de una pelota estática, patear hacia una meta situada a 5 metros de distancia.", [
        Criterio(
            "El brazo contralateral acompaña el gesto describiendo un péndulo desde el hombro", "Equilibrio",
            lambda t: t["avgElbowAngle"] >= 70 and t["symmetryScore"] >= 65,
            lambda t: f"Codo opuesto: {v(t['avgElbowAngle'])}° · Simetría: {v(t['symmetryScore'])}%", "Brazo opuesto pendular activo",
            "Brazo contralateral desplegado armónicamente contrarrestando la rotación de cadera.",
            "Brazos adosados al cuerpo o desbalance evidente durante el golpeo.",
            "Falta de contrapeso con brazo contralateral",
            "Provoca rotación descontrolada del tronco y pérdida de estabilidad en el pie de apoyo."),
        Criterio(
            "Participación coordinada del tronco con ligera flexión anterior hacia el impacto", "Postura",
            lambda t: 4 <= t["avgTrunkAngle"] <= 18,
            lambda t: f"{v(t['avgTrunkAngle'])}°", "4° a 18° de flexión",
            lambda t: f"Inclinación anterior fisiológica del tronco concentrando el centro de masa sobre el balón ({v(t['avgTrunkAngle'])}°).",
            lambda t: f"Tronco inclinado hacia atrás o excesivamente rígido ({v(t['avgTrunkAngle'])}°).",
            "Tronco hiperextendido hacia atrás al patear",
            "Eleva involuntariamente la trayectoria del balón y reduce la potencia transmitida."),
        Criterio(
            "Movimiento pendular amplio de toda la pierna ejecutante partiendo de la cadera", "Impulso",
            lambda t: t["maxHipAngle"] >= 32,
            lambda t: f"Arco de cadera: {v(t['maxHipAngle'])}°", "Apertura cadera ≥ 32°",
            lambda t: f"Gran recorrido pendular coxofemoral ({v(t['maxHipAngle'])}°) acumulando aceleración angular.",
            lambda t: f"Golpeo corto con rodilla únicamente sin movimiento pendular desde la cadera ({v(t['maxHipAngle'])}°).",
            "Patrón de patada segmentario limitado a la rodilla",
            "Falta de reclutamiento de psoas ilíaco y glúteos mayores para la aceleración del impacto."),
        Criterio(
            "La pierna que ejecuta la acción finaliza el seguimiento y retorna con control a la base", "Desaceleración",
            lambda t: t["minKneeAngle"] <= 135,
            lambda t: f"Flexión rodilla de seguimiento: {v(t['minKneeAngle'])}°", "Seguimiento y retorno suave",
            "Desaceleración fluida de isquiotibiales con retorno coordinado del pie al suelo.",
            "Frenado brusco e hiperextensión dolorosa de la rodilla post-impacto.",
            "Frenado hiperextendido sin seguimiento",
            "Genera impacto de cizallamiento en el ligamento cruzado anterior de la rodilla ejecutante."),
        Criterio(
            "Golpea la pelota nítidamente y esta avanza hacia el frente hacia el objetivo", "Efectividad",
            lambda t: t["symmetryScore"] >= 68,
            lambda t: "Impacto nítido y trayectoria frontal" if t["symmetryScore"] >= 68 else "Impacto fallido o desviado",
            "Progresión frontal hacia la meta",
            "Contacto limpio con la pelota y proyección hacia la zona delimitada.",
            "Contacto mordido o el balón sale lateralmente fuera del objetivo.",
            "Impacto descentrado del móvil",
            "Pie de apoyo mal situado respecto al eje del balón desalineando el punto de contacto."),
    ], [
        "¡Patea con el empeine como si enviaras una carta al cielo!",
        "¡Acompaña el disparo con tu cuerpo como un cohete que sigue volando suave después del despegue!",
    ]),

    EQ_DINAMICO: ReglaHabilidad(E, 14, 5, "Caminar sobre una línea de 5 cm de ancho por 9 metros de largo hasta el final del recorrido.", [
        Criterio(
            "La mirada se mantiene orientada al frente hacia el final del recorrido", "Orientación",
            lambda t: t["avgTrunkAngle"] <= 8,
            lambda t: "Mirada al frente y cabeza alineada" if t["avgTrunkAngle"] <= 8 else "Cabeza mirando al suelo fijando los pies",
            "Orientación cefálica horizontal",
            "Cabeza erguida y mirada orientada hacia la meta sin fijar la vista en los pies.",
            "Flexión excesiva de cuello y cabeza inclinada hacia el piso buscando seguridad.",
            "Mirada fija hacia el suelo",
            "Altera el sistema vestibular y disminuye la integración propioceptiva dinámica."),
        Criterio(
            "Mantiene una postura de tronco erguida y armónica durante todo el trayecto", "Postura",
            lambda t: t["avgTrunkAngle"] <= 7,
            lambda t: f"{v(t['avgTrunkAngle'])}°", "≤ 7° de inclinación",
            lambda t: f"Excelente verticalidad y control axial del tronco ({v(t['avgTrunkAngle'])}°).",
            lambda t: f"Desalineación axial o inclinación pronunciada de columna ({v(t['avgTrunkAngle'])}°).",
            "Tronco desalineado o colapso postural",
            "El centro de gravedad oscila fuera de la base estrecha de soporte."),
        Criterio(
            "Los brazos se coordinan con los pies contrarios sin elevarlos lateralmente en cruz", "Sincronía",
            lambda t: t["avgElbowAngle"] >= 100 and t["symmetryScore"] >= 75,
            lambda t: f"Codos: {v(t['avgElbowAngle'])}° · Simetría: {v(t['symmetryScore'])}%", "Brazos relajados sin abducción en cruz",
            "Brazos oscilando suavemente junto al cuerpo sin necesidad de abrirse en cruz.",
            "Brazos abiertos en abducción exagerada (\"alas de avión\") para evitar caídas.",
            "Brazos en cruz compensatorios",
            "Indica dependencia de estrategias de inercia externa ante falta de control central del core."),
        Criterio(
            "En el desplazamiento no se inclina ni tambalea hacia los lados", "Estabilidad",
            lambda t: t["symmetryScore"] >= 80,
            lambda t: f"Estabilidad medial-lateral: {v(t['symmetryScore'])}%", "Simetría lateral ≥ 80%",
            "Avance rectilíneo uniforme sin oscilaciones en el plano frontal.",
            "Oscilaciones laterales marcadas y pérdida de estabilidad.",
            "Oscilación lateral excesiva",
            "Inestabilidad en la contracción sinérgica de glúteo medio y oblicuos abdominales."),
        Criterio(
            "Los pies se mantienen todo el tiempo sobre la línea de trayectoria de 5 cm", "Precisión",
            lambda t: t["maxHipAngle"] <= 35 and t["symmetryScore"] >= 75,
            lambda t: "Pies en la línea de 5 cm" if (t["maxHipAngle"] <= 35 and t["symmetryScore"] >= 75) else "Pies salen fuera del ancho de la línea",
            "Apoyo 100% sobre la línea",
            "Apoyos podales precisos conservados dentro de la franja demarcada de 5 cm.",
            "Salida o toques fuera de la línea demarcada para recuperar sustentación.",
            "Pérdida de la línea de soporte",
            "El estudiante ensancha la base de sustentación para compensar el déficit de equilibrio dinámico."),
    ], [
        "¡Imagina que caminas sobre una cuerda de oro como un hábil equilibrista!",
        "¡Fija tus ojos en la meta como un halcón y tu cuerpo te seguirá con suavidad!",
    ]),

    EQ_ESTATICO: ReglaHabilidad(E, 15, 5, "Parado descalzo sobre colchoneta en apoyo unipodal durante 5 segundos con rodilla libre al frente y talón atrás.", [
        Criterio(
            "Los brazos se encuentran relajados a los lados del cuerpo sin aleteos compensatorios", "Reposo",
            lambda t: t["avgElbowAngle"] >= 120,
            lambda t: f"Codos: {v(t['avgElbowAngle'])}°", "≥ 120° (brazos a los lados)",
            lambda t: f"Brazos relajados adyacentes al tronco sin aleteos compensatorios ({v(t['avgElbowAngle'])}°).",
            lambda t: f"Brazos en abducción constante o aleteando para recuperar sustentación ({v(t['avgElbowAngle'])}°).",
            "Aleteo compensatorio de brazos",
            "Indica inmadurez en el control postural del tronco y tobillo, requiriendo auxilio inercial."),
        Criterio(
            "Mantiene posición erguida evitando inclinar el cuerpo adelante – atrás", "Sagital",
            lambda t: t["avgTrunkAngle"] <= 6,
            lambda t: f"{v(t['avgTrunkAngle'])}°", "≤ 6° de inclinación sagital",
            lambda t: f"Verticalidad sagital sólida sin balanceo anteroposterior ({v(t['avgTrunkAngle'])}°).",
            lambda t: f"Oscilación anterior o posterior notable del tronco ({v(t['avgTrunkAngle'])}°).",
            "Oscilación anteroposterior del tronco",
            "Falta de co-activación equilibrada entre erectores espinales y recto abdominal."),
        Criterio(
            "Mantiene posición erguida evitando inclinar el cuerpo de lado a lado", "Frontal",
            lambda t: (t.get("avgShoulderTilt") is None or t["avgShoulderTilt"] <= 8.5) and t["symmetryScore"] >= 80,
            lambda t: f"Oscilación lateral: {_tilt_str(t)} (Simetría: {v(t['symmetryScore'])}%)", "Oscilación ≤ 8.5° y Simetría ≥ 80%",
            lambda t: f"Estabilidad lateral sólida sin balanceo compensatorio ({_tilt_str(t)}).",
            lambda t: f"Inclinación lateral o balanceo excesivo de hombros ({_tilt_str(t)}).",
            "Inclinación lateral o caída pélvica",
            "Debilidad funcional del glúteo medio de la pierna de apoyo sobre la colchoneta."),
        Criterio(
            "La pierna de apoyo se mantiene firme y extendida (rodilla ≥ 160°)", "Sustentación",
            lambda t: _rodilla_apoyo(t) >= 155,
            lambda t: f"Extensión rodilla apoyo: {v(_rodilla_apoyo(t))}°", "≥ 155° extensión",
            lambda t: f"Base de sustentación firme con rodilla de apoyo extendida ({v(_rodilla_apoyo(t))}°).",
            lambda t: f"Rodilla de apoyo semiflexionada o claudicante ({v(_rodilla_apoyo(t))}°).",
            "Rodilla de apoyo flexionada o inestable",
            "Genera fatiga prematura en el cuádriceps y mayor inestabilidad sobre la superficie viscoelástica."),
        Criterio(
            "La pierna libre sostiene la rodilla delante y talón detrás durante 5 segundos continuos", "Sostenimiento",
            lambda t: _hay_sosten(t) or t["minKneeAngle"] <= 120,
            lambda t: f"Flexión pierna libre: {v(t['minKneeAngle'])}° (Sostén: {v(t.get('unipodalMaintainedFrames') or t['unipodalHoldFrames'] or 1)} frames)",
            "Flexión anterior sostenida y pie elevado",
            "Pierna libre sostenida en posición anterior canónica durante la prueba.",
            "Pierna libre desciende, toca la colchoneta o pierde la postura de flexión anterior.",
            "Pérdida de suspensión en pierna libre",
            "El estudiante apoya el pie contralateral en la colchoneta antes de cumplir los 5 segundos."),
    ], [
        "¡Eres un árbol milenario con raíces profundas que el viento no puede mover!",
        "¡Respira hondo y sostén tu rodilla en el aire como un flamenco elegante!",
    ]),
}


def obtener_regla(habilidad: Optional[str]) -> ReglaHabilidad:
    return REGLAS.get(habilidad or "", REGLAS[CARRERA])
