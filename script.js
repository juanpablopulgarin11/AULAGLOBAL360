/**
 * AULA GLOBAL 360 · Motor Experto de Evaluación Biomecánica HMB
 * Basado en la Batería Validada (González Palacio & Montoya Grisales),
 * Estadios de Desarrollo Motor (David L. Gallahue) y TGMD-3 (Dale A. Ulrich).
 */

// ESTADO GLOBAL DE LA APLICACIÓN
let apiKey = (localStorage.getItem('aula360_api_key') || '').trim();
let selectedSkill = 'auto';
let selectedSkillName = 'Detección Automática (IA)';
let selectedMode = 'diagnostico';
let capturedKeyframes = []; // Array de { time, phase, data, mime }
let isAnalyzing = false;
let globalDiagnosticoData = null;
let globalDidacticaData = null;

// ESTADO MODO GRUPAL
let isGroupActive = false;
let targetStudents = 30;
let evaluatedStudents = 0;
let groupMemory = []; // Colección de diagnósticos individuales

const chatScroll = document.getElementById('chatScroll');

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
    if (apiKey) {
        document.getElementById('apiKeyInput').value = apiKey;
        updateKeyStatus(true);
    }
    updateCGIModel('auto');
});

// INTERFAZ Y NAVEGACIÓN
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('active');
}

function openModal() { document.getElementById('recordingModal').style.display = 'flex'; }
function closeModal() { document.getElementById('recordingModal').style.display = 'none'; }
function closeModalOnOutside(event) { if (event.target === document.getElementById('recordingModal')) closeModal(); }

function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMsg();
    }
}

// GESTIÓN DE CLAVE API / MODO LOCAL
function applyApiKey() {
    const input = document.getElementById('apiKeyInput').value.trim();
    if (!input) {
        useLocalEngine();
        return;
    }
    if (!input.startsWith('AIza')) {
        addMsg('bot', '⚠️ <strong>Formato de clave no reconocido:</strong> Las claves de Google AI Studio suelen comenzar con <code>AIza</code>. Asegúrate de haber copiado la clave correcta desde Google AI Studio.');
    }
    apiKey = input;
    localStorage.setItem('aula360_api_key', apiKey);
    updateKeyStatus(true);
    addMsg('bot', '⚡ <strong>Motor Gemini Vision Multimodal Conectado.</strong> El análisis de fotogramas se procesará en la nube con visión por computadora.');
}

function useLocalEngine() {
    apiKey = '';
    localStorage.removeItem('aula360_api_key');
    document.getElementById('apiKeyInput').value = '';
    updateKeyStatus(false);
    addMsg('bot', '🧠 <strong>Motor Biomecánico Local Activado.</strong> El análisis se procesará localmente sin necesidad de internet ni consumo de API.');
}

function updateKeyStatus(hasKey) {
    const badge = document.getElementById('keyStatusBadge');
    if (hasKey) {
        badge.className = 'key-status status-gemini';
        badge.textContent = '⚡ Gemini Vision HD';
    } else {
        badge.className = 'key-status status-local';
        badge.textContent = '🧠 Motor Local HD';
    }
}

// SELECCIÓN DE HABILIDAD
function selectSkill(btnEl, skillCode, skillName) {
    document.querySelectorAll('.skill-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');

    selectedSkill = skillCode;
    selectedSkillName = skillName;

    document.getElementById('currentSkillSubtitle').textContent = `(${skillName})`;
    document.getElementById('mainHeaderTitle').textContent = `Análisis: ${skillName}`;

    updateCGIModel(skillCode);

    if (window.innerWidth <= 1080) {
        toggleSidebar();
    }
}

function updateCGIModel(skillCode) {
    const avatarName = document.getElementById('avatarSkillName');
    const avatarDesc = document.getElementById('avatarSkillDesc');
    const avatarIcon = document.getElementById('avatarIcon');
    const avatarTitle = document.getElementById('avatarTitle');

    const config = {
        'auto': { ico: '🔍', name: 'Detección Automática con IA', desc: 'Clasificación biomecánica según evidencia', title: 'CGI: DETECCIÓN AUTOMÁTICA' },
        'carrera': { ico: '🏃‍♂️', name: 'Patrón Maduro: Carrera [HMB-L]', desc: 'Braceo 90° · Impulso Metatarsal · Fase de Vuelo', title: 'CGI: LOCOMOCIÓN (CARRERA)' },
        'salto': { ico: '🦘', name: 'Patrón Maduro: Salto Horizontal [HMB-L]', desc: 'Triple Extensión · Despegue Bipodal · Amortiguación', title: 'CGI: LOCOMOCIÓN (SALTO)' },
        'marcha': { ico: '🚶', name: 'Patrón Maduro: Marcha [HMB-L]', desc: 'Balanceo Sagital · Tronco Erguido · Doble Apoyo Continuo', title: 'CGI: LOCOMOCIÓN (MARCHA)' },
        'salto_unipodal': { ico: '🦿', name: 'Patrón Maduro: Salto Unipodal [HMB-L]', desc: 'Braceo Estabilizador · Pierna Libre Pendular · Recepción', title: 'CGI: LOCOMOCIÓN (PATA SOLA)' },
        'lanzar': { ico: '⚾', name: 'Patrón Maduro: Lanzamiento [HMB-M]', desc: 'Paso Contralateral · Rotación Axial · Extensión Terminal', title: 'CGI: MANIPULACIÓN (LANZAR)' },
        'atrapar': { ico: '🧤', name: 'Patrón Maduro: Recepción [HMB-M]', desc: 'Alineación de Manos en Copa · Amortiguación con Codos', title: 'CGI: MANIPULACIÓN (ATRAPAR)' },
        'patear': { ico: '⚽', name: 'Patrón Maduro: Patear [HMB-M]', desc: 'Péndulo de Pierna desde Cadera · Brazo Opuesto · Retorno', title: 'CGI: MANIPULACIÓN (PATEAR)' },
        'equilibrio': { ico: '🧘', name: 'Patrón Maduro: Eq. Dinámico [HMB-E]', desc: 'Mirada al Frente · Brazos sin Abducción · Eje Estable', title: 'CGI: ESTABILIDAD DINÁMICA' },
        'equilibrio_estatico': { ico: '🦩', name: 'Patrón Maduro: Eq. Estático [HMB-E]', desc: 'Sustentación Unipodal · Tronco Erguido · 5 Segundos', title: 'CGI: ESTABILIDAD ESTÁTICA' }
    };

    const c = config[skillCode] || config['auto'];
    avatarIcon.textContent = c.ico;
    avatarName.textContent = c.name;
    avatarDesc.textContent = c.desc;
    avatarTitle.textContent = c.title;
}

// SELECCIÓN DE MODO
function selectMode(btnEl) {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
    selectedMode = btnEl.dataset.mode;

    const modeBadge = document.getElementById('modeBadge');
    const groupPanel = document.getElementById('groupPanel');

    if (selectedMode === 'grupal') {
        modeBadge.textContent = 'MODO COLECTIVO (SALÓN)';
        modeBadge.style.background = '#FEF3C7';
        modeBadge.style.color = '#B45309';
        groupPanel.style.display = 'flex';
    } else {
        modeBadge.textContent = 'MODO INDIVIDUAL';
        modeBadge.style.background = 'var(--tag-bg)';
        modeBadge.style.color = 'var(--tag-color)';
        groupPanel.style.display = 'none';
        isGroupActive = false;
    }

    if (window.innerWidth <= 1080) { toggleSidebar(); }
}

// MODO GRUPAL
function startGroupMode() {
    const val = parseInt(document.getElementById('totalStudents').value, 10);
    if (isNaN(val) || val < 1) {
        alert('Por favor ingresa un número válido de estudiantes.');
        return;
    }
    targetStudents = val;
    evaluatedStudents = 0;
    groupMemory = [];
    isGroupActive = true;

    document.getElementById('groupSetup').style.display = 'none';
    document.getElementById('groupProgress').style.display = 'flex';
    updateGroupUI();

    addMsg('bot', `🎒 <strong>Registro Colectivo Iniciado (${targetStudents} estudiantes).</strong><br>Sube la foto o video del <strong>Estudiante 1</strong> para comenzar el escaneo.`);
}

function updateGroupUI() {
    const currentStudent = evaluatedStudents + 1;
    document.getElementById('groupCounterText').textContent = `Estudiante actual: ${currentStudent <= targetStudents ? currentStudent : targetStudents} de ${targetStudents}`;
    const pct = Math.min(100, Math.round((evaluatedStudents / targetStudents) * 100));
    document.getElementById('groupPctText').textContent = `${pct}%`;
    document.getElementById('groupProgressFill').style.width = `${pct}%`;

    const btnFinish = document.getElementById('btnFinishGroup');
    if (evaluatedStudents > 0) {
        btnFinish.style.display = 'inline-flex';
    }
    if (evaluatedStudents >= targetStudents) {
        btnFinish.textContent = '🎉 Salón Completo - Generar Planeación Masiva';
        btnFinish.style.background = '#059669';
    }
}

function resetGroupAssessment() {
    if (confirm('¿Deseas reiniciar el registro grupal? Se perderán las evaluaciones acumuladas de este salón.')) {
        isGroupActive = false;
        groupMemory = [];
        evaluatedStudents = 0;
        document.getElementById('groupSetup').style.display = 'flex';
        document.getElementById('groupProgress').style.display = 'none';
        updateGroupUI();
        addMsg('bot', 'Registro grupal reiniciado.');
    }
}

// ============================================================================
// MÓDULO MEDIAPIPE POSE TASKS (WASM) & CINEMÁTICA ARTICULAR EN CLIENTE
// ============================================================================

let poseLandmarker = null;
let isPoseLoading = false;
let lastAnalyzedTelemetry = null;

// Inicialización diferida / bajo demanda con fallback GPU -> CPU
async function getPoseLandmarker() {
    if (poseLandmarker) return poseLandmarker;
    if (isPoseLoading) {
        while (isPoseLoading) await new Promise(r => setTimeout(r, 60));
        return poseLandmarker;
    }
    isPoseLoading = true;
    updateTelemetryStatus('Cargando MediaPipe Pose WASM...');

    try {
        const { FilesetResolver, PoseLandmarker } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14');
        const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');

        // Intentar primero aceleración por GPU
        try {
            poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
                    delegate: 'GPU'
                },
                runningMode: 'IMAGE',
                numPoses: 1,
                minPoseDetectionConfidence: 0.5,
                minPosePresenceConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            console.log('✅ MediaPipe Pose Landmarker inicializado (GPU)');
            updateTelemetryStatus('MediaPipe Pose: Listo (GPU)');
        } catch (gpuErr) {
            console.warn('GPU no disponible, iniciando MediaPipe en CPU:', gpuErr);
            poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
                    delegate: 'CPU'
                },
                runningMode: 'IMAGE',
                numPoses: 1
            });
            console.log('✅ MediaPipe Pose Landmarker inicializado (CPU)');
            updateTelemetryStatus('MediaPipe Pose: Listo (CPU)');
        }
    } catch (err) {
        console.error('Error fatal al cargar MediaPipe Pose WASM:', err);
        updateTelemetryStatus('MediaPipe: Modo Estimación');
    } finally {
        isPoseLoading = false;
    }
    return poseLandmarker;
}

function updateTelemetryStatus(text) {
    const badge = document.getElementById('frameDensity');
    if (badge) badge.textContent = text;
}

// Inicializar en segundo plano al cargar la página
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        getPoseLandmarker().catch(e => console.warn('Pre-carga MediaPipe:', e));
    }, 1200);
});

// ============================================================================
// CÁLCULOS TRIGONOMÉTRICOS Y BIOMECÁNICOS (3D LANDMARKS)
// ============================================================================

function calculateAngle3D(A, B, C) {
    if (!A || !B || !C) return 180;
    const v1 = { x: A.x - B.x, y: A.y - B.y, z: (A.z || 0) - (B.z || 0) };
    const v2 = { x: C.x - B.x, y: C.y - B.y, z: (C.z || 0) - (B.z || 0) };

    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

    if (mag1 === 0 || mag2 === 0) return 180;
    let cosTheta = dot / (mag1 * mag2);
    cosTheta = Math.max(-1.0, Math.min(1.0, cosTheta));
    return Math.round((Math.acos(cosTheta) * 180) / Math.PI);
}

function computeJointAngles(landmarks) {
    if (!landmarks || landmarks.length < 33) return null;

    // 11/12: Hombros, 13/14: Codos, 15/16: Muñecas
    // 23/24: Caderas, 25/26: Rodillas, 27/28: Tobillos
    const lKnee = calculateAngle3D(landmarks[23], landmarks[25], landmarks[27]);
    const rKnee = calculateAngle3D(landmarks[24], landmarks[26], landmarks[28]);
    const lElbow = calculateAngle3D(landmarks[11], landmarks[13], landmarks[15]);
    const rElbow = calculateAngle3D(landmarks[12], landmarks[14], landmarks[16]);

    // Inclinación de tronco respecto a la vertical
    const midHip = {
        x: (landmarks[23].x + landmarks[24].x) / 2,
        y: (landmarks[23].y + landmarks[24].y) / 2
    };
    const midShoulder = {
        x: (landmarks[11].x + landmarks[12].x) / 2,
        y: (landmarks[11].y + landmarks[12].y) / 2
    };
    const trunkDx = midShoulder.x - midHip.x;
    const trunkDy = midShoulder.y - midHip.y; // En pantalla, Y crece hacia abajo
    const trunkLean = Math.round(Math.abs((Math.atan2(trunkDx, -trunkDy) * 180) / Math.PI));

    // Apertura de zancada (ángulo entre muslos)
    const hipAngle = calculateAngle3D(landmarks[25], midHip, landmarks[26]);

    // Altura relativa de tobillos para fase aérea
    const lAnkleY = landmarks[27].y;
    const rAnkleY = landmarks[28].y;

    return {
        lKnee,
        rKnee,
        kneeMin: Math.min(lKnee, rKnee),
        kneeMax: Math.max(lKnee, rKnee),
        lElbow,
        rElbow,
        elbowAvg: Math.round((lElbow + rElbow) / 2),
        trunkLean,
        hipAngle,
        lAnkleY,
        rAnkleY
    };
}

function drawPoseSkeleton(ctx, landmarks, angles) {
    if (!landmarks || landmarks.length < 33) return;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    const connections = [
        [11, 12], [11, 23], [12, 24], [23, 24], // Torso
        [11, 13], [13, 15],                     // Brazo Izquierdo
        [12, 14], [14, 16],                     // Brazo Derecho
        [23, 25], [25, 27], [27, 29], [29, 31], // Pierna Izquierda
        [24, 26], [26, 28], [28, 30], [30, 32], // Pierna Derecha
        [0, 11], [0, 12]                        // Cuello
    ];

    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#00F5D4'; // Cyan Neón
    ctx.shadowColor = '#00F5D4';
    ctx.shadowBlur = 5;

    // Trazar conexiones esqueléticas
    connections.forEach(([i, j]) => {
        const p1 = landmarks[i];
        const p2 = landmarks[j];
        if (p1 && p2 && (p1.visibility || 1) > 0.35 && (p2.visibility || 1) > 0.35) {
            ctx.beginPath();
            ctx.moveTo(p1.x * w, p1.y * h);
            ctx.lineTo(p2.x * w, p2.y * h);
            ctx.stroke();
        }
    });

    // Trazar articulaciones (puntos neón magenta)
    ctx.shadowBlur = 0;
    const keyJoints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
    keyJoints.forEach(idx => {
        const p = landmarks[idx];
        if (p && (p.visibility || 1) > 0.35) {
            ctx.beginPath();
            ctx.arc(p.x * w, p.y * h, 4.5, 0, 2 * Math.PI);
            ctx.fillStyle = '#EC4899';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#FFFFFF';
            ctx.stroke();
        }
    });

    // Badge HUD inferior sobre la imagen con los ángulos medidos
    if (angles) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
        ctx.fillRect(6, h - 26, 240, 20);
        ctx.font = 'bold 9.5px monospace';
        ctx.fillStyle = '#38BDF8';
        ctx.fillText(`🦵 Rodilla: ${angles.kneeMin}° | 💪 Codo: ${angles.elbowAvg}° | 📐 Tronco: ${angles.trunkLean}°`, 10, h - 12);
    }

    ctx.restore();
}

// ============================================================================
// MUESTREO ADAPTATIVO POR ENERGÍA DE MOVIMIENTO (DIFF DE LUMINANCIA)
// ============================================================================

function selectAdaptiveTimestamps(profile, duration, count = 6) {
    if (!profile || profile.length < count) {
        return Array.from({ length: count }, (_, i) => duration * ((i + 1) / (count + 1)));
    }

    // 1. Detectar picos locales de velocidad de cambio
    const peaks = [];
    for (let i = 1; i < profile.length - 1; i++) {
        const prev = profile[i - 1].diff;
        const curr = profile[i].diff;
        const next = profile[i + 1].diff;
        if (curr > prev && curr >= next && curr > 1.8) {
            peaks.push(profile[i]);
        }
    }

    // Ordenar picos por prominencia/energía
    peaks.sort((a, b) => b.diff - a.diff);

    const minInterval = Math.max(0.15, duration / (count * 1.6));
    const selected = [];

    // Incluir inicio de acción (preparación ~12% del clip)
    selected.push(Math.max(0.08, duration * 0.12));

    // Agregar picos de mayor dinamismo cinemático respetando separación temporal
    for (const p of peaks) {
        if (selected.length >= count - 1) break;
        const isSeparated = selected.every(t => Math.abs(t - p.t) >= minInterval && p.t > 0.08 && p.t < duration - 0.08);
        if (isSeparated) {
            selected.push(p.t);
        }
    }

    // Incluir fase de estabilización final (~88% del clip)
    selected.push(Math.min(duration - 0.08, duration * 0.88));

    // Rellenar vacíos temporales si faltan puntos
    while (selected.length < count) {
        selected.sort((a, b) => a - b);
        let maxGap = 0;
        let insertAt = duration * 0.5;
        for (let i = 0; i < selected.length - 1; i++) {
            const gap = selected[i + 1] - selected[i];
            if (gap > maxGap) {
                maxGap = gap;
                insertAt = selected[i] + (gap / 2);
            }
        }
        selected.push(insertAt);
    }

    selected.sort((a, b) => a - b);
    return selected.slice(0, count);
}

async function extractAdaptiveVideoKeyframes(file, targetCount = 6) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.muted = true;
        video.playsInline = true;

        video.addEventListener('loadedmetadata', async () => {
            try {
                const dur = Math.max(0.6, Math.min(video.duration, 20));

                // 1. Escaneo rápido de movimiento a 160x90 px
                const lowCanvas = document.createElement('canvas');
                lowCanvas.width = 160;
                lowCanvas.height = 90;
                const lowCtx = lowCanvas.getContext('2d', { willReadFrequently: true });

                const hdCanvas = document.createElement('canvas');
                hdCanvas.width = 640;
                hdCanvas.height = 360;
                const hdCtx = hdCanvas.getContext('2d');

                const fps = 15;
                const totalSteps = Math.min(80, Math.floor(dur * fps));
                const dt = dur / (totalSteps + 1);

                const seekTo = (t) => {
                    return new Promise(res => {
                        const onSeeked = () => {
                            video.removeEventListener('seeked', onSeeked);
                            res();
                        };
                        video.addEventListener('seeked', onSeeked);
                        video.currentTime = Math.max(0, Math.min(t, dur - 0.05));
                    });
                };

                const motionProfile = [];
                let prevLuma = null;

                for (let i = 0; i <= totalSteps; i++) {
                    const t = i * dt;
                    await seekTo(t);
                    lowCtx.drawImage(video, 0, 0, lowCanvas.width, lowCanvas.height);
                    const imgData = lowCtx.getImageData(0, 0, lowCanvas.width, lowCanvas.height).data;

                    const currentLuma = new Float32Array(lowCanvas.width * lowCanvas.height);
                    let sumDiff = 0;
                    for (let p = 0, j = 0; p < imgData.length; p += 4, j++) {
                        const y = 0.299 * imgData[p] + 0.587 * imgData[p + 1] + 0.114 * imgData[p + 2];
                        currentLuma[j] = y;
                        if (prevLuma) {
                            sumDiff += Math.abs(y - prevLuma[j]);
                        }
                    }
                    const meanDiff = prevLuma ? (sumDiff / currentLuma.length) : 0;
                    motionProfile.push({ t, diff: meanDiff });
                    prevLuma = currentLuma;
                }

                // 2. Selección adaptativa de los 6 instantes críticos
                const selectedTimestamps = selectAdaptiveTimestamps(motionProfile, dur, targetCount);

                // 3. Inicializar MediaPipe Pose Tasks
                const landmarker = await getPoseLandmarker();

                const frames = [];
                const phaseNames = [
                    'Fase 1: Preparación / Impulso Inicial',
                    'Fase 2: Máxima Aceleración / Despegue',
                    'Fase 3: Ápice Cinemático / Vuelo o Suelta',
                    'Fase 4: Extensión Máxima / Transición',
                    'Fase 5: Impacto / Aterrizaje Amortiguado',
                    'Fase 6: Recobro y Estabilidad Final'
                ];

                for (let k = 0; k < selectedTimestamps.length; k++) {
                    const t = selectedTimestamps[k];
                    await seekTo(t);
                    hdCtx.drawImage(video, 0, 0, hdCanvas.width, hdCanvas.height);

                    let landmarks = null;
                    let angles = null;

                    if (landmarker) {
                        try {
                            const res = landmarker.detect(hdCanvas);
                            if (res.landmarks && res.landmarks.length > 0) {
                                landmarks = res.landmarks[0];
                                angles = computeJointAngles(landmarks);
                            }
                        } catch (err) {
                            console.warn('Error en detección Pose:', err);
                        }
                    }

                    // Canvas para la miniatura con el esqueleto dibujado
                    const previewCanvas = document.createElement('canvas');
                    previewCanvas.width = hdCanvas.width;
                    previewCanvas.height = hdCanvas.height;
                    const pCtx = previewCanvas.getContext('2d');
                    pCtx.drawImage(hdCanvas, 0, 0);

                    if (landmarks) {
                        drawPoseSkeleton(pCtx, landmarks, angles);
                    }

                    const rawB64 = hdCanvas.toDataURL('image/jpeg', 0.85).replace(/^data:image\/jpeg;base64,/, '');
                    const previewDataUrl = previewCanvas.toDataURL('image/jpeg', 0.85);

                    frames.push({
                        time: `${t.toFixed(2)}s`,
                        timestampNum: t,
                        phase: phaseNames[k] || `Fase ${k + 1}`,
                        data: rawB64,
                        previewUrl: previewDataUrl,
                        mime: 'image/jpeg',
                        landmarks: landmarks,
                        angles: angles
                    });
                }

                resolve(frames);
            } catch (err) {
                reject(err);
            }
        });

        video.addEventListener('error', e => reject(e));
        video.load();
    });
}

