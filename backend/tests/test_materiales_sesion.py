"""La planeación y sus tres modelados 3D usan el material que el docente marcó en «Configurar clase»."""
import json
import re
from pathlib import Path

import pytest

from apps.planeacion.montaje import construir_escena, construir_escena_parte
from biomecanica.didactica_v2 import generar_unidad
from biomecanica.materiales import adaptar_texto, mencionados, reemplazar_material

BANCO = json.loads((Path(__file__).resolve().parents[2] / "docs/datos/plantillas_progresion.json")
                   .read_text(encoding="utf-8"))["plantillas"]


def _unidad(habilidad, materiales):
    prefs = {"totalClasses": "12", "materials": ", ".join(materiales), "_materiales_lista": materiales}
    return generar_unidad({"habilidad_detectada": habilidad}, prefs, BANCO)


def test_semaforo_motriz_con_aros():
    s = _unidad("Carrera", ["Aros"])["clases_secuencia"][0]
    assert "frena dentro de un aro del color que nombre el docente" in s["actividad_inicial"]
    assert "círculos" not in s["actividad_inicial"]                   # la rodilla se flexiona y se extiende, no gira
    assert "flexionar y extender suavemente las rodillas" in s["actividad_inicial"]
    assert "colchoneta" not in s["actividad_central"] and "dentro de los aros" in s["actividad_central"]
    assert "aro" in s["actividad_final"]


@pytest.mark.parametrize("habilidad", list(BANCO))
def test_solo_aros_toda_la_secuencia_usa_aros(habilidad):
    for s in _unidad(habilidad, ["Aros"])["clases_secuencia"]:
        for parte in ("inicial", "central", "final"):
            texto = s[f"actividad_{parte}"].split("Montaje con tu material:")[0]     # la nota nombra lo reemplazado
            assert set(mencionados(texto)) <= {"Aros"}, (s["numero"], parte, mencionados(texto))
        assert "aro" in s["actividad_inicial"] and "aro" in s["actividad_final"], s["numero"]


@pytest.mark.parametrize("habilidad", list(BANCO))
def test_sin_errores_de_biomecanica_en_la_movilidad(habilidad):
    for s in BANCO[habilidad]:
        for parte in ("actividad_inicial", "actividad_final"):
            assert not re.search(r"rodillas?[^.]{0,40}(?<!no )(c[ií]rculo|gir|rotaci)", s[parte], re.I), (habilidad, s["orden"])
            assert not re.search(r"codos?[^.]{0,30}orejas?", s[parte], re.I), (habilidad, s["orden"])


def test_sin_configuracion_el_texto_no_cambia():
    u = _unidad("Patear", [])
    assert [s["actividad_inicial"] for s in u["clases_secuencia"]] == [p["actividad_inicial"] for p in BANCO["Patear"]]


def test_balones_solo_en_las_pruebas_de_manipulacion():
    carrera = _unidad("Carrera", ["Balones", "Aros"])["clases_secuencia"]
    assert not any("balón" in s["actividad_inicial"] for s in carrera if "balón" not in BANCO["Carrera"][s["orden_plantilla"] - 1]["actividad_inicial"])
    atrape = _unidad("Recepción y Atrape", ["Balones"])["clases_secuencia"]
    assert all("balón" in s["actividad_final"] or "pelota" in s["actividad_final"] for s in atrape)


def test_reemplazo_con_articulos():
    assert reemplazar_material("Pon las colchonetas y sobre la colchoneta.", "Colchonetas", ["Aros"]) == \
        "Pon los aros y dentro del aro."
    assert reemplazar_material("Rodear los conos.", "Conos", ["Platillos"]) == "Rodear los platillos."
    assert reemplazar_material("Pasar el balón.", "Balones", ["Conos"]) == "Pasar la pelota de papel."
    assert adaptar_texto("Correr entre conos.", "central", ["Aros", "Conos"], "Carrera") == "Correr entre conos."


def test_modelados_de_las_tres_partes_usan_el_material_elegido():
    s = _unidad("Carrera", ["Aros"])["clases_secuencia"][0]
    inicial = construir_escena_parte(s["actividad_inicial"], "inicial", materiales=["Aros"], habilidad="Carrera")
    final = construir_escena_parte(s["actividad_final"], "final", materiales=["Aros"], habilidad="Carrera")
    central = construir_escena(s["distribucion"], materiales=["Aros"], habilidad="Carrera")
    for escena in (inicial, final, central):
        tipos = {e["tipo"] for e in escena["elementos"]}
        assert "aro" in tipos and not tipos & {"cono", "platillo", "colchoneta", "balon"}, tipos
    assert inicial["receta"] == "inicial_libre" and final["receta"].startswith("final_")
    # en el momento de la señal del semáforo cada estudiante está dentro de un aro
    aros = [(e["x"], e["z"]) for e in inicial["elementos"] if e["tipo"] == "aro"]
    assert all(any(abs(p["x"] - x) < 0.01 and abs(p["z"] - z) < 0.01 for x, z in aros) for p in inicial["estudiantes"])


def test_concordancia_y_sin_repetir():
    assert reemplazar_material("a un paso del balón quieto", "Balones", ["Conos"]) == "a un paso de la pelota de papel quieta"
    assert reemplazar_material("esquivando platillos y conos", "Conos", ["Platillos"]) == "esquivando platillos"


def test_planeaciones_guardadas_se_corrigen_al_mostrarlas():
    viejo = ("Juego 'El semáforo motriz': desplazamientos suaves por la cancha frenando en punta de pies cuando el docente "
             "diga 'rojo'. Mover tobillos y rodillas en círculos suaves.")
    texto = adaptar_texto(viejo, "inicial", ["Aros", "Conos"], "Carrera")
    assert "círculos" not in texto and "frena dentro de un aro" in texto
    assert adaptar_texto(texto, "inicial", ["Aros", "Conos"], "Carrera") == texto          # adaptar dos veces no cambia nada
    escena = construir_escena_parte(texto, "inicial", materiales=["Aros", "Conos"], habilidad="Carrera")
    assert escena["receta"] == "inicial_libre"                                           # semáforo: espacio libre, no círculo
