/* AULA GLOBAL 360 · Escena 3D del montaje de una sesión (sin interfaz).
 * Dibuja la escena que arma apps/planeacion/montaje.py (metros; x a lo ancho, z a lo largo, y arriba).
 * La usan el visor interactivo (montaje3d.js) y las fotos del Word (capturas3d.js), así que toda
 * mejora gráfica de aquí llega a los dos.
 *
 * Calidad visual: tonos ACES con entorno de iluminación (reflejos suaves), sombras suaves, texturas
 * procedurales (pasto, cancha, tiza, balón, pared), personas articuladas con sombra de contacto y
 * cotas como en un plano. Animaciones: entrada de cada paso (el material cae en su lugar y los
 * estudiantes llegan caminando), respiración de las personas y flechas de rotación que fluyen. */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const COLORES = {
    naranja: 0xF26A1B, amarillo: 0xF5C518, rojo: 0xE5383B, azul: 0x2F6FDE, verde: 0x2BB24C,
    morado: 0x9B5DE5, blanco: 0xF8FAFC, rosa: 0xEC4899, celeste: 0x38BDF8,
};
export const ACENTO = 0x0D9488;
const color = (nombre, defecto = 0xFFFFFF) => COLORES[nombre] ?? defecto;
const PIELES = [0xF1C7A0, 0xE2A877, 0xC68B59, 0x8D5A3B, 0xF6D2B5];
const PELOS = [0x2B1B12, 0x4A2E1C, 0x1C1C1C, 0x7A4A22, 0x3B2A20];

// ------------------------------------------------------------------ render y entorno

/** Ajustes de color y sombras comunes al visor y a las fotos del Word. */
export function configurarRenderer(renderer) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

const entornos = new WeakMap();
/** Mapa de entorno (reflejos difusos de un estudio) generado una vez por renderer. */
function entornoDe(renderer) {
    if (!renderer) return null;
    if (!entornos.has(renderer)) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        entornos.set(renderer, pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
        pmrem.dispose();
    }
    return entornos.get(renderer);
}

// ------------------------------------------------------------------ texturas procedurales (una sola vez)

const texturas = {};
function lienzoTextura(clave, ancho, alto, pintar, { repetir = false, srgb = true } = {}) {
    if (texturas[clave]) return texturas[clave];
    const c = document.createElement('canvas');
    c.width = ancho;
    c.height = alto;
    pintar(c.getContext('2d'), ancho, alto);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    texturas[clave] = t;
    return t;
}

// generador pseudoaleatorio estable (las texturas no cambian entre visor y Word)
function azar(semilla) {
    let s = semilla >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const texPasto = () => lienzoTextura('pasto', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#6E9F4E';
    ctx.fillRect(0, 0, w, h);
    const r = azar(7);
    for (let i = 0; i < 9000; i++) {
        const x = r() * w, y = r() * h, l = 3 + r() * 7;
        const tono = 70 + r() * 70;
        ctx.strokeStyle = `rgba(${tono * 0.55 | 0},${tono + 40 | 0},${tono * 0.4 | 0},${0.25 + r() * 0.35})`;
        ctx.lineWidth = 1 + r();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (r() - 0.5) * 3, y - l);
        ctx.stroke();
    }
}, { repetir: true });

const texCancha = () => lienzoTextura('cancha', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4F7D69';                 // cancha multideporte: tono medio para que la tiza resalte
    ctx.fillRect(0, 0, w, h);
    const r = azar(11);
    for (let i = 0; i < 16000; i++) {          // grano de la pintura sobre concreto
        const v = r();
        ctx.fillStyle = v > 0.5 ? `rgba(130,170,150,${0.12 + r() * 0.16})` : `rgba(55,90,75,${0.12 + r() * 0.16})`;
        ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    for (let i = 0; i < 40; i++) {             // manchas de desgaste muy suaves
        const g = ctx.createRadialGradient(r() * w, r() * h, 0, r() * w, r() * h, 40 + r() * 80);
        g.addColorStop(0, 'rgba(150,160,150,0.06)');
        g.addColorStop(1, 'rgba(150,160,150,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    }
}, { repetir: true });

const texTiza = () => lienzoTextura('tiza', 256, 32, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const r = azar(3);
    for (let i = 0; i < 2600; i++) {
        const x = r() * w, y = h / 2 + (r() - 0.5) * h * 0.9 * Math.pow(r(), 0.5);
        ctx.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.65})`;
        ctx.fillRect(x, y, 1.5, 1.5);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(0, h * 0.25, w, h * 0.5);
}, { repetir: true, srgb: false });

const texCielo = () => lienzoTextura('cielo', 4, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#9CC8EA');
    g.addColorStop(0.55, '#D7E9F4');
    g.addColorStop(1, '#EEF4F2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
});

const texSombra = () => lienzoTextura('sombra', 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
}, { srgb: false });

function texBalon(hex) {
    const css = `#${hex.toString(16).padStart(6, '0')}`;
    return lienzoTextura(`balon-${hex}`, 256, 128, (ctx, w, h) => {
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 7;
        for (let i = 0; i < 4; i++) {             // costuras como en un balón de goma escolar
            ctx.beginPath();
            for (let x = 0; x <= w; x += 4) ctx.lineTo(x, h / 2 + Math.sin((x / w) * Math.PI * 2 + i * Math.PI / 2) * h * 0.32);
            ctx.stroke();
        }
    });
}

const texPared = () => lienzoTextura('pared', 512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#EDE6DA';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7C9CB5';                 // zócalo pintado
    ctx.fillRect(0, h * 0.78, w, h * 0.22);
    const r = azar(5);
    for (let i = 0; i < 6000; i++) {
        ctx.fillStyle = `rgba(120,110,95,${r() * 0.06})`;
        ctx.fillRect(r() * w, r() * h, 2, 2);
    }
}, { repetir: true });