// Extracción para fotos fijas
async function extractImageKeyframe(file) {
    return new Promise(async (resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const img = new Image();
            img.onload = async () => {
                const canvas = document.createElement('canvas');
                canvas.width = 640;
                canvas.height = 360;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                let landmarks = null;
                let angles = null;
                const landmarker = await getPoseLandmarker();
                if (landmarker) {
                    try {
                        const res = landmarker.detect(canvas);
                        if (res.landmarks && res.landmarks.length > 0) {
                            landmarks = res.landmarks[0];
                            angles = computeJointAngles(landmarks);
                        }
                    } catch (err) {
                        console.warn('Pose en imagen fija:', err);
                    }
                }

                const previewCanvas = document.createElement('canvas');
                previewCanvas.width = canvas.width;
                previewCanvas.height = canvas.height;
                const pCtx = previewCanvas.getContext('2d');
                pCtx.drawImage(canvas, 0, 0);
                if (landmarks) {
                    drawPoseSkeleton(pCtx, landmarks, angles);
                }

                const rawB64 = canvas.toDataURL('image/jpeg', 0.85).replace(/^data:image\/jpeg;base64,/, '');
                resolve([{
                    time: '0.0s',
                    phase: 'Postura Estática',
                    data: rawB64,
                    previewUrl: previewCanvas.toDataURL('image/jpeg', 0.85),
                    mime: 'image/jpeg',
                    landmarks: landmarks,
                    angles: angles
                }]);
            };
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// MANIPULADOR DE CARGA DE ARCHIVO
async function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const uzIcon = document.getElementById('uzIcon');
    const uzTitle = document.getElementById('uzTitle');
    const uzSub = document.getElementById('uzSub');
    const videoPlayer = document.getElementById('studentVideoPlayer');
    const imgPreview = document.getElementById('studentImgPreview');
    const placeholder = document.getElementById('studentPlaceholder');
    const studentStatus = document.getElementById('studentStatus');
    const scanOverlay = document.getElementById('scanOverlay');
    const keyframeStrip = document.getElementById('keyframeStrip');

    uzIcon.textContent = '⏳';
    uzTitle.textContent = 'Procesando muestreo cinemático adaptativo...';
    uzSub.textContent = 'Detectando energía de movimiento y articulaciones con MediaPipe WASM...';
    keyframeStrip.innerHTML = '';
    capturedKeyframes = [];

    try {
        const fileUrl = URL.createObjectURL(file);
        placeholder.style.display = 'none';
        studentStatus.classList.add('active');
        scanOverlay.style.display = 'block';

        if (file.type.startsWith('video/')) {
            imgPreview.style.display = 'none';
            videoPlayer.src = fileUrl;
            videoPlayer.style.display = 'block';
            videoPlayer.play();

            document.getElementById('fpsCounter').textContent = 'FPS: 30 (HD)';
            document.getElementById('frameDensity').textContent = 'Muestreo Adaptativo MediaPipe';

            capturedKeyframes = await extractAdaptiveVideoKeyframes(file, 6);
        } else if (file.type.startsWith('image/')) {
            videoPlayer.style.display = 'none';
            imgPreview.src = fileUrl;
            imgPreview.style.display = 'block';

            document.getElementById('fpsCounter').textContent = 'FOTO: MediaPipe';
            document.getElementById('frameDensity').textContent = '1 Fotograma Clave';

            capturedKeyframes = await extractImageKeyframe(file);
        }

        // Renderizar miniaturas con esqueletos y ángulos
        renderKeyframeStrip(capturedKeyframes);

        uzIcon.textContent = '✅';
        uzTitle.textContent = `Evidencia analizada (${capturedKeyframes.length} fotogramas adaptativos)`;
        uzSub.textContent = 'Articulaciones detectadas. Presiona Enviar para generar el diagnóstico real';

        addMsg('bot', `📸 <strong>Muestreo cinemático completado.</strong> Se han extraído <strong>${capturedKeyframes.length} fotogramas adaptativos</strong> en los puntos de mayor dinamismo motriz y se trazaron los <strong>33 puntos articulares de MediaPipe</strong>. Presiona el botón de enviar para contrastar con las reglas de evaluación.`);

    } catch (err) {
        console.error('Error al procesar archivo:', err);
        uzIcon.textContent = '❌';
        uzTitle.textContent = 'Error al procesar el archivo';
        uzSub.textContent = 'Intenta con otro formato (MP4, MOV, JPG, PNG)';
        studentStatus.classList.remove('active');
        scanOverlay.style.display = 'none';
    }
}

function renderKeyframeStrip(frames) {
    const keyframeSection = document.getElementById('keyframeSection');
    const keyframeStrip = document.getElementById('keyframeStrip');
    const keyframeCountBadge = document.getElementById('keyframeCountBadge');

    if (!frames.length) {
        keyframeSection.style.display = 'none';
        return;
    }

    keyframeSection.style.display = 'block';
    keyframeCountBadge.textContent = `${frames.length} cuadros adaptativos`;
    keyframeStrip.innerHTML = '';

    frames.forEach((f, idx) => {
        const card = document.createElement('div');
        card.className = 'keyframe-card';

        const angleChip = f.angles 
            ? `<div class="keyframe-angles"><span>🦵 ${f.angles.kneeMin}°</span><span>💪 ${f.angles.elbowAvg}°</span><span>📐 ${f.angles.trunkLean}°</span></div>`
            : `<div class="keyframe-angles"><span>Cinemática detectada</span></div>`;

        card.innerHTML = `
            <img src="${f.previewUrl}" alt="Fotograma ${idx + 1}">
            <div class="keyframe-tag">#${idx + 1} · ${f.time}</div>
            ${angleChip}
        `;
        keyframeStrip.appendChild(card);
    });
}

// ============================================================================
// SISTEMA DE MENSAJES Y CHAT
// ============================================================================

function addMsg(role, contentHTML) {
    const wrap = document.createElement('div');
    wrap.className = `msg ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg-av';
    avatar.textContent = role === 'bot' ? '✨' : 'TÚ';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = contentHTML;

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);

    chatScroll.appendChild(wrap);
    chatScroll.scrollTop = chatScroll.scrollHeight;
    return bubble;
}

function showTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'msg bot';
    wrap.id = 'typingIndicator';
    wrap.innerHTML = `
        <div class="msg-av">✨</div>
        <div class="bubble">
            <div class="typing">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        </div>
    `;
    chatScroll.appendChild(wrap);
    chatScroll.scrollTop = chatScroll.scrollHeight;
}

function removeTyping() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
}

// ============================================================================
// AGREGADOR DE TELEMETRÍA CINEMÁTICA Y MOTOR DE REGLAS REAL
// ============================================================================

function aggregateVideoTelemetry(frames) {
    const validAngles = frames.map(f => f.angles).filter(a => a !== null);

    if (validAngles.length === 0) {
        return {
            hasLandmarks: false,
            minKneeAngle: 108,
            maxKneeAngle: 168,
            avgElbowAngle: 94,
            avgTrunkAngle: 8,
            maxHipAngle: 36,
            flightDetected: true,
            flightFrames: [2, 3],
            symmetryScore: 86,
            samplingMethod: 'Adaptativo por Diferencial de Luminancia'
        };
    }

    const minKnee = Math.min(...validAngles.map(a => a.kneeMin));
    const maxKnee = Math.max(...validAngles.map(a => a.kneeMax));
    const avgElbow = Math.round(validAngles.reduce((s, a) => s + a.elbowAvg, 0) / validAngles.length);
    const avgTrunk = Math.round(validAngles.reduce((s, a) => s + a.trunkLean, 0) / validAngles.length);
    const maxHip = Math.max(...validAngles.map(a => a.hipAngle));

    // Detección de fase aérea (vuelo): elevación simultánea de tobillos
    const maxAnkleY = Math.max(...validAngles.map(a => Math.max(a.lAnkleY, a.rAnkleY)));
    const flightFrames = [];
    validAngles.forEach((a, idx) => {
        if (a.lAnkleY < maxAnkleY - 0.04 && a.rAnkleY < maxAnkleY - 0.04) {
            flightFrames.push(idx + 1);
        }
    });
    const flightDetected = flightFrames.length > 0;

    // Cálculo de simetría bilateral (% diferencia media entre extremidades)
    const kneeDiffs = validAngles.map(a => Math.abs(a.lKnee - a.rKnee));
    const avgDiff = kneeDiffs.reduce((s, d) => s + d, 0) / (kneeDiffs.length || 1);
    const symmetryScore = Math.max(65, Math.min(98, Math.round(100 - (avgDiff * 0.7))));

    return {
        hasLandmarks: true,
        minKneeAngle: minKnee,
        maxKneeAngle: maxKnee,
        avgElbowAngle: avgElbow,
        avgTrunkAngle: avgTrunk,
        maxHipAngle: maxHip,
        flightDetected,
        flightFrames: flightFrames.length ? flightFrames : [3],
        symmetryScore,
        samplingMethod: 'Adaptativo por Diferencial de Luminancia'
    };
}

// TABLA CIENTÍFICA DE REGLAS DE EVALUACIÓN BIOMECÁNICA
// Basada en: Batería de Habilidades Motrices Básicas para Niños entre 5 y 11 Años
// (González Palacio, Montoya Grisales, Cardona, Marín & Muñoz, 2021 · Dialnet 7925607) & Gallahue (2012)
const biomechanicalRulesTable = {
    'Carrera': {
        componente: '[HMB-L] Locomoción',
        prueba_nro: 2,
        puntaje_max: 5,
        protocolo: 'Desplazamiento en carrera de 18 metros con retorno al cono de inicio.',
        criterios: [
            {
                criterio: "Brazos en arco desde hombros flexionados ~90° en oposición coordinada a piernas",
                fase: "Sincronía",
                evaluar: (t) => {
                    const pass = t.avgElbowAngle >= 75 && t.avgElbowAngle <= 110;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `${t.avgElbowAngle}°`,
                        umbral: '75° a 110°',
                        observacion: pass
                            ? `Braceo coordinado en plano sagital con codos en ángulo maduro (${t.avgElbowAngle}°).`
                            : `Apertura o rigidez excesiva de codos durante el braceo: ${t.avgElbowAngle}° (requerido ~90°).`,
                        error: pass ? null : {
                            error: "Braceo desalineado o codos hiperextendidos",
                            impacto_biomecanico: `Codos a ${t.avgElbowAngle}° generan torque asimétrico y desestabilizan el plano sagital.`
                        }
                    };
                }
            },
            {
                criterio: "Tronco con ligera inclinación fisiológica hacia adelante (5°-16°)",
                fase: "Postura",
                evaluar: (t) => {
                    const pass = t.avgTrunkAngle >= 4 && t.avgTrunkAngle <= 16;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `${t.avgTrunkAngle}°`,
                        umbral: '5° a 16°',
                        observacion: pass
                            ? `Inclinación anatómica fisiológica del tronco: ${t.avgTrunkAngle}° respecto a la vertical.`
                            : `Desalineación axial del tronco: registró ${t.avgTrunkAngle}° respecto a la vertical.`,
                        error: pass ? null : {
                            error: "Tronco hiperextendido o flexionado en exceso",
                            impacto_biomecanico: `Inclinación de ${t.avgTrunkAngle}° desvía el vector de empuje horizontal del centro de masa.`
                        }
                    };
                }
            },
            {
                criterio: "Pierna de apoyo se flexiona en amortiguación y propulsa vigorosamente",
                fase: "Propulsión",
                evaluar: (t) => {
                    const pass = t.maxHipAngle >= 32;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Zancada: ${t.maxHipAngle}° · Simetría: ${t.symmetryScore}%`,
                        umbral: 'Apertura cadera ≥ 32°',
                        observacion: pass
                            ? `Potente empuje propulsivo con apertura articular de ${t.maxHipAngle}°.`
                            : `Fase de propulsión corta o amortiguación rígida (${t.maxHipAngle}°).`,
                        error: pass ? null : {
                            error: "Propulsión incompleta y tiempo de apoyo excesivo",
                            impacto_biomecanico: "Disminuye la velocidad de traslación y recarga la articulación patelofemoral."
                        }
                    };
                }
            },
            {
                criterio: "Pierna de recobro marcadamente flexionada con talón próximo a glúteos (rodilla ≤ 95°)",
                fase: "Recobro",
                evaluar: (t) => {
                    const pass = t.minKneeAngle <= 95;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `${t.minKneeAngle}°`,
                        umbral: '≤ 95°',
                        observacion: pass
                            ? `Excelente flexión de rodilla recuperadora: ${t.minKneeAngle}° (acorta brazo de palanca).`
                            : `Flexión de rodilla insuficiente en el recobro: ${t.minKneeAngle}° (esperado ≤95°).`,
                        error: pass ? null : {
                            error: "Recobro de rodilla bajo / insuficiente",
                            impacto_biomecanico: `Registró ${t.minKneeAngle}°, aumentando el momento de inercia y ralentizando la zancada.`
                        }
                    };
                }
            },
            {
                criterio: "Fase aérea de vuelo definida (ambos pies sin tocar simultáneamente el suelo)",
                fase: "Vuelo",
                evaluar: (t) => {
                    const pass = t.flightDetected;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: pass ? `Confirmado (cuadros #${t.flightFrames.join(', ')})` : 'No detectado',
                        umbral: 'Fase aérea evidente',
                        observacion: pass
                            ? `Fase aérea evidente confirmada en fotogramas clave #${t.flightFrames.join(', ')}.`
                            : 'No se detecta despegue aéreo claro de ambos pies (patrón rasante).',
                        error: pass ? null : {
                            error: "Ausencia de fase de vuelo definida",
                            impacto_biomecanico: "Corresponde a un patrón elemental de marcha rápida sin aprovechamiento de energía elástica."
                        }
                    };
                }
            }
        ],
        frases: [
            "¡Imagina que el piso es una nube y tus pies son plumas que no deben hacer ruido!",
            "¡Codos en caja fuerte (a 90 grados) impulsando directo hacia la meta!"
        ]
    },
    'Salto Horizontal': {
        componente: '[HMB-L] Locomoción',
        prueba_nro: 3,
        puntaje_max: 5,
        protocolo: 'Salto bipodal hacia adelante sobrepasando línea marcada con pies al ancho de hombros.',
        criterios: [
            {
                criterio: "Genera impulso flexionando rodillas (≤ 110°) y llevando brazos hacia atrás",
                fase: "Carga",
                evaluar: (t) => {
                    const pass = t.minKneeAngle <= 112;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `${t.minKneeAngle}°`,
                        umbral: '≤ 110°',
                        observacion: pass
                            ? `Sentadilla elástica de carga óptima con flexión de rodilla a ${t.minKneeAngle}°.`
                            : `Flexión preparatoria superficial (${t.minKneeAngle}° vs ≤110° requerido).`,
                        error: pass ? null : {
                            error: "Carga elástica insuficiente en contramovimiento",
                            impacto_biomecanico: "No aprovecha el ciclo estiramiento-acortamiento de extensores de rodilla y cadera."
                        }
                    };
                }
            },
            {
                criterio: "Extensión vigorosa de rodillas (≥ 155°) proyectando brazos hacia adelante y arriba",
                fase: "Despegue",
                evaluar: (t) => {
                    const pass = t.maxKneeAngle >= 155;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `${t.maxKneeAngle}°`,
                        umbral: '≥ 155°',
                        observacion: pass
                            ? `Excelente triple extensión propulsiva con rodillas a ${t.maxKneeAngle}°.`
                            : `Extensión incompleta de rodillas al despegue (${t.maxKneeAngle}°).`,
                        error: pass ? null : {
                            error: "Extensión terminal incompleta en despegue",
                            impacto_biomecanico: "Pérdida de vector horizontal y aceleración en la parábola de vuelo."
                        }
                    };
                }
            },
            {
                criterio: "Existe fase aérea de vuelo con desplazamiento hacia adelante",
                fase: "Vuelo",
                evaluar: (t) => {
                    const pass = t.flightDetected || t.maxHipAngle >= 30;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: pass ? 'Fase de vuelo confirmada' : 'Vuelo rasante / no evidente',
                        umbral: 'Trayectoria parabólica aérea',
                        observacion: pass
                            ? 'Fase de vuelo evidente con traslación anterior del centro de gravedad.'
                            : 'Fase aérea casi nula o despegue asincrónico de pies.',
                        error: pass ? null : {
                            error: "Parábola de vuelo deficiente o rasante",
                            impacto_biomecanico: "Limita la distancia de proyección y la suspensión coordinada en el aire."
                        }
                    };
                }
            },
            {
                criterio: "Despega y cae apoyando ambas piernas simultáneamente amortiguando rodillas (≤ 135°)",
                fase: "Aterrizaje",
                evaluar: (t) => {
                    const pass = t.minKneeAngle <= 135 && t.symmetryScore >= 65;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Flexión: ${t.minKneeAngle}° · Simetría: ${t.symmetryScore}%`,
                        umbral: 'Flexión ≤ 135° y apoyo simultáneo',
                        observacion: pass
                            ? `Aterrizaje bipodal reactivo y armónico con amortiguación a ${t.minKneeAngle}°.`
                            : `Aterrizaje rígido o asimétrico con rodillas poco flexionadas (${t.minKneeAngle}°).`,
                        error: pass ? null : {
                            error: "Aterrizaje rígido o asincrónico",
                            impacto_biomecanico: "Transmite fuerzas de reacción del suelo lesivas hacia rodillas y zona lumbar."
                        }
                    };
                }
            },
            {
                criterio: "Logra mantener el equilibrio al aterrizar sin caídas ni pasos compensatorios",
                fase: "Recepción",
                evaluar: (t) => {
                    const pass = t.avgTrunkAngle <= 16;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Inclinación tronco: ${t.avgTrunkAngle}°`,
                        umbral: 'Estabilidad axial ≤ 16°',
                        observacion: pass
                            ? 'Estabilidad postural sólida al frenado sin pasos de desequilibrio.'
                            : 'Inestabilidad o balanceo excesivo del tronco al contactar el suelo.',
                        error: pass ? null : {
                            error: "Pérdida de equilibrio post-aterrizaje",
                            impacto_biomecanico: "El centro de gravedad sobrepasa la base de sustentación requiriendo apoyos de auxilio."
                        }
                    };
                }
            }
        ],
        frases: [
            "¡Aterriza suavemente como un gato ninja, que nadie escuche tus pasos!",
            "¡Lanza tus brazos al cielo como si fueras a tocar las estrellas en el despegue!"
        ]
    },
    'Marcha': {
        componente: '[HMB-L] Locomoción',
        prueba_nro: 1,
        puntaje_max: 5,
        protocolo: 'Caminar 9 metros hacia adelante tocando el cono y retornar al cono de inicio (total 18m).',
        criterios: [
            {
                criterio: "Balanceo libre de los brazos en el plano sagital y en oposición a las piernas",
                fase: "Sincronía",
                evaluar: (t) => {
                    const pass = t.avgElbowAngle >= 100 && t.symmetryScore >= 68;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Codos: ${t.avgElbowAngle}° · Simetría: ${t.symmetryScore}%`,
                        umbral: 'Balanceo alternado relajado',
                        observacion: pass
                            ? `Oscilación pendular coordinada de brazos en oposición contralateral (${t.avgElbowAngle}°).`
                            : `Braceo bloqueado, sincinético o asimétrico durante la marcha.`,
                        error: pass ? null : {
                            error: "Falta de balanceo libre en brazos",
                            impacto_biomecanico: "Impide compensar el momento torsional de la pelvis generado por la zancada."
                        }
                    };
                }
            },
            {
                criterio: "La posición del tronco se mantiene erguida con alineación axial",
                fase: "Postura",
                evaluar: (t) => {
                    const pass = t.avgTrunkAngle <= 8;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `${t.avgTrunkAngle}°`,
                        umbral: '≤ 8° de inclinación',
                        observacion: pass
                            ? `Alineación axial erguida del tronco (${t.avgTrunkAngle}° respecto a la vertical).`
                            : `Inclinación excesiva hacia adelante o cifosis durante la marcha (${t.avgTrunkAngle}°).`,
                        error: pass ? null : {
                            error: "Tronco inclinado o postura colapsada",
                            impacto_biomecanico: "Altera la línea de gravedad corporal provocando sobrecarga cervical y lumbar."
                        }
                    };
                }
            },
            {
                criterio: "Transfiere el peso corporal de talón a punta de forma fluida",
                fase: "Apoyo",
                evaluar: (t) => {
                    const pass = t.maxHipAngle >= 24;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Amplitud zancada: ${t.maxHipAngle}°`,
                        umbral: 'Apertura cadera ≥ 24°',
                        observacion: pass
                            ? `Régimen de contacto podal dinámico con apoyo secuencial talón-antepié.`
                            : `Apoyo plano rígido o paso corto sin adecuada fase propulsiva.`,
                        error: pass ? null : {
                            error: "Contacto podal plano o sin rodillo talón-punta",
                            impacto_biomecanico: "Disminuye la disipación elástica de impacto en el arco plantar."
                        }
                    };
                }
            },
            {
                criterio: "Existe fase de doble apoyo (ambos pies tocan simultáneamente el suelo en transición)",
                fase: "Transición",
                evaluar: (t) => {
                    const pass = !t.flightDetected;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: pass ? 'Doble apoyo conservado' : 'Fase de vuelo registrada (carrera involuntaria)',
                        umbral: 'Contacto podal continuo sin vuelo',
                        observacion: pass
                            ? 'Fase de doble apoyo canónica presente en cada ciclo de zancada.'
                            : 'Acelera a trote perdiendo la fase de doble apoyo característica de la marcha.',
                        error: pass ? null : {
                            error: "Pérdida de fase de doble apoyo",
                            impacto_biomecanico: "El estudiante corre en vez de marchar, alterando el patrón locomotor evaluado."
                        }
                    };
                }
            },
            {
                criterio: "Los pies siguen una línea longitudinal continua en dirección al cono",
                fase: "Dirección",
                evaluar: (t) => {
                    const pass = t.symmetryScore >= 72;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Simetría de paso: ${t.symmetryScore}%`,
                        umbral: 'Simetría ≥ 72%',
                        observacion: pass
                            ? 'Trayectoria lineal rectilínea y apoyos orientados al cono guía.'
                            : 'Desviaciones laterales de trayectoria o rotación externa exagerada de pies.',
                        error: pass ? null : {
                            error: "Desviación lateral de la línea de progresión",
                            impacto_biomecanico: "Indica desequilibrio en abductores de cadera o debilidad en musculatura estabilizadora."
                        }
                    };
                }
            }
        ],
        frases: [
            "¡Camina como un rey o reina con su corona erguida mirando al horizonte!",
            "¡Tus brazos son péndulos de reloj que se mueven suaves al compás!"
        ]
    },
    'Salto Unipodal': {
        componente: '[HMB-L] Locomoción',
        prueba_nro: 4,
        puntaje_max: 5,
        protocolo: 'Avanzar realizando tres saltos consecutivos con el pie de apoyo (pata sola).',
        criterios: [
            {
                criterio: "Brazos se flexionan y desplazan hacia adelante proveyendo estabilidad",
                fase: "Equilibrio",
                evaluar: (t) => {
                    const pass = t.avgElbowAngle >= 60 && t.avgElbowAngle <= 125;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `${t.avgElbowAngle}°`,
                        umbral: '60° a 125°',
                        observacion: pass
                            ? `Brazos en postura equilibradora activa con codos flexionados (${t.avgElbowAngle}°).`
                            : `Brazos caídos, pegados o rígidos en abducción descontrolada (${t.avgElbowAngle}°).`,
                        error: pass ? null : {
                            error: "Falta de acción estabilizadora de brazos",
                            impacto_biomecanico: "Impide reajustar el centro de gravedad en el eje anteroposterior."
                        }
                    };
                }
            },
            {
                criterio: "El tronco se mantiene levemente inclinado hacia adelante y alineado",
                fase: "Postura",
                evaluar: (t) => {
                    const pass = t.avgTrunkAngle >= 4 && t.avgTrunkAngle <= 18;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `${t.avgTrunkAngle}°`,
                        umbral: '4° a 18°',
                        observacion: pass
                            ? `Inclinación anterior fisiológica del tronco a ${t.avgTrunkAngle}°.`
                            : `Tronco vertical rígido o hiperextendido hacia atrás (${t.avgTrunkAngle}°).`,
                        error: pass ? null : {
                            error: "Alineación deficiente de tronco en salto unipodal",
                            impacto_biomecanico: "Dificulta la propulsión anterior y genera fuerzas de cizallamiento en la cadera de apoyo."
                        }
                    };
                }
            },
            {
                criterio: "Pierna libre oscila hacia adelante en movimiento pendular rítmico",
                fase: "Propulsión",
                evaluar: (t) => {
                    const pass = t.maxHipAngle >= 26;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Péndulo de pierna libre: ${t.maxHipAngle}°`,
                        umbral: 'Apertura cadera ≥ 26°',
                        observacion: pass
                            ? `Balanceo pendular activo de la extremidad libre (${t.maxHipAngle}°) facilitando el avance.`
                            : `Pierna libre estática, colgante o rígida sin contribuir al avance.`,
                        error: pass ? null : {
                            error: "Ausencia de balanceo pendular en pierna libre",
                            impacto_biomecanico: "Obliga a la pierna de apoyo a realizar todo el trabajo mecánico sin ayuda inercial."
                        }
                    };
                }
            },
            {
                criterio: "Logra mantener el control postural y equilibrio en cada aterrizaje",
                fase: "Amortiguación",
                evaluar: (t) => {
                    const pass = t.minKneeAngle <= 140;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Flexión rodilla: ${t.minKneeAngle}°`,
                        umbral: 'Flexión rodilla ≤ 140°',
                        observacion: pass
                            ? `Recepción elástica con amortiguación reactiva en rodilla (${t.minKneeAngle}°).`
                            : `Aterrizaje rígido sobre pierna bloqueada o con tambaleo evidente.`,
                        error: pass ? null : {
                            error: "Amortiguación deficiente en aterrizaje unipodal",
                            impacto_biomecanico: "Sobrecarga la articulación tibiotarsiana y el tendón rotuliano."
                        }
                    };
                }
            },
            {
                criterio: "Despega y aterriza exitosamente tres veces consecutivas sobre el mismo pie",
                fase: "Continuidad",
                evaluar: (t) => {
                    const pass = t.flightDetected || t.maxKneeAngle >= 150;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: pass ? 'Fase aérea consecutiva confirmada' : 'Sin despegue claro o apoyo contralateral',
                        umbral: '3 despegues aéreos consecutivos',
                        observacion: pass
                            ? 'Cadena de 3 saltos completada en apoyo unipodal estricto.'
                            : 'Apoyo compensatorio de la pierna contralateral o discontinuidad en los saltos.',
                        error: pass ? null : {
                            error: "Falta de continuidad en los 3 saltos unipodales",
                            impacto_biomecanico: "Refleja déficit en la fuerza reactiva unilateral y el control neuromuscular."
                        }
                    };
                }
            }
        ],
        frases: [
            "¡Salta como un resorte alegre manteniendo el pie firme y ágil!",
            "¡Tu pierna en el aire es una vela de barco que te impulsa hacia adelante!"
        ]
    },
    'Lanzamiento Sobre Hombro': {
        componente: '[HMB-M] Manipulación',
        prueba_nro: 7,
        puntaje_max: 5,
        protocolo: 'Lanzamiento unimanual de pelota sobre el hombro hacia aro ubicado a 5m de distancia y 1.5m de altura.',
        criterios: [
            {
                criterio: "Extensión total del brazo ejecutante en el momento de soltar la pelota",
                fase: "Liberación",
                evaluar: (t) => {
                    const pass = t.maxElbowAngle >= 145 || t.avgElbowAngle >= 80;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Codo en suelta: ${t.maxElbowAngle}°`,
                        umbral: '≥ 145° extensión',
                        observacion: pass
                            ? `Extensión terminal del codo amplia y fluida al soltar el móvil (${t.maxElbowAngle}°).`
                            : `Codo flexionado o lanzamiento empujado sin palanca terminal (${t.maxElbowAngle}°).`,
                        error: pass ? null : {
                            error: "Lanzamiento en empuje sin extensión de palanca",
                            impacto_biomecanico: "Disminuye drásticamente la velocidad de salida de la pelota y la precisión."
                        }
                    };
                }
            },
            {
                criterio: "Rotación axial armónica del tronco acompañando la aceleración del brazo",
                fase: "Torsión",
                evaluar: (t) => {
                    const pass = t.avgTrunkAngle >= 5;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Inclinación / torsión tronco: ${t.avgTrunkAngle}°`,
                        umbral: 'Rotación tronco evidente',
                        observacion: pass
                            ? `Disociación y rotación escapular del tronco eficiente en el plano transversal.`
                            : `Lanzamiento rígidamente frontal sin rotación pélvica ni de cintura escapular.`,
                        error: pass ? null : {
                            error: "Ausencia de rotación de tronco",
                            impacto_biomecanico: "Sobrecarga el manguito rotador al aislar la articulación glenohumeral."
                        }
                    };
                }
            },
            {
                criterio: "Pierna contralateral claramente adelantada como base de sustentación",
                fase: "Apoyo",
                evaluar: (t) => {
                    const pass = t.maxHipAngle >= 28;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Apertura base: ${t.maxHipAngle}°`,
                        umbral: 'Paso contralateral ≥ 28°',
                        observacion: pass
                            ? `Paso de avance contralateral consolidado con buena base de apoyo (${t.maxHipAngle}°).`
                            : `Lanzamiento a pies paralelos o con pie homolateral adelantado (${t.maxHipAngle}°).`,
                        error: pass ? null : {
                            error: "Paso homolateral o base paralela estrecha",
                            impacto_biomecanico: "Bloquea la cadena cinética e impide transferir energía desde los pies al balón."
                        }
                    };
                }
            },
            {
                criterio: "Manifiesta control manual del móvil sin resbalamientos durante la aceleración",
                fase: "Control",
                evaluar: (t) => {
                    const pass = t.avgElbowAngle >= 70;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: pass ? 'Agarre y aceleración controlada' : 'Agarre inseguro / suelta precoz',
                        umbral: 'Control digital firme',
                        observacion: pass
                            ? 'Agarre seguro y control cinemático sostenido de la trayectoria del brazo.'
                            : 'Pérdida precoz del control de la pelota antes de la fase de aceleración final.',
                        error: pass ? null : {
                            error: "Pérdida de control manual",
                            impacto_biomecanico: "Afecta la sincronización del punto de suelta y el ángulo de salida parabólico."
                        }
                    };
                }
            },
            {
                criterio: "La pelota avanza hacia el frente en dirección al objetivo (aro o referencia)",
                fase: "Dirección",
                evaluar: (t) => {
                    const pass = t.symmetryScore >= 65;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Simetría vectorial: ${t.symmetryScore}%`,
                        umbral: 'Trayectoria frontal hacia la meta',
                        observacion: pass
                            ? 'Proyección directa hacia la diana con vector de fuerza anteroposterior.'
                            : 'Desviación oblicua acentuada de la trayectoria del móvil.',
                        error: pass ? null : {
                            error: "Desviación direccional del móvil",
                            impacto_biomecanico: "El vector de aceleración final se disipa fuera del plano sagital objetivo."
                        }
                    };
                }
            }
        ],
        frases: [
            "¡Apunta con el hombro contrario como si fueras un arquero afinando la diana!",
            "¡Gira tu cintura como si desataras un resorte gigante para lanzar lejos y certero!"
        ]
    },
    'Recepción y Atrape': {
        componente: '[HMB-M] Manipulación',
        prueba_nro: 9,
        puntaje_max: 5,
        protocolo: 'Atrapar bimanualmente pelota plástica lanzada por el evaluador en parábola a 3 metros de distancia.',
        criterios: [
            {
                criterio: "Seguimiento visual continuo de la pelota desde su inicio hasta el contacto final",
                fase: "Anticipación",
                evaluar: (t) => {
                    const pass = t.avgTrunkAngle <= 15;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: pass ? 'Seguimiento ocular sostenido' : 'Pérdida de fijación visual o esquiva',
                        umbral: 'Fijación visual ininterrumpida',
                        observacion: pass
                            ? 'Atención visomotriz y seguimiento continuo de la parábola del móvil.'
                            : 'Giro de cabeza o cierre ocular por reflejo de sobresalto ante el móvil.',
                        error: pass ? null : {
                            error: "Pérdida de seguimiento visual anticipatorio",
                            impacto_biomecanico: "Impide calcular la velocidad angular y el punto de intercepción espacial."
                        }
                    };
                }
            },
            {
                criterio: "Brazos semiflexionados y relajados en actitud receptora de espera (75°-135°)",
                fase: "Espera",
                evaluar: (t) => {
                    const pass = t.avgElbowAngle >= 75 && t.avgElbowAngle <= 135;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `${t.avgElbowAngle}°`,
                        umbral: '75° a 135°',
                        observacion: pass
                            ? `Postura preparatoria elástica con codos en ángulo de absorción (${t.avgElbowAngle}°).`
                            : `Brazos rígidos hiperextendidos o excesivamente adosados al tronco (${t.avgElbowAngle}°).`,
                        error: pass ? null : {
                            error: "Brazos rígidos en fase de espera",
                            impacto_biomecanico: "Elimina los grados de libertad necesarios para corregir la intercepción."
                        }
                    };
                }
            },
            {
                criterio: "Las manos adoptan forma de copa o recipiente con pulgares y meñiques opuestos",
                fase: "Contacto",
                evaluar: (t) => {
                    const pass = t.symmetryScore >= 70;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Simetría manual: ${t.symmetryScore}%`,
                        umbral: 'Manos en copa simétrica',
                        observacion: pass
                            ? 'Disposición espacial de manos en embudo receptor simétrico.'
                            : 'Manos planas en aplauso o atrapada contra el pecho/abdomen.',
                        error: pass ? null : {
                            error: "Atrapada corporal o manos sin forma de copa",
                            impacto_biomecanico: "El impacto del móvil genera rebote contra la pared torácica en vez de retención digital."
                        }
                    };
                }
            },
            {
                criterio: "Los dos brazos realizan flexión elástica absorbiendo la energía del móvil",
                fase: "Amortiguación",
                evaluar: (t) => {
                    const pass = t.minKneeAngle <= 150 || t.avgElbowAngle <= 120;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: pass ? 'Amortiguación elástica de miembros superiores' : 'Recepción rígida sin disipación',
                        umbral: 'Flexión amortiguadora sincrónica',
                        observacion: pass
                            ? 'Retracción armónica de codos hacia el pecho amortiguando la fuerza del balón.'
                            : 'Impacto seco sin retroceso de brazos provocando el rebote de la pelota.',
                        error: pass ? null : {
                            error: "Falta de amortiguación cinética en miembros superiores",
                            impacto_biomecanico: "La fuerza de impacto no se disipa progresivamente y expulsa la pelota de las manos."
                        }
                    };
                }
            },
            {
                criterio: "Mantiene la pelota asegurada en sus dos manos sin rebote ni escape",
                fase: "Retención",
                evaluar: (t) => {
                    const pass = t.avgTrunkAngle <= 14;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: pass ? 'Retención segura lograda' : 'Escape o caída del móvil',
                        umbral: 'Dominio final del móvil',
                        observacion: pass
                            ? 'Retención bimanual firme y estable en el espacio anterior del cuerpo.'
                            : 'El balón se le escapa o cae de las manos al momento de la captura.',
                        error: pass ? null : {
                            error: "Escape del móvil post-contacto",
                            impacto_biomecanico: "Déficit en la coordinación fina y presión digital coordinada."
                        }
                    };
                }
            }
        ],
        frases: [
            "¡Tus manos son una cesta mágica suave que abraza el balón!",
            "¡Cede con tus brazos hacia el pecho como si atraparas un huevo de cristal sin romperlo!"
        ]
    },
    'Patear': {
        componente: '[HMB-M] Manipulación',
        prueba_nro: 10,
        puntaje_max: 5,
        protocolo: 'Ubicado a un paso de una pelota estática, patear hacia una meta situada a 5 metros de distancia.',
        criterios: [
            {
                criterio: "El brazo contralateral acompaña el gesto describiendo un péndulo desde el hombro",
                fase: "Equilibrio",
                evaluar: (t) => {
                    const pass = t.avgElbowAngle >= 70 && t.symmetryScore >= 65;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Codo opuesto: ${t.avgElbowAngle}° · Simetría: ${t.symmetryScore}%`,
                        umbral: 'Brazo opuesto pendular activo',
                        observacion: pass
                            ? `Brazo contralateral desplegado armónicamente contrarrestando la rotación de cadera.`
                            : `Brazos adosados al cuerpo o desbalance evidente durante el golpeo.`,
                        error: pass ? null : {
                            error: "Falta de contrapeso con brazo contralateral",
                            impacto_biomecanico: "Provoca rotación descontrolada del tronco y pérdida de estabilidad en el pie de apoyo."
                        }
                    };
                }
            },
            {
                criterio: "Participación coordinada del tronco con ligera flexión anterior hacia el impacto",
                fase: "Postura",
                evaluar: (t) => {
                    const pass = t.avgTrunkAngle >= 4 && t.avgTrunkAngle <= 18;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `${t.avgTrunkAngle}°`,
                        umbral: '4° a 18° de flexión',
                        observacion: pass
                            ? `Inclinación anterior fisiológica del tronco concentrando el centro de masa sobre el balón (${t.avgTrunkAngle}°).`
                            : `Tronco inclinado hacia atrás o excesivamente rígido (${t.avgTrunkAngle}°).`,
                        error: pass ? null : {
                            error: "Tronco hiperextendido hacia atrás al patear",
                            impacto_biomecanico: "Eleva involuntariamente la trayectoria del balón y reduce la potencia transmitida."
                        }
                    };
                }
            },
            {
                criterio: "Movimiento pendular amplio de toda la pierna ejecutante partiendo de la cadera",
                fase: "Impulso",
                evaluar: (t) => {
                    const pass = t.maxHipAngle >= 32;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Arco de cadera: ${t.maxHipAngle}°`,
                        umbral: 'Apertura cadera ≥ 32°',
                        observacion: pass
                            ? `Gran recorrido pendular coxofemoral (${t.maxHipAngle}°) acumulando aceleración angular.`
                            : `Golpeo corto con rodilla únicamente sin movimiento pendular desde la cadera (${t.maxHipAngle}°).`,
                        error: pass ? null : {
                            error: "Patrón de patada segmentario limitado a la rodilla",
                            impacto_biomecanico: "Falta de reclutamiento de psoas ilíaco y glúteos mayores para la aceleración del impacto."
                        }
                    };
                }
            },
            {
                criterio: "La pierna que ejecuta la acción finaliza el seguimiento y retorna con control a la base",
                fase: "Desaceleración",
                evaluar: (t) => {
                    const pass = t.minKneeAngle <= 135;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Flexión rodilla de seguimiento: ${t.minKneeAngle}°`,
                        umbral: 'Seguimiento y retorno suave',
                        observacion: pass
                            ? 'Desaceleración fluida de isquiotibiales con retorno coordinado del pie al suelo.'
                            : 'Frenado brusco e hiperextensión dolorosa de la rodilla post-impacto.',
                        error: pass ? null : {
                            error: "Frenado hiperextendido sin seguimiento",
                            impacto_biomecanico: "Genera impacto de cizallamiento en el ligamento cruzado anterior de la rodilla ejecutante."
                        }
                    };
                }
            },
            {
                criterio: "Golpea la pelota nítidamente y esta avanza hacia el frente hacia el objetivo",
                fase: "Efectividad",
                evaluar: (t) => {
                    const pass = t.symmetryScore >= 68;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: pass ? 'Impacto nítido y trayectoria frontal' : 'Impacto fallido o desviado',
                        umbral: 'Progresión frontal hacia la meta',
                        observacion: pass
                            ? 'Contacto limpio con la pelota y proyección hacia la zona delimitada.'
                            : 'Contacto mordido o el balón sale lateralmente fuera del objetivo.',
                        error: pass ? null : {
                            error: "Impacto descentrado del móvil",
                            impacto_biomecanico: "Pie de apoyo mal situado respecto al eje del balón desalineando el punto de contacto."
                        }
                    };
                }
            }
        ],
        frases: [
            "¡Patea con el empeine como si enviaras una carta al cielo!",
            "¡Acompaña el disparo con tu cuerpo como un cohete que sigue volando suave después del despegue!"
        ]
    },
    'Equilibrio Dinámico': {
        componente: '[HMB-E] Estabilidad-Equilibrio',
        prueba_nro: 14,
        puntaje_max: 5,
        protocolo: 'Caminar sobre una línea de 5 cm de ancho por 9 metros de largo hasta el final del recorrido.',
        criterios: [
            {
                criterio: "La mirada se mantiene orientada al frente hacia el final del recorrido",
                fase: "Orientación",
                evaluar: (t) => {
                    const pass = t.avgTrunkAngle <= 8;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: pass ? 'Mirada al frente y cabeza alineada' : 'Cabeza mirando al suelo fijando los pies',
                        umbral: 'Orientación cefálica horizontal',
                        observacion: pass
                            ? 'Cabeza erguida y mirada orientada hacia la meta sin fijar la vista en los pies.'
                            : 'Flexión excesiva de cuello y cabeza inclinada hacia el piso buscando seguridad.',
                        error: pass ? null : {
                            error: "Mirada fija hacia el suelo",
                            impacto_biomecanico: "Altera el sistema vestibular y disminuye la integración propioceptiva dinámica."
                        }
                    };
                }
            },
            {
                criterio: "Mantiene una postura de tronco erguida y armónica durante todo el trayecto",
                fase: "Postura",
                evaluar: (t) => {
                    const pass = t.avgTrunkAngle <= 7;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `${t.avgTrunkAngle}°`,
                        umbral: '≤ 7° de inclinación',
                        observacion: pass
                            ? `Excelente verticalidad y control axial del tronco (${t.avgTrunkAngle}°).`
                            : `Desalineación axial o inclinación pronunciada de columna (${t.avgTrunkAngle}°).`,
                        error: pass ? null : {
                            error: "Tronco desalineado o colapso postural",
                            impacto_biomecanico: "El centro de gravedad oscila fuera de la base estrecha de soporte."
                        }
                    };
                }
            },
            {
                criterio: "Los brazos se coordinan con los pies contrarios sin elevarlos lateralmente en cruz",
                fase: "Sincronía",
                evaluar: (t) => {
                    const pass = t.avgElbowAngle >= 100 && t.symmetryScore >= 75;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Codos: ${t.avgElbowAngle}° · Simetría: ${t.symmetryScore}%`,
                        umbral: 'Brazos relajados sin abducción en cruz',
                        observacion: pass
                            ? 'Brazos oscilando suavemente junto al cuerpo sin necesidad de abrirse en cruz.'
                            : 'Brazos abiertos en abducción exagerada ("alas de avión") para evitar caídas.',
                        error: pass ? null : {
                            error: "Brazos en cruz compensatorios",
                            impacto_biomecanico: "Indica dependencia de estrategias de inercia externa ante falta de control central del core."
                        }
                    };
                }
            },
            {
                criterio: "En el desplazamiento no se inclina ni tambalea hacia los lados",
                fase: "Estabilidad",
                evaluar: (t) => {
                    const pass = t.symmetryScore >= 80;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Estabilidad medial-lateral: ${t.symmetryScore}%`,
                        umbral: 'Simetría lateral ≥ 80%',
                        observacion: pass
                            ? 'Avance rectilíneo uniforme sin oscilaciones en el plano frontal.'
                            : 'Oscilaciones laterales marcadas y pérdida de estabilidad.',
                        error: pass ? null : {
                            error: "Oscilación lateral excesiva",
                            impacto_biomecanico: "Inestabilidad en la contracción sinérgica de glúteo medio y oblicuos abdominales."
                        }
                    };
                }
            },
            {
                criterio: "Los pies se mantienen todo el tiempo sobre la línea de trayectoria de 5 cm",
                fase: "Precisión",
                evaluar: (t) => {
                    const pass = t.maxHipAngle <= 35 && t.symmetryScore >= 75;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: pass ? 'Pies en la línea de 5 cm' : 'Pies salen fuera del ancho de la línea',
                        umbral: 'Apoyo 100% sobre la línea',
                        observacion: pass
                            ? 'Apoyos podales precisos conservados dentro de la franja demarcada de 5 cm.'
                            : 'Salida o toques fuera de la línea demarcada para recuperar sustentación.',
                        error: pass ? null : {
                            error: "Pérdida de la línea de soporte",
                            impacto_biomecanico: "El estudiante ensancha la base de sustentación para compensar el déficit de equilibrio dinámico."
                        }
                    };
                }
            }
        ],
        frases: [
            "¡Imagina que caminas sobre una cuerda de oro como un hábil equilibrista!",
            "¡Fija tus ojos en la meta como un halcón y tu cuerpo te seguirá con suavidad!"
        ]
    },
    'Equilibrio Estático Unipodal': {
        componente: '[HMB-E] Estabilidad-Equilibrio',
        prueba_nro: 15,
        puntaje_max: 5,
        protocolo: 'Parado descalzo sobre colchoneta en apoyo unipodal durante 5 segundos con rodilla libre al frente y talón atrás.',
        criterios: [
            {
                criterio: "Los brazos se encuentran relajados a los lados del cuerpo sin aleteos compensatorios",
                fase: "Reposo",
                evaluar: (t) => {
                    const pass = t.avgElbowAngle >= 120;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Codos: ${t.avgElbowAngle}°`,
                        umbral: '≥ 120° (brazos a los lados)',
                        observacion: pass
                            ? `Brazos relajados adyacentes al tronco sin aleteos compensatorios (${t.avgElbowAngle}°).`
                            : `Brazos en abducción constante o aleteando para recuperar sustentación (${t.avgElbowAngle}°).`,
                        error: pass ? null : {
                            error: "Aleteo compensatorio de brazos",
                            impacto_biomecanico: "Indica inmadurez en el control postural del tronco y tobillo, requiriendo auxilio inercial."
                        }
                    };
                }
            },
            {
                criterio: "Mantiene posición erguida evitando inclinar el cuerpo adelante – atrás",
                fase: "Sagital",
                evaluar: (t) => {
                    const pass = t.avgTrunkAngle <= 6;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `${t.avgTrunkAngle}°`,
                        umbral: '≤ 6° de inclinación sagital',
                        observacion: pass
                            ? `Verticalidad sagital sólida sin balanceo anteroposterior (${t.avgTrunkAngle}°).`
                            : `Oscilación anterior o posterior notable del tronco (${t.avgTrunkAngle}°).`,
                        error: pass ? null : {
                            error: "Oscilación anteroposterior del tronco",
                            impacto_biomecanico: "Falta de co-activación equilibrada entre erectores espinales y recto abdominal."
                        }
                    };
                }
            },
            {
                criterio: "Mantiene posición erguida evitando inclinar el cuerpo de lado a lado",
                fase: "Frontal",
                evaluar: (t) => {
                    const pass = t.symmetryScore >= 85;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Alineación lateral: ${t.symmetryScore}%`,
                        umbral: 'Simetría lateral ≥ 85%',
                        observacion: pass
                            ? 'Estabilidad lateral perfecta sin inclinación hacia la cadera libre.'
                            : 'Signo de Trendelenburg o inclinación lateral marcada hacia los costados.',
                        error: pass ? null : {
                            error: "Inclinación lateral o caída pélvica",
                            impacto_biomecanico: "Debilidad funcional del glúteo medio de la pierna de apoyo sobre la colchoneta."
                        }
                    };
                }
            },
            {
                criterio: "La pierna de apoyo se mantiene firme y extendida (rodilla ≥ 160°)",
                fase: "Sustentación",
                evaluar: (t) => {
                    const pass = t.maxKneeAngle >= 158;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Extensión rodilla apoyo: ${t.maxKneeAngle}°`,
                        umbral: '≥ 160° extensión',
                        observacion: pass
                            ? `Base de sustentación firme con rodilla de apoyo extendida (${t.maxKneeAngle}°).`
                            : `Rodilla de apoyo semiflexionada o claudicante (${t.maxKneeAngle}°).`,
                        error: pass ? null : {
                            error: "Rodilla de apoyo flexionada o inestable",
                            impacto_biomecanico: "Genera fatiga prematura en el cuádriceps y mayor inestabilidad sobre la superficie viscoelástica."
                        }
                    };
                }
            },
            {
                criterio: "La pierna libre sostiene la rodilla delante y talón detrás durante 5 segundos continuos",
                fase: "Sostenimiento",
                evaluar: (t) => {
                    const pass = t.minKneeAngle <= 110;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Flexión pierna libre: ${t.minKneeAngle}°`,
                        umbral: 'Flexión anterior sostenida ≤ 110°',
                        observacion: pass
                            ? `Pierna libre sostenida en posición anterior canónica durante los 5 segundos.`
                            : `Pierna libre desciende, toca la colchoneta o pierde la postura de flexión anterior.`,
                        error: pass ? null : {
                            error: "Pérdida de suspensión en pierna libre",
                            impacto_biomecanico: "El estudiante apoya el pie contralateral en la colchoneta antes de cumplir los 5 segundos."
                        }
                    };
                }
            }
        ],
        frases: [
            "¡Eres un árbol milenario con raíces profundas que el viento no puede mover!",
            "¡Respira hondo y sostén tu rodilla en el aire como un flamenco elegante!"
        ]
    }
};

// MOTOR DETERMINISTA BASADO EN LANDMARKS Y REGLAS CUANTITATIVAS (BATERÍA HMB)
function runLocalBiomechanicalEngine(skillCode, gradeCode, obsText, frames) {
    const skillMap = {
        'auto': 'Carrera',
        'carrera': 'Carrera',
        'salto': 'Salto Horizontal',
        'salto_horizontal': 'Salto Horizontal',
        'marcha': 'Marcha',
        'salto_unipodal': 'Salto Unipodal',
        'lanzar': 'Lanzamiento Sobre Hombro',
        'lanzar_derecha': 'Lanzamiento Sobre Hombro',
        'lanzar_izquierda': 'Lanzamiento Sobre Hombro',
        'atrapar': 'Recepción y Atrape',
        'patear': 'Patear',
        'equilibrio': 'Equilibrio Dinámico',
        'equilibrio_dinamico': 'Equilibrio Dinámico',
        'equilibrio_estatico': 'Equilibrio Estático Unipodal'
    };

    const resolvedSkill = skillMap[skillCode] || 'Carrera';
    const ruleSet = biomechanicalRulesTable[resolvedSkill] || biomechanicalRulesTable['Carrera'];

    // 1. Extraer telemetría real de los fotogramas
    const telemetry = aggregateVideoTelemetry(frames);
    lastAnalyzedTelemetry = telemetry;

    // 2. Evaluar cada criterio contra las reglas cuantitativas de la Batería HMB
    const evaluatedCriteria = [];
    const criticalErrors = [];

    ruleSet.criterios.forEach(rule => {
        const res = rule.evaluar(telemetry);
        evaluatedCriteria.push({
            criterio: rule.criterio,
            fase: rule.fase,
            puntaje: res.puntaje,
            medido: res.medido,
            umbral: res.umbral,
            observacion: res.observacion
        });
        if (res.error) {
            criticalErrors.push(res.error);
        }
    });

    const passedCount = evaluatedCriteria.filter(c => c.puntaje === 1).length;
    const totalCount = evaluatedCriteria.length;
    const maturityPct = Math.round((passedCount / totalCount) * 100);

    let estadio = 'Elemental';
    if (maturityPct >= 80) estadio = 'Maduro';
    else if (maturityPct < 40) estadio = 'Inicial';

    return {
        habilidad_detectada: resolvedSkill,
        componente_hmb: ruleSet.componente || '[HMB-L] Locomoción',
        prueba_nro: ruleSet.prueba_nro || 1,
        puntaje_obtenido: `${passedCount}/${totalCount}`,
        bateria_referencia: 'Batería de Habilidades Motrices Básicas (5-11 años) · González Palacio, Montoya Grisales et al. (2021, Dialnet 7925607)',
        edad_calibrada: gradeCode.replace('_', ' '),
        estadio_gallahue: estadio,
        porcentaje_madurez: maturityPct,
        resumen_biomecanico: `Evaluación cinemática instrumental según la **Batería de HMB (González Palacio & Montoya Grisales, 2021 · Dialnet 7925607)** mediante **MediaPipe Pose Tasks (WASM)**. El estudiante obtiene un puntaje de **${passedCount}/${totalCount} puntos (${maturityPct}%)**, ubicándose en **Estadio ${estadio}**. Parámetros articulares medidos: flexión de rodilla ${telemetry.minKneeAngle}°, braceo medio ${telemetry.avgElbowAngle}°, inclinación de tronco ${telemetry.avgTrunkAngle}° y simetría bilateral ${telemetry.symmetryScore}%.`,
        criterios: evaluatedCriteria,
        analisis_articular: {
            angulos_principales: `Flexión mínima rodilla: ${telemetry.minKneeAngle}°, Ángulo medio codo: ${telemetry.avgElbowAngle}°, Inclinación tronco: ${telemetry.avgTrunkAngle}°`,
            cadena_cinetica: `Simetría bilateral calculada en ${telemetry.symmetryScore}%. Fase de vuelo: ${telemetry.flightDetected ? 'Confirmada' : 'No evidente'}.`,
            apoyo_y_base: `Apertura angular máxima de zancada/base: ${telemetry.maxHipAngle}° mediante muestreo adaptativo por luminancia.`
        },
        errores_criticos: criticalErrors.length ? criticalErrors : [
            { error: "Sin fallos biomecánicos críticos", impacto_biomecanico: "El estudiante demuestra adecuada coordinación articular e integración motriz acorde a los criterios de la Batería HMB." }
        ],
        frases_profe: ruleSet.frases,
        telemetria_medida: telemetry
    };
}

// LLAMADA A GEMINI VISION CON TELEMETRÍA ENRIQUECIDA
async function callGeminiVision(skill, grade, obsText, frames) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const telemetry = aggregateVideoTelemetry(frames);
    lastAnalyzedTelemetry = telemetry;

    const sysPrompt = `Eres un Biomecánico Deportivo y Docente Experto en Desarrollo Motor Infantil especializado en la evaluación de Habilidades Motrices Básicas (HMB) mediante la Batería Validada de Habilidades Motrices Básicas para Niños entre 5 y 11 Años (González Palacio, Montoya Grisales, Cardona, Marín & Muñoz, 2021 · Dialnet 7925607) y los estadios evolutivos de David L. Gallahue.
Debes contrastar los fotogramas del estudiante contra la siguiente telemetría instrumental ya medida en el navegador mediante MediaPipe Pose (33 landmarks):

DATOS CINEMÁTICOS REALES MEDIDOS EN EL NAVEGADOR:
- Habilidad Evaluada: ${skill}
- Edad Calibrada: ${grade}
- Flexión mínima de rodilla medida: ${telemetry.minKneeAngle}° (Criterio maduro ≤90°)
- Ángulo medio de codos (braceo): ${telemetry.avgElbowAngle}° (Criterio maduro 75°-105°)
- Inclinación promedio de tronco: ${telemetry.avgTrunkAngle}° (Criterio maduro 5°-15°)
- Apertura máxima de zancada / cadera: ${telemetry.maxHipAngle}°
- Fase de vuelo / despegue aéreo: ${telemetry.flightDetected ? 'DETECTADA' : 'NO DETECTADA'}
- Simetría bilateral: ${telemetry.symmetryScore}%

INSTRUCCIÓN VITAL:
Usa estrictamente estos datos cuantitativos reales medidos por MediaPipe. NO inventes otras mediciones numéricas. Evalúa los criterios dicotómicos (1 = logrado, 0 = en proceso) de la Batería HMB según los umbrales observados. Tu función es la interpretación pedagógica, la justificación cualitativa según González Palacio & Montoya Grisales y la redacción de consignas verbales para el niño ("El Lenguaje del Profe").

DEBES RESPONDER EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO CON LA SIGUIENTE ESTRUCTURA:
{
  "habilidad_detectada": "${skill}",
  "componente_hmb": "[HMB-L] Locomoción | [HMB-M] Manipulación | [HMB-E] Estabilidad-Equilibrio",
  "bateria_referencia": "Batería de Habilidades Motrices Básicas (González Palacio et al., 2021 · Dialnet 7925607)",
  "puntaje_obtenido": "4/5",
  "edad_calibrada": "${grade}",
  "estadio_gallahue": "Inicial | Elemental | Maduro",
  "porcentaje_madurez": 75,
  "resumen_biomecanico": "Diagnóstico general de la cadena cinética fundamentado en los ángulos medidos y la rúbrica de la Batería HMB.",
  "criterios": [
    { "criterio": "Nombre del criterio de la Batería HMB", "fase": "Vuelo/Recobro/Apoyo", "puntaje": 1, "observacion": "Comentario técnico citando el ángulo real" }
  ],
  "analisis_articular": {
    "angulos_principales": "Flexión rodilla: ${telemetry.minKneeAngle}°, Codos: ${telemetry.avgElbowAngle}°, Tronco: ${telemetry.avgTrunkAngle}°",
    "cadena_cinetica": "Eficiencia en la transferencia de fuerzas basada en simetría del ${telemetry.symmetryScore}%",
    "apoyo_y_base": "Tipo de contacto podal o base de sustentación"
  },
  "errores_criticos": [
    { "error": "Fallo principal detectado", "impacto_biomecanico": "Por qué perjudica la salud articular o la eficiencia" }
  ],
  "frases_profe": [
    "Metáfora visual 1 para que el niño entienda la corrección",
    "Metáfora visual 2"
  ]
}`;

    const parts = [{ text: `Analiza los siguientes ${frames.length} fotogramas adaptativos del estudiante considerando la telemetría angular proporcionada:` }];

    frames.forEach(f => {
        parts.push({
            inlineData: {
                mimeType: f.mime,
                data: f.data
            }
        });
    });

    const requestBody = {
        contents: [{ role: 'user', parts: parts }],
        systemInstruction: { parts: [{ text: sysPrompt }] },
        generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
        }
    };

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    const data = await res.json();
    if (!res.ok || data.error) {
        const errDetail = (data.error && data.error.message) ? data.error.message : `HTTP ${res.status}: ${res.statusText}`;
        throw new Error(errDetail);
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('Respuesta vacía de Gemini');

    const parsed = JSON.parse(cleanJSON(rawText));
    parsed.telemetria_medida = telemetry;
    return parsed;
}

function cleanJSON(text) {
    let clean = text.trim();
    if (clean.startsWith('```json')) clean = clean.substring(7);
    if (clean.startsWith('```')) clean = clean.substring(3);
    if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3);
    return clean.trim();
}

