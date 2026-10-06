#!/usr/bin/env node
/**
 * Genera los fixtures dorados de paridad JS → Python.
 *
 * Carga el script.js real de la app en un contexto aislado (con stubs mínimos de DOM),
 * le pasa secuencias sintéticas de landmarks deterministas y guarda entradas y salidas
 * en dorados.json. Los tests de Python deben reproducir esas salidas.
 *
 * Uso (desde la raíz del repo):  node backend/tests/golden/generar_dorados.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '../../..');
const SALIDA = path.join(__dirname, 'dorados.json');

// --------------------------------------------------------------------------
// 1. Cargar script.js con stubs de navegador
// --------------------------------------------------------------------------
function cargarMotorJS() {
    const noop = () => {};
    const elementoFalso = { value: '7_anos', options: [], selectedIndex: 0, style: {}, classList: { add: noop, remove: noop, toggle: noop } };
    const contexto = {
        console: { log: noop, warn: noop, error: noop },
        Math, JSON, Date, Set, Map, Array, Object, Number, String, Promise, Error, Infinity, NaN, isNaN, parseInt,
        setTimeout: noop, requestAnimationFrame: noop,
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        document: {
            getElementById: (id) => (id === 'gradeSelect' ? elementoFalso : null),
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: noop,
            createElement: () => ({ ...elementoFalso }),
            body: { appendChild: noop },
        },
    };
    contexto.window = contexto;
    contexto.window.addEventListener = noop;
    vm.createContext(contexto);
    const src = fs.readFileSync(path.join(RAIZ, 'script.js'), 'utf8');
    // const/class de nivel superior no quedan en el global del contexto: se exportan explícitamente
    vm.runInContext(src + '\n;globalThis.__exp = { biomechanicalRulesTable };', contexto, { filename: 'script.js' });
    contexto.__fijarGrado = (g) => { elementoFalso.value = g; };
    return contexto;
}

// --------------------------------------------------------------------------
// 2. Generador determinista de poses sintéticas
// --------------------------------------------------------------------------
function prng(semilla) {
    // mulberry32
    let a = semilla >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const r4 = (v) => Math.round(v * 10000) / 10000;

// Postura erguida de frente, coordenadas normalizadas (y crece hacia abajo)
function poseBase() {
    const p = [];
    for (let i = 0; i < 33; i++) p.push({ x: 0.5, y: 0.15, z: 0 });
    const set = (i, x, y) => { p[i] = { x, y, z: 0 }; };
    for (let i = 1; i <= 10; i++) set(i, 0.5 + (i % 2 ? 0.01 : -0.01) * (i / 2), 0.13 + (i > 8 ? 0.04 : 0));
    set(0, 0.5, 0.15);
    set(11, 0.55, 0.30); set(12, 0.45, 0.30);
    set(13, 0.57, 0.42); set(14, 0.43, 0.42);
    set(15, 0.58, 0.53); set(16, 0.42, 0.53);
    set(17, 0.585, 0.56); set(18, 0.415, 0.56); set(19, 0.585, 0.57); set(20, 0.415, 0.57); set(21, 0.58, 0.55); set(22, 0.42, 0.55);
    set(23, 0.53, 0.55); set(24, 0.47, 0.55);
    set(25, 0.535, 0.72); set(26, 0.465, 0.72);
    set(27, 0.535, 0.90); set(28, 0.465, 0.90);
    set(29, 0.535, 0.92); set(30, 0.465, 0.92);
    set(31, 0.55, 0.93); set(32, 0.45, 0.93);
    return p;
}

function mover(p, idxs, dx, dy) { idxs.forEach(i => { p[i] = { ...p[i], x: p[i].x + dx, y: p[i].y + dy }; }); }
const PIERNA_IZQ = [25, 27, 29, 31], PIERNA_DER = [26, 28, 30, 32];
const TOBILLO_IZQ = [27, 29, 31], TOBILLO_DER = [28, 30, 32];
const TODO = [...Array(33).keys()];

// Cada escenario devuelve la pose del fotograma k (0..n-1) con amplitud a ∈ [0.4, 1.6]
const ESCENARIOS = {
    reposo: (p) => p,
    salto: (p, k, n, a) => {
        const f = k / (n - 1);
        if (f < 0.3) { mover(p, [...Array(25).keys()], 0, 0.05 * a); mover(p, [25, 26], 0.04 * a, 0.02 * a); }
        else if (f < 0.7) { mover(p, TODO, 0.12 * a * f, -0.09 * a); }
        else { mover(p, TODO, 0.18 * a, 0); mover(p, [...Array(25).keys()], 0, 0.04 * a); mover(p, [25, 26], 0.03 * a, 0.01); }
        return p;
    },
    equilibrio: (p, k, n, a) => {
        if (k >= 1) { mover(p, TOBILLO_IZQ, 0.02, -0.09 * a); mover(p, [25], 0.03 * a, -0.05 * a); }
        return p;
    },
    patear: (p, k, n, a) => {
        const pico = Math.floor(n / 2);
        if (k === pico) { mover(p, TOBILLO_IZQ, 0.16 * a, -0.07 * a); mover(p, [25], 0.08 * a, -0.03); }
        else if (k === pico - 1) { mover(p, TOBILLO_IZQ, -0.08 * a, -0.03 * a); }
        return p;
    },
    lanzar: (p, k, n, a) => {
        if (k >= 2) { mover(p, [14], 0.0, -0.14 * a); mover(p, [16, 18, 20, 22], 0.02, -0.33 * a); }
        if (k >= 2 && k <= 5) mover(p, PIERNA_IZQ, 0.06 * a, 0);
        return p;
    },
    atrapar: (p, k, n, a) => {
        const c = Math.min(1, k / 3);
        mover(p, [13], -0.03 * c * a, -0.03 * c); mover(p, [14], 0.03 * c * a, -0.03 * c);
        mover(p, [15, 17, 19, 21], -0.07 * c * a, -0.12 * c); mover(p, [16, 18, 20, 22], 0.07 * c * a, -0.12 * c);
        return p;
    },
    carrera: (p, k, n, a) => {
        const s = k % 2 ? 1 : -1;
        mover(p, [0, ...Array.from({ length: 22 }, (_, i) => i + 1)], 0.04 * a, 0);
        mover(p, PIERNA_IZQ, 0.09 * s * a, -0.02); mover(p, PIERNA_DER, -0.09 * s * a, 0);
        mover(p, s > 0 ? TOBILLO_DER : TOBILLO_IZQ, 0, -0.08 * a);
        if (k === 3) mover(p, TODO, 0, -0.06 * a);
        return p;
    },
    marcha: (p, k, n, a) => {
        const s = k % 2 ? 1 : -1;
        mover(p, PIERNA_IZQ, 0.04 * s * a, 0); mover(p, PIERNA_DER, -0.04 * s * a, 0);
        mover(p, TODO, 0.01 * k, 0);
        return p;
    },
    unipodal: (p, k, n, a) => {
        mover(p, TOBILLO_IZQ, 0, -0.10 * a); mover(p, [25], 0.02, -0.04);
        if (k % 3 === 1) mover(p, TODO, 0.03, -0.07 * a);
        if (k % 3 === 2) mover(p, [26], 0.04 * a, 0.01);
        return p;
    },
    aleatorio: (p, k, n, a, rnd) => {
        TODO.forEach(i => { p[i] = { ...p[i], x: p[i].x + (rnd() - 0.5) * 0.25 * a, y: p[i].y + (rnd() - 0.5) * 0.25 * a }; });
        return p;
    },
};

function generarCaso(nombre, semilla) {
    const rnd = prng(semilla);
    const amp = 0.4 + rnd() * 1.2;
    const ruido = rnd() * 0.012;
    const n = rnd() < 0.15 ? 1 : 8;               // algunos casos de foto fija
    let t = rnd() * 0.5;
    const frames = [];
    for (let k = 0; k < n; k++) {
        let p = ESCENARIOS[nombre](poseBase(), k, n, amp, rnd);
        p = p.map(q => ({
            x: r4(q.x + (rnd() - 0.5) * ruido),
            y: r4(q.y + (rnd() - 0.5) * ruido),
            z: r4((rnd() - 0.5) * 0.03),
            visibility: r4(0.5 + rnd() * 0.5),
        }));
        const sinPersona = rnd() < 0.08;
        frames.push({ timestampNum: r4(t), landmarks: sinPersona ? null : p });
        t += 0.1 + rnd() * 0.15;
    }
    return { nombre: `${nombre}_${semilla}`, frames };
}

// --------------------------------------------------------------------------
// 3. Ejecutar el motor JS y serializar
// --------------------------------------------------------------------------
const CAMPOS_HITO = ['isMilestonePeak', 'isSubMilestone', 'isFinalMilestone', 'milestoneBadge', 'milestoneTitle', 'milestoneDesc', 'milestoneColor'];
const HABILIDADES = ['Carrera', 'Salto Horizontal', 'Marcha', 'Salto Unipodal', 'Lanzamiento Sobre Hombro',
    'Recepción y Atrape', 'Patear', 'Equilibrio Dinámico', 'Equilibrio Estático Unipodal'];
const CODIGOS = ['auto', 'carrera', 'salto', 'marcha', 'salto_unipodal', 'lanzar', 'atrapar', 'patear', 'equilibrio', 'equilibrio_estatico'];
const PREFERENCIAS = [
    { format: 'Cuento Motor', pedagogy: 'Descubrimiento Guiado', materials: 'Conos, Aros', duration: '45', period: '2', totalClasses: '8' },
    { format: 'Circuito de Estaciones', pedagogy: 'Asignación de Tareas', materials: 'Aros, Conos y recursos corporales', duration: '50', period: '1', totalClasses: '12' },
    { format: 'Retos Cooperativos', pedagogy: 'Resolución de Problemas', materials: 'Balones', duration: '90', period: '4', totalClasses: '3' },
];
const TEXTOS = ['', 'el niño patea la pelota', 'salto largo', 'camina en linea', 'se queda parado en un pie', 'corre rápido'];

function serializarFSM(fsm) {
    return { nombre: fsm.nombre, estado: fsm.estado, transiciones: fsm.transiciones, fasesCumplidas: Array.from(fsm.fasesCumplidas) };
}

function framesParaJS(caso, js) {
    return caso.frames.map((f, idx) => {
        const angles = f.landmarks ? js.computeJointAngles(f.landmarks) : null;
        return { time: `${f.timestampNum.toFixed(2)}s`, timestampNum: f.timestampNum, phase: `Fase ${idx + 1}`, landmarks: f.landmarks, angles };
    });
}

function ejecutarCaso(caso, js, rnd) {
    const frames = framesParaJS(caso, js);
    const salida = {};
    salida.angulos = frames.map(f => f.angles);

    let prev = null;
    salida.gatillos = frames.map(f => {
        if (!f.angles) return null;
        const g = js.checkExerciseTriggerPose(f.angles, prev);
        prev = f.angles;
        return g;
    });

    const tel = js.aggregateVideoTelemetry(frames);
    salida.telemetria = tel;
    salida.clasificacion = {};
    TEXTOS.forEach(txt => { salida.clasificacion[txt] = js.classifySkillFromKinematics(tel, txt); });

    salida.fsm = {};
    HABILIDADES.forEach(h => { salida.fsm[h] = serializarFSM(js.executeFSMAnalysis(frames, h)); });

    salida.hitos = {};
    [null, ...HABILIDADES].forEach(h => {
        const copia = frames.map(f => ({ ...f }));
        js.assignKeyframeMilestones(copia, h);
        salida.hitos[h === null ? 'auto' : h] = copia.map(f => Object.fromEntries(CAMPOS_HITO.map(c => [c, f[c]])));
    });

    // Motor local: 'auto' y un código al azar, con observación y grado al azar
    const grados = ['5_anos', '6_anos', '7_anos', '8_anos', '9_11_anos'];
    salida.motor = [];
    ['auto', CODIGOS[1 + Math.floor(rnd() * 9)]].forEach(codigo => {
        const grado = grados[Math.floor(rnd() * grados.length)];
        const obs = TEXTOS[Math.floor(rnd() * TEXTOS.length)];
        const entrada = { codigo, grado, obs };
        try {
            const d = js.runLocalBiomechanicalEngine(codigo, grado, obs, frames.map(f => ({ ...f })));
            const { fsm, ...telSinFsm } = d.telemetria_medida;
            js.__fijarGrado(grado);
            const planes = PREFERENCIAS.map(prefs => ({ prefs, plan: js.generateDidacticPlan(d, prefs, false) }));
            planes.push({ prefs: PREFERENCIAS[0], grupal: true, plan: js.generateDidacticPlan(d, PREFERENCIAS[0], true) });
            salida.motor.push({ entrada, diagnostico: { ...d, telemetria_medida: telSinFsm }, fsm: serializarFSM(fsm), planes });
        } catch (e) {
            salida.motor.push({ entrada, error: e.message });
        }
    });
    return salida;
}

function casosGeometria(js) {
    const rnd = prng(424242);
    const pt = (conZ) => ({ x: r4(rnd()), y: r4(rnd()), ...(conZ ? { z: r4(rnd() - 0.5) } : {}) });
    const casos = [];
    for (let i = 0; i < 300; i++) {
        const a = pt(i % 3 !== 0), b = pt(i % 3 !== 0), c = pt(i % 3 !== 0);
        casos.push({ a, b, c,
            angle3d: js.calculateAngle3D(a, b, c),
            angle2d: js.calcularAngulo2D(a, b, c),
            inclinacion: js.calcularInclinacionHorizontal(a, b) });
    }
    // casos degenerados
    const o = { x: 0.5, y: 0.5, z: 0 };
    casos.push({ a: o, b: o, c: { x: 0.1, y: 0.2 }, angle3d: js.calculateAngle3D(o, o, { x: 0.1, y: 0.2 }),
        angle2d: js.calcularAngulo2D(o, o, { x: 0.1, y: 0.2 }), inclinacion: js.calcularInclinacionHorizontal(o, o) });
    return casos;
}

function main() {
    const js = cargarMotorJS();
    const rnd = prng(7);
    const casos = [];
    let semilla = 1000;
    for (const nombre of Object.keys(ESCENARIOS)) {
        for (let i = 0; i < 9; i++) {
            const caso = generarCaso(nombre, semilla++);
            casos.push({ ...caso, salida: ejecutarCaso(caso, js, rnd) });
        }
    }
    // Caso sin ninguna persona detectada
    const vacio = { nombre: 'sin_persona', frames: Array.from({ length: 8 }, (_, k) => ({ timestampNum: k * 0.2, landmarks: null })) };
    casos.push({ ...vacio, salida: ejecutarCaso(vacio, js, rnd) });

    const dorados = {
        _generado_por: 'backend/tests/golden/generar_dorados.js a partir de script.js',
        geometria: casosGeometria(js),
        casos,
    };
    fs.writeFileSync(SALIDA, JSON.stringify(dorados));

    // Resumen de cobertura del clasificador
    const conteo = {};
    casos.forEach(c => { const h = c.salida.clasificacion['']; conteo[h] = (conteo[h] || 0) + 1; });
    console.info(`Dorados: ${casos.length} casos, ${dorados.geometria.length} de geometría → ${path.relative(RAIZ, SALIDA)}`);
    console.info('Clasificación automática (sin texto):', conteo);
}

main();