const texFlecha = () => lienzoTextura('flecha', 128, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#FFFFFF';
    for (const x0 of [0, w / 2]) {              // galones «>>» que se desplazan con la animación
        ctx.beginPath();
        ctx.moveTo(x0 + 6, 6);
        ctx.lineTo(x0 + 34, h / 2);
        ctx.lineTo(x0 + 6, h - 6);
        ctx.lineTo(x0 + 20, h - 6);
        ctx.lineTo(x0 + 48, h / 2);
        ctx.lineTo(x0 + 20, 6);
        ctx.closePath();
        ctx.fill();
    }
}, { repetir: true, srgb: false });

const texCinta = () => lienzoTextura('cinta', 128, 16, (ctx, w, h) => {
    for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#FFFFFF' : '#E5383B';
        ctx.fillRect((i * w) / 8, 0, w / 8, h);
    }
}, { repetir: true });

// ------------------------------------------------------------------ utilidades de dibujo

const material = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, ...extra });
const plastico = (hex, extra = {}) => material(hex, { roughness: 0.38, metalness: 0.0, ...extra });

function malla(geometria, mat, sombra = true) {
    const m = new THREE.Mesh(geometria, mat);
    m.castShadow = sombra;
    m.receiveShadow = true;
    return m;
}

function etiqueta(texto, clase = 'et3d') {
    const div = document.createElement('div');
    div.className = clase;
    div.textContent = texto;
    return new CSS2DObject(div);
}

/** Tira plana sobre el piso entre dos puntos (líneas de tiza o pintura). */
function tira(a, b, grosor, mat, y = 0.006) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const largoTira = Math.hypot(dx, dz);
    const m = malla(new THREE.PlaneGeometry(largoTira, grosor), mat, false);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.atan2(dz, dx) * -1;
    m.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
    if (mat.map) {                                   // la textura de tiza se repite a lo largo
        m.geometry.attributes.uv.array.forEach((_, i, arr) => { if (i % 2 === 0) arr[i] *= largoTira / 0.5; });
        m.geometry.attributes.uv.needsUpdate = true;
    }
    return m;
}

function sombraContacto(radio) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(radio * 2, radio * 2),
        new THREE.MeshBasicMaterial({ map: texSombra(), transparent: true, depthWrite: false, opacity: 0.85 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.008;
    m.renderOrder = 1;
    return m;
}

function diana(radio) {
    const g = new THREE.Group();
    const colores = [0xE5383B, 0xFFFFFF, 0xE5383B, 0xFFFFFF, 0xF5C518];
    colores.forEach((hex, i) => {
        const r = radio * (1 - i / colores.length);
        const disco = malla(new THREE.CircleGeometry(r, 48), material(hex, { roughness: 0.7, side: THREE.DoubleSide }), false);
        disco.position.z = i * 0.002;
        g.add(disco);
    });
    const aro = malla(new THREE.TorusGeometry(radio, radio * 0.04, 8, 48), material(0x1F2937));
    g.add(aro);
    return g;
}

// ------------------------------------------------------------------ personas articuladas

/** Persona de pie mirando a +z local. ``alto``: 1,25 m (niño) o 1,7 m (docente). */
function persona(camiseta, alto, { adulto = false, semilla = 1 } = {}) {
    const r = azar(semilla * 97 + 13);
    const piel = PIELES[Math.floor(r() * PIELES.length)];
    const pelo = PELOS[Math.floor(r() * PELOS.length)];
    const k = alto / 1.25;                           // escala respecto a un niño
    const g = new THREE.Group();
    const cuerpo = new THREE.Group();                // lo que respira (todo menos pies y sombra)
    g.add(cuerpo);

    const matCamiseta = material(camiseta, { roughness: 0.75 });
    const matPantalon = material(adulto ? 0x1F2A44 : 0x24324F, { roughness: 0.8 });
    const matPiel = material(piel, { roughness: 0.65 });
    const matZapato = material(0x111827, { roughness: 0.5 });

    for (const lado of [-1, 1]) {
        const pierna = malla(new THREE.CapsuleGeometry(0.055 * k, 0.42 * k, 4, 10), adulto ? matPantalon : matPiel);
        pierna.position.set(lado * 0.075 * k, 0.29 * k, 0);
        const short = malla(new THREE.CapsuleGeometry(0.075 * k, 0.12 * k, 4, 10), matPantalon);
        short.position.set(lado * 0.075 * k, 0.5 * k, 0);
        const zapato = malla(new RoundedBoxGeometry(0.1 * k, 0.07 * k, 0.2 * k, 2, 0.025 * k), matZapato);
        zapato.position.set(lado * 0.075 * k, 0.035 * k, 0.04 * k);
        g.add(zapato);
        cuerpo.add(pierna, short);
        const brazo = malla(new THREE.CapsuleGeometry(0.04 * k, 0.32 * k, 4, 10), matPiel);
        brazo.position.set(lado * 0.2 * k, 0.74 * k, 0.01 * k);
        brazo.rotation.z = lado * 0.12;
        const manga = malla(new THREE.CapsuleGeometry(0.052 * k, 0.08 * k, 4, 10), matCamiseta);
        manga.position.set(lado * 0.185 * k, 0.87 * k, 0);
        manga.rotation.z = lado * 0.12;
        cuerpo.add(brazo, manga);
    }
    const torso = malla(new THREE.CapsuleGeometry(0.15 * k, 0.24 * k, 6, 14), matCamiseta);
    torso.scale.set(1, 1, 0.72);
    torso.position.y = 0.76 * k;
    const cuello = malla(new THREE.CylinderGeometry(0.04 * k, 0.045 * k, 0.06 * k, 10), matPiel);
    cuello.position.y = 0.95 * k;
    const cabeza = malla(new THREE.SphereGeometry(0.11 * k, 24, 18), matPiel);
    cabeza.position.y = 1.07 * k;
    const cabello = malla(new THREE.SphereGeometry(0.117 * k, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), material(pelo, { roughness: 0.9 }));
    cabello.position.y = 1.08 * k;
    cabello.rotation.x = -0.35;                      // cubre nuca y coronilla: la cara queda al frente
    cuerpo.add(torso, cuello, cabeza, cabello);
    for (const lado of [-1, 1]) {
        const ojo = malla(new THREE.SphereGeometry(0.013 * k, 8, 6), material(0x111111, { roughness: 0.3 }), false);
        ojo.position.set(lado * 0.038 * k, 1.09 * k, 0.1 * k);
        cuerpo.add(ojo);
    }
    if (adulto) {                                    // pito y planilla: es el docente
        const pito = malla(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 10), plastico(0xF5C518));
        pito.rotation.x = Math.PI / 2;
        pito.position.set(0, 0.86 * k, 0.12 * k);
        const planilla = malla(new RoundedBoxGeometry(0.2, 0.27, 0.015, 2, 0.006), material(0x8B5E34, { roughness: 0.7 }));
        planilla.position.set(0.24 * k, 0.72 * k, 0.12 * k);
        planilla.rotation.set(-0.5, -0.3, 0.1);
        const hoja = malla(new THREE.PlaneGeometry(0.17, 0.22), material(0xFFFFFF, { roughness: 0.9 }), false);
        hoja.position.set(0, 0, 0.009);
        planilla.add(hoja);
        const gorra = malla(new THREE.SphereGeometry(0.12 * k, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), material(ACENTO));
        gorra.position.y = 1.1 * k;
        const visera = malla(new THREE.CylinderGeometry(0.1 * k, 0.1 * k, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), material(ACENTO));
        visera.position.set(0, 1.1 * k, 0.08 * k);
        cuerpo.add(pito, planilla, gorra, visera);
    }
    g.add(sombraContacto(0.35 * k));
    g.userData.cuerpo = cuerpo;
    g.userData.fase = r() * Math.PI * 2;
    return g;
}