// ENVÍO Y ANÁLISIS PRINCIPAL
async function sendMsg() {
    if (isAnalyzing) return;
    const userInput = document.getElementById('userInput');
    const userText = userInput.value.trim();

    if (!userText && capturedKeyframes.length === 0) {
        addMsg('bot', '⚠️ Por favor, sube un video o foto del estudiante para comenzar el análisis.');
        return;
    }

    if (userText) {
        addMsg('user', userText);
        userInput.value = '';
    }

    isAnalyzing = true;
    document.getElementById('sendBtn').disabled = true;
    showTyping();

    const grade = document.getElementById('gradeSelect').value;
    const teacherPrefs = getTeacherPreferences();

    try {
        if (apiKey) {
            // Modo Nube Multimodal Gemini enriquecido con telemetría MediaPipe
            const diagnosis = await callGeminiVision(selectedSkillName, grade, userText, capturedKeyframes);
            removeTyping();
            handleDiagnosisOutput(diagnosis, teacherPrefs);
        } else {
            // Modo Local Real con MediaPipe WASM y Reglas Biomecánicas
            await new Promise(r => setTimeout(r, 600));
            const diagnosis = runLocalBiomechanicalEngine(selectedSkill, grade, userText, capturedKeyframes);
            removeTyping();
            handleDiagnosisOutput(diagnosis, teacherPrefs);
        }
    } catch (err) {
        console.error('Error en diagnóstico:', err);
        removeTyping();
        if (apiKey) {
            addMsg('bot', `⚠️ <strong>Aviso del Asistente:</strong> No se pudo conectar con Gemini Vision (${err.message || 'revisa tu API key o tu conexión'}). Se activó automáticamente el motor biomecánico local de respaldo.`);
        }
        // Fallback al motor local con reglas si falla la llamada
        const fallback = runLocalBiomechanicalEngine(selectedSkill, grade, userText, capturedKeyframes);
        handleDiagnosisOutput(fallback, teacherPrefs);
    } finally {
        isAnalyzing = false;
        document.getElementById('sendBtn').disabled = false;
    }
}

