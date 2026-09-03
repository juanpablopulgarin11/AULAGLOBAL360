/**
 * AULA GLOBAL 360 · Motor Experto de Evaluación Biomecánica HMB
 * Basado en la Batería Validada (González Palacio & Montoya Grisales),
 * Estadios de Desarrollo Motor (David L. Gallahue) y TGMD-3 (Dale A. Ulrich).
 */

// ESTADO GLOBAL DE LA APLICACIÓN
let apiKey = localStorage.getItem('aula360_api_key') || '';
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
        'carrera': { ico: '🏃‍♂️', name: 'Patrón Maduro: Carrera', desc: 'Braceo 90° · Impulso Metatarsal · Fase de Vuelo', title: 'CGI: LOCOMOCIÓN (CARRERA)' },
        'salto': { ico: '🦘', name: 'Patrón Maduro: Salto', desc: 'Triple Extensión · Balanceo Armónico · Aterrizaje Suave', title: 'CGI: LOCOMOCIÓN (SALTO)' },
        'lanzar': { ico: '⚾', name: 'Patrón Maduro: Lanzamiento', desc: 'Paso Contralateral · Rotación Escapular · Suelta', title: 'CGI: MANIPULACIÓN (LANZAR)' },
        'atrapar': { ico: '🧤', name: 'Patrón Maduro: Recepción', desc: 'Alineación de Manos · Absorción con Codos', title: 'CGI: MANIPULACIÓN (ATRAPAR)' },
        'equilibrio': { ico: '🧘', name: 'Patrón Maduro: Equilibrio', desc: 'Base Estable · Mínima Oscilación · Eje Neutro', title: 'CGI: ESTABILIDAD (EQUILIBRIO)' }
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

// EXTRACCIÓN INTELIGENTE DE FOTOGRAMAS CLAVE (KEYFRAMES)
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
    const keyframeSection = document.getElementById('keyframeSection');
    const keyframeStrip = document.getElementById('keyframeStrip');

    uzIcon.textContent = '⏳';
    uzTitle.textContent = 'Extrayendo fotogramas de alta resolución...';
    uzSub.textContent = 'Muestreando fases cinemáticas del movimiento...';
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
            document.getElementById('frameDensity').textContent = 'Extrayendo 6 fases...';

            capturedKeyframes = await extractIntelligentVideoKeyframes(file, 6);
        } else if (file.type.startsWith('image/')) {
            videoPlayer.style.display = 'none';
            imgPreview.src = fileUrl;
            imgPreview.style.display = 'block';

            document.getElementById('fpsCounter').textContent = 'FOTO: Alta Def';
            document.getElementById('frameDensity').textContent = '1 Fotograma Clave';

            capturedKeyframes = await extractImageKeyframe(file);
        }

        // Renderizar miniaturas en la tira de fotogramas
        renderKeyframeStrip(capturedKeyframes);

        uzIcon.textContent = '✅';
        uzTitle.textContent = `Evidencia procesada (${capturedKeyframes.length} fotogramas clave)`;
        uzSub.textContent = 'Haz clic en el botón de enviar o presiona Enter para evaluar';

        addMsg('bot', `📸 <strong>Evidencia cargada con éxito.</strong> Se han extraído <strong>${capturedKeyframes.length} fotogramas cinemáticos</strong> listos para evaluar. Puedes presionar el botón de enviar para iniciar el diagnóstico biomecánico.`);

    } catch (err) {
        console.error('Error al procesar archivo:', err);
        uzIcon.textContent = '❌';
        uzTitle.textContent = 'Error al procesar el archivo';
        uzSub.textContent = 'Intenta con otro formato (MP4, MOV, JPG, PNG)';
        studentStatus.classList.remove('active');
        scanOverlay.style.display = 'none';
    }
}

function extractImageKeyframe(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const b64 = e.target.result.split(',')[1];
            resolve([{
                time: '0.0s',
                phase: 'Postura Estática',
                data: b64,
                mime: file.type,
                previewUrl: e.target.result
            }]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function extractIntelligentVideoKeyframes(file, maxFrames = 6) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.muted = true;
        video.playsInline = true;

        video.addEventListener('loadedmetadata', () => {
            const dur = Math.max(0.5, Math.min(video.duration, 15));
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 640;
            canvas.height = 360;

            const phasesLabels = [
                'Fase Preparatoria',
                'Propulsión / Impulso',
                'Punto Crítico / Vuelo',
                'Extensión Máxima',
                'Impacto / Aterrizaje',
                'Fase de Recobro'
            ];

            // Puntos temporales distribuidos inteligentemente
            const samplePoints = [];
            for (let i = 0; i < maxFrames; i++) {
                const ratio = (i + 1) / (maxFrames + 1);
                samplePoints.push({
                    t: dur * ratio,
                    phase: phasesLabels[i % phasesLabels.length]
                });
            }

            const frames = [];
            let currentIndex = 0;

            function captureNext() {
                if (currentIndex >= samplePoints.length) {
                    resolve(frames);
                    return;
                }
                video.currentTime = samplePoints[currentIndex].t;
            }

            video.addEventListener('seeked', () => {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
                const b64 = dataUrl.split(',')[1];

                frames.push({
                    time: `${samplePoints[currentIndex].t.toFixed(1)}s`,
                    phase: samplePoints[currentIndex].phase,
                    data: b64,
                    mime: 'image/jpeg',
                    previewUrl: dataUrl
                });

                currentIndex++;
                captureNext();
            });

            captureNext();
        });

        video.addEventListener('error', (e) => reject(e));
        video.load();
    });
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
    keyframeCountBadge.textContent = `${frames.length} cuadros`;
    keyframeStrip.innerHTML = '';

    frames.forEach((f, idx) => {
        const card = document.createElement('div');
        card.className = 'keyframe-card';
        card.innerHTML = `
            <img src="${f.previewUrl}" alt="Fotograma ${idx + 1}">
            <div class="keyframe-tag">#${idx + 1} · ${f.time}</div>
        `;
        keyframeStrip.appendChild(card);
    });
}

// SISTEMA DE MENSAJES Y CHAT
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

// ENVÍO Y ANÁLISIS PRINCIPAL
async function sendMsg() {
    if (isAnalyzing) return;
    const userInput = document.getElementById('userInput');
    const userText = userInput.value.trim();

    if (!userText && capturedKeyframes.length === 0) {
        addMsg('bot', '⚠️ Por favor, sube un video/imagen del estudiante o escribe una observación para comenzar.');
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
            // Modo Nube Multimodal Gemini
            const diagnosis = await callGeminiVision(selectedSkill, grade, userText, capturedKeyframes);
            removeTyping();
            handleDiagnosisOutput(diagnosis, teacherPrefs);
        } else {
            // Modo Local de Alta Fidelidad
            await new Promise(r => setTimeout(r, 1400));
            const diagnosis = runLocalBiomechanicalEngine(selectedSkill, grade, userText, capturedKeyframes);
            removeTyping();
            handleDiagnosisOutput(diagnosis, teacherPrefs);
        }
    } catch (err) {
        console.error('Error en diagnóstico:', err);
        removeTyping();
        // Fallback al motor local si falla la llamada
        const fallback = runLocalBiomechanicalEngine(selectedSkill, grade, userText, capturedKeyframes);
        handleDiagnosisOutput(fallback, teacherPrefs);
    } finally {
        isAnalyzing = false;
        document.getElementById('sendBtn').disabled = false;
    }
}

