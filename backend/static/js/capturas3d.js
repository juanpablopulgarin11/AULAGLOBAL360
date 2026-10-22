/* AULA GLOBAL 360 · Fotos del montaje 3D para el Word de la unidad.
 * Al pulsar «Descargar en Word», arma sin mostrarla la escena 3D de cada sesión, toma una foto del
 * montaje completo y una por cada paso, y las envía al servidor, que las inserta bajo su sesión.
 * Si el navegador no puede dibujar 3D, se descarga el Word sin fotos (como antes). */
import * as THREE from 'three';
import { crearEscena } from './montaje3d-escena.js';

const ANCHO = 1200, ALTO = 750;            // proporción 16:10, nítida al ancho de media página carta
const CALIDAD_JPEG = 0.86;
const ESCALA = ANCHO / 900;                // las etiquetas se ven como en el visor de ~900 px

// Estilos de las etiquetas (los mismos de .et3d / .cota3d en aula.css)
const ESTILOS = {
    'et3d': { fondo: 'rgba(255,255,255,.9)', texto: '#0F172A', fuente: 700, tam: 11, padX: 6, sombra: true },
    'et3d-num': { fondo: 'rgba(255,255,255,.9)', texto: '#0F172A', fuente: 700, tam: 10, padX: 5, sombra: true },
    'et3d-zona': { fondo: 'rgba(255,255,255,.75)', texto: '#0F172A', fuente: 600, tam: 11, padX: 6 },
    'et3d-docente': { fondo: '#0D9488', texto: '#FFFFFF', fuente: 700, tam: 11, padX: 6, sombra: true },
    'cota3d': { fondo: '#0F172A', texto: '#FFFFFF', fuente: 600, tam: 11, padX: 5, mono: true },
};

function estiloDe(clase) {
    const clases = clase.split(/\s+/);
    for (const c of ['cota3d', 'et3d-docente', 'et3d-zona', 'et3d-num']) if (clases.includes(c)) return ESTILOS[c];
    return ESTILOS.et3d;
}

function visibleEnEscena(o) {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
}

function rectRedondeado(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** Las etiquetas del visor son HTML (CSS2D); en la foto se pintan sobre el lienzo en su posición proyectada. */
function pintarEtiquetas(ctx, escena, camara) {
    const v = new THREE.Vector3();
    const lista = [];
    escena.traverse((o) => {
        if (!o.isCSS2DObject || !visibleEnEscena(o)) return;
        v.setFromMatrixPosition(o.matrixWorld).project(camara);
        if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return;
        lista.push({ x: (v.x + 1) / 2 * ANCHO, y: (1 - v.y) / 2 * ALTO, z: v.z, texto: o.element.textContent, e: estiloDe(o.element.className) });
    });
    lista.sort((a, b) => b.z - a.z);         // las lejanas primero, las cercanas encima
    for (const { x, y, texto, e } of lista) {
        const tam = e.tam * ESCALA;
        ctx.font = `${e.fuente} ${tam}px ${e.mono ? 'ui-monospace, Consolas, monospace' : 'Inter, "Segoe UI", system-ui, sans-serif'}`;
        const w = ctx.measureText(texto).width + e.padX * 2 * ESCALA;
        const h = tam + 4 * ESCALA;
        ctx.save();
        if (e.sombra) { ctx.shadowColor = 'rgba(15,23,42,.18)'; ctx.shadowBlur = 3 * ESCALA; ctx.shadowOffsetY = 1 * ESCALA; }
        ctx.fillStyle = e.fondo;
        rectRedondeado(ctx, x - w / 2, y - h / 2, w, h, 4 * ESCALA);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = e.texto;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(texto, x, y + 0.5 * ESCALA);
    }
}

/** Rótulo de la esquina: «Sesión 2 · Paso 3 de 5». */
function pintarRotulo(ctx, texto) {
    const tam = 13 * ESCALA;
    ctx.font = `700 ${tam}px Inter, "Segoe UI", system-ui, sans-serif`;
    const w = ctx.measureText(texto).width + 20 * ESCALA;
    const h = tam + 12 * ESCALA;
    ctx.fillStyle = 'rgba(2,132,199,.95)';
    rectRedondeado(ctx, 14 * ESCALA, 14 * ESCALA, w, h, 8 * ESCALA);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, 24 * ESCALA, 14 * ESCALA + h / 2 + 0.5 * ESCALA);
}