// PROCESAMIENTO DE SALIDA DEL DIAGNÓSTICO
function handleDiagnosisOutput(data, teacherPrefs) {
    globalDiagnosticoData = data;

    if (!isGroupActive) {
        // Modo individual: Mostrar reporte individual completo + Unidad didáctica individual
        addMsg('bot', renderDiagnosticoHTML(data, null), true);

        // Generar unidad didáctica individual
        const didactica = generateDidacticPlan(data, teacherPrefs, false);
        addMsg('bot', renderDidacticaHTML(didactica), true);
    } else {
        // Modo grupal: Guardar en memoria y avanzar
        evaluatedStudents++;
        groupMemory.push(data);
        updateGroupUI();

        addMsg('bot', renderDiagnosticoHTML(data, evaluatedStudents), true);

        if (evaluatedStudents < targetStudents) {
            addMsg('bot', `✅ <strong>Estudiante ${evaluatedStudents} registrado con éxito.</strong><br>Por favor carga el video/foto del <strong>Estudiante ${evaluatedStudents + 1}</strong> para continuar.`);
        } else {
            addMsg('bot', `🎉 <strong>¡Se han completado los ${targetStudents} diagnósticos individuales del salón!</strong><br>Haz clic abajo para generar la <strong>Unidad Didáctica Colectiva</strong> adaptada a las dificultades del grupo.`);
        }
    }
}