// ------------------------------------------------------------------ elementos del montaje

const CONSTRUCTORES = {
    cono(e) {
        const g = new THREE.Group();
        const hex = color(e.color, COLORES.naranja);
        // perfil de cono deportivo: base ancha, cuerpo cónico con borde superior redondeado
        const perfil = [[0.0, 0.03], [0.11, 0.03], [0.095, 0.08], [0.05, 0.27], [0.035, 0.3], [0.0, 0.3]].map(([x, y]) => new THREE.Vector2(x, y));
        const cuerpo = malla(new THREE.LatheGeometry(perfil, 28), plastico(hex));
        const base = malla(new RoundedBoxGeometry(0.27, 0.035, 0.27, 2, 0.012), plastico(hex));
        base.position.y = 0.0175;
        const franja = malla(new THREE.CylinderGeometry(0.0737, 0.0846, 0.045, 28, 1, true), material(0xFFFFFF, { roughness: 0.3, side: THREE.DoubleSide }));
        franja.position.y = 0.155;
        g.add(cuerpo, base, franja);
        g.position.set(e.x, 0, e.z);
        return g;
    },
    poste(e) {
        const g = new THREE.Group();
        const alto = e.alto || 1;
        const palo = malla(new THREE.CylinderGeometry(0.025, 0.025, alto, 16), material(0xF8FAFC, { roughness: 0.4 }));
        palo.position.y = alto / 2;
        g.add(palo);
        for (let y = 0.25; y < alto - 0.05; y += 0.25) {       // franjas de color cada 25 cm
            const f = malla(new THREE.CylinderGeometry(0.027, 0.027, 0.1, 16), plastico(color(e.color, COLORES.naranja)));
            f.position.y = y;
            g.add(f);
        }
        const base = malla(new THREE.CylinderGeometry(0.16, 0.18, 0.05, 28), plastico(0x334155));
        base.position.y = 0.025;
        g.add(base);
        if (e.marca) {
            const marca = malla(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 16), material(COLORES.rojo, { emissive: 0x330000 }));
            marca.position.y = e.marca;
            g.add(marca);
        }
        g.position.set(e.x, 0, e.z);
        return g;
    },
    aro(e) {
        const g = new THREE.Group();
        const aro = malla(new THREE.TorusGeometry(0.3, 0.022, 16, 64), plastico(color(e.color, COLORES.amarillo), { roughness: 0.28 }));
        if (e.pared) {
            g.position.set(e.x, e.y, e.z + 0.03);
        } else {
            aro.rotation.x = -Math.PI / 2;
            g.position.set(e.x, 0.022, e.z);
        }
        g.add(aro);
        if (e.etiqueta) {
            const et = etiqueta(e.etiqueta, 'et3d et3d-num');
            et.position.y = 0.15;
            g.add(et);
        }
        return g;
    },
    cuerda(e) {
        const g = new THREE.Group();
        const puntos = e.puntos.map(([x, z]) => new THREE.Vector3(x, 0.025, z));
        const curva = puntos.length > 2 ? new THREE.CatmullRomCurve3(puntos) : new THREE.LineCurve3(puntos[0], puntos[1]);
        const hex = color(e.color, COLORES.amarillo);
        g.add(malla(new THREE.TubeGeometry(curva, 64, 0.02, 10, false), material(hex, { roughness: 0.85 })));
        for (const p of [puntos[0], puntos[puntos.length - 1]]) {   // mangos en las puntas
            const mango = malla(new THREE.CapsuleGeometry(0.03, 0.12, 4, 10), plastico(0x1F2937));
            const dir = (p === puntos[0] ? puntos[1] : puntos[puntos.length - 2]).clone().sub(p).normalize();
            mango.position.copy(p).addScaledVector(dir, -0.08);
            mango.rotation.z = Math.PI / 2;
            mango.rotation.y = -Math.atan2(dir.z, dir.x);
            g.add(mango);
        }
        return g;
    },
    linea(e) {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({
            color: color(e.color), roughness: 1, map: texTiza(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
        });
        for (let i = 0; i < e.puntos.length - 1; i++) g.add(tira(e.puntos[i], e.puntos[i + 1], (e.grosor || 0.06) * 1.3, mat));
        return g;
    },
    zona(e) {
        const g = new THREE.Group();
        const hex = color(e.color);
        const plano = malla(new THREE.PlaneGeometry(e.ancho, e.largo),
            material(hex, { transparent: true, opacity: 0.24, depthWrite: false, roughness: 1 }), false);
        plano.rotation.x = -Math.PI / 2;
        plano.position.y = 0.004;
        g.add(plano);
        // borde pintado, más intenso que el relleno
        const borde = material(hex, { transparent: true, opacity: 0.75, depthWrite: false, roughness: 1 });
        const [a, l] = [e.ancho / 2, e.largo / 2];
        const esquinas = [[-a, -l], [a, -l], [a, l], [-a, l], [-a, -l]];
        for (let i = 0; i < 4; i++) g.add(tira(esquinas[i], esquinas[i + 1], 0.05, borde, 0.005));
        if (e.etiqueta) {
            const et = etiqueta(e.etiqueta, 'et3d et3d-zona');
            et.position.y = 0.05;
            g.add(et);
        }
        g.position.set(e.x, 0, e.z);
        return g;
    },
    etiqueta(e) {
        const et = etiqueta(e.texto);
        et.position.set(e.x, e.y ?? 0.4, e.z);
        return et;
    },
    colchoneta(e) {
        const g = new THREE.Group();
        const m = malla(new RoundedBoxGeometry(e.ancho, 0.1, e.largo, 3, 0.035), material(0x2F5FD0, { roughness: 0.85 }));
        m.position.y = 0.05;
        g.add(m);
        // costuras transversales que dividen la colchoneta en paneles
        const paneles = Math.max(2, Math.round(e.largo / 0.6));
        for (let i = 1; i < paneles; i++) {
            const costura = malla(new THREE.BoxGeometry(e.ancho * 0.98, 0.004, 0.018), material(0x1E40AF, { roughness: 1 }), false);
            costura.position.set(0, 0.101, -e.largo / 2 + (e.largo * i) / paneles);
            g.add(costura);
        }
        g.position.set(e.x, 0, e.z);
        return g;
    },
    valla(e) {
        const g = new THREE.Group();
        const mat = plastico(color(e.color, COLORES.naranja), { roughness: 0.6 });
        const alto = e.alto || 0.2;
        for (const lado of [-1, 1]) {
            const pata = malla(new RoundedBoxGeometry(0.05, alto, 0.05, 2, 0.015), mat);
            pata.position.set(lado * e.ancho / 2, alto / 2, 0);
            const pie = malla(new RoundedBoxGeometry(0.06, 0.03, 0.22, 2, 0.01), mat);
            pie.position.set(lado * e.ancho / 2, 0.015, 0);
            g.add(pata, pie);
        }
        const barra = malla(new RoundedBoxGeometry(e.ancho + 0.05, 0.06, 0.06, 2, 0.02), material(0xF8FAFC, { roughness: 0.5 }));
        barra.position.y = alto;
        g.add(barra);
        g.position.set(e.x, 0, e.z);
        return g;
    },
    pared(e) {
        const g = new THREE.Group();
        const tex = texPared().clone();
        tex.needsUpdate = true;
        tex.userData.propia = true;
        tex.repeat.set(e.ancho / 4, 1);
        const m = malla(new THREE.BoxGeometry(e.ancho, e.alto, 0.2), material(0xFFFFFF, { roughness: 0.95, map: tex }));
        m.position.set(0, e.alto / 2, -0.1);
        const remate = malla(new THREE.BoxGeometry(e.ancho + 0.1, 0.06, 0.28), material(0xB8B1A5, { roughness: 0.9 }));
        remate.position.set(0, e.alto + 0.03, -0.1);
        g.add(m, remate);
        g.position.set(e.x, 0, e.z);
        return g;
    },
    franja(e) {
        const m = malla(new THREE.PlaneGeometry(e.ancho, e.y1 - e.y0), material(color(e.color), { transparent: true, opacity: 0.8, roughness: 0.9 }), false);
        m.position.set(e.x, (e.y0 + e.y1) / 2, e.z + 0.012);
        return m;
    },
    diana(e) {
        const g = new THREE.Group();
        const d = diana(e.radio || 0.3);
        if (e.pared) {
            d.position.set(e.x, e.y, e.z + 0.015);
            g.add(d);
            return g;
        }
        // trípode de madera
        const madera = material(0x9A6B3F, { roughness: 0.8 });
        for (let i = 0; i < 3; i++) {
            const ang = (i / 3) * Math.PI * 2 + Math.PI / 6;
            const pata = malla(new THREE.CylinderGeometry(0.018, 0.022, e.y * 1.05, 8), madera);
            pata.position.set(e.x + Math.cos(ang) * 0.12, e.y / 2, e.z - 0.04 + Math.sin(ang) * 0.12);
            pata.lookAt(e.x, e.y, e.z - 0.04);
            pata.rotateX(Math.PI / 2);
            g.add(pata);
        }
        d.position.set(e.x, e.y, e.z);
        g.add(d);
        return g;
    },
    balon(e) {
        const g = new THREE.Group();
        const y = e.y ?? 0.11;
        let bola;
        if (e.papel) {
            // pelota de papel periódico arrugado con dos vueltas de cinta (sustituto del balón)
            const geo = new THREE.IcosahedronGeometry(0.1, 2);
            const pos = geo.attributes.position;
            const r = azar(Math.round(Math.abs(e.x * 97 + e.z * 31)) + 5);
            for (let i = 0; i < pos.count; i++) {
                const v = new THREE.Vector3().fromBufferAttribute(pos, i);
                v.multiplyScalar(0.9 + r() * 0.18);
                pos.setXYZ(i, v.x, v.y, v.z);
            }
            geo.computeVertexNormals();
            bola = malla(geo, material(0xE6E1D3, { roughness: 0.95, flatShading: true }));
            for (const giro of [0, Math.PI / 2]) {
                const cinta = malla(new THREE.TorusGeometry(0.1, 0.012, 6, 24), material(0xC9B98F, { roughness: 0.6 }), false);
                cinta.rotation.set(Math.PI / 2, giro, 0);
                bola.add(cinta);
            }
        } else {
            bola = malla(new THREE.SphereGeometry(0.11, 32, 20), material(0xFFFFFF, { roughness: 0.42, map: texBalon(color(e.color, COLORES.rojo)) }));
        }
        bola.position.set(e.x, y, e.z);
        bola.rotation.set(0.4, e.x * 3, 0.2);
        g.add(bola);
        if (e.colgado) {
            const hilo = malla(new THREE.CylinderGeometry(0.004, 0.004, e.colgado - y, 4), material(0x334155), false);
            hilo.position.set(e.x, (e.colgado + y) / 2, e.z);
            g.add(hilo);
        } else {
            const s = sombraContacto(0.16);
            s.position.set(e.x, 0.008, e.z);
            g.add(s);
        }
        return g;
    },
    cinta(e) {
        const g = new THREE.Group();
        const [a, b] = [e.desde, e.hasta];
        for (const [x, z] of [a, b]) {
            const palo = malla(new THREE.CylinderGeometry(0.03, 0.03, e.altura + 0.15, 14), material(0xF8FAFC, { roughness: 0.4 }));
            palo.position.set(x, (e.altura + 0.15) / 2, z);
            const base = malla(new THREE.CylinderGeometry(0.14, 0.16, 0.04, 24), plastico(0x334155));
            base.position.set(x, 0.02, z);
            g.add(palo, base);
        }
        const largoCinta = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const tex = texCinta().clone();
        tex.needsUpdate = true;
        tex.userData.propia = true;
        tex.repeat.set(largoCinta / 0.6, 1);
        const banda = malla(new THREE.BoxGeometry(largoCinta, 0.05, 0.008), material(0xFFFFFF, { map: tex, roughness: 0.6 }));
        banda.position.set((a[0] + b[0]) / 2, e.altura, (a[1] + b[1]) / 2);
        banda.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
        g.add(banda);
        return g;
    },
    castillo(e) {
        const g = new THREE.Group();
        // pirámide de vasos/conos apilados (3-2-1) como la usan las escuelas
        const pisos = [[-0.13, 0, 0.13], [-0.065, 0.065], [0]];
        pisos.forEach((fila, nivel) => fila.forEach((x) => {
            const vaso = malla(new THREE.CylinderGeometry(0.045, 0.06, 0.15, 20, 1, true), plastico(nivel === 2 ? COLORES.amarillo : COLORES.naranja, { side: THREE.DoubleSide }));
            vaso.position.set(x, 0.075 + nivel * 0.15, 0);
            const tapa = malla(new THREE.CircleGeometry(0.045, 20), plastico(nivel === 2 ? COLORES.amarillo : COLORES.naranja));
            tapa.rotation.x = -Math.PI / 2;
            tapa.position.set(x, 0.15 + nivel * 0.15, 0);
            g.add(vaso, tapa);
        }));
        g.position.set(e.x, 0, e.z);
        return g;
    },
    huella(e) {
        const g = new THREE.Group();
        const mat = material(e.lado === 'izq' ? COLORES.azul : COLORES.rojo, { roughness: 1 });
        const planta = malla(new THREE.CircleGeometry(0.05, 24), mat, false);
        planta.scale.set(1, 2, 1);
        planta.rotation.x = -Math.PI / 2;
        planta.position.y = 0.006;
        g.add(planta);
        [[-0.035, 0.125, 0.017], [-0.012, 0.135, 0.015], [0.01, 0.133, 0.014], [0.03, 0.125, 0.013], [0.045, 0.11, 0.012]].forEach(([x, z, r]) => {
            const dedo = malla(new THREE.CircleGeometry(r, 12), mat, false);
            dedo.rotation.x = -Math.PI / 2;
            dedo.position.set(e.lado === 'izq' ? -x : x, 0.006, z);
            g.add(dedo);
        });
        const et = etiqueta(e.lado === 'izq' ? 'I' : 'D', 'et3d et3d-num');
        et.position.y = 0.1;
        g.add(et);
        g.position.set(e.x, 0, e.z);
        g.rotation.y = e.rot || 0;
        return g;
    },
    banco(e) {
        // banco sueco: tabla superior a 30 cm, dos caballetes y la barra inferior estrecha (se usa al darle la vuelta)
        const g = new THREE.Group();
        const largo = e.largo || 3;
        const madera = material(0xC8955A, { roughness: 0.7 });
        const oscura = material(0x8A5A2B, { roughness: 0.75 });
        const tabla = malla(new RoundedBoxGeometry(0.26, 0.045, largo, 2, 0.012), madera);
        tabla.position.y = 0.3;
        const barra = malla(new RoundedBoxGeometry(0.1, 0.04, largo - 0.1, 2, 0.01), oscura);
        barra.position.y = 0.05;
        g.add(tabla, barra);
        for (const z of [-largo / 2 + 0.2, largo / 2 - 0.2]) {
            const caballete = malla(new RoundedBoxGeometry(0.4, 0.28, 0.06, 2, 0.015), oscura);
            caballete.position.set(0, 0.15, z);
            g.add(caballete);
        }
        g.position.set(e.x, 0, e.z);
        g.rotation.y = e.rot || 0;
        return g;
    },
    porteria(e) {
        // mini-portería de tubo blanco con red; la boca mira hacia +z (de donde viene el balón)
        const g = new THREE.Group();
        const ancho = e.ancho || 1.5, alto = e.alto || 0.9, fondo = 0.6;
        const tubo = material(0xF8FAFC, { roughness: 0.35 });
        const palo = (x0, y0, z0, x1, y1, z1) => {
            const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
            const m = malla(new THREE.CylinderGeometry(0.025, 0.025, a.distanceTo(b), 12), tubo);
            m.position.copy(a).add(b).multiplyScalar(0.5);
            m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
            g.add(m);
        };
        palo(-ancho / 2, 0, 0, -ancho / 2, alto, 0);
        palo(ancho / 2, 0, 0, ancho / 2, alto, 0);
        palo(-ancho / 2, alto, 0, ancho / 2, alto, 0);
        palo(-ancho / 2, 0, -fondo, ancho / 2, 0, -fondo);
        palo(-ancho / 2, alto, 0, -ancho / 2, 0, -fondo);
        palo(ancho / 2, alto, 0, ancho / 2, 0, -fondo);
        const red = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, wireframe: true, transparent: true, opacity: 0.45 });
        const atras = new THREE.Mesh(new THREE.PlaneGeometry(ancho, Math.hypot(alto, fondo), 14, 8), red);
        atras.position.set(0, alto / 2, -fondo / 2);
        atras.rotation.x = Math.atan2(fondo, alto);
        g.add(atras);
        for (const lado of [-1, 1]) {
            const forma = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, alto), new THREE.Vector2(-fondo, 0)]);
            const costado = new THREE.Mesh(new THREE.ShapeGeometry(forma, 4), red);
            costado.rotation.y = -Math.PI / 2;
            costado.position.x = lado * ancho / 2;
            g.add(costado);
        }
        g.position.set(e.x, 0, e.z);
        g.rotation.y = e.rot || 0;
        return g;
    },
    platillo(e) {
        // cono plano de entrenamiento (marca de suelo) con agujero central
        const perfil = [[0.025, 0.045], [0.1, 0.004], [0.1, 0.0], [0.09, 0.0], [0.022, 0.04]].map(([x, y]) => new THREE.Vector2(x, y));
        const m = malla(new THREE.LatheGeometry(perfil, 28), plastico(color(e.color, COLORES.amarillo), { side: THREE.DoubleSide }));
        m.position.set(e.x, 0, e.z);
        return m;
    },
    bolo(e) {
        // bolo de plástico blanco con dos franjas rojas en el cuello
        const g = new THREE.Group();
        const perfil = [[0, 0], [0.035, 0.0], [0.05, 0.06], [0.055, 0.12], [0.035, 0.22], [0.022, 0.27], [0.03, 0.33], [0.024, 0.37], [0, 0.38]]
            .map(([x, y]) => new THREE.Vector2(x, y));
        g.add(malla(new THREE.LatheGeometry(perfil, 24), plastico(0xF8FAFC)));
        for (const y of [0.25, 0.28]) {
            const franja = malla(new THREE.CylinderGeometry(0.0235, 0.0235, 0.012, 20), plastico(COLORES.rojo));
            franja.position.y = y;
            g.add(franja);
        }
        g.position.set(e.x, 0, e.z);
        return g;
    },
    flecha(e) {
        const g = new THREE.Group();
        const hex = color(e.color, COLORES.azul);
        const [a, b] = e.puntos;
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const d = Math.hypot(dx, dz) || 1;
        const fin = [b[0] - dx / d * 0.45, b[1] - dz / d * 0.45];
        const base = material(hex, { roughness: 0.9, transparent: true, opacity: 0.9, depthWrite: false });
        g.add(tira(a, fin, 0.16, base, 0.008));
        // galones blancos que «fluyen» en el sentido de la rotación (se animan en actualizar)
        const galones = tira(a, fin, 0.12, new THREE.MeshBasicMaterial({ map: texFlecha(), transparent: true, depthWrite: false, opacity: 0.85 }), 0.009);
        galones.userData.flujo = texFlecha();
        g.add(galones);
        const forma = new THREE.Shape([new THREE.Vector2(0, 0.45), new THREE.Vector2(-0.27, 0), new THREE.Vector2(0.27, 0)]);
        const punta = malla(new THREE.ShapeGeometry(forma), base, false);
        punta.rotation.x = -Math.PI / 2;
        const contenedor = new THREE.Group();
        contenedor.add(punta);
        contenedor.position.set(fin[0], 0.009, fin[1]);
        contenedor.rotation.y = Math.atan2(dx, dz);
        punta.rotation.z = Math.PI;
        g.add(contenedor);
        return g;
    },
};