const siguienteCuadro = () => new Promise((r) => requestAnimationFrame(() => r()));

function aBlob(lienzo) {
    return new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo crear la imagen'))), 'image/jpeg', CALIDAD_JPEG));
}

class Fotografo {
    constructor() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(ANCHO, ALTO, false);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.camara = new THREE.PerspectiveCamera(45, ANCHO / ALTO, 0.1, 400);
        this.lienzo = document.createElement('canvas');
        this.lienzo.width = ANCHO;
        this.lienzo.height = ALTO;
        this.ctx = this.lienzo.getContext('2d');
    }

    async foto(montaje, rotulo) {
        this.renderer.render(montaje.escena, this.camara);
        this.ctx.clearRect(0, 0, ANCHO, ALTO);
        this.ctx.drawImage(this.renderer.domElement, 0, 0, ANCHO, ALTO);
        pintarEtiquetas(this.ctx, montaje.escena, this.camara);
        pintarRotulo(this.ctx, rotulo);
        return aBlob(this.lienzo);
    }

    /** Fotos de una sesión: fotos según el modo ('ambas', 'completo', 'pasos').
     * Devuelve una lista de { k, blob } donde k=0 es el montaje completo y k>=1 es el paso k.
     */
    async sesion({ numero, escena: datos }, modo = 'ambas', onAvance = null) {
        const montaje = crearEscena(datos);
        try {
            const { pos, obj } = montaje.vista('3d', this.camara);
            this.camara.position.copy(pos);
            this.camara.lookAt(obj);
            this.camara.updateMatrixWorld();
            const fotos = [];

            if (modo === 'ambas' || modo === 'completo') {
                if (onAvance) onAvance(`Sesión ${numero}: Foto del modelo 3D general`);
                montaje.mostrarPaso(null);
                const blob = await this.foto(montaje, `Sesión ${numero} · Montaje completo`);
                fotos.push({ k: 0, blob });
            }

            if (modo === 'ambas' || modo === 'pasos') {
                for (let i = 0; i < datos.pasos.length; i++) {
                    await siguienteCuadro();      // deja respirar a la página entre fotos
                    if (onAvance) onAvance(`Sesión ${numero}: Foto del paso ${i + 1} de ${datos.pasos.length}`);
                    montaje.mostrarPaso(i);
                    montaje.resaltar(i, 0.4);
                    const blob = await this.foto(montaje, `Sesión ${numero} · Paso ${i + 1} de ${datos.pasos.length}`);
                    fotos.push({ k: i + 1, blob });
                }
            }
            return fotos;
        } finally {
            montaje.liberar();
        }
    }

    cerrar() {
        this.renderer.dispose();
        this.renderer.forceContextLoss?.();
    }
}

function nombreDeArchivo(respuesta, defecto) {
    const m = /filename="?([^";]+)"?/.exec(respuesta.headers.get('Content-Disposition') || '');
    return m ? m[1] : defecto;
}

function guardar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ------------------------------------------------------------------ Descarga y Modal de Opciones

const boton = document.querySelector('[data-descargar-word]');
const estado = document.querySelector('[data-descarga-estado]');
const textoOriginal = boton?.textContent;
let ocupado = false;

function avisar(texto) {
    if (estado) {
        estado.hidden = !texto;
        estado.textContent = texto || '';
    }
}