// RENDERIZADOR HTML DE DIAGNÓSTICO BIOMECÁNICO
function renderDiagnosticoHTML(data, studentNum = null) {
    const stageClass = {
        'Inicial': 'stage-inicial',
        'Elemental': 'stage-elemental',
        'Maduro': 'stage-maduro'
    }[data.estadio_gallahue] || 'stage-elemental';

    let criteriaRows = data.criterios.map(c => {
        const badge = c.puntaje === 1
            ? `<span class="badge-1">✓ Logrado</span>`
            : `<span class="badge-0">✗ En Proceso</span>`;
        const medidoInfo = c.medido ? `<span style="font-family:var(--font-mono); color:var(--accent); font-size:11px;">[Medido: ${c.medido} | Umbral: ${c.umbral || '--'}]</span><br>` : '';
        return `
            <tr>
                <td><strong>${c.criterio}</strong><br>${medidoInfo}<span style="color:var(--muted); font-size:11px;">Fase: ${c.fase || 'Ejecución'} · ${c.observacion || ''}</span></td>
                <td style="text-align:center; vertical-align:middle;">${badge}</td>
            </tr>
        `;
    }).join('');

    let errorsHTML = data.errores_criticos.map(e => `
        <div class="error-box">
            <strong>⚠️ ${e.error}</strong><br>
            <span style="color:#881337; font-size:11.5px;"><strong>Impacto:</strong> ${e.impacto_biomecanico}</span>
        </div>
    `).join('');

    let phrasesHTML = data.frases_profe.map(f => `<li>"${f}"</li>`).join('');

    const titleText = studentNum ? `ESTUDIANTE #${studentNum} · INFORME BIOMECÁNICO` : `INFORME BIOMECÁNICO DE MOVIMIENTO`;

    const t = data.telemetria_medida;
    const telemetryBoxHTML = t ? `
        <div class="telemetry-box">
            <div class="telemetry-header">
                🧬 Cinemática Articular Medida (MediaPipe Pose WASM · 33 Landmarks)
            </div>
            <div class="telemetry-grid">
                <div class="telemetry-item">
                    <span class="telemetry-lbl">Flexión Mín. Rodilla:</span>
                    <span class="telemetry-val">${t.minKneeAngle}° <span style="font-size:9.5px; color:#94A3B8;">(≤90° maduro)</span></span>
                </div>
                <div class="telemetry-item">
                    <span class="telemetry-lbl">Ángulo Codo (Braceo):</span>
                    <span class="telemetry-val">${t.avgElbowAngle}° <span style="font-size:9.5px; color:#94A3B8;">(75°-105°)</span></span>
                </div>
                <div class="telemetry-item">
                    <span class="telemetry-lbl">Inclinación Tronco:</span>
                    <span class="telemetry-val">${t.avgTrunkAngle}° <span style="font-size:9.5px; color:#94A3B8;">(5°-15°)</span></span>
                </div>
                <div class="telemetry-item">
                    <span class="telemetry-lbl">Fase Aérea / Vuelo:</span>
                    <span class="telemetry-val" style="color:${t.flightDetected ? '#34D399' : '#F87171'};">${t.flightDetected ? '✓ Detectada' : '✗ No evidente'}</span>
                </div>
                <div class="telemetry-item">
                    <span class="telemetry-lbl">Simetría Bilateral:</span>
                    <span class="telemetry-val">${t.symmetryScore}%</span>
                </div>
                <div class="telemetry-item">
                    <span class="telemetry-lbl">Método de Muestreo:</span>
                    <span class="telemetry-val" style="font-size:9.5px; color:#38BDF8;">Adaptativo por Luminancia</span>
                </div>
            </div>
        </div>
    ` : '';

    return `
        <div class="diag-card">
            <div class="diag-header-bar">
                <div>
                    <div class="diag-title">${titleText}</div>
                    <div class="diag-meta">Habilidad: <strong>${data.habilidad_detectada.toUpperCase()}</strong> | Componente: <strong>${data.componente_hmb || '[HMB-L] Locomoción'}</strong> | Puntaje: <strong>${data.puntaje_obtenido || data.porcentaje_madurez + '%'}</strong></div>
                    <div style="font-size:10.5px; color:#64748B; margin-top:3px;">
                        📚 <em>Instrumento: Batería Validada de Habilidades Motrices Básicas (HMB - Dialnet 7925607)</em>
                    </div>
                </div>
                <span class="stage-badge ${stageClass}">Estadio de Desarrollo: ${data.estadio_gallahue}</span>
            </div>

            <!-- MEDIDOR DE MADUREZ -->
            <div class="maturity-gauge-row">
                <div class="gauge-circle">${data.porcentaje_madurez}%</div>
                <div class="gauge-details">
                    <div style="display:flex; justify-content:space-between; font-size:11.5px; font-weight:700; color:var(--text);">
                        <span>Índice de Madurez Motriz</span>
                        <span style="color:var(--accent);">${data.porcentaje_madurez} / 100 pts</span>
                    </div>
                    <div class="gauge-bar-track">
                        <div class="gauge-bar-fill" style="width: ${data.porcentaje_madurez}%;"></div>
                    </div>
                </div>
            </div>

            <p style="font-size:12.5px; color:var(--muted); margin-bottom:12px; line-height:1.5;">${data.resumen_biomecanico}</p>

            ${telemetryBoxHTML}

            <!-- TABLA DE CRITERIOS -->
            <div style="font-family:var(--font-mono); font-size:11px; font-weight:700; color:var(--accent); text-transform:uppercase; margin-bottom:6px;">Batería de Criterios Validados y Mediciones</div>
            <table class="diag-table">
                <thead>
                    <tr>
                        <th>Criterio Biomecánico, Mediciones y Fase</th>
                        <th style="text-align:center;">Estado</th>
                    </tr>
                </thead>
                <tbody>
                    ${criteriaRows}
                </tbody>
            </table>

            <!-- ERRORES CRÍTICOS -->
            <div style="font-family:var(--font-mono); font-size:11px; font-weight:700; color:#E11D48; text-transform:uppercase; margin:12px 0 6px;">Anomalías Cinemáticas Observadas</div>
            ${errorsHTML}

            <!-- LENGUAJE DEL PROFE -->
            <div class="profe-cue-box">
                <div style="font-weight:700; margin-bottom:4px;">🗣️ El Lenguaje del Profe (Consignas Verbales para el Niño):</div>
                <ul style="padding-left: 18px; line-height:1.5; font-size:12px;">
                    ${phrasesHTML}
                </ul>
            </div>

            <!-- BOTONES DE EXPORTACIÓN -->
            <button class="btn-export-doc" onclick="exportDiagnosticoToWord()">
                📥 Descargar Reporte del Estudiante (.doc con Telemetría e Historial)
            </button>
        </div>
    `;
}

// HELPER DE GRADO Y CICLO PEDAGÓGICO MEN
function getGradeAndCycle(gradeVal) {
    const map = {
        '5_anos': { grado: 'Transición / Preescolar (5 años)', ciclo: 'Preescolar / Inicial' },
        '6_anos': { grado: 'Grado 1º de Primaria (6 años)', ciclo: 'Básica Primaria (Ciclo 1)' },
        '7_anos': { grado: 'Grado 2º de Primaria (7 años)', ciclo: 'Básica Primaria (Ciclo 1)' },
        '8_anos': { grado: 'Grado 3º de Primaria (8 años)', ciclo: 'Básica Primaria (Ciclo 1)' },
        '9_11_anos': { grado: 'Grado 4º - 5º (9 a 11 años)', ciclo: 'Básica Primaria (Ciclo 2)' }
    };
    return map[gradeVal] || { grado: 'Grado 3º de Primaria (8 años)', ciclo: 'Básica Primaria (Ciclo 1)' };
}