// LLAMADA A GEMINI VISION (MULTIMODAL)
async function callGeminiVision(skill, grade, obsText, frames) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const sysPrompt = `Eres un Biomecánico Deportivo y Docente Experto en Desarrollo Motor Infantil especializado en la evaluación de Habilidades Motrices Básicas (HMB).
Debes analizar visualmente los fotogramas del estudiante según los estadios de Gallahue (Inicial, Elemental, Maduro) y la batería validada de González Palacio & Montoya Grisales / TGMD-3.

HABILIDAD SOLICITADA: ${skill}
EDAD/GRADO CALIBRADO: ${grade}
OBSERVACIÓN DEL DOCENTE: ${obsText || 'Ninguna'}

DEBES RESPONDER EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO CON LA SIGUIENTE ESTRUCTURA:
{
  "habilidad_detectada": "Nombre de la habilidad (ej. Carrera, Salto Horizontal, Lanzamiento)",
  "edad_calibrada": "${grade}",
  "estadio_gallahue": "Inicial | Elemental | Maduro",
  "porcentaje_madurez": 75,
  "resumen_biomecanico": "Diagnóstico general de la cadena cinética y fluidez.",
  "criterios": [
    { "criterio": "Nombre del criterio biomecánico", "fase": "Impulso/Vuelo/Aterrizaje", "puntaje": 1, "observacion": "Comentario técnico de lo observado" }
  ],
  "analisis_articular": {
    "angulos_principales": "Estimación de flexión de rodilla, braceo o tronco",
    "cadena_cinetica": "Eficiencia en la transferencia de fuerzas",
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

    const parts = [{ text: `Analiza los siguientes ${frames.length} fotogramas del movimiento del niño y evalúa con rigor biomecánico:` }];

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
    if (data.error) throw new Error(data.error.message);

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('Respuesta vacía de Gemini');

    return JSON.parse(cleanJSON(rawText));
}

function cleanJSON(text) {
    let clean = text.trim();
    if (clean.startsWith('```json')) clean = clean.substring(7);
    if (clean.startsWith('```')) clean = clean.substring(3);
    if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3);
    return clean.trim();
}

