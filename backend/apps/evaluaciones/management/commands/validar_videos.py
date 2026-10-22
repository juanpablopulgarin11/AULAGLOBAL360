"""Valida el motor v2 con videos reales etiquetados, sin tocar la base de datos.

Estructura de la carpeta (el nombre de cada subcarpeta es la habilidad que se ejecuta)::

    videos/
      carrera/  salto/  marcha/  salto_unipodal/  lanzar/  atrapar/  patear/
      equilibrio/  equilibrio_estatico/
      otros/            ← videos sin una prueba de la batería (deben quedar con confianza baja)

Uso::

    python manage.py validar_videos videos/ [--esperado calificacion_docente.csv] [--csv resultados.csv]

``--esperado``: CSV con columnas ``archivo,c1,c2,c3,c4,c5`` (1/0, vacío si no se calificó) con la
calificación del docente; se reporta la concordancia criterio por criterio, como la validación
entre jueces de la batería. Los videos se procesan localmente (nada sale del computador).
"""
from __future__ import annotations

import csv
import time
from collections import Counter, defaultdict
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.evaluaciones.servicios import preparar_frames
from apps.evaluaciones.tasks import obtener_detector
from biomecanica.extraccion import ArchivoIlegible, extraer_video
from biomecanica.habilidades import resolver_habilidad
from biomecanica.motor_v2 import run_motor_v2

EXTENSIONES = {".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"}


class Command(BaseCommand):
    help = "Mide el acierto de la detección automática y de los criterios con videos reales etiquetados."

    def add_arguments(self, parser):
        parser.add_argument("carpeta", type=Path)
        parser.add_argument("--esperado", type=Path, help="CSV archivo,c1..c5 con la calificación del docente")
        parser.add_argument("--csv", type=Path, dest="salida", help="Guarda el detalle por video")

    def handle(self, *args, carpeta: Path, esperado=None, salida=None, **opts):
        if not carpeta.is_dir():
            raise CommandError(f"No existe la carpeta {carpeta}")
        videos = sorted(p for p in carpeta.rglob("*") if p.suffix.lower() in EXTENSIONES)
        if not videos:
            raise CommandError("La carpeta no tiene videos (mp4, mov, webm…)")
        calificacion = _leer_esperado(esperado) if esperado else {}
        detector = obtener_detector()

        filas, confusion = [], Counter()
        concordancia = defaultdict(lambda: [0, 0])          # criterio → [coincide, comparados]
        for ruta in videos:
            etiqueta = ruta.parent.name.lower()
            real = None if etiqueta == "otros" else resolver_habilidad(etiqueta)
            if etiqueta != "otros" and real is None:
                self.stderr.write(f"Se omite {ruta.name}: la carpeta «{etiqueta}» no es una habilidad")
                continue
            t0 = time.perf_counter()
            try:
                r = extraer_video(ruta, detector)
            except ArchivoIlegible as exc:
                self.stderr.write(f"{ruta.name}: {exc}")
                continue
            frames = preparar_frames(r.frames)
            try:
                auto = run_motor_v2("auto", "7_anos", "", frames, r.serie)
            except ValueError as exc:            # sin persona
                self.stderr.write(f"{ruta.name}: {exc}")
                continue
            segundos = time.perf_counter() - t0
            det = auto["deteccion"]
            confusion[(real or "otros", det["habilidad"] if det["confianza"] != "baja" else "no reconocida")] += 1
            fila = {"archivo": ruta.name, "carpeta": etiqueta, "detectada": det["habilidad"], "confianza": det["confianza"],
                    "acierta": (det["habilidad"] == real and det["confianza"] != "baja") if real else det["confianza"] == "baja",
                    "segundos": round(segundos, 1), "avisos": " | ".join(r.advertencias)}
            if real:
                dirigida = run_motor_v2(etiqueta, "7_anos", "", frames, r.serie)
                pts = [c["puntaje"] for c in dirigida["criterios"]]
                fila.update({f"c{i}": ("" if p is None else p) for i, p in enumerate(pts, 1)})
                fila["estadio"] = dirigida["estadio_gallahue"]
                for i, (p, e) in enumerate(zip(pts, calificacion.get(ruta.name, [])), 1):
                    if p is not None and e is not None:
                        concordancia[(real, i)][1] += 1
                        concordancia[(real, i)][0] += int(p == e)
            filas.append(fila)
            marca = "✓" if fila["acierta"] else "✗"
            self.stdout.write(f"{marca} {etiqueta:20} {ruta.name[:40]:40} → {det['habilidad']} ({det['confianza']}) "
                              f"{fila.get('estadio', '')} {segundos:.1f}s")

        self._resumen(filas, confusion, concordancia)
        if salida:
            campos = sorted({k for f in filas for k in f}, key=lambda k: (k not in ("archivo", "carpeta"), k))
            with open(salida, "w", newline="", encoding="utf-8") as fh:
                w = csv.DictWriter(fh, fieldnames=campos)
                w.writeheader()
                w.writerows(filas)
            self.stdout.write(f"Detalle guardado en {salida}")

    def _resumen(self, filas, confusion, concordancia):
        if not filas:
            return
        aciertos = sum(1 for f in filas if f["acierta"])
        self.stdout.write(self.style.MIGRATE_HEADING(f"\nDetección automática: {aciertos}/{len(filas)} "
                                                     f"({round(aciertos / len(filas) * 100)}%)"))
        for (real, detectada), n in sorted(confusion.items()):
            self.stdout.write(f"  {real:30} → {detectada:30} {n}")
        if concordancia:
            self.stdout.write(self.style.MIGRATE_HEADING("\nConcordancia con el docente (criterios medidos con la pose):"))
            for (habilidad, i), (ok, n) in sorted(concordancia.items()):
                self.stdout.write(f"  {habilidad:30} criterio {i}: {ok}/{n} ({round(ok / n * 100)}%)")
        lentos = max(f["segundos"] for f in filas)
        self.stdout.write(f"\nTiempo por video: máx. {lentos} s, promedio {round(sum(f['segundos'] for f in filas) / len(filas), 1)} s")


def _leer_esperado(ruta: Path):
    salida = {}
    with open(ruta, encoding="utf-8") as fh:
        for fila in csv.DictReader(fh):
            salida[fila["archivo"]] = [int(fila[f"c{i}"]) if fila.get(f"c{i}", "").strip() in ("0", "1") else None
                                       for i in range(1, 6)]
    return salida