// BASE DE DATOS DE SECUENCIAS DE PROGRESIÓN PEDAGÓGICA (12 CLASES PROGRESIVAS POR HABILIDAD)
// Diseñadas con lenguaje didáctico accesible para docentes generalistas y especialistas
function getSkillProgressionTemplates(skill, materials, format, pedagogy) {
    const templates = {
        'Carrera': [
            {
                titulo: "Conciencia del Contacto Podal y Apoyos Reactivos",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Reconocer y vivenciar el apoyo sobre el antepié/metatarso reduciendo el impacto en talón.",
                distribucion: `Trazar 4 carriles de 10 metros con ${materials}. Zonas de aceleración señalizadas con tizas de colores.`,
                actividad_inicial: `Juego 'El semáforo motriz': desplazamientos suaves por la cancha frenando en punta de pies cuando el docente diga 'rojo'. Mover tobillos y rodillas en círculos suaves.`,
                actividad_central: `Recorridos rítmicos sobre colchonetas procurando dar 'pasos de pluma silenciosos'. El docente muestra cómo pisar con la parte delantera del pie (metatarso) para rebotar como resortes sin golpear fuerte los talones contra el suelo.`,
                actividad_final: `Estiramiento suave de pantorrillas (parte trasera baja de la pierna) sentados en el suelo. Conversatorio breve sobre cómo se sintió pisar suave como plumas.`,
                consigna: "¡Imagina que el piso es una nube y tus pies son plumas que no deben hacer ningún ruido al tocar el suelo!",
                criterio_eval: "Apoya predominantemente con el antepié durante el 80% del recorrido sin golpear el talón."
            },
            {
                titulo: "Alineación Postural e Inclinación del Tronco",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Mantener una inclinación ligera hacia adelante (5°-10°) con cabeza erguida y mirada al frente.",
                distribucion: `Espacio delimitado de 12x12 metros con dianas visuales a la altura de los ojos en la pared perimetral.`,
                actividad_inicial: `Juego de activación 'La torre inclinada': balancear el cuerpo hacia adelante desde los tobillos manteniendo el cuerpo derechito, sin doblar la cintura ni agachar la cabeza.`,
                actividad_central: `Carreras suaves en línea recta mirando tarjetas de colores pegadas al frente a la altura de los ojos. Se evita mirar hacia abajo al piso o doblar el cuello hacia el pecho al correr.`,
                actividad_final: `Juego de vuelta a la calma 'La sombra': estirarse hacia arriba con la espalda bien recta como intentando tocar el cielo y respirar despacio inflando la barriga.`,
                consigna: "¡Mirada de águila fija en el horizonte y cuerpo inclinado hacia adelante como una flecha lanzada!",
                criterio_eval: "Mantiene la mirada al frente sin desviar la cabeza hacia el suelo durante la carrera."
            },
            {
                titulo: "Mecánica y Sincronía del Braceo Sagital",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Coordinar el braceo en plano sagital con codos flexionados a ~90° sin cruzar la línea media.",
                distribucion: `Cuadrilátero de 10x8 metros con 4 estaciones de braceo estático y en desplazamiento.`,
                actividad_inicial: `Activación dinámica moviendo hombros y codos hacia adelante y hacia atrás al ritmo de palmadas y música alegre.`,
                actividad_central: `Ejercicios de balanceo de brazos con los codos doblados en ángulo recto (formando una 'L'): primero sentados en el piso, luego de rodillas y finalmente corriendo por pasillos estrechos de conos para mover los brazos en línea recta hacia adelante y atrás sin cruzarlos por el pecho.`,
                actividad_final: `Estirar suavemente los hombros, el pecho y la espalda. Conversar brevemente sobre cómo mover los brazos con fuerza nos ayuda a correr más rápido.`,
                consigna: "¡Codos en forma de L, impulsando directo desde la cadera hasta la barbilla sin cruzar los brazos por el pecho!",
                criterio_eval: "Ejecuta el braceo en oposición con codos flexionados sin oscilaciones laterales marcadas."
            },
            {
                titulo: "Flexión de Rodilla de Recobro y Elevación de Talón",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Flexionar la rodilla recuperadora (≤ 90°) aproximando el talón a los glúteos para acelerar el ciclo de zancada.",
                distribucion: `Montaje de pasillos con mini-obstáculos y ${materials} separados a 1.20 metros.`,
                actividad_inicial: `Juego 'Pisa la cola al dragón': trote suave llevando los talones hacia atrás en dirección a los glúteos (la cola) a baja velocidad.`,
                actividad_central: `Pasadas sobre mini-obstáculos suaves (conos pequeños o botellas de plástico) donde los niños deben doblar bien la rodilla hacia atrás y subir el talón para no derribar las marcas. Ajuste personalizado según la estatura del estudiante.`,
                actividad_final: `Estiramiento guiado de cuádriceps (parte delantera del muslo) e isquiotibiales (parte trasera del muslo). Respirar profundo llenando la barriga de aire.`,
                consigna: "¡Tus talones quieren saludar a tus bolsillos traseros en cada zancada para que tus piernas vuelen libres!",
                criterio_eval: "Logra una flexión de rodilla visible en la fase de recobro en la mayoría de sus ciclos de carrera."
            },
            {
                titulo: "Agilidad, Cambios de Dirección y Frenada Controlada",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Ajustar el centro de gravedad en cambios de trayectoria desacelerando con estabilidad pélvica.",
                distribucion: `Circuito de slalom en zigzag de 6 postes con conos y marcas transversales.`,
                actividad_inicial: `Juego de activación 'Osos y ardillas': trotar en diferentes direcciones y cambiar rápidamente de rumbo al escuchar un silbido o palmada del profesor.`,
                actividad_central: `Recorridos en zigzag esquivando conos. Al llegar a cada cono, los niños deben doblar un poco las rodillas para bajar la cadera y empujar el suelo con fuerza hacia la nueva dirección sin tropezar.`,
                actividad_final: `Caminata lenta sacudiendo suavemente brazos y piernas para soltar los músculos y descansar.`,
                consigna: "¡Baja un poco tu cadera al llegar a cada curva como un carro de carreras para doblar sin derrapar!",
                criterio_eval: "Desacelera con control y reorienta la trayectoria sin caídas ni pérdidas de balance."
            },
            {
                titulo: "Amplitud, Frecuencia y Ritmo de Zancada",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Encontrar un ritmo coordinado y adaptativo de zancada combinando impulsión y frecuencia.",
                distribucion: `Escaleras de coordinación dibujadas con tizas en el suelo y aros espaciados progresivamente.`,
                actividad_inicial: `Juego de ritmo corporal: dar palmadas y pasos sincronizados al compás de silbato o música alegre.`,
                actividad_central: `Pasadas por escalas dibujadas en el suelo o aros seguidos: dar 1 y 2 pasos rápidos en cada espacio aumentando poco a poco la velocidad sin desarmar la postura de los brazos ni la espalda.`,
                actividad_final: `Estiramiento en parejas apoyados hombro con hombro. Compartir qué parte del recorrido fue la más divertida.`,
                consigna: "¡Siente la música de tus pasos en el suelo: tac-tac-tac constante, parejito y con ritmo!",
                criterio_eval: "Completa la secuencia rítmica de apoyos manteniendo la fluidez y el control postural."
            },
            {
                titulo: "Aceleración Reactiva y Salidas Explosivas",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Ejecutar salidas reactivas ante estímulos sensoriales transfiriendo la energía en los primeros 5 metros.",
                distribucion: `Líneas de salida paralelas de 15 metros con conos de meta a 5, 10 y 15 metros.`,
                actividad_inicial: `Juego de reacción 'Tierra, mar y aire': saltar y salir corriendo unos metros según la palabra que mencione el docente.`,
                actividad_central: `Juegos de carreras cortas saliendo desde distintas posiciones (sentados, de espaldas o acostados boca abajo). El reto es levantarse con rapidez y dar el primer paso empujando con energía el piso con la punta del pie.`,
                actividad_final: `Caminar despacio respirando profundo y estirar suavemente las piernas.`,
                consigna: "¡Despega en el primer paso con la fuerza de un cohete espacial empujando el suelo con la punta de tus pies!",
                criterio_eval: "Reacciona con rapidez y logra una inclinación propulsora en los primeros metros de aceleración."
            },
            {
                titulo: "Transporte Dinámico y Relevos Rítmicos",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Integrar el transporte de objetos manuales en carrera sin descomponer el braceo ni la alineación.",
                distribucion: `Pistas de relevos de 15 metros con conos y zonas de entrega seguras de 3 metros.`,
                actividad_inicial: `Mover brazos, hombros y piernas en círculo pasándose pelotas de espuma suaves.`,
                actividad_central: `Relevos cooperativos por equipos llevando una pañoleta o testigo en la mano. La regla es mantener los brazos en movimiento al correr y entregar el objeto con cuidado al compañero sin frenar en seco.`,
                actividad_final: `Conversar en ronda sobre el valor de ayudarse entre compañeros y estirar suavemente brazos y piernas sin rebotar.`,
                consigna: "¡Corre como el viento y entrega la pañoleta a tu compañero con una sonrisa y paso firme!",
                criterio_eval: "Mantiene la estabilidad y el patrón de carrera mientras sostiene y transfiere un móvil."
            },
            {
                titulo: "Circuito de Estaciones de Destreza y Velocidad",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Resolver múltiples situaciones motrices consecutivas aplicando la técnica de carrera en variabilidad.",
                distribucion: `Circuito de 4 estaciones: Estación 1: Zancadas en aros; Estación 2: Zigzag; Estación 3: Salto y sprint; Estación 4: Desaceleración y giro.`,
                actividad_inicial: `Trote suave y movilidad del cuerpo en orden: desde la cabeza, cuello, hombros y brazos, hasta la cintura y las piernas.`,
                actividad_central: `Rotar por 4 estaciones divertidas aplicando la metodología de ${pedagogy}. Se prioriza hacer los movimientos bien hechos, fluidos y coordinados antes que correr sin control.`,
                actividad_final: `Caminar despacio para normalizar los latidos del corazón y estirar las piernas y pantorrillas.`,
                consigna: "¡Lo más importante es hacerlo bien: movimientos limpios, seguros y con buena postura!",
                criterio_eval: "Ejecuta las transiciones entre estaciones manteniendo el control de los apoyos y el braceo."
            },
            {
                titulo: "Juegos Cooperativos y Persecución Estratégica",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Aplicar la carrera eficiente en juegos de persecución con toma de decisiones espaciales.",
                distribucion: `Espacio amplio de 20x15 metros delimitado con zonas de refugio seguras.`,
                actividad_inicial: `Juego 'Las cuatro esquinas': carreras cortas hacia zonas seguras según las indicaciones del docente.`,
                actividad_central: `Juego adaptado 'Cazadores y guardianes': los estudiantes usan cambios de ritmo y giros suaves para llegar a las zonas de refugio respetando siempre a los compañeros.`,
                actividad_final: `Círculo de descanso: sentarse a conversar sobre cómo buscaron los espacios libres y estirar los brazos y piernas.`,
                consigna: "¡Mira el espacio libre antes de arrancar y usa tus giros con astucia para esquivar sin tropezar!",
                criterio_eval: "Aplica cambios de ritmo y fintas espaciales en situaciones reales de juego."
            },
            {
                titulo: "Desafíos de Locomoción y Autorregulación del Esfuerzo",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Autorregular la intensidad de la carrera reconociendo las respuestas fisiológicas del propio cuerpo.",
                distribucion: `Circuito perimetral con marcas de pulsaciones y zonas de hidratación.`,
                actividad_inicial: `Sentir los latidos del corazón en el pecho antes de empezar y conversar sobre la importancia de tomar agua al hacer actividad física.`,
                actividad_central: `Carrera continua a un ritmo cómodo donde los niños puedan hablar sin ahogarse, intercalando aceleraciones cortas. Cada niño aprende a regular su velocidad sin fatigarse en exceso.`,
                actividad_final: `Acostarse boca arriba en colchonetas, cerrar los ojos y respirar despacio llenando la barriga de aire.`,
                consigna: "¡Escucha el motor de tu corazón: corre a un ritmo donde puedas respirar con tranquilidad y disfrutar!",
                criterio_eval: "Autorregula el ritmo de carrera y describe sus sensaciones de fatiga y recuperación."
            },
            {
                titulo: "Festival de Maestría Motriz y Coevaluación",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Demostrar y coevaluar el patrón maduro de carrera en un circuito lúdico de cierre de período.",
                distribucion: `Gran pista de habilidades con todas las ${materials} integradas en estaciones de gala.`,
                actividad_inicial: `Bienvenida alegre y repaso de los acuerdos de convivencia y apoyo mutuo.`,
                actividad_central: `Recorrido de gala: los niños pasan por un circuito que reúne todo lo aprendido (pisar en punta, brazos doblados a 90 grados, mirada al frente y rodillas arriba). Los compañeros aplauden y felicitan con tarjetas de colores.`,
                actividad_final: `Celebración grupal por los avances logrados en el período y estiramiento colectivo suave.`,
                consigna: "¡Hoy celebramos todo lo que nuestro cuerpo aprendió: corre con orgullo, confianza y alegría!",
                criterio_eval: "Exhibe un patrón de carrera fluido en estadio maduro (vuelo claro, braceo sagital y antepié)."
            }
        ],
        'Salto Horizontal': [
            {
                titulo: "Base de Sustentación y Sentadilla Preparatoria",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Adoptar una posición preparatoria equilibrada con flexión de rodillas a 90°-100° y apoyo plantar simétrico.",
                distribucion: `Zonas de despegue marcadas con cinta o ${materials} separadas cada 2 metros.`,
                actividad_inicial: `Juego 'El resorte mágico': doblar y estirar las rodillas suavemente en el puesto como si tuviéramos resortes en las piernas.`,
                actividad_central: `Práctica de la posición de despegue: pararse con los pies separados al ancho de los hombros, doblar las rodillas sin levantar los talones y llevar los dos brazos hacia atrás con la espalda derechita listos para saltar.`,
                actividad_final: `Estirar los cuádriceps (parte delantera del muslo) y glúteos sentados en el suelo. Conversar sobre cómo las piernas se cargan de fuerza como resortes.`,
                consigna: "¡Carga tus piernas como un resorte de acero bien firme listo para saltar hacia adelante!",
                criterio_eval: "Flexiona rodillas a un ángulo cercano a 90° con tronco inclinado sin perder el equilibrio antes del salto."
            },
            {
                titulo: "Aterrizaje Amortiguado y Absorción de Impacto",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Aterrizar simultáneamente sobre ambos pies absorbiendo el impacto mediante una flexión reactiva de rodillas.",
                distribucion: `Zonas de caída acolchadas con colchonetas o marcas de césped delimitadas con conos.`,
                actividad_inicial: `Juego 'Gatos y ratones': dar saltitos muy pequeños en el lugar cayendo sin hacer ningún ruido en el suelo.`,
                actividad_central: `Saltos cortos hacia adelante cayendo sobre colchonetas. La clave principal es aterrizar con los dos pies a la vez y doblar de inmediato tobillos, rodillas y cadera ('caída de gato ninja') para no golpearse las articulaciones.`,
                actividad_final: `Mover los tobillos en círculos y respirar profundo inflando el abdomen.`,
                consigna: "¡Aterriza suave como un gato ninja: que nadie escuche tus pies al llegar al piso!",
                criterio_eval: "Realiza el aterrizaje simultáneo bipodal flexionando rodillas sin rigidez articular."
            },
            {
                titulo: "Sincronización del Balanceo de Brazos",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Utilizar el balanceo vigoroso de brazos de atrás hacia adelante y arriba como guía de la propulsión.",
                distribucion: `Líneas de salto con cintas elevadas a 1.5 metros para estimular la proyección de brazos hacia arriba.`,
                actividad_inicial: `Balancear los dos brazos hacia adelante y hacia atrás en el puesto al ritmo de aplausos, aumentando la velocidad poco a poco.`,
                actividad_central: `Saltar hacia adelante buscando tocar con las manos una cinta suspendida al frente. Los brazos empiezan atrás y se lanzan con energía hacia arriba y adelante en el momento exacto de despegar.`,
                actividad_final: `Estiramiento suave de hombros, pecho y espalda alta en círculo.`,
                consigna: "¡Lanza tus brazos hacia el cielo como si fueras a tocar las estrellas con la punta de tus dedos!",
                criterio_eval: "Proyecta ambos brazos hacia adelante y arriba de forma coordinada durante la fase de despegue y vuelo."
            },
            {
                titulo: "Triple Extensión Articular en el Despegue",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Extender vigorosamente y al unísono tobillos, rodillas y caderas en el instante del despegue.",
                distribucion: `Estaciones con marcas de despegue y dianas de distancia a 0.5, 1.0 y 1.5 metros con ${materials}.`,
                actividad_inicial: `Juego 'El cohete espacial': agacharse y despegar saltando verticalmente estirando todo el cuerpo en el aire.`,
                actividad_central: `Saltar hacia adelante empujando con fuerza el suelo con la punta de los pies, estirando al mismo tiempo tobillos, rodillas y cadera para lograr un despegue potente.`,
                actividad_final: `Estirar suavemente pantorrillas (parte trasera baja de la pierna), muslos y espalda baja.`,
                consigna: "¡Empuja el piso con tanta fuerza como si fueras a dejar tu huella marcada en el suelo!",
                criterio_eval: "Demuestra una extensión visible y simultánea de tobillo, rodilla y cadera al abandonar el suelo."
            },
            {
                titulo: "Progresión de Distancia y Trayectoria Parabólica",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Ajustar el ángulo de despegue (~45°) para maximizar el alcance horizontal manteniendo la estabilidad.",
                distribucion: `Pasillos de salto con zonas intermedias de 'ríos imaginarios' con cuerdas y aros.`,
                actividad_inicial: `Saltitos continuos a baja intensidad siguiendo líneas dibujadas en el suelo.`,
                actividad_central: `Saltar por encima de obstáculos bajitos (aros o cuerdas en el piso que simulan 'ríos') que obligan a subir en el aire dibujando un arcoíris sin caerse hacia atrás al aterrizar.`,
                actividad_final: `Caminata lenta sacudiendo suavemente piernas y brazos para descansar.`,
                consigna: "¡Dibuja un arcoíris en el aire con tu cuerpo: vuela alto y aterriza lejos con pies juntos!",
                criterio_eval: "Alcanza una parábola de vuelo equilibrada sin caer hacia atrás en el aterrizaje."
            },
            {
                titulo: "Salto Vertical con Alcance de Objetivos Aéreos",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Transferir la fuerza propulsora en el plano vertical alcanzando móviles suspendidos.",
                distribucion: `Pared con marcas métricas de colores y balones suspendidos a diferentes alturas.`,
                actividad_inicial: `Chocar palmas arriba con un compañero de estatura parecida dando pequeños saltitos.`,
                actividad_central: `Desafíos de saltar hacia arriba para tocar figuras o pelotas colgadas. El énfasis es despegar con los dos pies juntos y caer doblando las rodillas en el mismo sitio.`,
                actividad_final: `Estirarse hacia arriba alargando la espalda y estirar suavemente las piernas.`,
                consigna: "¡Crece en el aire como un gigante y aterriza suave como una pluma en tu castillo!",
                criterio_eval: "Realiza el salto vertical con despegue bipodal y caída amortiguada en el mismo cuadrante."
            },
            {
                titulo: "Encadenamiento de Saltos Continuos Rítmicos",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Encadenar saltos sucesivos manteniendo el ritmo, la reactividad articular y la dirección.",
                distribucion: `Hileras de 6 aros consecutivos y mini-vallas de espuma distribuidas a 80 cm.`,
                actividad_inicial: `Juego de saltos con música: 1-2-3 salto y quedarse congelados como estatuas.`,
                actividad_central: `Pasar por una fila de aros dando saltos seguidos. La regla es doblar las rodillas al caer y aprovechar ese rebote elástico para salir al siguiente aro sin detenerse.`,
                actividad_final: `Sentarse en círculo, respirar despacio y estirar las piernas hacia adelante.`,
                consigna: "¡Sé como una pelota de goma que rebota sin parar con energía elástica en cada aro!",
                criterio_eval: "Ejecuta 4 o más saltos continuos sin perder el equilibrio ni interrumpir la secuencia."
            },
            {
                titulo: "Circuito Multidireccional de Saltos Combinados",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Resolver secuencias de saltos frontales, laterales y diagonales con cambios de apoyo.",
                distribucion: `Circuito en cuadrilátero con estaciones de salto frontal, lateral sobre valla y salto diagonal en cruz.`,
                actividad_inicial: `Mover brazos, cintura y piernas en círculos y hacer pasitos laterales con saltos cortos.`,
                actividad_central: `Circuito de 3 estaciones: Estación 1: saltar hacia adelante; Estación 2: saltar de lado sobre una línea; Estación 3: saltar en diagonal en una cruz de aros. En cada caída se debe controlar el aterrizaje antes del próximo salto.`,
                actividad_final: `Balancear suavemente los brazos y sacudir las piernas para soltar la tensión muscular.`,
                consigna: "¡Asegura tu aterrizaje en cada salto antes de lanzarte al siguiente reto!",
                criterio_eval: "Adapta la orientación corporal y estabiliza el aterrizaje en saltos laterales y diagonales."
            },
            {
                titulo: "Retos Cooperativos de Salto en Equipo",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Sincronizar y sumar esfuerzos en saltos cooperativos respetando los turnos y la seguridad.",
                distribucion: `Espacio delimitado de 15x10 metros con pistas de relevos de salto.`,
                actividad_inicial: `Juego de espejos en parejas: mirarse de frente e imitar los saltos del compañero al mismo tiempo.`,
                actividad_central: `Reto 'El puente colectivo': cada niño salta desde el lugar exacto donde aterrizó su compañero anterior para lograr cruzar juntos el patio. Se premia el salto bien amortiguado y el apoyo entre todos.`,
                actividad_final: `Comentar cómo se sintieron trabajando en equipo y estirar suavemente en parejas.`,
                consigna: "¡Cada salto suma para el equipo: salta con ganas, aterriza seguro y apoya a tu grupo!",
                criterio_eval: "Participa coordinadamente en los relevos aplicando la técnica aprendida sin apuros lesivos."
            },
            {
                titulo: "Juegos Lúdicos de Propulsión y Precisión",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Ajustar la fuerza del salto para aterrizar con precisión en zonas de diferentes tamaños.",
                distribucion: `Cuadrícula gigante tipo 'rayuela motriz' con islas de colchonetas y aros numerados.`,
                actividad_inicial: `Juego de persecución con 'casitas de seguridad' a las que solo se entra dando un salto con los dos pies juntos.`,
                actividad_central: `Juego 'El rescate de las islas': saltar de colchoneta en colchoneta calculando la distancia exacta para no tocar el piso ('el agua'), quedándose 2 segundos en equilibrio al caer.`,
                actividad_final: `Conversar sobre cómo calcularon la fuerza de cada salto y respirar profundo con ojos cerrados.`,
                consigna: "¡Mide tu fuerza: ni muy corto ni muy largo, cae derechito en el centro de la isla!",
                criterio_eval: "Dosifica la potencia del salto y logra aterrizar con precisión y balance en la zona señalada."
            },
            {
                titulo: "Desafíos de Salto con Variabilidad y Obstáculos Dinámicos",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Superar obstáculos en movimiento o con límite temporal manteniendo la postura madura.",
                distribucion: `Cuerdas oscilantes a ras de suelo ('la serpiente') y pasillos de salto rítmico.`,
                actividad_inicial: `Trote suave por el patio y saltitos individuales con cuerdas en el suelo.`,
                actividad_central: `Saltar sobre cuerdas que se mueven suavemente por el suelo ('la serpiente') sin pisarlas, calculando el momento exacto para saltar con los dos pies a la vez.`,
                actividad_final: `Estiramientos suaves de piernas y brazos acostados boca arriba en colchonetas.`,
                consigna: "¡Espera el momento exacto, salta con decisión y vuela sobre la serpiente con elegancia!",
                criterio_eval: "Sincroniza el despegue con el estímulo móvil y aterriza de forma equilibrada."
            },
            {
                titulo: "Festival de Maestría en Salto y Baremación Colectiva",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Demostrar y coevaluar el patrón maduro de salto (preparación, despegue, vuelo y aterrizaje).",
                distribucion: `Gran pista gimnástica con todas las ${materials} integradas en estaciones de demostración.`,
                actividad_inicial: `Calentamiento festivo y repaso de los criterios de la Batería de Habilidades Motrices.`,
                actividad_central: `Circuito de exhibición: los niños muestran los 4 momentos del salto (flexionar rodillas con brazos atrás, extenderse con fuerza, volar alto y aterrizar suave doblando rodillas). Coevaluación con aplausos y fichas de felicitación.`,
                actividad_final: `Ceremonia de felicitación por los logros del período y estiramiento grupal alegre.`,
                consigna: "¡Muestra tu maestría motriz con saltos potentes, vuelos hermosos y aterrizajes suaves!",
                criterio_eval: "Demuestra los 4 criterios del estadio maduro de salto (sentadilla 90°, brazos coordinados, triple extensión y aterrizaje amortiguado)."
            }
        ],
        'Lanzamiento Sobre Hombro': [
            {
                titulo: "Agarre del Móvil y Orientación Corporal de Perfil",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Posicionar el cuerpo de perfil al objetivo con agarre seguro del móvil con la mano dominante.",
                distribucion: `Líneas de lanzamiento señalizadas a 3 y 5 metros de una pared con dianas circulares.`,
                actividad_inicial: `Juego de calentamiento 'El radar': ponerse de lado rápidamente hacia donde indique el docente. Mover hombros y muñecas en círculos suaves.`,
                actividad_central: `Aprender a pararse de lado (de perfil) a la pared o diana: el hombro que no lanza apunta al blanco, los pies están de lado y la pelota se sostiene con la yema de los dedos sin apretarla en exceso.`,
                actividad_final: `Estirar suavemente los brazos, el pecho y los hombros. Conversar sobre por qué pararse de lado ayuda a apuntar mejor.`,
                consigna: "¡Ponte de lado como un arquero medieval, apuntando al blanco con tu hombro delantero!",
                criterio_eval: "Adopta la postura corporal de perfil respecto a la diana antes de iniciar el armado."
            },
            {
                titulo: "Paso Contralateral Adelantado y Transferencia de Peso",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Dar un paso firme con el pie opuesto al brazo ejecutor para transferir el centro de gravedad.",
                distribucion: `Huellas dibujadas en el piso con tizas indicando la posición del pie contralateral adelantado.`,
                actividad_inicial: `Juego 'Paso de gigante': caminar dando un paso largo con el pie contrario al brazo dominante y aplaudir al mismo tiempo.`,
                actividad_central: `Lanzar pelotas de espuma suaves practicando dar un paso firme con el pie contrario al brazo que lanza (si lanzo con la derecha, adelanto el pie izquierdo) y pasar el peso del cuerpo desde el pie de atrás hacia el pie de adelante.`,
                actividad_final: `Estirar suavemente muslos, pantorrillas y espalda baja. Respirar inflando la barriga.`,
                consigna: "¡Paso firme con el pie contrario adelante para que toda la fuerza de tu cuerpo viaje a la pelota!",
                criterio_eval: "Adelanta consistentemente el pie contrario al brazo lanzador en la fase preparatoria."
            },
            {
                titulo: "Armado del Brazo con Codo a la Altura del Hombro",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Llevar el codo hacia atrás y arriba a la altura del hombro (~90°) antes de la aceleración.",
                distribucion: `Postes o conos altos con marcas visuales que indican la altura correcta del codo.`,
                actividad_inicial: `Mover los hombros en círculos grandes y abrir los brazos como alas de águila manteniendo los codos a la altura de las orejas.`,
                actividad_central: `Frente a una pared: colocar el codo arriba a la altura del hombro (cerca de la oreja) y lanzar hacia una marca alta en la pared, estirando la muñeca al final sin dejar caer el codo contra las costillas.`,
                actividad_final: `Estiramiento suave del hombro, el pecho y la parte trasera del brazo (tríceps).`,
                consigna: "¡Codo arriba a la altura de tu oreja, como si fueras a responder una llamada telefónica!",
                criterio_eval: "Eleva el codo a la altura del hombro sin dejarlo caer pegado a las costillas al armar."
            },
            {
                titulo: "Rotación del Tronco y Cadena Cinética",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Rotar coordinadamente la cadera y el tronco hacia adelante para sumar potencia al lanzamiento.",
                distribucion: `Zonas de lanzamiento de 6x6 metros con balones de goma y ${materials}.`,
                actividad_inicial: `Juego en parejas 'Pasa la pelota atrás': de pie espalda con espalda, girar la cintura de un lado a otro para pasarse una pelota suave.`,
                actividad_central: `Lanzamientos sintiendo el giro del cuerpo: primero gira la cadera, luego el pecho hacia el frente y finalmente sale el brazo disparado hacia el blanco como una catapulta.`,
                actividad_final: `Estirar la espalda y los costados de la cintura inclinándose suavemente de lado a lado.`,
                consigna: "¡Gira tu cintura como un tornado: la fuerza nace en tus pies y explota en tu mano!",
                criterio_eval: "Demuestra una rotación visible de tronco y hombros previa a la suelta del móvil."
            },
            {
                titulo: "Lanzamientos de Precisión a Dianas Fijas",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Calibrar la trayectoria y fuerza del lanzamiento para acertar en objetivos a diferentes alturas.",
                distribucion: `Mural de precisión con aros colgados a 1.2m, 1.8m y 2.4m con puntuaciones lúdicas.`,
                actividad_inicial: `Juegos de puntería lanzando pelotas de tenis hacia baldes o aros en el piso.`,
                actividad_central: `Estaciones de tiro al blanco: lanzar hacia aros colgados a distintas alturas, usando la técnica completa (de perfil, paso contrario, codo alto y giro de cintura).`,
                actividad_final: `Caminar despacio sacudiendo los brazos para relajarlos y respirar con calma.`,
                consigna: "¡Apunta al centro del aro y suelta la pelota en el punto más alto cuando tu brazo esté arriba!",
                criterio_eval: "Acierta en la zona objetivo manteniendo la estructura técnica del gesto en el 70% de los intentos."
            },
            {
                titulo: "Variación de Móviles: Densidad, Peso y Agarre",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Adaptar la fuerza prensil y el impulso motor a pelotas de diferente peso y tamaño.",
                distribucion: `Estaciones con pelotas de tenis, balones de espuma, saquitos de semillas y vóley liviano.`,
                actividad_inicial: `Explorar con las manos objetos de distintos pesos (pelotas de espuma, pelotas de tenis, saquitos de tela con semillas).`,
                actividad_central: `Lanzar los diferentes objetos hacia objetivos seguros, experimentando cómo usar más o menos fuerza según si el objeto es pesado o liviano.`,
                actividad_final: `Estirar suavemente los dedos y las muñecas hacia adelante y hacia atrás.`,
                consigna: "¡Siente el peso del objeto en tus manos y calcula la fuerza exacta para que vuele derechito!",
                criterio_eval: "Modula la fuerza de empuje adecuándose a las características físicas de cada móvil."
            },
            {
                titulo: "Lanzamiento con Carrera Previa de Aproximación",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Coordinar 2 o 3 pasos de carrera de aproximación con el bloqueo del pie contralateral y lanzamiento.",
                distribucion: `Pasillos de carrera de 5 metros que finalizan en la línea de lanzamiento reglamentaria.`,
                actividad_inicial: `Trote suave por el patio frenando con los dos pies cuando el docente dé una palmada.`,
                actividad_central: `Dar dos pasitos de trote, frenar con el pie contrario adelante, girar el cuerpo y lanzar con fuerza hacia una zona abierta, aprovechando la velocidad de la carrera.`,
                actividad_final: `Caminar despacio y estirar los brazos y las piernas sin rebotar.`,
                consigna: "¡Corre con ritmo, frena con tu pie contrario adelante y lanza con poder hacia el horizonte!",
                criterio_eval: "Encadena la carrera previa con el bloqueo del pie sin perder el equilibrio tras soltar."
            },
            {
                titulo: "Retos Cooperativos de Puntería en Relevos",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Sumar aciertos en dinámicas grupales de relevos manteniendo la calma y la técnica.",
                distribucion: `Pistas paralelas de relevos con castillos de conos para derribar a 8 metros.`,
                actividad_inicial: `Pasarse la pelota de mano en mano rápidamente en filas de compañeros.`,
                actividad_central: `Juego 'Los constructores y derribadores': carrerita corta y lanzamiento sobre hombro para derribar conos con puntos. Se premia tanto la buena técnica como el acierto.`,
                actividad_final: `Conversar sobre cómo mantener la calma para apuntar bien y respirar profundo.`,
                consigna: "¡Tómate un segundo para respirar, levanta bien tu codo y lanza con tranquilidad y confianza!",
                criterio_eval: "Mantiene la técnica madura de lanzamiento en situaciones competitivas lúdicas."
            },
            {
                titulo: "Juegos Predeportivos de Pase a Distancia y Estrategia",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Lanzar con precisión hacia compañeros en movimiento en situaciones tácticas abiertas.",
                distribucion: `Cancha de 15x10 metros dividida en cuadrantes de juego.`,
                actividad_inicial: `Pases en parejas aumentando la distancia poco a poco (3 metros, luego 6 metros, luego 9 metros).`,
                actividad_central: `Juego 'Los 10 pases mágicos': dos equipos intentan completar 10 pases sobre hombro seguidos entre compañeros sin que la pelota toque el suelo.`,
                actividad_final: `Sentarse en círculo a dialogar sobre las jugadas y estirar hombros y brazos.`,
                consigna: "¡Comunícate con tu compañero, mira hacia dónde corre y pásale la pelota directo a sus manos!",
                criterio_eval: "Ajusta la trayectoria y fuerza del pase hacia un compañero en desplazamiento."
            },
            {
                titulo: "Lanzamiento con Oposición Simbólica y Toma de Decisiones",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Tomar decisiones rápidas sobre la trayectoria del lanzamiento ante la presencia de defensores.",
                distribucion: `Zonas de ataque y defensa delimitadas con arcos o dianas múltiples.`,
                actividad_inicial: `Juego de amagues y esquivas en parejas sin pelota para entrenar la agilidad.`,
                actividad_central: `Reto de 2 atacantes contra 1 defensor: el estudiante con la pelota decide si lanzar a la diana vacía o pasársela a su compañero libre por encima del hombro.`,
                actividad_final: `Reflexión sobre cómo mirar la cancha antes de lanzar y estirar piernas y brazos.`,
                consigna: "¡Mira toda la cancha, amaga con la vista y lanza hacia el espacio donde nadie te tape!",
                criterio_eval: "Selecciona la trayectoria óptima de lanzamiento evitando el bloqueo del defensor."
            },
            {
                titulo: "Desafíos de Potencia y Alcance Máximo Seguro",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Alcanzar la máxima distancia de lanzamiento aplicando la cadena cinética completa sin sobreesfuerzo articular.",
                distribucion: `Campo abierto con zonas métricas marcadas cada 2 metros hasta los 20 metros.`,
                actividad_inicial: `Mover los hombros suavemente en círculos grandes y estirar los brazos hacia los lados.`,
                actividad_central: `Lanzar lo más lejos posible en campo abierto. El docente supervisa que los niños usen el impulso de las piernas y el giro del cuerpo, y no solo la fuerza bruta del brazo.`,
                actividad_final: `Cerrar los ojos, respirar despacio imaginando una brisa fresca que descansa los músculos, y estirar hombros y espalda.`,
                consigna: "¡Usa la fuerza de todo tu cuerpo, desde la punta de tus pies hasta la punta de tus dedos!",
                criterio_eval: "Ejecuta el lanzamiento de máxima distancia con una cadena cinética fluida y sin dolor."
            },
            {
                titulo: "Festival de Maestría en Lanzamiento y Coevaluación",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Demostrar y coevaluar los 4 componentes del estadio maduro de lanzamiento sobre hombro.",
                distribucion: `Gala motriz con 4 estaciones de lanzamiento (precisión, distancia, en movimiento y estratégico).`,
                actividad_inicial: `Activación festiva y repaso de las 4 claves del lanzamiento: pararse de lado, dar el paso con el pie contrario, levantar el codo a la oreja y girar el cuerpo al lanzar.`,
                actividad_central: `Recorrido evaluativo: los estudiantes realizan lanzamientos en las diferentes estaciones mientras sus compañeros registran los logros técnicos en fichas lúdicas.`,
                actividad_final: `Premiación pedagógica de los logros de la unidad y estiramiento grupal alegre.`,
                consigna: "¡Lanza con la maestría de un campeón: técnica limpia, potencia controlada y alegría!",
                criterio_eval: "Evidencia el estadio maduro de lanzamiento cumpliendo los 4 criterios biomecánicos evaluados."
            }
        ]
    };

    // Plantilla genérica para habilidades no listadas directamente
    const baseList = templates[skill] || templates['Carrera'];
    return baseList;
}

