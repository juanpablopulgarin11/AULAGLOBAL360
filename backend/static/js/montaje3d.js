/* AULA GLOBAL 360 · Visor 3D del montaje de una sesión.
 * Dibuja la escena que arma apps/planeacion/montaje.py (metros; x a lo ancho, z a lo largo, y arriba)
 * y permite recorrer los pasos de montaje uno a uno. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { configurarRenderer, crearEscena } from './montaje3d-escena.js';

const datos = JSON.parse(document.getElementById('escena-datos').textContent);
const visor = document.getElementById('visor');
const lienzo = document.getElementById('montaje-3d');
const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ escena base

let renderer;
try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
    visor.querySelector('.visor-sin-3d').hidden = false;
    throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
configurarRenderer(renderer);
lienzo.appendChild(renderer.domElement);

const etiquetas = new CSS2DRenderer();
etiquetas.domElement.className = 'visor-etiquetas';
lienzo.appendChild(etiquetas.domElement);

const montaje = crearEscena(datos, { renderer });
const { escena, capaCotas, capaPersonas, rejilla } = montaje;

const camara = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
const controles = new OrbitControls(camara, renderer.domElement);
controles.enableDamping = true;
controles.maxPolarAngle = Math.PI / 2 - 0.03;
controles.minDistance = 1.5;
controles.maxDistance = 120;

// ------------------------------------------------------------------ cámaras

let transicion = null;
function irA(nombre, inmediato = false) {
    const { pos, obj } = montaje.vista(nombre, camara);
    document.querySelectorAll('[data-vista]').forEach((b) => b.classList.toggle('activo', b.dataset.vista === nombre));
    if (inmediato || reducirMovimiento) {
        camara.position.copy(pos);
        controles.target.copy(obj);
        controles.update();
        return;
    }
    transicion = { desdePos: camara.position.clone(), desdeObj: controles.target.clone(), pos, obj, t0: performance.now() };
}

document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => irA(b.dataset.vista)));

// ------------------------------------------------------------------ capas

document.querySelectorAll('[data-capa]').forEach((input) => {
    input.addEventListener('change', () => {
        const capa = { cotas: capaCotas, personas: capaPersonas, rejilla }[input.dataset.capa];
        capa.visible = input.checked;
    });
});

document.querySelector('[data-pantalla-completa]').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else visor.requestFullscreen?.();
});

// ------------------------------------------------------------------ recorrido por pasos

const botonesPaso = [...document.querySelectorAll('[data-paso]')];
const estadoPaso = document.querySelector('[data-paso-estado]');
const verTodo = document.querySelector('[data-paso-todo]');
let pasoActual = null;   // null = montaje completo

function mostrarPaso(paso) {
    pasoActual = paso;
    montaje.mostrarPaso(paso, { animar: !reducirMovimiento, ahora: performance.now() });
    botonesPaso.forEach((b, i) => {
        b.classList.toggle('activo', i === paso);
        b.classList.toggle('hecho', paso !== null && i < paso);
    });
    estadoPaso.textContent = paso === null ? 'Montaje completo' : `Paso ${paso + 1} de ${datos.pasos.length}`;
    verTodo.hidden = paso === null;
}

botonesPaso.forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.paso);
    mostrarPaso(pasoActual === i ? null : i);
}));
document.querySelectorAll('[data-paso-mover]').forEach((b) => b.addEventListener('click', () => {
    const n = datos.pasos.length;
    const delta = Number(b.dataset.pasoMover);
    const base = pasoActual === null ? (delta > 0 ? -1 : n) : pasoActual;
    const siguiente = base + delta;
    mostrarPaso(siguiente < 0 || siguiente >= n ? null : siguiente);
}));
verTodo.addEventListener('click', () => { detenerReproduccion(); mostrarPaso(null); });

// ------------------------------------------------------------------ reproducir el montaje y girar la cámara

const botonReproducir = document.querySelector('[data-reproducir]');
const botonGirar = document.querySelector('[data-girar]');
let reproduccion = null;
const PAUSA_PASO_MS = 2600;

function detenerReproduccion() {
    clearTimeout(reproduccion);
    reproduccion = null;
    botonReproducir?.classList.remove('activo');
    if (botonReproducir) botonReproducir.textContent = '▶ Reproducir montaje';
}

function reproducirDesde(i) {
    if (i >= datos.pasos.length) {          // al terminar queda el montaje completo
        mostrarPaso(null);
        detenerReproduccion();
        return;
    }
    mostrarPaso(i);
    reproduccion = setTimeout(() => reproducirDesde(i + 1), PAUSA_PASO_MS);
}

botonReproducir?.addEventListener('click', () => {
    if (reproduccion) { detenerReproduccion(); return; }
    botonReproducir.classList.add('activo');
    botonReproducir.textContent = '■ Detener';
    reproducirDesde(0);
});
botonGirar?.addEventListener('click', () => {
    controles.autoRotate = !controles.autoRotate;
    controles.autoRotateSpeed = 0.8;
    botonGirar.classList.toggle('activo', controles.autoRotate);
});
botonesPaso.forEach((b) => b.addEventListener('click', detenerReproduccion, { capture: true }));
document.querySelectorAll('[data-paso-mover]').forEach((b) => b.addEventListener('click', detenerReproduccion, { capture: true }));

// ------------------------------------------------------------------ tamaño y animación

function ajustar() {
    const { clientWidth: w, clientHeight: h } = lienzo;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    etiquetas.setSize(w, h);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
}
new ResizeObserver(ajustar).observe(lienzo);
ajustar();
irA(location.hash === '#planta' ? 'planta' : '3d', true);

const suavizar = (t) => 1 - Math.pow(1 - t, 3);
renderer.setAnimationLoop((ahora) => {
    if (transicion) {
        const t = Math.min(1, (ahora - transicion.t0) / 700);
        const k = suavizar(t);
        camara.position.lerpVectors(transicion.desdePos, transicion.pos, k);
        controles.target.lerpVectors(transicion.desdeObj, transicion.obj, k);
        if (t >= 1) transicion = null;
    }
    montaje.actualizar(ahora, { movimiento: !reducirMovimiento });
    if (pasoActual !== null) {
        montaje.resaltar(pasoActual, reducirMovimiento ? 0.3 : 0.18 + 0.14 * Math.sin(ahora / 260));
    }
    controles.update();
    renderer.render(escena, camara);
    etiquetas.render(escena, camara);
});
