/* AULA GLOBAL 360 · Escena 3D del montaje de una sesión (sin interfaz).
 * Dibuja la escena que arma apps/planeacion/montaje.py (metros; x a lo ancho, z a lo largo, y arriba).
 * La usan el visor interactivo (montaje3d.js) y las fotos del Word (capturas3d.js). */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export const COLORES = {
    naranja: 0xF97316, amarillo: 0xFACC15, rojo: 0xEF4444, azul: 0x3B82F6, verde: 0x22C55E,
    morado: 0xA855F7, blanco: 0xFFFFFF, rosa: 0xEC4899, celeste: 0x38BDF8,
};
export const ACENTO = 0x0D9488;
const color = (nombre, defecto = 0xFFFFFF) => COLORES[nombre] ?? defecto;

// ------------------------------------------------------------------ utilidades de dibujo

const material = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, ...extra });

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

/** Tira plana sobre el piso entre dos puntos (líneas de tiza, flechas). */
function tira(a, b, grosor, mat, y = 0.006) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const largoTira = Math.hypot(dx, dz);
    const m = malla(new THREE.BoxGeometry(largoTira, 0.004, grosor), mat, false);
    m.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
    m.rotation.y = -Math.atan2(dz, dx);
    return m;
}

function diana(radio) {
    const g = new THREE.Group();
    const anillos = 4;
    for (let i = 0; i < anillos; i++) {
        const r = radio * (1 - i / anillos);
        const disco = malla(new THREE.CircleGeometry(r, 40), material(i % 2 ? 0xFFFFFF : 0xEF4444, { side: THREE.DoubleSide }), false);
        disco.position.z = i * 0.002;
        g.add(disco);
    }
    return g;
}

function persona(hex, alto, conFrente = true) {
    const g = new THREE.Group();
    const cuerpo = malla(new THREE.CapsuleGeometry(alto * 0.12, alto * 0.42, 4, 12), material(hex));
    cuerpo.position.y = alto * 0.4;
    const cabeza = malla(new THREE.SphereGeometry(alto * 0.1, 16, 12), material(0xF1C7A0));
    cabeza.position.y = alto * 0.86;
    g.add(cuerpo, cabeza);
    if (conFrente) {   // nariz: indica hacia dónde mira
        const nariz = malla(new THREE.SphereGeometry(alto * 0.025, 8, 6), material(0xE0A882), false);
        nariz.position.set(0, alto * 0.86, alto * 0.1);
        g.add(nariz);
    }
    return g;
}

// ------------------------------------------------------------------ elementos

