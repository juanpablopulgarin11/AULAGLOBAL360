# AulaGlobal360 🏃‍♂️✨

**AULA GLOBAL 360** es una plataforma web interactiva de evaluación diagnóstica de Habilidades Motrices Básicas (HMB) y generador de planeaciones pedagógicas para docentes de Educación Física en preescolar y primaria (5 a 11 años).

🌐 **Demo en Vivo (GitHub Pages):** [https://juanpablopulgarin11.github.io/AULAGLOBAL360/](https://juanpablopulgarin11.github.io/AULAGLOBAL360/)

---

## 🌟 Características Principales

- **Evaluación Biomecánica HMB:** Basada en la batería validada de *González Palacio & Montoya Grisales* y los estadios de desarrollo motor de *David L. Gallahue* (Inicial, Elemental y Maduro).
- **Modos de Operación:**
  - **📊 Análisis Individual:** Diagnóstico biomecánico y generación de unidad didáctica personalizada.
  - **👨‍👩‍👧‍👦 Análisis Grupal (Salón):** Registro secuencial del grupo para consolidar fallos comunes y generar planeaciones masivas.
- **Preferencias Pedagógicas:** Adaptación a formatos como *Cuento Motor*, *Circuito de Estaciones*, *Retos Cooperativos* y metodologías como *Descubrimiento Guiado*.
- **Visualizador Anatómico 3D:** Comparación del video/imagen del estudiante frente a modelos de patrones motores maduros.
- **Exportación a Microsoft Word (.doc):**
  - Reporte biomecánico del estudiante (para padres e historial con firma docente).
  - Planeación de clase completa (con distribución espacial con medidas, guion docente *"El Lenguaje del Profe"*, prevención y adaptaciones de inclusión).

## 📁 Estructura del Proyecto

```
├── index.html             # App principal (evaluación y planeación)
├── landing.html / .css    # Página de presentación
├── preview.html / _styles # Vista previa del rediseño de la interfaz
├── script.js              # Lógica interactiva, procesamiento de video y análisis
├── styles.css             # Estilos de la app
├── scripts/build.mjs      # Genera dist/ para el despliegue
├── .github/workflows/     # Despliegue automático a GitHub Pages
├── netlify.toml           # Configuración para Netlify
├── Data/                  # Material bibliográfico de referencia (no se publica)
└── codigodelsalto.py      # Prototipo Python de referencia (no se publica)
```

## 🖥️ Despliegue en servidor (versión Django)

La guía completa para instalar la versión Django en un servidor gratuito de Oracle Cloud, con HTTPS, PostgreSQL y respaldos diarios, está en **[DESPLIEGUE.md](DESPLIEGUE.md)**.

## 🧪 Probar en local (versión estática)

Requiere Node.js 18+ (no hay dependencias que instalar).

```bash
npm start      # genera dist/ y lo sirve en http://localhost:8080
npm run build  # solo genera dist/
```

No abras `index.html` con doble clic (`file://`): MediaPipe y la cámara necesitan un servidor HTTP.

## ☁️ Publicar la versión estática

`npm run build` genera `dist/` solo con los archivos del sitio (~0.5 MB). La carpeta `Data/` (PDFs de referencia) y `codigodelsalto.py` **no se publican**.

**Opción A — GitHub Pages (manual):**
1. En GitHub: *Settings → Pages → Build and deployment → Source:* **GitHub Actions**. Esto reemplaza la demo que hoy se sirve desde la rama.
2. En *Actions*, ejecuta el workflow [Deploy GitHub Pages (estático)](.github/workflows/deploy-pages.yml), que publica `dist/` en `https://<usuario>.github.io/AULAGLOBAL360/`.

**Opción B — Netlify:** importa el repositorio en Netlify; [netlify.toml](netlify.toml) ya define el build (`npm run build`) y la carpeta (`dist`). También puedes ejecutar `npm run build` y arrastrar `dist/` a [app.netlify.com/drop](https://app.netlify.com/drop).

**Análisis con IA (opcional):** cada usuario pega su propia clave de Google AI Studio en la app; se guarda solo en su navegador (`localStorage`). El modo local funciona sin clave.

## 🚀 Uso Rápido

1. Abre `index.html` en cualquier navegador moderno o visita el enlace de [GitHub Pages](https://juanpablopulgarin11.github.io/AULAGLOBAL360/).
2. Selecciona la habilidad motriz y tus preferencias de clase en el menú lateral.
3. Sube un video o imagen del estudiante (o usa el modo simulado).
4. Obtén el diagnóstico biomecánico y descarga la planeación de clase o reporte en Word.

## 🐍 Versión Python / Django

La carpeta [`backend/`](backend/README.md) contiene la versión completa en Django: el video se analiza en el servidor con MediaPipe, los resultados quedan guardados por estudiante y salón, y las planeaciones y reportes se descargan en Word (`.docx`). Instrucciones de instalación local y con Docker en su README.

## 📚 Documentación técnica

La documentación completa del funcionamiento interno (motor biomecánico, reglas de la batería, planeación, Gemini) y el plan de migración a Python/Django está en [`docs/`](docs/README.md).
