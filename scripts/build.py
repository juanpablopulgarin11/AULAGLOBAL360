"""
Genera dist/ con solo los archivos que necesita el sitio publicado.
Data/ (PDFs de referencia) y codigodelsalto.py quedan fuera del despliegue.
Compatible con entornos sin Node.js.
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

FILES = [
    "index.html",
    "landing.html",
    "preview.html",
    "script.js",
    "styles.css",
    "landing.css",
    "preview_styles.css",
    "logo.svg",
    "logo-icon.svg",
    ".nojekyll",
]

def build():
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True, exist_ok=True)

    for filename in FILES:
        src = ROOT / filename
        if not src.exists():
            print(f"Falta el archivo requerido: {filename}", file=sys.stderr)
            sys.exit(1)
        shutil.copy2(src, DIST / filename)

    # Verifica que todo recurso local referenciado en los HTML exista en dist/
    missing = []
    url_pattern = re.compile(r'(?:src|href)="([^"#?]+)')
    for page in [f for f in FILES if f.endswith(".html")]:
        html = (DIST / page).read_text(encoding="utf-8")
        for ref in url_pattern.findall(html):
            if re.match(r"^(https?:|mailto:|data:|//)", ref):
                continue
            if not (DIST / ref).exists():
                missing.append(f"{page} -> {ref}")

    if missing:
        print("Referencias rotas:\n  " + "\n  ".join(missing), file=sys.stderr)
        sys.exit(1)

    print(f"dist/ listo con {len(FILES)} archivos.")

if __name__ == "__main__":
    build()
