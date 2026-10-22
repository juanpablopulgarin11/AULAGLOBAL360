import time
import os
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

import threading
import http.server
import socketserver

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        super().end_headers()

PORT = 8000
Handler = CORSRequestHandler
httpd = socketserver.TCPServer(("", PORT), Handler)
server_thread = threading.Thread(target=httpd.serve_forever)
server_thread.daemon = True
server_thread.start()
print("Serving at port", PORT)

def draw_numbered_boxes(img_path, bounding_boxes, out_path, padding=4):
    img = Image.open(img_path)
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arialbd.ttf", 24)
    except:
        font = ImageFont.load_default()

    for i, box in enumerate(bounding_boxes):
        if not box: continue
        x, y, w, h = box['x'], box['y'], box['width'], box['height']
        x -= padding
        y -= padding
        w += padding*2
        h += padding*2
        draw.rectangle([x, y, x+w, y+h], outline="red", width=3)
        draw.ellipse([x-15, y-15, x+15, y+15], fill="red")
        draw.text((x-7, y-10), str(i+1), fill="white", font=font)

    img.save(out_path)

def run():
    out_dir = "screenshots_auto"
    os.makedirs(out_dir, exist_ok=True)
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        
        # --- 1. Landing Page ---
        page.goto(f"http://127.0.0.1:{PORT}/landing.html")
        time.sleep(1)
        page.screenshot(path="temp.png")
        box_landing = [
            page.locator(".nav-container").first.bounding_box(),
            page.locator(".hero-title").first.bounding_box(),
            page.locator(".btn-cta-primary").first.bounding_box(),
            page.locator(".btn-cta-secondary").first.bounding_box(),
        ]
        draw_numbered_boxes("temp.png", box_landing, f"{out_dir}/auto_1_landing.png")
        print(f"Saved {out_dir}/auto_1_landing.png")

        # --- 2. Dashboard Header ---
        page.goto(f"http://127.0.0.1:{PORT}/index.html")
        time.sleep(1)
        page.screenshot(path="temp.png")
        box_dashboard = [
            page.locator(".engine-toggle").first.bounding_box(),
            page.locator(".config-btn").first.bounding_box(),
        ]
        draw_numbered_boxes("temp.png", box_dashboard, f"{out_dir}/auto_2_dashboard.png")
        print(f"Saved {out_dir}/auto_2_dashboard.png")
        
        # --- 3. Config Drawer ---
        # First activate Gemini mode so the API Key input appears (Item 7)
        page.click("#btnModeGemini")
        time.sleep(0.5)
        page.click(".config-btn") # Open drawer
        time.sleep(1)
        page.screenshot(path="temp.png")
        box_config = [
            page.locator(".drawer-section").nth(0).bounding_box(), # Grado/Edad
            page.locator(".drawer-section").nth(1).bounding_box(), # Formato
            page.locator(".drawer-section").nth(2).bounding_box(), # Metodologia
            page.locator(".drawer-row").first.bounding_box(), # Tiempos
            page.locator(".mat-grid").first.bounding_box(), # Materiales
            page.locator(".mode-btns").first.bounding_box(), # Evaluacion Individual/Colectivo
            page.locator("#drawerGeminiSection").first.bounding_box(), # Gemini Key
        ]
        draw_numbered_boxes("temp.png", box_config, f"{out_dir}/auto_3_config.png")
        print(f"Saved {out_dir}/auto_3_config.png")
        
        # --- 4. Subir video y Keyframes (Paso 1 del Dashboard) ---
        # Esperamos que se cierre el drawer si sigue abierto
        page.click(".drawer-close")
        time.sleep(0.5)
        
        # Simulate video processing UI state directly
        page.evaluate("""
            const strip = document.getElementById('keyframeStrip');
            strip.innerHTML = '';
            for(let i=0; i<8; i++) {
                const img = document.createElement('div');
                img.className = 'keyframe-img';
                img.style.background = 'linear-gradient(135deg, #4f46e5, #ec4899)';
                img.style.width = '80px';
                img.style.height = '140px';
                img.style.borderRadius = '8px';
                img.style.border = '2px solid #3b82f6';
                strip.appendChild(img);
            }
            const badge = document.getElementById('keyframeCountBadge');
            if(badge) {
                badge.textContent = '8 cuadros adaptativos';
                badge.style.display = 'inline-block';
            }
            const uploadZone = document.getElementById('uploadZone');
            if(uploadZone) uploadZone.classList.add('has-file');
            
            // Show video player block
            const videoPlayer = document.getElementById('videoPlayer') || document.getElementById('studentVideoPlayer');
            if(videoPlayer) {
                videoPlayer.style.display = 'block';
                videoPlayer.style.background = '#000';
            }
            
            // Show step 3 button and make it active
            const step3Btn = document.getElementById('sendBtn');
            if(step3Btn) {
                step3Btn.disabled = false;
                step3Btn.classList.add('active');
            }
        """)
        time.sleep(2) # Let UI settle
        
        page.screenshot(path="temp.png")
        # --- Paso 1: Elección de Habilidad ---
        box_paso1 = [
            page.locator(".skill-card--auto").first.bounding_box(),
            page.locator(".skill-grid").first.bounding_box()
        ]
        page.screenshot(path="temp.png")
        draw_numbered_boxes("temp.png", box_paso1, f"{out_dir}/auto_4_paso1.png")
        print(f"Saved {out_dir}/auto_4_paso1.png")

        # Seleccionar habilidad para avanzar
        page.click(".skill-card--auto")
        time.sleep(0.5)

        # --- Paso 2: Ver guía de grabación (botón) ---
        box_btn_guia = [
            page.locator(".link-btn").first.bounding_box()
        ]
        page.screenshot(path="temp.png")
        draw_numbered_boxes("temp.png", box_btn_guia, f"{out_dir}/auto_4_paso2_btn_guia.png")
        print(f"Saved {out_dir}/auto_4_paso2_btn_guia.png")

        # --- Paso 3: Modal de la guía ---
        page.click(".link-btn")
        time.sleep(1)
        box_guia_modal = [
            page.locator("#recordingModal .modal-content").first.bounding_box()
        ]
        page.screenshot(path="temp.png")
        draw_numbered_boxes("temp.png", box_guia_modal, f"{out_dir}/auto_4_paso3_modal.png")
        print(f"Saved {out_dir}/auto_4_paso3_modal.png")
        page.click(".modal-close")
        time.sleep(0.5)

        # --- Paso 4: Cuadro de Subir Video ---
        box_upload = [
            page.locator(".upload-zone").first.bounding_box()
        ]
        page.screenshot(path="temp.png")
        draw_numbered_boxes("temp.png", box_upload, f"{out_dir}/auto_4_paso4_upload.png")
        print(f"Saved {out_dir}/auto_4_paso4_upload.png")

        # --- Paso 5: Fotogramas cargados y botón de analizar ---
        # Inject mock keyframes
        page.evaluate("""
            const container = document.getElementById('keyframeStrip');
            container.innerHTML = '';
            for(let i=0; i<8; i++) {
                const div = document.createElement('div');
                div.className = 'keyframe-box';
                div.style.backgroundColor = '#334155';
                div.style.border = '1px solid #475569';
                div.innerHTML = `<span style="color:#94a3b8; font-size:10px;">Frame ${i+1}</span>`;
                container.appendChild(div);
            }
            document.getElementById('keyframeSection').style.display = 'block';
            document.getElementById('keyframeCountBadge').innerText = '8 cuadros';
            
            // Show step 3 button and make it active
            const step3Btn = document.getElementById('sendBtn');
            if(step3Btn) {
                step3Btn.disabled = false;
                step3Btn.classList.add('active');
            }
        """)
        time.sleep(0.5)
        box_keyframes = [
            page.locator("#keyframeStrip").first.bounding_box(),
            page.locator("#sendBtn").first.bounding_box()
        ]
        page.screenshot(path="temp.png")
        draw_numbered_boxes("temp.png", box_keyframes, f"{out_dir}/auto_4_paso5_fotogramas.png")
        print(f"Saved {out_dir}/auto_4_paso5_fotogramas.png")

        # --- Paso 6: Resultados y Descargas ---
        # Inject mock results directly without clicking to avoid 'Clave requerida' modal
        page.evaluate("""
            const resultContainer = document.getElementById('resultContainer');
            resultContainer.innerHTML = `
                <div class='result-content' style='background: #1e293b; padding: 20px; border-radius: 8px; margin-bottom: 20px;'>
                    <h3 style='color: #fff;'>Evaluación Biomecánica: Carrera</h3>
                    <p style='color: #cbd5e1;'>Fase de vuelo ausente.</p>
                </div>
                <div class='result-actions' style='display: flex; gap: 10px;'>
                    <button class='btn-download' style='background: #3b82f6; color: white; padding: 12px; border: none; border-radius: 6px; cursor: pointer;'>📥 Informe Estudiante (Word)</button>
                    <button class='btn-download' style='background: #10b981; color: white; padding: 12px; border: none; border-radius: 6px; cursor: pointer;'>📥 Unidad Didáctica (Word)</button>
                </div>
            `;
            resultContainer.style.display = 'block';
            
            // Also reveal the step 3 block itself if hidden
            const step3 = document.getElementById('wizardStep3');
            if(step3) step3.style.display = 'block';
            
            // Scroll to results
            resultContainer.scrollIntoView({behavior: "smooth"});
        """)
        time.sleep(1)
        box_resultados = [
            page.locator(".result-content").first.bounding_box(),
            page.locator(".btn-download").nth(0).bounding_box(),
            page.locator(".btn-download").nth(1).bounding_box(),
        ]
        page.screenshot(path="temp.png")
        draw_numbered_boxes("temp.png", box_resultados, f"{out_dir}/auto_5_resultados.png")
        print(f"Saved {out_dir}/auto_5_resultados.png")

        browser.close()
        httpd.shutdown()

if __name__ == "__main__":
    run()