const CONSTRUCTORES = {
    cono(e) {
        const g = new THREE.Group();
        const cono = malla(new THREE.ConeGeometry(0.12, 0.3, 20), material(color(e.color, COLORES.naranja)));
        cono.position.y = 0.17;
        const base = malla(new THREE.BoxGeometry(0.26, 0.02, 0.26), material(color(e.color, COLORES.naranja)));
        base.position.y = 0.01;
        g.add(cono, base);
        g.position.set(e.x, 0, e.z);
        return g;
    },
    poste(e) {
        const g = new THREE.Group();
        const alto = e.alto || 1;
        const palo = malla(new THREE.CylinderGeometry(0.03, 0.03, alto, 12), material(0xF8FAFC));
        palo.position.y = alto / 2;
        const base = malla(new THREE.ConeGeometry(0.14, 0.18, 16), material(color(e.color, COLORES.naranja)));
        base.position.y = 0.09;
        g.add(palo, base);
        if (e.marca) {
            const marca = malla(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 12), material(COLORES.rojo));
            marca.position.y = e.marca;
            g.add(marca);
        }
        g.position.set(e.x, 0, e.z);
        return g;
    },
    aro(e) {
        const g = new THREE.Group();
        const aro = malla(new THREE.TorusGeometry(0.3, 0.02, 10, 40), material(color(e.color, COLORES.amarillo)));
        if (e.pared) {
            g.position.set(e.x, e.y, e.z + 0.03);
        } else {
            aro.rotation.x = -Math.PI / 2;
            g.position.set(e.x, 0.02, e.z);
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
        const puntos = e.puntos.map(([x, z]) => new THREE.Vector3(x, 0.025, z));
        const curva = puntos.length > 2 ? new THREE.CatmullRomCurve3(puntos) : new THREE.LineCurve3(puntos[0], puntos[1]);
        return malla(new THREE.TubeGeometry(curva, 48, 0.018, 8, false), material(color(e.color, COLORES.amarillo)));
    },
    linea(e) {
        const g = new THREE.Group();
        const mat = material(color(e.color), { roughness: 1 });
        for (let i = 0; i < e.puntos.length - 1; i++) g.add(tira(e.puntos[i], e.puntos[i + 1], e.grosor || 0.06, mat));
        return g;
    },
    zona(e) {
        const g = new THREE.Group();
        const plano = malla(new THREE.PlaneGeometry(e.ancho, e.largo),
            material(color(e.color), { transparent: true, opacity: 0.3, depthWrite: false }), false);
        plano.rotation.x = -Math.PI / 2;
        plano.position.y = 0.004;
        g.add(plano);
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
        const m = malla(new THREE.BoxGeometry(e.ancho, 0.08, e.largo), material(0x2563EB, { roughness: 0.85 }));
        m.position.set(e.x, 0.04, e.z);
        return m;
    },
    valla(e) {
        const g = new THREE.Group();
        const mat = material(color(e.color, COLORES.naranja));
        const alto = e.alto || 0.2;
        for (const lado of [-1, 1]) {
            const pata = malla(new THREE.BoxGeometry(0.04, alto, 0.12), mat);
            pata.position.set(lado * e.ancho / 2, alto / 2, 0);
            g.add(pata);
        }
        const barra = malla(new THREE.BoxGeometry(e.ancho, 0.04, 0.04), mat);
        barra.position.y = alto;
        g.add(barra);
        g.position.set(e.x, 0, e.z);
        return g;
    },
    pared(e) {
        const m = malla(new THREE.BoxGeometry(e.ancho, e.alto, 0.2), material(0xE7E2DA, { roughness: 0.95 }));
        m.position.set(e.x, e.alto / 2, e.z - 0.1);
        return m;
    },
    franja(e) {
        const m = malla(new THREE.PlaneGeometry(e.ancho, e.y1 - e.y0), material(color(e.color), { transparent: true, opacity: 0.75 }), false);
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
        const palo = malla(new THREE.CylinderGeometry(0.03, 0.03, e.y, 10), material(0x64748B));
        palo.position.set(e.x, e.y / 2, e.z - 0.03);
        d.position.set(e.x, e.y, e.z);
        g.add(palo, d);
        return g;
    },
    balon(e) {
        const g = new THREE.Group();
        const y = e.y ?? 0.11;
        const bola = malla(new THREE.SphereGeometry(0.11, 20, 14), material(color(e.color, COLORES.rojo), { roughness: 0.4 }));
        bola.position.set(e.x, y, e.z);
        g.add(bola);
        if (e.colgado) {
            const hilo = malla(new THREE.CylinderGeometry(0.005, 0.005, e.colgado - y, 4), material(0x334155), false);
            hilo.position.set(e.x, (e.colgado + y) / 2, e.z);
            g.add(hilo);
        }
        return g;
    },
    cinta(e) {
        const g = new THREE.Group();
        const [a, b] = [e.desde, e.hasta];
        for (const [x, z] of [a, b]) {
            const palo = malla(new THREE.CylinderGeometry(0.035, 0.035, e.altura + 0.15, 10), material(0xF8FAFC));
            palo.position.set(x, (e.altura + 0.15) / 2, z);
            g.add(palo);
        }
        const largoCinta = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const banda = malla(new THREE.BoxGeometry(largoCinta, 0.05, 0.01), material(COLORES.rojo));
        banda.position.set((a[0] + b[0]) / 2, e.altura, (a[1] + b[1]) / 2);
        banda.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
        g.add(banda);
        return g;
    },
    castillo(e) {
        const g = new THREE.Group();
        const pisos = [[-0.2, 0, 0.2], [-0.1, 0.1], [0]];
        pisos.forEach((fila, nivel) => fila.forEach((x) => {
            const c = malla(new THREE.ConeGeometry(0.09, 0.22, 16), material(nivel === 2 ? COLORES.amarillo : COLORES.naranja));
            c.position.set(x, 0.11 + nivel * 0.2, 0);
            g.add(c);
        }));
        g.position.set(e.x, 0, e.z);
        return g;
    },
    huella(e) {
        const g = new THREE.Group();
        const mat = material(e.lado === 'izq' ? COLORES.azul : COLORES.rojo, { roughness: 1 });
        const planta = malla(new THREE.CircleGeometry(0.06, 20), mat, false);
        planta.scale.set(1, 2, 1);
        planta.rotation.x = -Math.PI / 2;
        planta.position.y = 0.006;
        g.add(planta);
        const et = etiqueta(e.lado === 'izq' ? 'I' : 'D', 'et3d et3d-num');
        et.position.y = 0.1;
        g.add(et);
        g.position.set(e.x, 0, e.z);
        g.rotation.y = e.rot || 0;
        return g;
    },
    flecha(e) {
        const g = new THREE.Group();
        const mat = material(color(e.color, COLORES.azul), { roughness: 1 });
        const [a, b] = e.puntos;
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const d = Math.hypot(dx, dz) || 1;
        const fin = [b[0] - dx / d * 0.45, b[1] - dz / d * 0.45];
        g.add(tira(a, fin, 0.1, mat, 0.008));
        const forma = new THREE.Shape([new THREE.Vector2(0, 0.45), new THREE.Vector2(-0.25, 0), new THREE.Vector2(0.25, 0)]);
        const punta = malla(new THREE.ShapeGeometry(forma), mat, false);
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

// ------------------------------------------------------------------ cotas

const matCota = new THREE.LineBasicMaterial({ color: 0x0F172A });

function cota(c) {
    const a = new THREE.Vector3(c.desde[0], c.desde[1] + 0.03, c.desde[2]);
    const b = new THREE.Vector3(c.hasta[0], c.hasta[1] + 0.03, c.hasta[2]);
    const g = new THREE.Group();
    const vertical = Math.abs(b.y - a.y) > Math.abs(b.x - a.x) + Math.abs(b.z - a.z);
    const dir = b.clone().sub(a).normalize();
    const perp = vertical ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-dir.z, 0, dir.x);
    const t = perp.multiplyScalar(0.12);
    const puntos = [a, b, a.clone().add(t), a.clone().sub(t), b.clone().add(t), b.clone().sub(t)];
    const geo = new THREE.BufferGeometry().setFromPoints([puntos[0], puntos[1], puntos[2], puntos[3], puntos[4], puntos[5]]);
    g.add(new THREE.LineSegments(geo, matCota));
    const et = etiqueta(c.texto, 'cota3d');
    et.position.copy(a.clone().add(b).multiplyScalar(0.5));
    g.add(et);
    return g;
}

// ------------------------------------------------------------------ escena completa

/**
 * Arma la escena de una sesión.
 * Devuelve la escena, sus capas y funciones para encuadrar la cámara, mostrar un paso y resaltarlo.
 */
export function crearEscena(datos) {
    const escena = new THREE.Scene();
    escena.background = new THREE.Color(0xE6EEF2);
    escena.fog = new THREE.Fog(0xE6EEF2, 60, 140);

    escena.add(new THREE.HemisphereLight(0xFFFFFF, 0x8FA89A, 1.6));
    const sol = new THREE.DirectionalLight(0xFFFFFF, 1.8);
    const { ancho, largo } = datos.area;
    const mayor = Math.max(ancho, largo);
    sol.position.set(mayor * 0.6, mayor * 1.2, mayor * 0.8);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -mayor, right: mayor, top: mayor, bottom: -mayor, far: mayor * 4 });
    sol.shadow.camera.updateProjectionMatrix();
    escena.add(sol);

    const pasto = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xA7C796, roughness: 1 }));
    pasto.rotation.x = -Math.PI / 2;
    pasto.position.y = -0.01;
    pasto.receiveShadow = true;
    escena.add(pasto);

    const piso = new THREE.Mesh(new THREE.PlaneGeometry(ancho + 2, largo + 2), new THREE.MeshStandardMaterial({ color: 0xD5DCD6, roughness: 0.95 }));
    piso.rotation.x = -Math.PI / 2;
    piso.receiveShadow = true;
    escena.add(piso);

    const rejilla = new THREE.GridHelper(Math.ceil(mayor + 2), Math.ceil(mayor + 2), 0x94A3B8, 0xB8C2CC);
    rejilla.position.y = 0.003;
    rejilla.material.transparent = true;
    rejilla.material.opacity = 0.45;
    rejilla.visible = false;
    escena.add(rejilla);

    const capaCotas = new THREE.Group();
    escena.add(capaCotas);

    const resaltables = [];
    function registrar(objeto, paso) {
        objeto.traverse((o) => {
            if (o.material && o.material.emissive) resaltables.push({ o, paso });
        });
    }

    for (const e of datos.elementos) {
        const construir = CONSTRUCTORES[e.tipo];
        if (!construir) continue;
        const obj = construir(e);
        obj.userData.paso = e.paso;
        escena.add(obj);
        registrar(obj, e.paso);
    }
    for (const c of datos.cotas) {
        const obj = cota(c);
        obj.userData.paso = c.paso;
        capaCotas.add(obj);
    }

    const capaPersonas = new THREE.Group();
    escena.add(capaPersonas);
    for (const s of datos.estudiantes) {
        const p = persona(color(s.color, COLORES.azul), 1.25);
        p.position.set(s.x, 0, s.z);
        p.rotation.y = s.rot;
        p.userData.paso = s.paso;
        capaPersonas.add(p);
        registrar(p, s.paso);
    }

    const doc = datos.docente;
    const docente = persona(ACENTO, 1.7);
    docente.position.set(doc.x, 0, doc.z);
    const mira = new THREE.Vector3(doc.mira[0], 0, doc.mira[1]);
    docente.lookAt(mira.x, 0, mira.z);
    const etDocente = etiqueta('Tú (docente)', 'et3d et3d-docente');
    etDocente.position.y = 2.05;
    docente.add(etDocente);
    // campo de visión: abanico de 120° hacia donde mira (el frente de la figura es +z local)
    const abanico = malla(new THREE.CircleGeometry(mayor * 0.6, 48, -Math.PI / 2 - Math.PI / 3, (2 * Math.PI) / 3),
        new THREE.MeshBasicMaterial({ color: ACENTO, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }), false);
    abanico.rotation.x = -Math.PI / 2;
    abanico.position.y = 0.012;
    docente.add(abanico);
    docente.userData.paso = doc.paso;
    capaPersonas.add(docente);
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

    const VISTAS = {
        '3d': (camara) => {
            const radio = Math.hypot(tamano.x, tamano.z) / 2 + 1;
            const d = distanciaPara(camara, radio * 1.5, radio * 2);
            return { pos: new THREE.Vector3(0.38, 0.85, 1).normalize().multiplyScalar(d).add(centro), obj: centro.clone() };
        },
        planta: (camara) => ({ pos: centro.clone().setY(distanciaPara(camara, tamano.z + 5, tamano.x + 3)).setZ(centro.z + 0.01), obj: centro.clone() }),
        docente: () => {
            const ojos = new THREE.Vector3(doc.x, 1.6, doc.z);
            const frente = mira.clone().sub(new THREE.Vector3(doc.x, 0, doc.z)).setY(0).normalize();
            return { pos: ojos.clone().sub(frente.clone().multiplyScalar(1.2)).setY(2.1), obj: new THREE.Vector3(mira.x, 0.3, mira.z) };
        },
    };

    /** Posición y objetivo de cámara para una vista ('3d', 'planta' o 'docente'). */
    const vista = (nombre, camara) => VISTAS[nombre](camara);

    /** Deja armado hasta el paso indicado (null = montaje completo) y quita el resaltado. */
    function mostrarPaso(paso) {
        const visible = (p) => paso === null || p <= paso;
        for (const grupo of [escena.children, capaCotas.children, capaPersonas.children]) {
            for (const o of grupo) {
                if (o.userData.paso === undefined) continue;
                o.visible = visible(o.userData.paso);
            }
        }
        for (const { o } of resaltables) o.material.emissive.setHex(0x000000);
    }

    /** Ilumina los objetos que se agregan en ese paso. */
    function resaltar(paso, brillo) {
        for (const { o, paso: p } of resaltables) if (p === paso) o.material.emissive.setHex(ACENTO).multiplyScalar(brillo);
    }

    /** Libera la memoria de la GPU (geometrías y materiales). */
    function liberar() {
        escena.traverse((o) => {
            o.geometry?.dispose();
            if (o.material) [].concat(o.material).forEach((m) => m.dispose());
        });
    }

    return { escena, capaCotas, capaPersonas, rejilla, vista, mostrarPaso, resaltar, liberar };
}