// ------------------------------------------------------------------ cotas como en un plano

function cota(c, matCota) {
    const a = new THREE.Vector3(c.desde[0], c.desde[1] + 0.03, c.desde[2]);
    const b = new THREE.Vector3(c.hasta[0], c.hasta[1] + 0.03, c.hasta[2]);
    const g = new THREE.Group();
    const largo = a.distanceTo(b);
    if (largo < 1e-3) return g;
    const dir = b.clone().sub(a).normalize();
    const flecha = Math.min(0.14, largo * 0.25);
    // barra entre las puntas de flecha
    const barra = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, Math.max(0.01, largo - flecha * 2), 8), matCota);
    barra.position.copy(a.clone().add(b).multiplyScalar(0.5));
    barra.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.add(barra);
    for (const [p, d] of [[a, dir], [b, dir.clone().negate()]]) {
        const cabeza = new THREE.Mesh(new THREE.ConeGeometry(0.045, flecha, 12), matCota);
        cabeza.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d);
        cabeza.position.copy(p).addScaledVector(d, flecha / 2);
        g.add(cabeza);
        // marca perpendicular en cada extremo (línea de referencia del plano)
        const vertical = Math.abs(dir.y) > 0.7;
        const perp = vertical ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-dir.z, 0, dir.x);
        const marca = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), matCota);
        marca.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), perp);
        marca.position.copy(p);
        g.add(marca);
    }
    const et = etiqueta(c.texto, 'cota3d');
    et.position.copy(a.clone().add(b).multiplyScalar(0.5));
    g.add(et);
    return g;
}