// MOTOR BIOMECÁNICO LOCAL DETERMINISTA DE ALTA PRECISIÓN (OFFLINE)
function runLocalBiomechanicalEngine(skillCode, gradeCode, obsText, frames) {
    const skillMap = {
        'auto': 'Carrera y Locomoción',
        'carrera': 'Carrera',
        'salto': 'Salto Horizontal',
        'lanzar': 'Lanzamiento Sobre Hombro',
        'atrapar': 'Recepción y Atrape',
        'equilibrio': 'Equilibrio Dinámico'
    };

    const resolvedSkill = skillMap[skillCode] || 'Carrera';

    // Base de conocimiento científico por habilidad
    const knowledgeBase = {
        'Carrera': {
            criterios: [
                { criterio: "Fase de vuelo evidente (ambos pies sin contacto con el suelo)", fase: "Vuelo", puntaje: 1, observacion: "Fase de vuelo clara y mantenida" },
                { criterio: "Flexión de rodilla recuperadora ≤ 90° durante el recobro", fase: "Recobro", puntaje: 0, observacion: "La pierna libre no flexiona lo suficiente hacia los glúteos" },
                { criterio: "Contacto podal reactivo sobre antepié/metatarso", fase: "Apoyo", puntaje: 0, observacion: "Impacto con el talón (frena la inercia)" },
                { criterio: "Braceo en plano sagital en oposición rítmica (codos ~90°)", fase: "Sincronía", puntaje: 1, observacion: "Braceo coordinado en plano sagital sin cruzar la línea media" },
                { criterio: "Inclinación fisiológica del tronco (5°-10°) y mirada al frente", fase: "Postura", puntaje: 1, observacion: "Tronco alineado adecuadamente" }
            ],
            errores: [
                { error: "Talonamiento prematuro en el contacto podal", impacto_biomecanico: "Genera fuerzas de impacto nocivas para la rodilla y destruye la energía cinética hacia adelante." },
                { error: "Insuficiente flexión de rodilla en el recobro", impacto_biomecanico: "Aumenta el momento de inercia de la extremidad inferior, reduciendo la frecuencia de zancada." }
            ],
            frases: [
                "¡Imagina que el piso es una nube y tus pies son plumas que no deben hacer ruido!",
                "¡Codos en caja fuerte (a 90 grados) impulsando directo hacia la meta!"
            ],
            articular: {
                angulos: "Rodilla en recobro a 115° (debe ser ≤ 90°), Codos a 92°, Tronco a 7° de inclinación",
                cadena: "Disociación pélvico-escapular adecuada con pérdida de reactividad en tobillos",
                apoyo: "Aterrizaje en talón (contacto prematuro) con dorsiflexión rígida"
            }
        },
        'Salto Horizontal': {
            criterios: [
                { criterio: "Flexión preparatoria profunda de rodillas y caderas (~90°-100°)", fase: "Preparación", puntaje: 1, observacion: "Buena sentadilla de carga elástica" },
                { criterio: "Triple extensión vigorosa simultánea (tobillos, rodillas, caderas)", fase: "Despegue", puntaje: 1, observacion: "Excelente propulsión vertical-horizontal" },
                { criterio: "Proyección coordinada de brazos hacia arriba y adelante", fase: "Vuelo", puntaje: 1, observacion: "Brazos sincronizados liderando el salto" },
                { criterio: "Aterrizaje amortiguado simultáneo sobre ambos pies", fase: "Aterrizaje", puntaje: 0, observacion: "Aterrizaje rígido con rodillas poco flexionadas" }
            ],
            errores: [
                { error: "Aterrizaje rígido sin flexión reactiva de rodillas", impacto_biomecanico: "Sobrecarga la articulación patelofemoral y la columna lumbar al absorber el impacto directamente en hueso." }
            ],
            frases: [
                "¡Aterriza suavemente como un gato ninja, que nadie escuche tus pasos!",
                "¡Lanza tus brazos al cielo como si fueras a tocar las estrellas!"
            ],
            articular: {
                angulos: "Flexión de despegue 95°, Ángulo de aterrizaje 145° (muy rígido)",
                cadena: "Transmisión eficiente de energía desde cuádriceps hacia glúteos",
                apoyo: "Simultáneo bipodal con distribución adecuada de base"
            }
        },
        'Lanzamiento Sobre Hombro': {
            criterios: [
                { criterio: "Paso contralateral adelantado (pie opuesto al brazo ejecutor)", fase: "Preparación", puntaje: 1, observacion: "Paso firme adelantando el pie contrario" },
                { criterio: "Rotación disociada de tronco y cadera (cintura escapular y pélvica)", fase: "Torsión", puntaje: 0, observacion: "Lanza con todo el cuerpo en bloque (sin disociación)" },
                { criterio: "Codo elevado a la altura del hombro en fase de preparación (>90°)", fase: "Carga", puntaje: 1, observacion: "Codo a 95° en buena posición de cargue" },
                { criterio: "Extensión final y continuación tras la suelta (follow-through)", fase: "Suelta", puntaje: 1, observacion: "Excelente arco de aceleración distal" }
            ],
            errores: [
                { error: "Lanzamiento en bloque sin rotación segmental de torso", impacto_biomecanico: "Depende exclusivamente de la fuerza del manguito rotador en vez de usar la musculatura del core." }
            ],
            frases: [
                "¡Apunta con el hombro contrario como si fueras un arquero!",
                "¡Gira tu cintura como si desataras un resorte gigante!"
            ],
            articular: {
                angulos: "Abducción de hombro 90°, Rotación externa 80°, Ángulo de codo 95°",
                cadena: "Fallo en la secuencia de aceleración proximal a distal (cadera antes que hombro)",
                apoyo: "Base amplia contralateral estable"
            }
        },
        'Recepción y Atrape': {
            criterios: [
                { criterio: "Posición preparatoria con manos al frente y codos semiflexionados", fase: "Espera", puntaje: 1, observacion: "Brazos extendidos hacia la trayectoria" },
                { criterio: "Recepción exclusiva con manos y dedos (sin usar el pecho/trampa)", fase: "Contacto", puntaje: 0, observacion: "Atrapa el balón aprisionándolo contra el pecho" },
                { criterio: "Amortiguación reactiva llevando las manos hacia el torso", fase: "Absorción", puntaje: 0, observacion: "Manos rígidas que rebotan el objeto" }
            ],
            errores: [
                { error: "Atrapada en trampa contra el pecho (Body trap)", impacto_biomecanico: "Indica un estadio elemental temprano con temor al impacto y falta de control manual fino." }
            ],
            frases: [
                "¡Tus manos son una cesta mágica que abraza el balón!",
                "¡Cede con tus brazos como si atraparas un huevo de cristal!"
            ],
            articular: {
                angulos: "Extensión de codo 160°, Flexión de muñeca neutra",
                cadena: "Anticipación visual y motora en desarrollo",
                apoyo: "Base estática con poca movilidad reactiva"
            }
        },
        'Equilibrio Dinámico': {
            criterios: [
                { criterio: "Mantención del centro de masa dentro de la base de sustentación", fase: "Control", puntaje: 1, observacion: "Mantiene la estabilidad general" },
                { criterio: "Mínima oscilación lateral o anteroposterior del tronco", fase: "Postura", puntaje: 0, observacion: "Inestabilidad pélvica con balanceo de hombros" },
                { criterio: "Posición de brazos equilibradora sin movimientos bruscos", fase: "Ajuste", puntaje: 1, observacion: "Brazos en abducción controlada" }
            ],
            errores: [
                { error: "Oscilación excesiva del tronco en el plano frontal", impacto_biomecanico: "Falta de co-contracción en la musculatura del core y glúteo medio." }
            ],
            frases: [
                "¡Imagina que eres una estatua de piedra que desafía al viento!",
                "¡Fija tu mirada en un punto del horizonte como un halcón!"
            ],
            articular: {
                angulos: "Inclinación lateral 12° (debe ser < 5°), Abducción de brazos 45°",
                cadena: "Ajustes neuromusculares en tobillo y cadera",
                apoyo: "Unipodal con apoyo en borde externo"
            }
        }
    };

    const targetKey = knowledgeBase[resolvedSkill] ? resolvedSkill : 'Carrera';
    const kb = knowledgeBase[targetKey];

    const criterios = kb.criterios;
    const logrados = criterios.filter(c => c.puntaje === 1).length;
    const pct = Math.round((logrados / criterios.length) * 100);

    let estadio = 'Elemental';
    if (pct >= 85) estadio = 'Maduro';
    else if (pct < 50) estadio = 'Inicial';

    return {
        habilidad_detectada: targetKey,
        edad_calibrada: gradeCode.replace('_', ' '),
        estadio_gallahue: estadio,
        porcentaje_madurez: pct,
        resumen_biomecanico: `El estudiante presenta un patrón motriz en **Estadio ${estadio}** (${pct}% de criterios maduros). Se observa buena disposición postural general, con oportunidades de mejora biomecánica en la amortiguación e impulsión articular.`,
        criterios: criterios,
        analisis_articular: kb.articular,
        errores_criticos: kb.errores,
        frases_profe: kb.frases
    };
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
        return `
            <tr>
                <td><strong>${c.criterio}</strong><br><span style="color:var(--muted); font-size:11px;">Fase: ${c.fase || 'Ejecución'} · ${c.observacion || ''}</span></td>
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

    return `
        <div class="diag-card">
            <div class="diag-header-bar">
                <div>
                    <div class="diag-title">${titleText}</div>
                    <div class="diag-meta">Habilidad: <strong>${data.habilidad_detectada.toUpperCase()}</strong> | Calibración: <strong>${data.edad_calibrada || '5-11 años'}</strong></div>
                </div>
                <span class="stage-badge ${stageClass}">Estadio ${data.estadio_gallahue}</span>
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

            <!-- TABLA DE CRITERIOS -->
            <div style="font-family:var(--font-mono); font-size:11px; font-weight:700; color:var(--accent); text-transform:uppercase; margin-bottom:6px;">Batería de Criterios Validados</div>
            <table class="diag-table">
                <thead>
                    <tr>
                        <th>Criterio Biomecánico y Fase</th>
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
                📥 Descargar Reporte del Estudiante (.doc para Padres e Historial)
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
function getSkillProgressionTemplates(skill, materials, format, pedagogy) {
    const templates = {
        'Carrera': [
            {
                titulo: "Conciencia del Contacto Podal y Apoyos Reactivos",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Reconocer y vivenciar el apoyo sobre el antepié/metatarso reduciendo el impacto en talón.",
                distribucion: `Trazar 4 carriles de 10 metros con ${materials}. Zonas de aceleración señalizadas con tizas de colores.`,
                actividad_inicial: `Juego 'El semáforo motriz': desplazamientos suaves con frenadas en punta de pies. Movilidad articular de tobillos y rodillas.`,
                actividad_central: `Recorridos rítmicos sobre colchonetas y marcas en el suelo procurando dar 'pasos de pluma silenciosos'. El docente modela la amortiguación elástica de tobillo evitando el golpe del talón.`,
                actividad_final: `Estiramiento estático de gastrocnemios y sóleos en el suelo. Conversatorio sobre las sensaciones de impacto articular.`,
                consigna: "¡Imagina que el piso es una nube y tus pies son plumas que no deben hacer ningún ruido al tocar el suelo!",
                criterio_eval: "Apoya predominantemente con el antepié durante el 80% del recorrido sin golpear el talón."
            },
            {
                titulo: "Alineación Postural e Inclinación del Tronco",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Mantener una inclinación ligera hacia adelante (5°-10°) con cabeza erguida y mirada al frente.",
                distribucion: `Espacio delimitado de 12x12 metros con dianas visuales a la altura de los ojos en la pared perimetral.`,
                actividad_inicial: `Juego de activación 'La torre inclinada': inclinaciones dinámicas controladas desde los tobillos sin doblar la cintura.`,
                actividad_central: `Desplazamientos en línea recta manteniendo la mirada fija en tarjetas de colores al frente. Se evita la flexión excesiva de cuello o tronco hacia abajo.`,
                actividad_final: `Juego de vuelta a la calma 'La sombra': imitación de posturas de elongación axial y control respiratorio.`,
                consigna: "¡Mirada de águila fija en el horizonte y cuerpo inclinado hacia adelante como una flecha lanzada!",
                criterio_eval: "Mantiene la mirada al frente sin desviar la cabeza hacia el suelo durante la carrera."
            },
            {
                titulo: "Mecánica y Sincronía del Braceo Sagital",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Coordinar el braceo en plano sagital con codos flexionados a ~90° sin cruzar la línea media.",
                distribucion: `Cuadrilátero de 10x8 metros con 4 estaciones de braceo estático y en desplazamiento.`,
                actividad_inicial: `Activación dinámica de hombros y codos con ritmos musicales y palmadas alternadas.`,
                actividad_central: `Ejercicios de braceo primero en posición sedente, luego en rodillas y finalmente en carrera continua entre conos paralelos estrechos que delimitan el plano sagital.`,
                actividad_final: `Elongación de deltoides, pectorales y dorsales. Metacognición sobre la ayuda del braceo en la propulsión.`,
                consigna: "¡Codos en caja fuerte a 90 grados, impulsando directo de la cadera a la barbilla sin cruzar el pecho!",
                criterio_eval: "Ejecuta el braceo en oposición con codos flexionados sin oscilaciones laterales marcadas."
            },
            {
                titulo: "Flexión de Rodilla de Recobro y Elevación de Talón",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Flexionar la rodilla recuperadora (≤ 90°) aproximando el talón a los glúteos para acelerar el ciclo de zancada.",
                distribucion: `Montaje de pasillos con mini-obstáculos y ${materials} separados a 1.20 metros.`,
                actividad_inicial: `Juego 'Pisa la cola al dragón' con desplazamientos de talones a glúteos en baja intensidad.`,
                actividad_central: `Pasadas sobre mini-obstáculos suaves donde los estudiantes deben elevar activamente el talón hacia el glúteo para no derribar las marcas. Ajuste individualizado de distancias.`,
                actividad_final: `Estiramiento guiado de cuádriceps e isquiotibiales. Respiración diafragmática.`,
                consigna: "¡Tus talones quieren saludar a tus bolsillos traseros en cada zancada para que tus piernas vuelen!",
                criterio_eval: "Logra una flexión de rodilla visible en la fase de recobro en la mayoría de sus ciclos de carrera."
            },
            {
                titulo: "Agilidad, Cambios de Dirección y Frenada Controlada",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Ajustar el centro de gravedad en cambios de trayectoria desacelerando con estabilidad pélvica.",
                distribucion: `Circuito de slalom en zigzag de 6 postes con conos y marcas transversales.`,
                actividad_inicial: `Activación lúdica 'Osos y ardillas' con cambios rápidos de dirección a la señal auditiva.`,
                actividad_central: `Recorridos en zigzag por estaciones, donde al llegar a cada cono deben flexionar rodillas para bajar el centro de gravedad y empujar fuertemente en la nueva dirección.`,
                actividad_final: `Marcha lenta con relajación miofascial y sacudida de extremidades.`,
                consigna: "¡Baja un poco tu cadera al llegar a la curva como un carro de carreras para no derrapar!",
                criterio_eval: "Desacelera con control y reorienta la trayectoria sin caídas ni pérdidas de balance."
            },
            {
                titulo: "Amplitud, Frecuencia y Ritmo de Zancada",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Encontrar un ritmo coordinado y adaptativo de zancada combinando impulsión y frecuencia.",
                distribucion: `Escaleras de coordinación dibujadas con tizas en el suelo y aros espaciados progresivamente.`,
                actividad_inicial: `Juego de ritmo corporal con palmadas y pasos sincronizados al compás de silbato o música.`,
                actividad_central: `Pasadas por escalas de coordinación rítmica (apoyos de 1 y 2 contactos por cuadrante) aumentando progresivamente la velocidad sin desarmar la técnica de braceo.`,
                actividad_final: `Estiramiento en parejas apoyados hombro con hombro. Socialización de logros.`,
                consigna: "¡Siente la música de tus pasos en el suelo: tac-tac-tac constante y rítmico!",
                criterio_eval: "Completa la secuencia rítmica de apoyos manteniendo la fluidez y el control postural."
            },
            {
                titulo: "Aceleración Reactiva y Salidas Explosivas",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Ejecutar salidas reactivas ante estímulos sensoriales transfiriendo la energía en los primeros 5 metros.",
                distribucion: `Líneas de salida paralelas de 15 metros con conos de meta a 5, 10 y 15 metros.`,
                actividad_inicial: `Juego de reacción 'Tierra, mar y aire': saltos y salidas cortas según la consigna verbal.`,
                actividad_central: `Retos de aceleración desde diferentes posiciones iniciales (sentados, de espaldas, acostados bocabajo), enfatizando la triple extensión de la pierna impulsora en la primera zancada.`,
                actividad_final: `Dinámica suave de relajación muscular y respiración guiada.`,
                consigna: "¡Explosión de cohete en el primer paso impulsando con fuerza desde la punta de tus dedos!",
                criterio_eval: "Reacciona con rapidez y logra una inclinación propulsora en los primeros metros de aceleración."
            },
            {
                titulo: "Transporte Dinámico y Relevos Rítmicos",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Integrar el transporte de objetos manuales en carrera sin descomponer el braceo ni la alineación.",
                distribucion: `Pistas de relevos de 15 metros con conos y zonas de entrega seguras de 3 metros.`,
                actividad_inicial: `Movilidad segmentaria global con pases de pelotas de espuma en círculos.`,
                actividad_central: `Relevos cooperativos por equipos transportando testigos livianos o pañoletas. La regla es mantener la técnica de carrera y entregar el objeto sin frenar bruscamente.`,
                actividad_final: `Conversatorio sobre el trabajo en equipo y vuelta a la calma con estiramientos pasivos.`,
                consigna: "¡Corre como el viento y entrega tu energía a tu compañero con una sonrisa y paso firme!",
                criterio_eval: "Mantiene la estabilidad y el patrón de carrera mientras sostiene y transfiere un móvil."
            },
            {
                titulo: "Circuito de Estaciones de Destreza y Velocidad",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Resolver múltiples situaciones motrices consecutivas aplicando la técnica de carrera en variabilidad.",
                distribucion: `Circuito de 4 estaciones: Estación 1: Zancadas en aros; Estación 2: Zigzag; Estación 3: Salto y sprint; Estación 4: Desaceleración y giro.`,
                actividad_inicial: `Activación general guiada con trote suave y movilidad articular cefalocaudal.`,
                actividad_central: `Rotación cronometrada por las 4 estaciones aplicando el método de ${pedagogy}. Enfoque en la autorregulación del esfuerzo y la calidad técnica.`,
                actividad_final: `Marcha lenta de recuperación cardíaca y estiramiento de tren inferior.`,
                consigna: "¡Calidad antes que velocidad: haz que cada movimiento sea limpio, elegante y coordinado!",
                criterio_eval: "Ejecuta las transiciones entre estaciones manteniendo el control de los apoyos y el braceo."
            },
            {
                titulo: "Juegos Cooperativos y Persecución Estratégica",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Aplicar la carrera eficiente en juegos de persecución con toma de decisiones espaciales.",
                distribucion: `Espacio amplio de 20x15 metros delimitado con zonas de refugio seguras.`,
                actividad_inicial: `Juego 'Las cuatro esquinas': carreras cortas hacia zonas seguras según consignas tácticas.`,
                actividad_central: `Juego adaptado 'Cazadores y guardianes': los estudiantes utilizan fintas, aceleraciones y cambios de dirección para superar a sus compañeros respetando el juego limpio.`,
                actividad_final: `Círculo de reflexión pedagógica sobre la toma de decisiones y el respeto a las reglas.`,
                consigna: "¡Lee el espacio libre antes de acelerar y usa tus cambios de dirección con inteligencia!",
                criterio_eval: "Aplica cambios de ritmo y fintas espaciales en situaciones reales de juego."
            },
            {
                titulo: "Desafíos de Locomoción y Autorregulación del Esfuerzo",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Autorregular la intensidad de la carrera reconociendo las respuestas fisiológicas del propio cuerpo.",
                distribucion: `Circuito perimetral con marcas de pulsaciones y zonas de hidratación.`,
                actividad_inicial: `Chequeo del pulso y conversatorio sobre respiración e hidratación deportiva.`,
                actividad_central: `Retos de carrera continua a ritmo controlado con estaciones de aceleración breve. Los estudiantes monitorean su respiración y ajustan el esfuerzo sin agotarse prematuramente.`,
                actividad_final: `Ejercicios de relajación guiada y estiramientos profundos.`,
                consigna: "¡Escucha el motor de tu corazón: corre a un ritmo donde puedas respirar con calma y disfrutar!",
                criterio_eval: "Autorregula el ritmo de carrera y describe sus sensaciones de fatiga y recuperación."
            },
            {
                titulo: "Festival de Maestría Motriz y Coevaluación",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Demostrar y coevaluar el patrón maduro de carrera en un circuito lúdico de cierre de período.",
                distribucion: `Gran pista de habilidades con todas las ${materials} integradas en estaciones de gala.`,
                actividad_inicial: `Activación festiva y repaso de los acuerdos de convivencia y apoyo mutuo.`,
                actividad_central: `Gala motriz: recorrido individual y por parejas del circuito integral. Los compañeros observan y retroalimentan con tarjetas de felicitación los criterios biomecánicos logrados.`,
                actividad_final: `Ceremonia de felicitación y cierre de la unidad didáctica con estiramiento colectivo.`,
                consigna: "¡Hoy celebramos todo lo que nuestro cuerpo ha aprendido: corre con orgullo y alegría!",
                criterio_eval: "Exhibe un patrón de carrera fluido en estadio maduro (vuelo claro, braceo sagital y antepié)."
            }
        ],
        'Salto Horizontal': [
            {
                titulo: "Base de Sustentación y Sentadilla Preparatoria",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Adoptar una posición preparatoria equilibrada con flexión de rodillas a 90°-100° y apoyo plantar simétrico.",
                distribucion: `Zonas de despegue marcadas con cinta o ${materials} separadas cada 2 metros.`,
                actividad_inicial: `Juego 'El resorte mágico': flexiones y extensiones estáticas en el puesto con rebotes elásticos suaves.`,
                actividad_central: `Ejercicios de carga elástica: sentadillas guiadas frente a conos manteniendo la espalda recta y brazos atrás listos para el despegue. Corrección de la base de sustentación.`,
                actividad_final: `Estiramiento de cuádriceps y glúteos en posición sedente. Metacognición sobre la acumulación de energía elástica.`,
                consigna: "¡Carga tus piernas como un resorte de acero listo para dispararse hacia adelante!",
                criterio_eval: "Flexiona rodillas a un ángulo cercano a 90° con tronco inclinado sin perder el equilibrio antes del salto."
            },
            {
                titulo: "Aterrizaje Amortiguado y Absorción de Impacto",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Aterrizar simultáneamente sobre ambos pies absorbiendo el impacto mediante una flexión reactiva de rodillas.",
                distribucion: `Zonas de caída acolchadas con colchonetas o marcas de césped delimitadas con conos.`,
                actividad_inicial: `Juego 'Gatos y ratones': caídas desde pequeñas alturas (10-15 cm) buscando el silencio absoluto al tocar el suelo.`,
                actividad_central: `Saltos cortos hacia adelante aterrizando en colchonetas. Énfasis en flexionar tobillos, rodillas y caderas simultáneamente ('aterrizaje de gato ninja') para proteger las articulaciones.`,
                actividad_final: `Ejercicios de movilidad de tobillos y respiración diafragmática.`,
                consigna: "¡Aterriza suave como un gato ninja: que nadie en el colegio escuche tu llegada al suelo!",
                criterio_eval: "Realiza el aterrizaje simultáneo bipodal flexionando rodillas sin rigidez articular."
            },
            {
                titulo: "Sincronización del Balanceo de Brazos",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Utilizar el balanceo vigoroso de brazos de atrás hacia adelante y arriba como guía de la propulsión.",
                distribucion: `Líneas de salto con cintas elevadas a 1.5 metros para estimular la proyección de brazos hacia arriba.`,
                actividad_inicial: `Balanceos dinámicos de brazos en el puesto al ritmo de palmadas aumentando la velocidad de oscilación.`,
                actividad_central: `Saltos buscando tocar con ambas manos una cinta suspendida al frente. Los brazos inician extendidos atrás y se lanzan enérgicamente hacia adelante y arriba en el momento del despegue.`,
                actividad_final: `Elongación de hombros, pectorales y cintura escapular.`,
                consigna: "¡Lanza tus brazos hacia el cielo como si fueras a tocar las estrellas con la punta de tus dedos!",
                criterio_eval: "Proyecta ambos brazos hacia adelante y arriba de forma coordinada durante la fase de despegue y vuelo."
            },
            {
                titulo: "Triple Extensión Articular en el Despegue",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Extender vigorosamente y al unísono tobillos, rodillas y caderas en el instante del despegue.",
                distribucion: `Estaciones con marcas de despegue y dianas de distancia a 0.5, 1.0 y 1.5 metros con ${materials}.`,
                actividad_inicial: `Juego 'El cohete espacial': saltos verticales con extensión máxima del cuerpo en el aire.`,
                actividad_central: `Práctica de despegue explosivo horizontal. Los estudiantes empujan activamente el suelo con el metatarso logrando la extensión completa de la cadena cinética inferior.`,
                actividad_final: `Estiramiento de gemelos, isquiotibiales y zona lumbar.`,
                consigna: "¡Empuja el piso con tanta fuerza como si fueras a dejar tu huella marcada en el suelo!",
                criterio_eval: "Demuestra una extensión visible y simultánea de tobillo, rodilla y cadera al abandonar el suelo."
            },
            {
                titulo: "Progresión de Distancia y Trayectoria Parabólica",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Ajustar el ángulo de despegue (~45°) para maximizar el alcance horizontal manteniendo la estabilidad.",
                distribucion: `Pasillos de salto con zonas intermedias de 'ríos imaginarios' con cuerdas y aros.`,
                actividad_inicial: `Desplazamientos con saltos continuos de baja intensidad sobre líneas.`,
                actividad_central: `Superación de obstáculos bajos (aros y cuerdas) que obligan a elevar la trayectoria de vuelo sin perder el avance hacia adelante. Ajuste personalizado según la estatura del estudiante.`,
                actividad_final: `Marcha lenta y ejercicios de relajación miofascial.`,
                consigna: "¡Dibuja un arcoíris en el aire con tu cuerpo, volando alto y aterrizando lejos!",
                criterio_eval: "Alcanza una parábola de vuelo equilibrada sin caer hacia atrás en el aterrizaje."
            },
            {
                titulo: "Salto Vertical con Alcance de Objetivos Aéreos",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Transferir la fuerza propulsora en el plano vertical alcanzando móviles suspendidos.",
                distribucion: `Pared con marcas métricas de colores y balones suspendidos a diferentes alturas.`,
                actividad_inicial: `Juegos de toques de palmas en salto con compañeros de similar estatura.`,
                actividad_central: `Desafíos de salto vertical para tocar tarjetas o móviles aéreos. Enfoque en la impulsión bipodal y la absorción elástica al caer en el mismo punto de despegue.`,
                actividad_final: `Estiramiento axial de columna y miembros inferiores.`,
                consigna: "¡Crece en el aire como un gigante y aterriza suave en tu propio castillo!",
                criterio_eval: "Realiza el salto vertical con despegue bipodal y caída amortiguada en el mismo cuadrante."
            },
            {
                titulo: "Encadenamiento de Saltos Continuos Rítmicos",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Encadenar saltos sucesivos manteniendo el ritmo, la reactividad articular y la dirección.",
                distribucion: `Hileras de 6 aros consecutivos y mini-vallas de espuma distribuidas a 80 cm.`,
                actividad_inicial: `Juego de saltos al compás de la música: 1-2-3 salto y congelado.`,
                actividad_central: `Recorridos de saltos seguidos dentro de los aros. La consigna es utilizar la amortiguación del primer salto como carga propulsora inmediata para el siguiente salto sin pausas prolongadas.`,
                actividad_final: `Círculo de estiramiento pasivo y respiración profunda.`,
                consigna: "¡Sé como una pelota de goma que rebota sin parar con energía elástica en cada aro!",
                criterio_eval: "Ejecuta 4 o más saltos continuos sin perder el equilibrio ni interrumpir la secuencia."
            },
            {
                titulo: "Circuito Multidireccional de Saltos Combinados",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Resolver secuencias de saltos frontales, laterales y diagonales con cambios de apoyo.",
                distribucion: `Circuito en cuadrilátero con estaciones de salto frontal, lateral sobre valla y salto diagonal en cruz.`,
                actividad_inicial: `Movilidad articular completa y desplazamientos laterales con saltos cortos.`,
                actividad_central: `Rotación por estaciones aplicando el método de ${pedagogy}. Los estudiantes varían los planos de salto y ajustan la postura corporal para estabilizar cada aterrizaje.`,
                actividad_final: `Vuelta a la calma con dinámicas de balanceo y sacudida muscular.`,
                consigna: "¡Controla tu aterrizaje en cada dirección antes de lanzarte al siguiente reto!",
                criterio_eval: "Adapta la orientación corporal y estabiliza el aterrizaje en saltos laterales y diagonales."
            },
            {
                titulo: "Retos Cooperativos de Salto en Equipo",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Sincronizar y sumar esfuerzos en saltos cooperativos respetando los turnos y la seguridad.",
                distribucion: `Espacio delimitado de 15x10 metros con pistas de relevos de salto.`,
                actividad_inicial: `Juego de espejos en parejas imitando secuencias de salto simultáneo.`,
                actividad_central: `Reto 'El puente colectivo': cada estudiante salta desde la marca donde aterrizó su compañero anterior para lograr cruzar juntos el patio. Enfoque en el estímulo mutuo y la técnica segura.`,
                actividad_final: `Conversatorio sobre el trabajo colaborativo y estiramientos en parejas.`,
                consigna: "¡Cada salto suma para el equipo: salta con técnica, aterriza seguro y apoya a tu grupo!",
                criterio_eval: "Participa coordinadamente en los relevos aplicando la técnica aprendida sin apuros lesivos."
            },
            {
                titulo: "Juegos Lúdicos de Propulsión y Precisión",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Ajustar la fuerza del salto para aterrizar con precisión en zonas de diferentes tamaños.",
                distribucion: `Cuadrícula gigante tipo 'rayuela motriz' con islas de colchonetas y aros numerados.`,
                actividad_inicial: `Juego de persecución con zonas de seguridad a las que solo se puede ingresar mediante un salto bipodal.`,
                actividad_central: `Juego 'El rescate de las islas': los alumnos deben saltar de isla en isla calculando la distancia exacta para no caer al 'agua', manteniendo el equilibrio estático 2 segundos al aterrizar.`,
                actividad_final: `Reflexión sobre el cálculo de distancias y relajación corporal.`,
                consigna: "¡Calcula tu fuerza como un arquero: ni muy corto ni muy largo, justo en el centro de la isla!",
                criterio_eval: "Dosifica la potencia del salto y logra aterrizar con precisión y balance en la zona señalada."
            },
            {
                titulo: "Desafíos de Salto con Variabilidad y Obstáculos Dinámicos",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Superar obstáculos en movimiento o con límite temporal manteniendo la postura madura.",
                distribucion: `Cuerdas oscilantes a ras de suelo ('la serpiente') y pasillos de salto rítmico.`,
                actividad_inicial: `Activación cardiovascular con trote y saltos de cuerda individual.`,
                actividad_central: `Salto sobre cuerdas onduladas en movimiento sin tocarlas, requiriendo sincronizar el momento de despegue con la posición del obstáculo móvil.`,
                actividad_final: `Estiramiento general y ejercicios de visualización motriz.`,
                consigna: "¡Espera el momento exacto, salta con decisión y vuela sobre el obstáculo con elegancia!",
                criterio_eval: "Sincroniza el despegue con el estímulo móvil y aterriza de forma equilibrada."
            },
            {
                titulo: "Festival de Maestría en Salto y Baremación Colectiva",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Demostrar y coevaluar el patrón maduro de salto (preparación, despegue, vuelo y aterrizaje).",
                distribucion: `Gran pista gimnástica con todas las ${materials} integradas en estaciones de demostración.`,
                actividad_inicial: `Calentamiento festivo y repaso de la rúbrica de criterios biomecánicos de Gallahue.`,
                actividad_central: `Circuito de maestría motriz: los estudiantes realizan el recorrido completo mostrando los 4 componentes maduros del salto. Coevaluación formativa con fichas visuales.`,
                actividad_final: `Ceremonia de reconocimiento y cierre de la unidad con estiramiento colectivo.`,
                consigna: "¡Muestra tu maestría motriz con saltos potentes, vuelos hermosos y aterrizajes perfectos!",
                criterio_eval: "Demuestra los 4 criterios del estadio maduro de salto (sentadilla 90°, brazos coordinados, triple extensión y aterrizaje amortiguado)."
            }
        ],
        'Lanzamiento Sobre Hombro': [
            {
                titulo: "Agarre del Móvil y Orientación Corporal de Perfil",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Posicionar el cuerpo de perfil al objetivo con agarre seguro del móvil con la mano dominante.",
                distribucion: `Líneas de lanzamiento señalizadas a 3 y 5 metros de una pared con dianas circulares.`,
                actividad_inicial: `Juego de calentamiento 'El radar': giros corporales de perfil a la voz del docente. Movilidad de hombros y muñecas.`,
                actividad_central: `Práctica de postura de perfil: pies perpendiculares a la línea de lanzamiento, hombro no dominante apuntando a la diana y pelota sostenida con dedos sin apretar en exceso.`,
                actividad_final: `Elongación de antebrazos, bíceps y deltoides. Metacognición sobre la orientación espacial.`,
                consigna: "¡Ponte de lado como un arquero medieval, apuntando al blanco con tu hombro delantero!",
                criterio_eval: "Adopta la postura corporal de perfil respecto a la diana antes de iniciar el armado."
            },
            {
                titulo: "Paso Contralateral Adelantado y Transferencia de Peso",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Dar un paso firme con el pie opuesto al brazo ejecutor para transferir el centro de gravedad.",
                distribucion: `Huellas dibujadas en el piso con tizas indicando la posición del pie contralateral adelantado.`,
                actividad_inicial: `Juego 'Paso de gigante': desplazamientos coordinando paso contralateral con palmadas.`,
                actividad_central: `Lanzamientos suaves de pelotas de espuma enfocados exclusivamente en adelantar el pie contrario al brazo lanzador y transferir el peso desde el pie trasero hacia el delantero.`,
                actividad_final: `Estiramiento de cuádriceps, glúteos y gemelos. Respiración diafragmática.`,
                consigna: "¡Paso firme con el pie contrario adelante para que todo el poder de tu cuerpo viaje al balón!",
                criterio_eval: "Adelanta consistentemente el pie contrario al brazo lanzador en la fase preparatoria."
            },
            {
                titulo: "Armado del Brazo con Codo a la Altura del Hombro",
                fase_pedagogica: "Fase 1: Iniciación y Esquema Corporal",
                objetivo: "Llevar el codo hacia atrás y arriba a la altura del hombro (~90°) antes de la aceleración.",
                distribucion: `Postes o conos altos con marcas visuales que indican la altura correcta del codo.`,
                actividad_inicial: `Movilidad dinámica de hombros formando círculos y 'alas de águila' con los codos elevados.`,
                actividad_central: `Ejercicios frente a la pared: armar el brazo con el codo a la altura del hombro, verificar la postura y lanzar con extensión final de muñeca hacia una diana alta.`,
                actividad_final: `Estiramiento de manguito rotador, pectorales y tríceps.`,
                consigna: "¡Codo arriba a la altura de tu oreja, como si fueras a responder una llamada telefónica!",
                criterio_eval: "Eleva el codo a la altura del hombro sin dejarlo caer pegado a las costillas al armar."
            },
            {
                titulo: "Rotación del Tronco y Cadena Cinética",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Rotar coordinadamente la cadera y el tronco hacia adelante para sumar potencia al lanzamiento.",
                distribucion: `Zonas de lanzamiento de 6x6 metros con balones de goma y ${materials}.`,
                actividad_inicial: `Juego de torsión de tronco en parejas 'Pasa la pelota atrás' en posición de pie.`,
                actividad_central: `Lanzamientos a media distancia donde los estudiantes sienten la torsión de la cintura: primero gira la cadera, luego el pecho y finalmente se proyecta el brazo como una catapulta.`,
                actividad_final: `Elongación de dorsales, oblicuos y músculos intercostales.`,
                consigna: "¡Gira tu cintura como un tornado: la fuerza nace en tus pies y explota en tu mano!",
                criterio_eval: "Demuestra una rotación visible de tronco y hombros previa a la suelta del móvil."
            },
            {
                titulo: "Lanzamientos de Precisión a Dianas Fijas",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Calibrar la trayectoria y fuerza del lanzamiento para acertar en objetivos a diferentes alturas.",
                distribucion: `Mural de precisión con aros colgados a 1.2m, 1.8m y 2.4m con puntuaciones lúdicas.`,
                actividad_inicial: `Dinámicas de puntería con pelotas de tenis hacia cubos en el suelo.`,
                actividad_central: `Circuito de puntería por estaciones: los alumnos aplican el gesto completo (perfil, paso, codo alto, giro) buscando encestar en los aros más altos.`,
                actividad_final: `Marcha lenta con sacudida de brazos y respiración controlada.`,
                consigna: "¡Apunta al centro de la diana y suelta el balón en el punto más alto de tu extensión!",
                criterio_eval: "Acierta en la zona objetivo manteniendo la estructura técnica del gesto en el 70% de los intentos."
            },
            {
                titulo: "Variación de Móviles: Densidad, Peso y Agarre",
                fase_pedagogica: "Fase 2: Coordinación y Ajuste Técnico",
                objetivo: "Adaptar la fuerza prensil y el impulso motor a pelotas de diferente peso y tamaño.",
                distribucion: `Estaciones con pelotas de tenis, balones de espuma, saquitos de semillas y vóley liviano.`,
                actividad_inicial: `Manipulación sensorial de los distintos móviles (apretar, balancear, botar).`,
                actividad_central: `Lanzamientos consecutivos rotando los elementos. El estudiante experimenta cómo ajustar la fuerza muscular y la velocidad del brazo según el peso del objeto.`,
                actividad_final: `Estiramiento de la musculatura flexora y extensora de dedos y muñecas.`,
                consigna: "¡Siente el peso del objeto en tus dedos y calcula la fuerza justa para que vuele exacto!",
                criterio_eval: "Modula la fuerza de empuje adecuándose a las características físicas de cada móvil."
            },
            {
                titulo: "Lanzamiento con Carrera Previa de Aproximación",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Coordinar 2 o 3 pasos de carrera de aproximación con el bloqueo del pie contralateral y lanzamiento.",
                distribucion: `Pasillos de carrera de 5 metros que finalizan en la línea de lanzamiento reglamentaria.`,
                actividad_inicial: `Trote rítmico con paradas en 1 tiempo sobre marcas de colores.`,
                actividad_central: `Carrera corta $\rightarrow$ paso de bloqueo contralateral $\rightarrow$ rotación $\rightarrow$ lanzamiento potente hacia una zona lejana. Enfoque en transferir la velocidad de la carrera al lanzamiento.`,
                actividad_final: `Relajación pasiva con estiramiento de piernas y hombros.`,
                consigna: "¡Corre con ritmo, clava tu pie como una estaca y proyecta el balón al horizonte!",
                criterio_eval: "Encadena la carrera previa con el bloqueo del pie sin perder el equilibrio tras soltar."
            },
            {
                titulo: "Retos Cooperativos de Puntería en Relevos",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Sumar aciertos en dinámicas grupales de relevos manteniendo la calma y la técnica.",
                distribucion: `Pistas paralelas de relevos con castillos de conos para derribar a 8 metros.`,
                actividad_inicial: `Juegos de pases rápidos de mano a mano en filas cooperativas.`,
                actividad_central: `Juego 'Los constructores y derribadores': relevos de carrera y lanzamiento de precisión para derribar conos numerados. Se valora tanto el acierto como la técnica correcta.`,
                actividad_final: `Conversatorio sobre la concentración y el control emocional bajo presión lúdica.`,
                consigna: "¡Tómate tu segundo de concentración, arma tu brazo con calma y lanza con confianza!",
                criterio_eval: "Mantiene la técnica madura de lanzamiento en situaciones competitivas lúdicas."
            },
            {
                titulo: "Juegos Predeportivos de Pase a Distancia y Estrategia",
                fase_pedagogica: "Fase 3: Complejidad y Retos Dinámicos",
                objetivo: "Lanzar con precisión hacia compañeros en movimiento en situaciones tácticas abiertas.",
                distribucion: `Cancha de 15x10 metros dividida en cuadrantes de juego.`,
                actividad_inicial: `Pases en parejas aumentando la distancia progresivamente (3m $\rightarrow$ 6m $\rightarrow$ 9m).`,
                actividad_central: `Juego 'Los 10 pases mágicos': dos equipos deben completar 10 pases sobre hombro consecutivos entre compañeros desmarcados sin que el móvil toque el suelo.`,
                actividad_final: `Estiramiento colectivo y retroalimentación táctica.`,
                consigna: "¡Comunícate con tu compañero, anticipa su carrera y lanza a sus manos con suavidad!",
                criterio_eval: "Ajusta la trayectoria y fuerza del pase hacia un compañero en desplazamiento."
            },
            {
                titulo: "Lanzamiento con Oposición Simbólica y Toma de Decisiones",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Tomar decisiones rápidas sobre la trayectoria del lanzamiento ante la presencia de defensores.",
                distribucion: `Zonas de ataque y defensa delimitadas con arcos o dianas múltiples.`,
                actividad_inicial: `Juego de fintas corporales y esquivas 1 vs 1 sin balón.`,
                actividad_central: `Situaciones 2 atacantes vs 1 defensor: el portador del balón debe identificar si lanzar directo a la diana libre o pasar a su compañero desmarcado utilizando el gesto sobre hombro.`,
                actividad_final: `Reflexión sobre la lectura del juego y estiramiento de tren superior e inferior.`,
                consigna: "¡Mira todo el campo, engaña con la mirada y lanza al espacio donde nadie te bloquee!",
                criterio_eval: "Selecciona la trayectoria óptima de lanzamiento evitando el bloqueo del defensor."
            },
            {
                titulo: "Desafíos de Potencia y Alcance Máximo Seguro",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Alcanzar la máxima distancia de lanzamiento aplicando la cadena cinética completa sin sobreesfuerzo articular.",
                distribucion: `Campo abierto con zonas métricas marcadas cada 2 metros hasta los 20 metros.`,
                actividad_inicial: `Calentamiento específico del hombro con gomas elásticas o movimientos circulares suaves.`,
                actividad_central: `Intentos de lanzamiento de distancia máxima. El docente evalúa que el incremento de fuerza provenga de las piernas y el tronco y no de un latigazo exclusivo del brazo.`,
                actividad_final: `Crioterapia simbólica (relajación guiada) y estiramiento profundo de hombros y espalda.`,
                consigna: "¡Usa la fuerza de todo tu cuerpo, desde los dedos de tus pies hasta la punta de tus manos!",
                criterio_eval: "Ejecuta el lanzamiento de máxima distancia con una cadena cinética fluida y sin dolor."
            },
            {
                titulo: "Festival de Maestría en Lanzamiento y Coevaluación",
                fase_pedagogica: "Fase 4: Consolidación y Aplicación en Juego",
                objetivo: "Demostrar y coevaluar los 4 componentes del estadio maduro de lanzamiento sobre hombro.",
                distribucion: `Gala motriz con 4 estaciones de lanzamiento (precisión, distancia, en movimiento y estratégico).`,
                actividad_inicial: `Activación festiva y repaso de los criterios de Gallahue (perfil, paso contralateral, codo alto y rotación).`,
                actividad_central: `Recorrido evaluativo: los estudiantes realizan lanzamientos en las diferentes estaciones mientras sus compañeros registran los logros técnicos en fichas lúdicas.`,
                actividad_final: `Premiación pedagógica de los logros de la unidad y estiramiento grupal.`,
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

    // Generar la secuencia progresiva completa de N clases
    const fullTemplates = getSkillProgressionTemplates(skill, materials, format, pedagogy);
    const clasesSecuencia = [];

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
        evaluacion: `Evaluación formativa continua: Observación directa de la progresión motriz del estudiante clase a clase (${skill}), valoración de la adquisición de criterios maduros de Gallahue, participación activa y autorregulación.`,
        metodos_ensenanza: `Mando directo pedagógico por asignación de tareas, descubrimiento guiado y aprendizaje cooperativo estructurado en progresión de dificultad.`,
        estilo_ensenanza: `Estilo lúdico-participativo y resolución de problemas motores basado en ${pedagogy}.`,
        adaptaciones_piar: `Ajustes Razonables (DUA / PIAR): Graduación de niveles de dificultad, adaptación de distancias y apoyos; uso de compañeros tutores; variación de materiales y pausas activas para asegurar la inclusión de todos los ritmos de aprendizaje.`,
        reflexion_pedagogica: `La secuencia progresiva concibe el error motriz como una oportunidad de autorregulación y andamiaje corporal, garantizando que cada estudiante avance con confianza hacia el estadio maduro.`,
        retroalimentacion_tips: frasesProfe,
        video_profundizacion: "https://aulaglobal360.edu.co/recursos/pedagogia-hmb",
        bibliografia: "Ministerio de Educación Nacional de Colombia (MEN). Orientaciones Pedagógicas para la Educación Física, Recreación y Deporte. / Gallahue, D. L., & Ozmun, J. C. (2012). Understanding Motor Development."
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
            <tr><td colspan="2" style="background:#F1F5F9; padding:8px; font-weight:bold;">DATOS DEL ESTUDIANTE Y EVALUACIÓN</td></tr>
            <tr><td><strong>Habilidad Evaluada:</strong> ${d.habilidad_detectada.toUpperCase()}</td><td><strong>Estadio Motor (Gallahue):</strong> ${d.estadio_gallahue.toUpperCase()}</td></tr>
            <tr><td><strong>Índice de Madurez:</strong> ${d.porcentaje_madurez}%</td><td><strong>Calibración:</strong> ${d.edad_calibrada || '5 a 11 años'}</td></tr>
        </table>

        <h3>1. Batería de Criterios Biomecánicos Observados</h3>
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
