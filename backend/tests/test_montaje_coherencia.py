"""Montaje 3D coherente con la habilidad y con los materiales que el docente marcó en «Configurar clase»."""
import json
from pathlib import Path

import pytest

from apps.planeacion.models import MATERIALES
from apps.planeacion.montaje import Escena, adaptar_a_materiales, construir_escena

BANCO = json.loads((Path(__file__).resolve().parents[2] / "docs/datos/plantillas_progresion.json")
                   .read_text(encoding="utf-8"))["plantillas"]
SESIONES = [(h, s["orden"], s["distribucion"].replace("{materiales}", "Conos, Aros")) for h, ses in BANCO.items() for s in ses]


def _tipos(e):
    return [x["tipo"] for x in e["elementos"]]


@pytest.mark.parametrize("habilidad,orden,texto", SESIONES)
def test_cada_montaje_solo_trae_objetos_de_su_prueba(habilidad, orden, texto):
    tipos = _tipos(construir_escena(texto, materiales=MATERIALES, habilidad=habilidad))
    if habilidad in ("Carrera", "Marcha", "Equilibrio Dinámico"):
        assert "colchoneta" not in tipos and "balon" not in tipos            # ni se corre ni se camina sobre colchonetas
    if habilidad in ("Lanzamiento Sobre Hombro", "Recepción y Atrape", "Patear"):
        assert "balon" in tipos                                              # sin móvil no hay prueba de manipulación
    if habilidad != "Patear":
        assert not {"porteria", "bolo"} & set(tipos)
    if not habilidad.startswith("Equilibrio"):
        assert "banco" not in tipos


def test_la_habilidad_quita_objetos_ajenos_salvo_que_el_texto_los_pida():
    texto = "Circuito de 4 estaciones: Estación 1: Colchoneta; Estación 2: Pelotas de espuma; Estación 3: Aros; Estación 4: Conos."
    assert {"colchoneta", "balon"} <= set(_tipos(construir_escena(texto, habilidad="Marcha")))   # el docente lo escribió
    sin_mencion = construir_escena("Circuito de 4 estaciones: Estación 1: Frontal; Estación 2: Precisión; Estación 3: Aros; "
                                   "Estación 4: Conos.", habilidad="Marcha")
    assert not {"colchoneta", "balon", "diana"} & set(_tipos(sin_mencion))


def _escena_con_todo():
    esc = Escena(12)
    p = esc.paso("Pon colchonetas, bancos, una portería y conos.")
    esc.cono(p, 0, 0)
    esc.add("platillo", p, x=1, z=0, color="amarillo")
    esc.aro(p, 2, 0)
    esc.cuerda(p, [(0, 1), (2, 1)])
    esc.add("balon", p, x=3, z=0)
    esc.add("colchoneta", p, x=0, z=2, ancho=1.2, largo=2.0)
    esc.add("banco", p, x=2, z=2, largo=3.0, rot=0.0)
    esc.add("valla", p, x=4, z=0, ancho=0.6, alto=0.2)
    esc.add("poste", p, x=5, z=0, alto=1.0)
    esc.add("porteria", p, x=6, z=0, ancho=1.5, alto=0.9)
    return esc


def test_con_todo_el_material_no_cambia_nada():
    esc = _escena_con_todo()
    antes = list(esc.elementos)
    adaptar_a_materiales(esc, MATERIALES)
    assert esc.elementos == antes and not esc.avisos


def test_sin_material_marcado_usa_sustitutos_reales():
    esc = _escena_con_todo()
    adaptar_a_materiales(esc, ["Conos"])
    tipos = [x["tipo"] for x in esc.elementos]
    assert not {"aro", "cuerda", "colchoneta", "banco", "valla", "poste", "porteria", "platillo"} & set(tipos)
    assert tipos.count("cono") == 1 + 1 + 1 + 2                    # cono, platillo→cono, poste→cono, portería→2 conos
    assert any(x["tipo"] == "zona" and x["etiqueta"] == "Zona blanda" for x in esc.elementos)
    assert next(x for x in esc.elementos if x["tipo"] == "balon")["papel"]
    assert len(esc.avisos) == 9 and all("«Configurar clase»" in a for a in esc.avisos)
    assert "(Sin colchonetas:" in esc.pasos[0] and "(Sin bancos suecos:" in esc.pasos[0]


def test_sin_conos_ni_platillos_las_marcas_son_de_tiza():
    esc = _escena_con_todo()
    adaptar_a_materiales(esc, ["Balones"])
    assert not {"cono", "platillo"} & set(x["tipo"] for x in esc.elementos)
    assert any("cruces de tiza" in a for a in esc.avisos)


def test_platillos_reemplazan_a_los_conos():
    esc = _escena_con_todo()
    adaptar_a_materiales(esc, ["Platillos", "Cuerdas"])
    tipos = [x["tipo"] for x in esc.elementos]
    assert "cono" not in tipos and tipos.count("platillo") >= 5
    assert "cuerda" in tipos                                       # la valla queda como cuerda entre dos platillos