// ------------------------------------------------------------------ animación

const facilSalida = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);   // «back out»: rebota un poco al llegar

// ------------------------------------------------------------------ escena completa

/**
 * Arma la escena de una sesión.
 * ``opciones.renderer``: si se pasa, la escena usa su mapa de entorno (reflejos suaves).
 * Devuelve la escena, sus capas y funciones para encuadrar la cámara, mostrar un paso,
 * resaltarlo, animar (``actualizar``) y liberar la memoria.
 */
export function crearEscena(datos, opciones = {}) {
    const escena = new THREE.Scene();
    escena.background = texCielo();
    escena.environment = entornoDe(opciones.renderer);
    escena.environmentIntensity = 0.3;
    escena.fog = new THREE.Fog(0xE4EEF2, 70, 170);

    escena.add(new THREE.HemisphereLight(0xE3F1FF, 0x5F7F4A, 0.75));
    const sol = new THREE.DirectionalLight(0xFFF3E0, 2.6);
    const { ancho, largo } = datos.area;
    const mayor = Math.max(ancho, largo);
    sol.position.set(mayor * 0.55, mayor * 1.3, mayor * 0.75);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.bias = -0.0004;
    sol.shadow.normalBias = 0.02;
    sol.shadow.radius = 4;
    Object.assign(sol.shadow.camera, { left: -mayor * 0.85, right: mayor * 0.85, top: mayor * 0.85, bottom: -mayor * 0.85, far: mayor * 4 });
    sol.shadow.camera.updateProjectionMatrix();
    escena.add(sol);

    const tPasto = texPasto().clone();
    tPasto.needsUpdate = true;
    tPasto.userData.propia = true;
    tPasto.repeat.set(60, 60);
    const pasto = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xFFFFFF, map: tPasto, roughness: 1 }));
    pasto.rotation.x = -Math.PI / 2;
    pasto.position.y = -0.012;
    pasto.receiveShadow = true;
    escena.add(pasto);

    // cancha: placa de concreto con borde, un poco más grande que el área
    const tCancha = texCancha().clone();
    tCancha.needsUpdate = true;
    tCancha.userData.propia = true;
    tCancha.repeat.set((ancho + 2) / 4, (largo + 2) / 4);
    const piso = new THREE.Mesh(new RoundedBoxGeometry(ancho + 2, 0.04, largo + 2, 2, 0.015),
        new THREE.MeshStandardMaterial({ color: 0xFFFFFF, map: tCancha, roughness: 0.92 }));
    piso.position.y = -0.02;
    piso.receiveShadow = true;
    escena.add(piso);

    const rejilla = new THREE.GridHelper(Math.ceil(mayor + 2), Math.ceil(mayor + 2), 0x64748B, 0x94A3B8);
    rejilla.position.y = 0.003;
    rejilla.material.transparent = true;
    rejilla.material.opacity = 0.35;
    rejilla.visible = false;
    escena.add(rejilla);

    const capaCotas = new THREE.Group();
    escena.add(capaCotas);
    const matCota = new THREE.MeshBasicMaterial({ color: 0x1E293B });

    const resaltables = [];
    const flujos = [];
    function registrar(objeto, paso) {
        objeto.traverse((o) => {
            if (o.material && o.material.emissive) resaltables.push({ o, paso, base: o.material.emissive.getHex() });
            if (o.userData.flujo) flujos.push(o.userData.flujo);
        });
    }

    for (const e of datos.elementos) {
        const construir = CONSTRUCTORES[e.tipo];
        if (!construir) continue;
        const obj = construir(e);
        obj.userData.paso = e.paso;
        obj.userData.tipo = e.tipo;
        escena.add(obj);
        registrar(obj, e.paso);
    }
    for (const c of datos.cotas) {
        const obj = cota(c, matCota);
        obj.userData.paso = c.paso;
        capaCotas.add(obj);
    }

    const capaPersonas = new THREE.Group();
    escena.add(capaPersonas);
    const personas = [];
    datos.estudiantes.forEach((s, i) => {
        const p = persona(color(s.color, COLORES.azul), 1.25, { semilla: i + 1 });
        p.position.set(s.x, 0, s.z);
        p.rotation.y = s.rot;
        p.userData.paso = s.paso;
        p.userData.tipo = 'estudiante';
        capaPersonas.add(p);
        personas.push(p);
        registrar(p, s.paso);
    });

    const doc = datos.docente;
    const docente = persona(ACENTO, 1.7, { adulto: true, semilla: 999 });
    docente.position.set(doc.x, 0, doc.z);
    const mira = new THREE.Vector3(doc.mira[0], 0, doc.mira[1]);
    docente.lookAt(mira.x, 0, mira.z);
    const etDocente = etiqueta('Tú (docente)', 'et3d et3d-docente');
    etDocente.position.y = 2.1;
    docente.add(etDocente);
    // campo de visión: abanico de 120° hacia donde mira, con borde marcado
    const radioVision = mayor * 0.6;
    const abanico = new THREE.Group();
    const relleno = new THREE.Mesh(new THREE.CircleGeometry(radioVision, 64, -Math.PI / 2 - Math.PI / 3, (2 * Math.PI) / 3),
        new THREE.MeshBasicMaterial({ color: ACENTO, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide }));
    const arco = new THREE.Mesh(new THREE.RingGeometry(radioVision - 0.06, radioVision, 64, 1, -Math.PI / 2 - Math.PI / 3, (2 * Math.PI) / 3),
        new THREE.MeshBasicMaterial({ color: ACENTO, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    abanico.add(relleno, arco);
    abanico.rotation.x = -Math.PI / 2;
    abanico.position.y = 0.013;
    docente.add(abanico);
    docente.userData.paso = doc.paso;
    docente.userData.tipo = 'estudiante';
    capaPersonas.add(docente);
    personas.push(docente);
    registrar(docente, doc.paso);

    // encuadre: el área más todo lo que se dibujó fuera de ella (hileras, docente, cotas)
    const caja = new THREE.Box3(new THREE.Vector3(-ancho / 2, 0, -largo / 2), new THREE.Vector3(ancho / 2, 0, largo / 2));
    docente.remove(abanico);   // el campo de visión no cuenta para el encuadre
    for (const o of [...escena.children, ...capaPersonas.children, ...capaCotas.children]) {
        if (o.userData.paso !== undefined) caja.expandByObject(o);
    }
    docente.add(abanico);
    const centro = caja.getCenter(new THREE.Vector3()).setY(0);
    const tamano = caja.getSize(new THREE.Vector3());

    // distancia para que una medida (m) quepa en pantalla, en vertical y en horizontal
    function distanciaPara(camara, alto, anchoVisto) {
        const tan = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
        return Math.max(alto / 2, anchoVisto / 2 / camara.aspect) / tan;
    }

    // esquinas del contenido a ras de piso y a 1,7 m (cabezas): lo que debe quedar en la foto
    const esquinas = [];
    for (const x of [caja.min.x, caja.max.x]) for (const z of [caja.min.z, caja.max.z]) for (const y of [0, 1.7]) esquinas.push(new THREE.Vector3(x, y, z));

    /** Encuadre exacto en perspectiva: busca la distancia y el centro para que todo quepa con margen. */
    function encuadrar(camara, direccion, margen = 0.94) {
        const prueba = camara.clone();
        const dir = direccion.clone().normalize();
        let objetivo = centro.clone();
        const extremos = (d) => {
            prueba.position.copy(objetivo).addScaledVector(dir, d);
            prueba.lookAt(objetivo);
            prueba.updateMatrixWorld();
            prueba.updateProjectionMatrix();
            let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
            for (const p of esquinas) {
                const v = p.clone().project(prueba);
                x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
            }
            return { x0, x1, y0, y1 };
        };
        let d = 5;
        for (let paso = 0; paso < 2; paso++) {            // 1) distancia; 2) recentrar y volver a ajustar
            let [bajo, alto] = [1, 400];
            for (let i = 0; i < 28; i++) {
                d = (bajo + alto) / 2;
                const e = extremos(d);
                if (Math.max(-e.x0, e.x1, -e.y0, e.y1) > margen) bajo = d; else alto = d;
            }
            d = alto;
            const e = extremos(d);
            // desplaza el objetivo para centrar lo proyectado (sobre los ejes de la cámara)
            const cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2;
            const derecha = new THREE.Vector3().setFromMatrixColumn(prueba.matrixWorld, 0);
            const arriba = new THREE.Vector3().setFromMatrixColumn(prueba.matrixWorld, 1);
            const alturaVista = 2 * d * Math.tan(THREE.MathUtils.degToRad(prueba.fov / 2));
            objetivo.addScaledVector(derecha, cx * alturaVista * prueba.aspect / 2).addScaledVector(arriba, cy * alturaVista / 2);
            objetivo.y = Math.max(0, objetivo.y);
        }
        return { pos: objetivo.clone().addScaledVector(dir, d), obj: objetivo };
    }

    const VISTAS = {
        '3d': (camara) => encuadrar(camara, new THREE.Vector3(0.42, 0.78, 1)),
        planta: (camara) => ({ pos: centro.clone().setY(distanciaPara(camara, tamano.z + 4, tamano.x + 3)).setZ(centro.z + 0.01), obj: centro.clone() }),
        docente: () => {
            // a la altura de los ojos del docente, justo delante de su cara (su cuerpo no tapa la vista)
            const frente = mira.clone().sub(new THREE.Vector3(doc.x, 0, doc.z)).setY(0).normalize();
            const ojos = new THREE.Vector3(doc.x, 1.62, doc.z).addScaledVector(frente, 0.35);
            return { pos: ojos, obj: new THREE.Vector3(mira.x, 0.2, mira.z) };
        },
    };

    /** Posición y objetivo de cámara para una vista ('3d', 'planta' o 'docente'). */
    const vista = (nombre, camara) => VISTAS[nombre](camara);

    // entradas en curso: objeto → {t0, retraso, destino}
    const entradas = new Map();
    function iniciarEntrada(o, retraso, ahora) {
        const destino = o.position.clone();
        entradas.set(o, { t0: ahora + retraso, destino, persona: o.userData.tipo === 'estudiante' });
        if (o.userData.tipo === 'estudiante') o.position.z = destino.z + 2.2;      // llega caminando
        else o.position.y = destino.y + 0.9;                                        // cae en su lugar
        o.scale.setScalar(0.001);
    }

    /** Deja armado hasta el paso indicado (null = montaje completo) y quita el resaltado.
     * Con ``animar`` (en el visor), lo nuevo de ese paso entra con animación. */
    function mostrarPaso(paso, { animar = false, ahora = 0 } = {}) {
        const visible = (p) => paso === null || p <= paso;
        for (const [o, en] of entradas) { o.position.copy(en.destino); o.scale.setScalar(1); }
        entradas.clear();
        let n = 0;
        for (const grupo of [escena.children, capaCotas.children, capaPersonas.children]) {
            for (const o of grupo) {
                if (o.userData.paso === undefined) continue;
                o.visible = visible(o.userData.paso);
                if (animar && paso !== null && o.userData.paso === paso && o.visible) iniciarEntrada(o, Math.min(n++ * 45, 900), ahora);
            }
        }
        for (const { o, base } of resaltables) o.material.emissive.setHex(base);
    }

    /** Ilumina los objetos que se agregan en ese paso. */
    function resaltar(paso, brillo) {
        for (const { o, paso: p } of resaltables) if (p === paso) o.material.emissive.setHex(ACENTO).multiplyScalar(brillo);
    }

    /** Animación continua (visor): entradas, respiración de las personas y flechas que fluyen. */
    function actualizar(ahora, { movimiento = true } = {}) {
        for (const [o, en] of entradas) {
            const t = Math.min(1, Math.max(0, (ahora - en.t0) / (en.persona ? 650 : 480)));
            if (t <= 0) continue;
            const k = facilSalida(t);
            o.scale.setScalar(Math.max(0.001, en.persona ? Math.min(1, t * 3) : k));
            if (en.persona) {
                o.position.z = en.destino.z + 2.2 * (1 - (1 - Math.pow(1 - t, 3)));
                o.position.y = Math.abs(Math.sin(t * Math.PI * 4)) * 0.05 * (1 - t);
            } else {
                o.position.y = en.destino.y + 0.9 * (1 - Math.min(1, t * 1.25));
            }
            if (t >= 1) { o.position.copy(en.destino); o.scale.setScalar(1); entradas.delete(o); }
        }
        if (!movimiento) return;
        const s = ahora / 1000;
        for (const p of personas) {
            const c = p.userData.cuerpo;
            c.scale.y = 1 + Math.sin(s * 2.2 + p.userData.fase) * 0.012;
            c.rotation.y = Math.sin(s * 0.6 + p.userData.fase) * 0.06;
        }
        for (const tex of flujos) tex.offset.x = -(s * 0.8) % 1;
    }

    /** Libera la memoria de la GPU (geometrías, materiales y texturas propias; las compartidas se conservan). */
    function liberar() {
        escena.traverse((o) => {
            o.geometry?.dispose();
            if (o.material) {
                [].concat(o.material).forEach((m) => {
                    if (m.map?.userData.propia) m.map.dispose();
                    m.dispose();
                });
            }
        });
    }

    return { escena, capaCotas, capaPersonas, rejilla, vista, mostrarPaso, resaltar, actualizar, liberar };
}