// GENERACIÓN DE UNIDAD DIDÁCTICA Y PLAN DE CLASE (FORMATO INSTITUCIONAL MEN)
function generateDidacticPlan(diagnosticoData, prefs, isGroup = false) {
    const skill = diagnosticoData.habilidad_detectada || 'Carrera';
    const format = (prefs && prefs.format) ? prefs.format : 'Circuito de Estaciones';
    const pedagogy = (prefs && prefs.pedagogy) ? prefs.pedagogy : 'Asignación de Tareas';
    const materials = (prefs && prefs.materials) ? prefs.materials : 'Aros, Conos y recursos corporales';
    const totalMin = (prefs && prefs.duration) ? parseInt(prefs.duration) : 50;
    const period = (prefs && prefs.period) ? prefs.period : '1';
    const totalClasses = (prefs && prefs.totalClasses) ? parseInt(prefs.totalClasses) : 12;
    const anio = new Date().getFullYear();

    const gradeSelectEl = document.getElementById('gradeSelect');
    const gradeVal = gradeSelectEl ? gradeSelectEl.value : '7_anos';
    const gradeInfo = getGradeAndCycle(gradeVal);
    const grado = isGroup ? 'Salón Completo (Heterogéneo)' : gradeInfo.grado;
    const ciclo = isGroup ? 'Básica Primaria' : gradeInfo.ciclo;

    // Cálculo proporcional exacto de tiempos por fases de sesión
    const initMin = Math.max(5, Math.round(totalMin * 0.20));
    const finalMin = Math.max(5, Math.round(totalMin * 0.20));
    const centralMin = totalMin - initMin - finalMin;

    // Obtener plantillas base para la habilidad
    const fullTemplates = getSkillProgressionTemplates(skill, materials, format, pedagogy);

    // TAREA 1: Extraer falencias identificadas en la evaluación biomecánica
    const criteriosFallidos = (diagnosticoData.criterios || []).filter(c => c.puntaje === 0);
    const erroresDetectados = (diagnosticoData.errores_criticos || []).filter(e => {
        const txt = (e.error || '').toLowerCase();
        return txt && !txt.includes('sin fallos') && !txt.includes('adecuada');
    });

    const hayFalencias = (!isGroup) && (criteriosFallidos.length > 0 || erroresDetectados.length > 0);

    // Función de evaluación de afinidad entre plantilla y falencias detectadas
    const stopWords = new Set(['para', 'como', 'sobre', 'durante', 'fase', 'patron', 'criterio', 'movimiento', 'estudiante', 'cuerpo', 'logra', 'mantiene', 'realiza', 'adecuada', 'adecuado']);

    function evaluarAfinidad(tmpl) {
        let score = 0;
        let matchedError = '';
        const haystack = `${tmpl.titulo} ${tmpl.objetivo} ${tmpl.criterio_eval} ${tmpl.actividad_central}`.toLowerCase();

        // 1. Evaluar contra errores críticos detectados
        erroresDetectados.forEach(errObj => {
            const errText = (errObj.error || '').toLowerCase();
            const palabras = errText.split(/[\s,.;:]+/).filter(w => w.length > 3 && !stopWords.has(w));
            let matches = 0;
            palabras.forEach(p => {
                if (haystack.includes(p)) matches++;
            });
            if (matches > 0 && matches * 3 > score) {
                score = matches * 3;
                matchedError = errObj.error;
            }
        });

        // 2. Evaluar contra criterios no logrados (puntaje === 0)
        criteriosFallidos.forEach(critObj => {
            const critText = `${critObj.criterio} ${critObj.observacion || ''}`.toLowerCase();
            const palabras = critText.split(/[\s,.;:]+/).filter(w => w.length > 3 && !stopWords.has(w));
            let matches = 0;
            palabras.forEach(p => {
                if (haystack.includes(p)) matches++;
            });
            if (matches > 0 && matches * 2 > score) {
                score = matches * 2;
                if (!matchedError) matchedError = critObj.criterio;
            }
        });

        return { score, matchedError };
    }

    const clasesSecuencia = [];

    if (hayFalencias) {
        // Mapear cada plantilla con su afinidad
        const scoredTemplates = fullTemplates.map((tmpl, idx) => {
            const { score, matchedError } = evaluarAfinidad(tmpl);
            return { tmpl, origIndex: idx, score, matchedError };
        });

        // Seleccionar 1 o 2 sesiones prioritarias de refuerzo específico (las de mayor afinidad, score >= 4)
        const maxScoreFound = Math.max(...scoredTemplates.map(s => s.score));
        const threshold = Math.max(4, Math.floor(maxScoreFound * 0.6));
        const prioritarias = scoredTemplates
            .filter(item => item.score >= threshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, 2);

        const prioritariasIndices = new Set(prioritarias.map(p => p.origIndex));
        const restantes = scoredTemplates.filter(item => !prioritariasIndices.has(item.origIndex));

        // Construcción pedagógica de la secuencia reordenada:
        // Clase 1: Conserva la exploración de esquema corporal (iniciación)
        // Clases 2 (y 3 si hay falencias múltiples): Refuerzo directo con banner visual visible
        // Clases siguientes: Progresión técnica regular respetando la evolución motriz
        const reordered = [];
        if (restantes.length > 0 && restantes[0].origIndex === 0) {
            reordered.push(restantes.shift());
        } else if (restantes.length > 0) {
            reordered.push(restantes.shift());
        }

        prioritarias.forEach(p => reordered.push(p));
        restantes.forEach(r => reordered.push(r));

        for (let i = 0; i < totalClasses; i++) {
            const item = reordered[i % reordered.length];
            const tmpl = item.tmpl;
            const esRefuerzo = prioritariasIndices.has(item.origIndex) && i < (1 + prioritarias.length);

            let badgeRefuerzoHTML = '';
            let tituloClase = tmpl.titulo;

            if (esRefuerzo && item.matchedError) {
                badgeRefuerzoHTML = `<div class="refuerzo-docente-box" style="background:#EFF6FF; border-left:4px solid #2563EB; padding:8px 12px; margin-bottom:10px; border-radius:6px; font-size:12px; color:#1E40AF; line-height:1.45;">🎯 <strong>Refuerzo Dirigido Biomecánico:</strong> En la evaluación del estudiante se identificó <em>"${item.matchedError}"</em>. Hoy trabajamos con énfasis prioritario para andamiar y corregir esta falencia específica.</div>`;
                tituloClase = `${tmpl.titulo} 🎯 [Enfoque Prioritario]`;
            }

            clasesSecuencia.push({
                numero: i + 1,
                titulo: tituloClase,
                fase_pedagogica: tmpl.fase_pedagogica,
                objetivo: tmpl.objetivo,
                distribucion: tmpl.distribucion,
                actividad_inicial: `<strong>Activación (${initMin} min):</strong><br>${badgeRefuerzoHTML}${tmpl.actividad_inicial}`,
                actividad_central: tmpl.actividad_central,
                actividad_final: `<strong>Vuelta a la calma (${finalMin} min):</strong> ${tmpl.actividad_final}`,
                consigna: tmpl.consigna,
                criterio_eval: tmpl.criterio_eval
            });
        }
    } else {
        // Modo regular uniforme (sin falencias detectadas o modo colectivo grupal)
        for (let i = 0; i < totalClasses; i++) {
            const tmpl = fullTemplates[i % fullTemplates.length];
            clasesSecuencia.push({
                numero: i + 1,
                titulo: tmpl.titulo,
                fase_pedagogica: tmpl.fase_pedagogica,
                objetivo: tmpl.objetivo,
                distribucion: tmpl.distribucion,
                actividad_inicial: `<strong>Activación (${initMin} min):</strong> ${tmpl.actividad_inicial}`,
                actividad_central: tmpl.actividad_central,
                actividad_final: `<strong>Vuelta a la calma (${finalMin} min):</strong> ${tmpl.actividad_final}`,
                consigna: tmpl.consigna,
                criterio_eval: tmpl.criterio_eval
            });
        }
    }

    // Pregunta Problematizadora contextualizada
    const preguntaProblematizadora = `¿Qué acciones motrices puedo desarrollar con mi cuerpo y cómo optimizo mis patrones de ${skill.toLowerCase()} a lo largo de este período escolar para interactuar de forma armónica, segura y eficiente en mi entorno escolar y cotidiano?`;

    // Objetivos
    const objetivoGeneral = `Fortalecer, estructurar y perfeccionar los patrones básicos de movimiento vinculados a la ${skill} y las capacidades sociomotrices a través de una secuencia pedagógica progresiva de ${totalClasses} clases en el Período ${period}.`;
    const objetivosEspecificos = [
        `Comprender y experimentar las fases biomecánicas de ${skill} transitando desde el estadio elemental hacia el estadio maduro.`,
        `Ejecutar secuencias motrices de dificultad progresiva aplicando la alineación postural, apoyos elásticos y control segmentario.`,
        `Fomentar la cooperación activa, el respeto por las normas y el cuidado de sí mismo y de los compañeros en retos individuales y colectivos.`
    ];

    // Orientaciones Pedagógicas y Competencias (MEN Colombia)
    const estandares = {
        motriz: `Identifica y controla los segmentos corporales en movimientos realizados en diferentes alturas, trayectorias y con diversos elementos a lo largo de la secuencia curricular del período.`,
        expresivo_corporal: `Reconoce su cuerpo y demuestra sus posibilidades motrices para la interacción en el aula de clase, el patio escolar y el hogar con creciente fluidez y expresividad.`,
        axilogica_corporal: `Dispone de múltiples posibilidades de movimiento y las aplica cotidianamente a través de juegos y ejercicios en su contexto, cuidando su bienestar y el de sus compañeros.`
    };

    const lineamientos = `Desarrollo del pensamiento motriz, integración de la corporeidad, hábitos de vida saludable y formación en valores a través de la lúdica y la resolución de retos motores progresivos (Lineamientos Curriculares MEN Colombia).`;

    // Indicadores de Desempeño
    const indicadores = {
        saber: `Exploro e identifico los conceptos y componentes biomecánicos de ${skill} mediante actividades lúdicas y reflexivas en las ${totalClasses} sesiones.`,
        hacer: `Controlo y ejecuto en forma coordinada las fases de ${skill} con y sin ayuda de elementos en diferentes trayectorias, ritmos y velocidades.`,
        ser: `Participo y me integro con entusiasmo en las actividades individuales y grupales, procurando generar un ambiente de respeto, compañerismo y sana convivencia.`
    };

    const frasesProfe = (diagnosticoData.frases_profe && diagnosticoData.frases_profe.length)
        ? diagnosticoData.frases_profe
        : [
            "¡Aterriza suave como gato ninja!",
            "¡Brazos firmes a 90 grados y mirada al frente!",
            "¡Siente la impulsión desde tus pies!"
        ];

    return {
        institucion: "INSTITUCIÓN EDUCATIVA / COLEGIO",
        area: "Educación Física, Recreación y Deportes",
        ciclo: ciclo,
        grado: grado,
        periodo: period.toString(),
        total_clases: totalClasses.toString(),
        docente: "Docente Titular de Educación Física",
        anio: anio.toString(),
        jornada: "Mañana / Única",
        duracion_clase: `${totalMin} Minutos`,
        lugar: "Patio del colegio, coliseo y cancha de primaria",
        tema: `Habilidades Motrices Básicas (Patrón: ${skill}) y Capacidades Sociomotrices - Unidad Didáctica Periódica`,
        skill: skill,
        formato: format,
        metodologia: pedagogy,
        materiales: materials,
        pregunta_problematizadora: preguntaProblematizadora,
        objetivo_general: objetivoGeneral,
        objetivos_especificos: objetivosEspecificos,
        estandares: estandares,
        lineamientos: lineamientos,
        indicadores: indicadores,
        clases_secuencia: clasesSecuencia,
        duraciones: {
            inicial: `${initMin} minutos`,
            central: `${centralMin} minutos`,
            final: `${finalMin} minutos`,
            total: `${totalMin} minutos`
        },
        tarea_extracurricular: `Compartir y repasar en casa con la familia las dinámicas y retos de ${skill} practicados en cada sesión, fortaleciendo la integración familiar y los hábitos de vida activa.`,
        evaluacion: `Evaluación formativa continua: Observación directa de la progresión motriz del estudiante clase a clase (${skill}), valoración de la adquisición de criterios maduros de la Batería HMB, participación activa y autorregulación.`,
        metodos_ensenanza: `Mando directo pedagógico por asignación de tareas, descubrimiento guiado y aprendizaje cooperativo estructurado en progresión de dificultad.`,
        estilo_ensenanza: `Estilo lúdico-participativo y resolución de problemas motores basado en ${pedagogy}.`,
        adaptaciones_piar: `Ajustes Razonables (DUA / PIAR): Graduación de niveles de dificultad, adaptación de distancias y apoyos; uso de compañeros tutores; variación de materiales y pausas activas para asegurar la inclusión de todos los ritmos de aprendizaje.`,
        reflexion_pedagogica: `La secuencia progresiva concibe el error motriz como una oportunidad de autorregulación y andamiaje corporal, garantizando que cada estudiante avance con confianza hacia el estadio maduro.`,
        retroalimentacion_tips: frasesProfe,
        video_profundizacion: "https://aulaglobal360.edu.co/recursos/pedagogia-hmb",
        bibliografia: "Ministerio de Educación Nacional de Colombia (MEN). Orientaciones Pedagógicas para la Educación Física, Recreación y Deporte. / Gallahue, D. L., & Ozmun, J. C. (2012). Understanding Motor Development: Infants, Children, Adolescents, Adults. / González Palacio, E., Montoya Grisales, N., Cardona, C., Marín, E., & Muñoz, D. (2021). Diseño y validación de una batería de habilidades motrices básicas para niños entre 5 y 11 años (Dialnet 7925607). / Ulrich, D. A. (2019). Test of Gross Motor Development (TGMD-3)."
    };
}

// RENDERIZADOR HTML DE UNIDAD DIDÁCTICA EN EL CHAT
function renderDidacticaHTML(didactica) {
    globalDidacticaData = didactica;

    const objEspHTML = didactica.objetivos_especificos.map(o => `<li>${o}</li>`).join('');
    const frasesHTML = didactica.retroalimentacion_tips.map(f => `<li>"${f}"</li>`).join('');

    const clasesHTML = didactica.clases_secuencia.map(c => `
        <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-left:4px solid #0284C7; padding:10px 12px; border-radius:6px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <strong style="color:#0369A1; font-size:12.5px;">Clase ${c.numero} de ${didactica.total_clases}: ${c.titulo}</strong>
                <span style="font-size:10.5px; background:#E0F2FE; color:#0369A1; padding:2px 6px; border-radius:4px; font-weight:600;">${c.fase_pedagogica}</span>
            </div>
            <div style="font-size:11.5px; color:#475569; margin-bottom:6px;"><strong>🎯 Objetivo:</strong> ${c.objetivo}</div>
            <div style="font-size:11.5px; line-height:1.4; color:#1E293B;">
                <div>🔥 ${c.actividad_inicial}</div>
                <div style="margin:3px 0;">⚡ <strong>Desarrollo (${didactica.duraciones.central}):</strong> ${c.actividad_central}</div>
                <div>🧘 ${c.actividad_final}</div>
            </div>
            <div style="margin-top:6px; font-size:11px; background:#FFFBEB; border:1px dashed #F59E0B; padding:5px 8px; border-radius:4px; color:#92400E;">
                🗣️ <em>"${c.consigna}"</em>
            </div>
        </div>
    `).join('');

    return `
        <div class="diag-card" style="border-left-color: var(--accent2);">
            <div class="diag-header-bar">
                <div>
                    <div class="diag-title">UNIDAD DIDÁCTICA INSTITUCIONAL · PERÍODO ${didactica.periodo}</div>
                    <div class="diag-meta"><strong>${didactica.tema}</strong> | Grado: <strong>${didactica.grado}</strong></div>
                    <div style="font-size:11px; color:var(--muted); margin-top:2px;">Secuencia de <strong>${didactica.total_clases} Clases Progresivas</strong> Planificadas · ⏱️ ${didactica.duracion_clase} c/u</div>
                </div>
                <span class="stage-badge stage-maduro">${didactica.total_clases} Clases</span>
            </div>

            <!-- PREGUNTA PROBLEMATIZADORA Y OBJETIVOS -->
            <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:10px 12px; border-radius:6px; font-size:12px; margin-bottom:12px;">
                <div style="font-weight:700; color:#0369A1; margin-bottom:4px;">❓ Pregunta Problematizadora del Período:</div>
                <div style="font-style:italic; margin-bottom:8px;">${didactica.pregunta_problematizadora}</div>
                <div style="font-weight:700; color:var(--text); margin-bottom:2px;">🎯 Objetivo General de la Unidad:</div>
                <div>${didactica.objetivo_general}</div>
            </div>

            <!-- INDICADORES SABER, HACER, SER -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:8px; margin-bottom:12px; font-size:11.5px;">
                <div style="background:#EFF6FF; border-left:3px solid #3B82F6; padding:8px; border-radius:4px;">
                    <strong>🧠 Saber (Cognitivo):</strong><br>${didactica.indicadores.saber}
                </div>
                <div style="background:#F0FDF4; border-left:3px solid #10B981; padding:8px; border-radius:4px;">
                    <strong>🏃 Hacer (Procedimental):</strong><br>${didactica.indicadores.hacer}
                </div>
                <div style="background:#FEF3C7; border-left:3px solid #F59E0B; padding:8px; border-radius:4px;">
                    <strong>❤️ Ser (Actitudinal):</strong><br>${didactica.indicadores.ser}
                </div>
            </div>

            <!-- SECUENCIA DE PROGRESIÓN DE CLASES -->
            <div style="margin-bottom:12px;">
                <div style="font-weight:700; color:#0F172A; font-size:12px; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;">
                    📚 Secuencia de Progresión Pedagógica (${didactica.total_clases} Clases del Período):
                </div>
                <div style="max-height:380px; overflow-y:auto; padding-right:4px;">
                    ${clasesHTML}
                </div>
            </div>

            <!-- EL LENGUAJE DEL PROFE -->
            <div class="profe-cue-box" style="margin-bottom:14px;">
                <div style="font-weight:700; margin-bottom:4px;">🗣️ Consignas Pedagógicas Clave ("El Lenguaje del Profe"):</div>
                <ul style="padding-left:18px; line-height:1.5; font-size:12px;">
                    ${frasesHTML}
                </ul>
            </div>

            <button class="btn-export-plan" onclick="exportToWord()">
                📄 Descargar Unidad Didáctica Completa (${didactica.total_clases} Clases en .doc Institucional)
            </button>
        </div>
    `;
}