function actualizarProgresoModal(texto, pct) {
    const container = document.getElementById('wordProgressContainer');
    const txt = document.getElementById('wordProgressTexto');
    const bar = document.getElementById('wordProgressBar');
    const pctTxt = document.getElementById('wordProgressPorcentaje');
    if (container) container.style.display = 'block';
    if (txt) txt.textContent = texto;
    if (bar && pct !== undefined) bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    if (pctTxt && pct !== undefined) pctTxt.textContent = `${Math.round(pct)}%`;
}

/**
 * Ejecuta la descarga del Word según las opciones elegidas por el usuario.
 * @param {Object} opciones
 * @param {string} opciones.modo - 'ambas' | 'completo' | 'pasos' | 'ninguna'
 * @param {number[]} [opciones.sesiones] - Lista de números de sesión a exportar (vacío = todas)
 * @param {string} [opciones.urlDocx] - URL de descarga (por defecto boton.href)
 * @param {string} [opciones.urlEscenas] - URL de escenas JSON
 * @param {string} [opciones.csrf] - Token CSRF
 */
async function descargar(opciones = {}) {
    if (ocupado) return;
    ocupado = true;

    const urlDocx = opciones.urlDocx || boton?.href || window.location.pathname.replace(/\/$/, '') + '/plan.docx';
    const urlEscenas = opciones.urlEscenas || boton?.dataset.escenas;
    const csrf = opciones.csrf || boton?.dataset.csrf || document.querySelector('input[name="csrfmiddlewaretoken"]')?.value || '';
    const modo3d = opciones.modo || 'ambas';
    const sesElegidas = (opciones.sesiones && opciones.sesiones.length) ? opciones.sesiones : null;

    if (boton) {
        boton.setAttribute('aria-busy', 'true');
        boton.textContent = 'Generando Word…';
    }

    const btnConfirmar = document.getElementById('btnConfirmarDescargaWord');
    if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = 'Procesando...';
    }

    let fotografo = null;
    try {
        const datos = new FormData();
        if (sesElegidas) {
            datos.append('sesiones_elegidas', sesElegidas.join(','));
        }

        if (modo3d !== 'ninguna' && urlEscenas) {
            avisar('Preparando el montaje 3D de las sesiones…');
            actualizarProgresoModal('Consultando modelos 3D de las sesiones…', 5);

            const r = await fetch(urlEscenas, { credentials: 'same-origin' });
            if (!r.ok) throw new Error(`escenas: ${r.status}`);
            const { sesiones } = await r.json();

            // Filtrar las sesiones seleccionadas si se especificaron
            const aProcesar = sesElegidas
                ? sesiones.filter((s) => sesElegidas.includes(s.numero))
                : sesiones;

            fotografo = new Fotografo(); // falla aquí si no hay soporte WebGL

            for (let i = 0; i < aProcesar.length; i++) {
                const s = aProcesar[i];
                const pctBase = 10 + (i / aProcesar.length) * 75;
                const txtSesion = `Sesión ${s.numero} (${i + 1} de ${aProcesar.length})`;
                avisar(`Tomando fotos del montaje 3D · ${txtSesion}…`);
                actualizarProgresoModal(`Tomando fotos 3D · ${txtSesion}…`, pctBase);

                await siguienteCuadro();
                const fotos = await fotografo.sesion(s, modo3d, (subTexto) => {
                    actualizarProgresoModal(subTexto, pctBase + (1 / aProcesar.length) * 35);
                });

                fotos.forEach(({ k, blob }) => {
                    datos.append(`montaje-${s.numero}-${k}`, blob, `sesion${s.numero}_${k}.jpg`);
                });
            }

            fotografo.cerrar();
            fotografo = null;
        }

        avisar('Armando el documento Word oficial con las fotos…');
        actualizarProgresoModal('Construyendo documento Word oficial (.docx)…', 90);

        const resp = await fetch(urlDocx, {
            method: 'POST',
            body: datos,
            credentials: 'same-origin',
            headers: { 'X-CSRFToken': csrf },
        });
        if (!resp.ok) throw new Error(`documento: ${resp.status}`);

        actualizarProgresoModal('¡Descarga lista!', 100);
        guardar(await resp.blob(), nombreDeArchivo(resp, 'Unidad_Didactica.docx'));
        avisar('');

        // Cerrar modal tras pequeña pausa de satisfacción
        setTimeout(() => {
            const modal = document.getElementById('modalWordOpciones');
            if (modal) modal.style.display = 'none';
            const progress = document.getElementById('wordProgressContainer');
            if (progress) progress.style.display = 'none';
        }, 900);
    } catch (e) {
        console.warn('No se pudieron agregar las fotos 3D; descargando versión alternativa.', e);
        avisar('Generando Word con la información de las sesiones seleccionadas…');
        actualizarProgresoModal('Descargando documento Word…', 100);

        // Fallback: descargar vía POST o GET directo
        const fallbackUrl = new URL(urlDocx, window.location.origin);
        if (sesElegidas) fallbackUrl.searchParams.set('sesiones_elegidas', sesElegidas.join(','));
        window.location.href = fallbackUrl.toString();
    } finally {
        fotografo?.cerrar();
        ocupado = false;
        if (boton) {
            boton.removeAttribute('aria-busy');
            boton.textContent = textoOriginal;
        }
        if (btnConfirmar) {
            btnConfirmar.disabled = false;
            btnConfirmar.textContent = 'Generar y descargar Word (.docx)';
        }
    }
}

