import os
import glob
from PIL import Image, ImageDraw, ImageFont

def draw_numbered_box(draw, w, h, box_rel, num):
    # box_rel is (x1, y1, x2, y2) in percentages (0.0 to 1.0)
    x1, y1, x2, y2 = [int(v * w) if i % 2 == 0 else int(v * h) for i, v in enumerate(box_rel)]
    
    # Draw thick red rectangle
    draw.rectangle([x1, y1, x2, y2], outline="red", width=4)
    
    # Draw number badge
    r = 15 # radius
    draw.ellipse([x1-r, y1-r, x1+r, y1+r], fill="red")
    
    # Default font is tiny, but it's ok for a simple badge if we don't have true type fonts easily available. 
    # Let's try to load a default windows font, if not fallback.
    try:
        font = ImageFont.truetype("arial.ttf", 20)
    except:
        font = ImageFont.load_default()
        
    # Draw text centered (roughly)
    draw.text((x1-6, y1-10), str(num), fill="white", font=font)

def process_file(pattern, boxes, out_name):
    files = glob.glob(pattern)
    if not files:
        print(f"File not found for pattern: {pattern}")
        return None
    
    file_path = files[0]
    try:
        img = Image.open(file_path).convert("RGB")
        draw = ImageDraw.Draw(img)
        w, h = img.size
        
        for i, box in enumerate(boxes):
            draw_numbered_box(draw, w, h, box, i + 1)
            
        out_path = os.path.join(os.path.dirname(file_path), out_name)
        img.save(out_path)
        print(f"Saved {out_path}")
        return out_path
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return None

# Definir cajas (x1, y1, x2, y2) en relativos
boxes_landing = [
    (0.25, 0.05, 0.75, 0.12), # Menu nav
    (0.20, 0.30, 0.80, 0.50), # Titulo
    (0.25, 0.73, 0.49, 0.82), # Boton verde
    (0.51, 0.73, 0.75, 0.82), # Boton fundamento
]

boxes_dashboard = [
    (0.35, 0.10, 0.65, 0.20), # Engine
    (0.85, 0.10, 0.98, 0.20), # Config btn
]

boxes_config = [
    (0.82, 0.10, 0.98, 0.25), # Edad, Formato
    (0.82, 0.26, 0.98, 0.38), # Metodologia
    (0.82, 0.39, 0.98, 0.55), # Tiempos
    (0.82, 0.56, 0.98, 0.70), # Materiales
    (0.82, 0.71, 0.98, 0.85), # Modos
    (0.82, 0.86, 0.98, 0.98), # IA (si cabe, aproximado)
]

boxes_paso1 = [
    (0.28, 0.35, 0.72, 0.45), # Deteccion auto
    (0.28, 0.48, 0.72, 0.90), # Tarjetas manuales
]

boxes_guia = [
    (0.30, 0.20, 0.70, 0.80), # Modal guia
]

boxes_fotogramas = [
    (0.25, 0.55, 0.75, 0.85), # Tira fotogramas
]

boxes_resultados = [
    (0.20, 0.20, 0.80, 0.80), # Panel diagnostico
]

boxes_export = [
    (0.25, 0.85, 0.75, 0.95), # Boton azul descarga
]

# Run processing
process_file("1.*Landing*.png", boxes_landing, "mod_1_landing.png")
process_file("2.*Dashboard*.png", boxes_dashboard, "mod_2_dashboard.png")
process_file("3.*Ajustes*.png", boxes_config, "mod_3_config.png")
process_file("4.*Proceso*.png", boxes_paso1, "mod_4_paso1.png")
# The user uploaded 'foto 4 Paso 2...' which is the modal maybe? Let's check glob.
process_file("foto 4 Paso 2*.png", boxes_guia, "mod_4_paso2_guia.png")
process_file("foto 4 fotogramas*.png", boxes_fotogramas, "mod_4_fotogramas.png")
process_file("resultado de analisis*.png", boxes_resultados, "mod_5_resultados.png")
process_file("5.*Exportaci*.png", boxes_export, "mod_6_export.png")
# We also have 'panel del resultado 2.png' and 'panel del resultado.png', we can use them if needed.