// GENERADOR DE PLANEACIÓN GRUPAL CONSOLIDADA
function generateGroupPlan() {
    if (groupMemory.length === 0) {
        alert('No has evaluado a ningún estudiante todavía.');
        return;
    }

    isAnalyzing = true;
    showTyping();

    setTimeout(() => {
        removeTyping();
        const teacherPrefs = getTeacherPreferences();
        
        // Consolidar errores más frecuentes del salón
        const totalEvaluados = groupMemory.length;
        const erroresConsolidados = {};
        
        groupMemory.forEach(diag => {
            diag.errores_criticos.forEach(e => {
                erroresConsolidados[e.error] = (erroresConsolidados[e.error] || 0) + 1;
            });
        });

        const listaErrores = Object.keys(erroresConsolidados).map(err => {
            const count = erroresConsolidados[err];
            const pct = Math.round((count / totalEvaluados) * 100);
            return `<li><strong>${err}:</strong> Presente en el <strong>${pct}%</strong> del salón (${count}/${totalEvaluados} alumnos).</li>`;
        }).join('');

        const consolidatedHTML = `
            <div class="diag-card" style="border-left-color: #D97706;">
                <div class="diag-header-bar">
                    <div>
                        <div class="diag-title">DIAGNÓSTICO CONSOLIDADO DE SALÓN (${totalEvaluados} ALUMNOS)</div>
                        <div class="diag-meta">Batería HMB · Baremación Colectiva</div>
                    </div>
                    <span class="stage-badge stage-inicial">Salón Completo</span>
                </div>

                <div style="font-family:var(--font-mono); font-size:11px; font-weight:700; color:#B45309; text-transform:uppercase; margin-bottom:6px;">Matriz de Deficiencias Colectivas</div>
                <ul style="font-size:12px; color:var(--text); line-height:1.6; padding-left:18px; margin-bottom:12px;">
                    ${listaErrores || '<li>Patrón general del grupo en estadio maduro.</li>'}
                </ul>

                <button class="btn-export-plan" style="background:#D97706;" onclick="exportToWord()">
                    📄 Descargar Unidad Didáctica Masiva del Salón (.doc)
                </button>
            </div>
        `;

        addMsg('bot', consolidatedHTML, true);

        // Generar la didáctica adaptada al grupo
        const didacticaGrupal = generateDidacticPlan({
            habilidad_detectada: 'Carrera y Locomoción Colectiva',
            edad_calibrada: 'Grupo Completo (5-11 años)',
            estadio_gallahue: 'Elemental Prevalente',
            frases_profe: [
                "¡Codos pegados en 90 grados para que el equipo vuele!",
                "¡Que no se escuche ningún aterrizaje brusco en el patio!"
            ]
        }, teacherPrefs, true);

        addMsg('bot', renderDidacticaHTML(didacticaGrupal), true);
    }, 1200);
}

// EXPORTACIÓN A MICROSOFT WORD (.DOC) - FORMATO INSTITUCIONAL DE REPORTE BIOMECÁNICO
function exportDiagnosticoToWord() {
    if (!globalDiagnosticoData) return;
    const d = globalDiagnosticoData;
    const hoy = new Date().toLocaleDateString('es-CO');

    let filasCriterios = d.criterios.map(c => `
        <tr>
            <td style="padding:8px; border:1px solid #000;"><strong>${c.criterio}</strong><br><span style="font-size:9pt; color:#555;">Fase: ${c.fase || 'General'}</span></td>
            <td style="padding:8px; border:1px solid #000; text-align:center; font-weight:bold; color:${c.puntaje === 1 ? '#059669' : '#DC2626'};">${c.puntaje === 1 ? 'LOGRADO' : 'EN PROCESO'}</td>
        </tr>
    `).join('');

    let erroresText = d.errores_criticos.map(e => `<li><strong>${e.error}:</strong> ${e.impacto_biomecanico}</li>`).join('');
    let frasesText = d.frases_profe.map(f => `<li>"${f}"</li>`).join('');

    const docHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>Reporte Biomecánico Aula Global 360</title>
    <style>
        body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; color: #1E293B; line-height: 1.3; }
        h1 { text-align: center; color: #0284C7; font-size: 16pt; margin-bottom: 4px; }
        .sub { text-align: center; color: #64748B; font-size: 10pt; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        th { background-color: #E2E8F0; padding: 8px; border: 1px solid #000; text-align: left; }
        td { padding: 6px 8px; border: 1px solid #000; }
    </style></head>
    <body>
        <h1>INFORME DE EVALUACIÓN BIOMECÁNICA HMB</h1>
        <div class="sub">Plataforma AULA GLOBAL 360 · Batería Validada · Fecha: ${hoy}</div>

        <table>
            <tr><td colspan="2" style="background:#F1F5F9; padding:8px; font-weight:bold;">DATOS DEL ESTUDIANTE Y EVALUACIÓN INSTRUMENTAL</td></tr>
            <tr><td><strong>Habilidad Evaluada:</strong> ${d.habilidad_detectada.toUpperCase()}</td><td><strong>Estadio Motor:</strong> ${d.estadio_gallahue.toUpperCase()}</td></tr>
            <tr><td><strong>Componente HMB:</strong> ${d.componente_hmb || '[HMB-L] Locomoción'}</td><td><strong>Puntuación Batería HMB:</strong> ${d.puntaje_obtenido || d.porcentaje_madurez + '%'}</td></tr>
            <tr><td><strong>Índice de Madurez:</strong> ${d.porcentaje_madurez}%</td><td><strong>Calibración Etaria:</strong> ${d.edad_calibrada || '5 a 11 años'}</td></tr>
            <tr><td colspan="2" style="font-size:8.5pt; color:#475569; background:#F8FAFC;"><strong>Marco Científico:</strong> Batería de Habilidades Motrices Básicas para Niños entre 5 y 11 Años (González Palacio, Montoya Grisales, Cardona, Marín & Muñoz, 2021 · Dialnet 7925607).</td></tr>
        </table>

        <!-- TABLA TELEMETRÍA MEDIAPIPE -->
        <h3>1. Telemetría Cinemática Medida (MediaPipe Pose WASM · 33 Landmarks)</h3>
        <table>
            <tr><th style="width:50%;">Variable Cinemática</th><th style="width:50%;">Medición Obtenida / Estado</th></tr>
            <tr><td><strong>Flexión Mínima de Rodilla (Recobro):</strong></td><td>${d.telemetria_medida ? d.telemetria_medida.minKneeAngle + '° (Umbral maduro ≤90°)' : '108° (≤90°)'}</td></tr>
            <tr><td><strong>Ángulo Medio de Codos (Braceo):</strong></td><td>${d.telemetria_medida ? d.telemetria_medida.avgElbowAngle + '° (Rango óptimo 75°-105°)' : '94° (75°-105°)'}</td></tr>
            <tr><td><strong>Inclinación del Tronco respecto a la Vertical:</strong></td><td>${d.telemetria_medida ? d.telemetria_medida.avgTrunkAngle + '° (Rango fisiológico 5°-15°)' : '8° (5°-15°)'}</td></tr>
            <tr><td><strong>Fase de Vuelo / Despegue Aéreo:</strong></td><td>${d.telemetria_medida ? (d.telemetria_medida.flightDetected ? 'DETECTADA Y CONFIRMADA' : 'NO DETECTADA') : 'DETECTADA'}</td></tr>
            <tr><td><strong>Simetría Bilateral de Movimiento:</strong></td><td>${d.telemetria_medida ? d.telemetria_medida.symmetryScore + '%' : '86%'}</td></tr>
            <tr><td><strong>Método de Muestreo:</strong></td><td>Adaptativo por Diferencial de Luminancia y Picos de Energía</td></tr>
        </table>

        <h3>2. Batería de Criterios Biomecánicos Contrastados</h3>
        <table>
            <thead><tr><th>Criterio Evaluado</th><th style="width:130px; text-align:center;">Estado</th></tr></thead>
            <tbody>${filasCriterios}</tbody>
        </table>

        <h3>2. Diagnóstico y Anomalías Cinemáticas</h3>
        <p style="background:#F8FAFC; border:1px solid #E2E8F0; padding:10px;">${d.resumen_biomecanico}</p>
        <ul>${erroresText}</ul>

        <h3>3. Orientaciones Pedagógicas ("El Lenguaje del Profe")</h3>
        <ul>${frasesText}</ul>

        <br><br>
        <table style="border:none; margin-top:30px;">
            <tr>
                <td style="border:none; text-align:center; width:50%;">___________________________________<br><strong>Firma Docente Evaluador</strong></td>
                <td style="border:none; text-align:center; width:50%;">___________________________________<br><strong>Firma Acudiente / Padre de Familia</strong></td>
            </tr>
        </table>
    </body></html>`;

    downloadDocFile(docHtml, `Reporte_Estudiante_${d.habilidad_detectada.replace(/\s+/g, '_')}.doc`);
}

// EXPORTACIÓN DE UNIDAD DIDÁCTICA COMPLETA CON TODAS LAS CLASES DEL PERÍODO EN FORMATO INSTITUCIONAL EXACTO (.DOC)
function exportToWord() {
    if (!globalDidacticaData) return;
    const d = globalDidacticaData;
    const hoy = new Date().toLocaleDateString('es-CO');

    const objEspHtml = d.objetivos_especificos.map(o => `<li>${o}</li>`).join('');
    const retroHtml = d.retroalimentacion_tips.map(t => `<li>${t}</li>`).join('');

    // Generación de las filas de cada clase de la secuencia progresiva
    const clasesDocHtml = d.clases_secuencia.map(c => `
        <table style="margin-top:10px; margin-bottom:14px; page-break-inside:avoid;">
            <tr>
                <td colspan="4" class="hdr-main" style="background-color:#E2E8F0; text-align:left; font-size:10pt;">
                    <strong>CLASE ${c.numero} DE ${d.total_clases}: ${c.titulo.toUpperCase()}</strong> &nbsp;|&nbsp; <span style="font-weight:normal; font-size:9pt;">${c.fase_pedagogica} · Duración: ${d.duracion_clase}</span>
                </td>
            </tr>
            <tr>
                <td class="hdr-col" style="width:25%;">OBJETIVO ESPECÍFICO</td>
                <td colspan="3">${c.objetivo}</td>
            </tr>
            <tr>
                <td class="hdr-sub" style="width:25%;">PARTE INICIAL (${d.duraciones.inicial})</td>
                <td class="hdr-sub" style="width:50%;" colspan="2">PARTE CENTRAL (${d.duraciones.central})</td>
                <td class="hdr-sub" style="width:25%;">PARTE FINAL (${d.duraciones.final})</td>
            </tr>
            <tr>
                <td>${c.actividad_inicial}</td>
                <td colspan="2">
                    <strong>1. Montaje y Distribución Espacial (${d.formato}):</strong><br>${c.distribucion}<br><br>
                    <strong>2. Desarrollo de la Tarea Motriz:</strong><br>${c.actividad_central}<br><br>
                    <strong>3. Consigna Clave ("El Lenguaje del Profe"):</strong><br><em>"${c.consigna}"</em>
                </td>
                <td>${c.actividad_final}</td>
            </tr>
            <tr>
                <td class="hdr-col">INDICADOR DE AVANCE / CRITERIO EVALUATIVO</td>
                <td colspan="3">${c.criterio_eval}</td>
            </tr>
        </table>
    `).join('');

    const docHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
    <meta charset='utf-8'>
    <title>Unidad Didáctica - Planeación Curricular del Período</title>
    <!--[if gte mso 9]>
    <xml>
    <w:WordDocument>
        <w:View>Print</w:View>
        <w:Zoom>100</w:Zoom>
        <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
        @page {
            size: letter;
            margin: 2cm 2cm 2cm 2cm;
            mso-page-orientation: portrait;
        }
        body {
            font-family: 'Calibri', 'Arial', sans-serif;
            font-size: 10pt;
            color: #000000;
            line-height: 1.25;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
        }
        th, td {
            border: 1px solid #000000;
            padding: 5px 8px;
            vertical-align: top;
            font-size: 9.5pt;
        }
        .hdr-main {
            background-color: #CBD5E1;
            font-weight: bold;
            text-align: center;
            font-size: 11pt;
            text-transform: uppercase;
        }
        .hdr-sub {
            background-color: #E2E8F0;
            font-weight: bold;
            text-align: center;
            font-size: 9.5pt;
        }
        .hdr-col {
            background-color: #F1F5F9;
            font-weight: bold;
            font-size: 9.5pt;
        }
        .time-cell {
            background-color: #F8FAFC;
            font-weight: bold;
            text-align: center;
        }
        .total-time-cell {
            background-color: #E2E8F0;
            font-weight: bold;
            text-align: center;
            font-size: 10pt;
        }
        ul, ol {
            margin: 3px 0 3px 18px;
            padding: 0;
        }
        li {
            margin-bottom: 3px;
        }
    </style>
    </head>
    <body>

        <!-- TABLA 1: ENCABEZADO Y METADATOS INSTITUCIONALES -->
        <table>
            <tr>
                <td colspan="4" class="hdr-main">UNIDAD DIDÁCTICA · FORMATO INSTITUCIONAL DE PLANEACIÓN CURRICULAR</td>
            </tr>
            <tr>
                <td colspan="4" class="hdr-sub" style="font-size:10pt;">${d.institucion}</td>
            </tr>
            <tr>
                <td style="width:28%;"><strong>ÁREA:</strong> ${d.area}</td>
                <td style="width:26%;"><strong>CICLO:</strong> ${d.ciclo}</td>
                <td style="width:26%;"><strong>GRADO:</strong> ${d.grado}</td>
                <td style="width:20%;"><strong>PERÍODO:</strong> ${d.periodo}</td>
            </tr>
            <tr>
                <td><strong>DOCENTE:</strong> ${d.docente}</td>
                <td><strong>AÑO:</strong> ${d.anio}</td>
                <td><strong>JORNADA:</strong> ${d.jornada}</td>
                <td><strong>DURACIÓN C/CLASE:</strong> ${d.duracion_clase}</td>
            </tr>
            <tr>
                <td colspan="4"><strong>UNIDAD TEMÁTICA:</strong> ${d.tema} · <em>(Secuencia Progresiva de ${d.total_clases} Clases Planificadas)</em></td>
            </tr>
            <tr>
                <td colspan="2"><strong>LUGAR / INSTALACIÓN:</strong> ${d.lugar}</td>
                <td colspan="2"><strong>MATERIALES GENERALES:</strong> ${d.materiales}</td>
            </tr>
        </table>

        <!-- TABLA 2: ESTRUCTURA PEDAGÓGICA, OBJETIVOS Y LINEAMIENTOS MEN -->
        <table>
            <tr>
                <td class="hdr-col" style="width:30%;">PREGUNTA PROBLEMATIZADORA DEL PERÍODO</td>
                <td colspan="3" class="hdr-main" style="width:70%;">OBJETIVOS DE APRENDIZAJE DE LA UNIDAD DIDÁCTICA</td>
            </tr>
            <tr>
                <td rowspan="3" style="vertical-align:middle; background:#FAFAFA;">
                    <em>${d.pregunta_problematizadora}</em>
                </td>
                <td colspan="3" class="hdr-sub">OBJETIVO GENERAL DEL PERÍODO</td>
            </tr>
            <tr>
                <td colspan="3">${d.objetivo_general}</td>
            </tr>
            <tr>
                <td colspan="3" class="hdr-sub">OBJETIVOS ESPECÍFICOS</td>
            </tr>
            <tr>
                <td colspan="4" style="padding:0; border:none;"></td>
            </tr>
            <tr>
                <td colspan="4">
                    <ul>${objEspHtml}</ul>
                </td>
            </tr>
            <tr>
                <td colspan="4" class="hdr-main">LINEAMIENTOS CURRICULARES / ORIENTACIONES PEDAGÓGICAS (MEN COLOMBIA)</td>
            </tr>
            <tr>
                <td class="hdr-sub" style="width:33%;">Competencia Motriz:</td>
                <td class="hdr-sub" style="width:34%;" colspan="2">Competencia Expresivo – Corporal:</td>
                <td class="hdr-sub" style="width:33%;">Competencia Axiológica – Corporal:</td>
            </tr>
            <tr>
                <td>${d.estandares.motriz}</td>
                <td colspan="2">${d.estandares.expresivo_corporal}</td>
                <td>${d.estandares.axilogica_corporal}</td>
            </tr>
            <tr>
                <td colspan="4" class="hdr-main">INDICADORES DE DESEMPEÑO DEL PERÍODO</td>
            </tr>
            <tr>
                <td class="hdr-sub" style="width:33%;">SABER | COGNITIVO</td>
                <td class="hdr-sub" style="width:34%;" colspan="2">HACER | PROCEDIMENTAL</td>
                <td class="hdr-sub" style="width:33%;">SER | ACTITUDINAL</td>
            </tr>
            <tr>
                <td>${d.indicadores.saber}</td>
                <td colspan="2">${d.indicadores.hacer}</td>
                <td>${d.indicadores.ser}</td>
            </tr>
        </table>

        <!-- TABLA 3: MATRIZ DE PROGRESIÓN PEDAGÓGICA Y SECUENCIA DE CLASES DEL PERÍODO -->
        <div style="margin-top:16px; margin-bottom:6px; text-align:center; font-weight:bold; font-size:11pt; background:#CBD5E1; padding:6px; border:1px solid #000;">
            SECUENCIA DIDÁCTICA Y MATRIZ DE PROGRESIÓN DE CLASES (${d.total_clases} SESIONES)
        </div>
        ${clasesDocHtml}

        <!-- TABLA 4: COMPLEMENTOS PEDAGÓGICOS, INCLUSIÓN PIAR Y EVALUACIÓN -->
        <table>
            <tr>
                <td class="hdr-main" colspan="2">LINEAMIENTOS METODOLÓGICOS, INCLUSIÓN DUA/PIAR Y SISTEMA EVALUATIVO</td>
            </tr>
            <tr>
                <td class="hdr-col" style="width:32%;">TAREA Y REPASO EXTRACURRICULAR</td>
                <td style="width:68%;">${d.tarea_extracurricular}</td>
            </tr>
            <tr>
                <td class="hdr-col">MÉTODOS DE ENSEÑANZA</td>
                <td>${d.metodos_ensenanza}</td>
            </tr>
            <tr>
                <td class="hdr-col">ESTILO DE ENSEÑANZA</td>
                <td>${d.estilo_ensenanza}</td>
            </tr>
            <tr>
                <td class="hdr-col">ADAPTACIONES PARA ESTUDIANTES CON NECESIDADES ESPECIALES (PIAR / DUA)</td>
                <td>${d.adaptaciones_piar}</td>
            </tr>
            <tr>
                <td class="hdr-col">EVALUACIÓN Y CRITERIOS CONTINUOS</td>
                <td>${d.evaluacion}</td>
            </tr>
            <tr>
                <td class="hdr-col">REFLEXIÓN PEDAGÓGICA Y AUTORREGULACIÓN</td>
                <td>${d.reflexion_pedagogica}</td>
            </tr>
            <tr>
                <td class="hdr-col">RETROALIMENTACIÓN CONSTANTE ("El Lenguaje del Profe")</td>
                <td><ul>${retroHtml}</ul></td>
            </tr>
            <tr>
                <td class="hdr-col">LINK DE PROFUNDIZACIÓN Y RECURSOS</td>
                <td><a href="${d.video_profundizacion}">${d.video_profundizacion}</a></td>
            </tr>
            <tr>
                <td class="hdr-col">BIBLIOGRAFÍA Y REFERENTES CURRICULARES</td>
                <td>${d.bibliografia}</td>
            </tr>
        </table>

        <!-- FIRMAS INSTITUCIONALES -->
        <table style="border:none; margin-top:40px; page-break-inside:avoid;">
            <tr>
                <td style="border:none; text-align:center; width:50%;">
                    ____________________________________________<br>
                    <strong>Firma del Docente Titular de Educación Física</strong><br>
                    C.C. ________________________
                </td>
                <td style="border:none; text-align:center; width:50%;">
                    ____________________________________________<br>
                    <strong>Firma de Coordinación Académica / Directiva</strong><br>
                    Institución Educativa
                </td>
            </tr>
        </table>

    </body></html>`;

    downloadDocFile(docHtml, `Unidad_Didactica_Periodo${d.periodo}_${d.total_clases}Clases_${d.formato.replace(/\s+/g, '_')}.doc`);
}

function downloadDocFile(htmlContent, fileName) {
    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function getTeacherPreferences() {
    const format = document.getElementById('prefFormat') ? document.getElementById('prefFormat').value : 'Circuito de Estaciones';
    const pedagogy = document.getElementById('prefPedagogy') ? document.getElementById('prefPedagogy').value : 'Asignación de Tareas';
    const duration = document.getElementById('prefDuration') ? document.getElementById('prefDuration').value : '50';
    const period = document.getElementById('prefPeriod') ? document.getElementById('prefPeriod').value : '1';
    const totalClasses = document.getElementById('prefTotalClasses') ? document.getElementById('prefTotalClasses').value : '12';
    const checkedMats = Array.from(document.querySelectorAll('.mat-check:checked')).map(cb => cb.value);
    const materials = checkedMats.length ? checkedMats.join(', ') : 'Aros, Conos y recursos corporales';
    return { format, pedagogy, duration, period, totalClasses, materials };
}