// ------------------------------------------------------------------ Eventos y Enlace con el Modal

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modalWordOpciones');
    const btnConfirmar = document.getElementById('btnConfirmarDescargaWord');
    const btnTodas = document.getElementById('btnMarcarTodasSesiones');
    const btnNinguna = document.getElementById('btnDesmarcarSesiones');

    const btnDescargar = document.querySelector('[data-descargar-word]') || boton;

    // Botón principal de la página: abrir modal para personalizar
    if (btnDescargar && modal) {
        btnDescargar.addEventListener('click', (ev) => {
            ev.preventDefault();
            modal.style.display = 'flex';
        });
    } else if (btnDescargar) {
        btnDescargar.addEventListener('click', (ev) => {
            ev.preventDefault();
            descargar();
        });
    }

    // Botones rápidos de selección de sesiones
    if (btnTodas) {
        btnTodas.addEventListener('click', () => {
            document.querySelectorAll('.check-sesion').forEach((cb) => { cb.checked = true; });
        });
    }
    if (btnNinguna) {
        btnNinguna.addEventListener('click', () => {
            document.querySelectorAll('.check-sesion').forEach((cb) => { cb.checked = false; });
        });
    }

    // Confirmación dentro del modal
    if (btnConfirmar) {
        btnConfirmar.addEventListener('click', () => {
            const checks = [...document.querySelectorAll('.check-sesion:checked')];
            if (checks.length === 0) {
                alert('Por favor selecciona al menos una sesión para incluir en el documento Word.');
                return;
            }
            const sesiones = checks.map((cb) => Number(cb.value));
            const modo = document.querySelector('input[name="modo_3d"]:checked')?.value || 'ambas';

            descargar({
                modo,
                sesiones,
                urlDocx: btnConfirmar.dataset.urlDocx,
                urlEscenas: btnConfirmar.dataset.escenas,
                csrf: btnConfirmar.dataset.csrf,
            });
        });
    }

    // Si se llega desde la evaluación con ?descargar=1 o ?abrir_word=1 o hash #modal-word
    const url = new URL(window.location.href);
    if (url.searchParams.get('descargar') === '1' || url.searchParams.get('abrir_word') === '1' || window.location.hash === '#modal-word') {
        url.searchParams.delete('descargar');
        url.searchParams.delete('abrir_word');
        history.replaceState(null, '', url.pathname + url.search);
        if (modal) {
            modal.style.display = 'flex';
        } else {
            descargar();
        }
    }
});

