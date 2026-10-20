"""La interfaz de Django reutiliza la de la web estática (index.html + styles.css) sin modificarla."""
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def test_web_css_es_copia_exacta_de_styles_css():
    """Si cambia styles.css en la web, copiarlo: cp styles.css backend/static/css/web.css"""
    assert (RAIZ / "backend/static/css/web.css").read_bytes() == (RAIZ / "styles.css").read_bytes()
