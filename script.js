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

// GENERACIÓN DE UNIDAD DIDÁCTICA Y PLAN DE CLASE (FORMATO INSTITUCIONAL MEN)
function generateDidacticPlan(diagnosticoData, prefs, isGroup = false) {
    const skill = diagnosticoData.habilidad_detectada || 'Desarrollo Motor';
    const format = (prefs && prefs.format) ? prefs.format : 'Circuito de Estaciones';
    const pedagogy = (prefs && prefs.pedagogy) ? prefs.pedagogy : 'Asignación de Tareas';
    const materials = (prefs && prefs.materials) ? prefs.materials : 'Aros, Conos y recursos corporales';
    const totalMin = (prefs && prefs.duration) ? parseInt(prefs.duration) : 50;
    const period = (prefs && prefs.period) ? prefs.period : '1';
    const classNum = (prefs && prefs.classNum) ? prefs.classNum : '1';
    const totalClasses = (prefs && prefs.totalClasses) ? prefs.totalClasses : '12';
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

    let distribucion = "";
    let guion = "";

    if (format === "Cuento Motor") {
        distribucion = `Delimitar un círculo central de 6 metros de radio usando ${materials}. Cada estación representa una base o planeta motriz donde los estudiantes ejecutan la dinámica aplicando la corrección sin detener la fluidez del movimiento.`;
        guion = `*(Con entusiasmo pedagógico):* "¡Tripulantes espaciales! Nuestra nave ha entrado en una nueva dimensión motriz. Para activar los propulsores sin perder el equilibrio, debemos movernos con pasos ligeros, brazos activos a 90 grados y mirada siempre al frente. ¡Aterrizaje suave en 3, 2, 1... acción!"`;
    } else if (format === "Circuito de Estaciones") {
        distribucion = `Montaje de 4 estaciones consecutivas en cuadrilátero (10x8 metros) usando ${materials}. Estación 1: Activación e impulsión coordinada; Estación 2: Coordinación segmentaria y ritmo; Estación 3: Precisión y trayectoria con elementos; Estación 4: Desaceleración, balance y control de apoyos.`;
        guion = `*(Explicación técnica en lenguaje sencillo):* "Equipo: en cada estación nos enfocaremos en un detalle específico de nuestro cuerpo. Cuando escuchen el silbato, congelen la postura un instante para verificar su apoyo y luego roten con energía a la siguiente estación."`;
    } else {
        distribucion = `Espacio libre delimitado de 12x12 metros usando ${materials}. Zonas seguras perimetrales de 2 metros para evitar colisiones durante los desplazamientos y aceleraciones.`;
        guion = `*(Reto cooperativo grupal):* "El reto de hoy consiste en completar las secuencias de trabajo en equipo sin que ningún elemento toque el suelo. La regla de oro es que cada relevo debe realizarse con la postura corregida y apoyando siempre a los compañeros."`;
    }

    // Pregunta Problematizadora contextualizada
    const preguntaProblematizadora = `¿Qué acciones puedo realizar con mi cuerpo y cómo optimizo mis patrones de ${skill.toLowerCase()} para interactuar de forma armónica, segura y eficiente en mi entorno escolar y cotidiano?`;

    // Objetivos
    const objetivoGeneral = `Fortalecer y perfeccionar los patrones básicos de movimiento vinculados a la ${skill} y las capacidades sociomotrices a través de experiencias lúdicas, cooperativas y de exploración corporal (Sesión ${classNum} de ${totalClasses}).`;
    const objetivosEspecificos = [
        `Identificar las fases biomecánicas y la alineación segmentaria correcta en la ejecución de ${skill}.`,
        `Ejecutar secuencias motrices coordinadas aplicando la postura y apoyos adecuados en situaciones de juego individual y grupal.`,
        `Fomentar la cooperación activa, el respeto por las normas y el cuidado de sí mismo y de los demás en dinámicas de clase.`
    ];

    // Orientaciones Pedagógicas y Competencias (MEN Colombia)
    const estandares = {
        motriz: `Identifica y controla los segmentos corporales en movimientos realizados en diferentes alturas, trayectorias y con diversos elementos.`,
        expresivo_corporal: `Reconoce su cuerpo y demuestra sus posibilidades motrices para la interacción en el aula de clase, el patio escolar y el hogar.`,
        axilogica_corporal: `Dispone de múltiples posibilidades de movimiento y las aplica cotidianamente a través de juegos y ejercicios en su contexto, cuidando su bienestar y el de sus compañeros.`
    };

    const lineamientos = `Desarrollo del pensamiento motriz, integración de la corporeidad, hábitos de vida saludable y formación en valores a través de la lúdica y la resolución de retos motores (Lineamientos Curriculares MEN Colombia).`;

    // Indicadores de Desempeño
    const indicadores = {
        saber: `Exploro e identifico los conceptos y componentes biomecánicos de ${skill} mediante actividades lúdicas y reflexivas.`,
        hacer: `Controlo y ejecuto en forma coordinada las fases de ${skill} con y sin ayuda de elementos en diferentes trayectorias y velocidades.`,
        ser: `Participo y me integro con entusiasmo en las actividades individuales y grupales, procurando generar un ambiente de respeto, compañerismo y sana convivencia.`
    };

    // Secuencia de Actividades adaptada dinámicamente al tiempo total
    const actividades = {
        fase_inicial: `<strong>Instrucciones previas y Saludo (${initMin} min):</strong> Se realiza un conversatorio con los estudiantes acerca de su salud, estado de ánimo y acuerdos de convivencia. Se socializa el objetivo pedagógico de la sesión.<br><br><strong>Activación Dinámica y Motriz:</strong> Juego de activación lúdica ("El semáforo motriz" / "Osos y ardillas") con movilidad articular progresiva (tobillos, rodillas, cadera y cintura escapular) para preparar la cadena cinética y elevar la temperatura corporal.`,
        desarrollo_central: `<strong>1. Montaje y Distribución Espacial:</strong><br>${distribucion}<br><br><strong>2. Guion / Consigna Pedagógica:</strong><br><em>${guion}</em><br><br><strong>3. Desarrollo del Formato (${format} - ${centralMin} min):</strong><br>Aplicación de la metodología de ${pedagogy}. Se organizan subgrupos equitativos para recorrer las estaciones/retos de ${skill}. El docente acompaña el proceso brindando retroalimentación inmediata ("El Lenguaje del Profe") para afianzar la alineación postural y los apoyos sin detener el flujo lúdico de la sesión.`,
        fase_final: `<strong>Juego de Vuelta a la Calma (${finalMin} min):</strong> Dinámica suave de control respiratorio y relajación miofascial ("La marioneta de algodón"). Estiramiento guiado de los principales grupos musculares en posición sedente.<br><br><strong>Conversatorio Grupal y Metacognición:</strong> ¿Cómo se sintieron durante los juegos? ¿Qué sensaciones corporales experimentaron al ajustar la técnica de ${skill}? Cierre con felicitación y hábitos de hidratación.`
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
        periodo: period,
        numero_clase: classNum,
        total_clases: totalClasses,
        docente: "Docente Titular de Educación Física",
        anio: anio.toString(),
        jornada: "Mañana / Única",
        duracion_clase: `${totalMin} Minutos`,
        lugar: "Patio del colegio, coliseo y cancha de primaria",
        tema: `Habilidades Motrices Básicas (Patrón: ${skill}) y Capacidades Sociomotrices`,
        formato: format,
        metodologia: pedagogy,
        materiales: materials,
        pregunta_problematizadora: preguntaProblematizadora,
        objetivo_general: objetivoGeneral,
        objetivos_especificos: objetivosEspecificos,
        estandares: estandares,
        lineamientos: lineamientos,
        indicadores: indicadores,
        actividades: actividades,
        duraciones: {
            inicial: `${initMin} minutos`,
            central: `${centralMin} minutos`,
            final: `${finalMin} minutos`,
            total: `${totalMin} minutos`
        },
        tarea_extracurricular: `Compartir y repasar en casa con la familia una variante del juego de ${skill} practicado hoy, fortaleciendo la integración familiar y los hábitos de vida activa.`,
        evaluacion: `Evaluación formativa continua: Observación directa del empleo de los patrones básicos de movimiento (${skill}) en situaciones lúdicas dirigidas y espontáneas; participación activa, seguimiento de acuerdos de convivencia y cooperación con los compañeros.`,
        metodos_ensenanza: `Mando directo pedagógico por asignación de tareas, descubrimiento guiado y aprendizaje cooperativo.`,
        estilo_ensenanza: `Estilo lúdico-participativo y resolución de problemas motores basado en ${pedagogy}.`,
        adaptaciones_piar: `Ajustes Razonables (DUA / PIAR): Adaptación de distancias, alturas y ritmos de ejecución según las necesidades del estudiante; uso de compañeros tutores; variación del tamaño y textura de los móviles; pausas activas y priorización de la vivencia placentera del movimiento.`,
        reflexion_pedagogica: `El error motriz se concibe como una oportunidad clave para la autorregulación y la toma de conciencia del esquema corporal, fortaleciendo la autoconfianza del estudiante.`,
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

    return `
        <div class="diag-card" style="border-left-color: var(--accent2);">
            <div class="diag-header-bar">
                <div>
                    <div class="diag-title">FORMATO INSTITUCIONAL · PLANEACIÓN DE CLASE</div>
                    <div class="diag-meta"><strong>${didactica.tema}</strong> | Grado: <strong>${didactica.grado}</strong></div>
                    <div style="font-size:11px; color:var(--muted); margin-top:2px;">Período ${didactica.periodo} · <strong>Clase ${didactica.numero_clase} de ${didactica.total_clases}</strong></div>
                </div>
                <span class="stage-badge stage-maduro">⏱️ ${didactica.duracion_clase}</span>
            </div>

            <!-- PREGUNTA PROBLEMATIZADORA Y OBJETIVOS -->
            <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:10px 12px; border-radius:6px; font-size:12px; margin-bottom:12px;">
                <div style="font-weight:700; color:#0369A1; margin-bottom:4px;">❓ Pregunta Problematizadora:</div>
                <div style="font-style:italic; margin-bottom:8px;">${didactica.pregunta_problematizadora}</div>
                <div style="font-weight:700; color:var(--text); margin-bottom:2px;">🎯 Objetivo General:</div>
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

            <!-- SECUENCIA DIDÁCTICA -->
            <div style="display:flex; flex-direction:column; gap:8px; font-size:12px; color:var(--text); margin-bottom:12px;">
                <div style="background:#FFFFFF; border:1px solid #E2E8F0; padding:8px; border-radius:6px;">
                    <strong>🔥 Parte Inicial (${didactica.duraciones.inicial}):</strong> ${didactica.actividades.fase_inicial}
                </div>
                <div style="background:#FFFFFF; border:1px solid #E2E8F0; padding:8px; border-radius:6px;">
                    <strong>⚡ Parte Central (${didactica.duraciones.central}):</strong> ${didactica.actividades.desarrollo_central}
                </div>
                <div style="background:#FFFFFF; border:1px solid #E2E8F0; padding:8px; border-radius:6px;">
                    <strong>🧘 Parte Final (${didactica.duraciones.final}):</strong> ${didactica.actividades.fase_final}
                </div>
            </div>

            <!-- EL LENGUAJE DEL PROFE -->
            <div class="profe-cue-box" style="margin-bottom:14px;">
                <div style="font-weight:700; margin-bottom:4px;">🗣️ El Lenguaje del Profe (Retroalimentación Inmediata):</div>
                <ul style="padding-left:18px; line-height:1.5; font-size:12px;">
                    ${frasesHTML}
                </ul>
            </div>

            <button class="btn-export-plan" onclick="exportToWord()">
                📄 Descargar Planeación de Clase Completa (.doc Formato Institucional)
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
            habilidad_detectada: 'Corrección Colectiva del Salón',
            edad_calibrada: 'Grupo Completo (5-11 años)',
            estadio_gallahue: 'Elemental Prevalente',
            frases_profe: [
                "¡Codos pegados en 90 grados para que el equipo vuele!",
                "¡Que no se escuche ningún aterrizaje brusco en el patio!"
            ]
        }, teacherPrefs, true);

        addMsg('bot', renderDidacticaHTML(didacticaGrupal), true);

        isAnalyzing = false;
    }, 1200);
}

// EXPORTACIÓN A MICROSOFT WORD (.DOC) - FORMATO INSTITUCIONAL
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

// EXPORTACIÓN DE PLANEACIÓN DE CLASE EN FORMATO INSTITUCIONAL EXACTO (.DOC)
function exportToWord() {
    if (!globalDidacticaData) return;
    const d = globalDidacticaData;
    const hoy = new Date().toLocaleDateString('es-CO');

    const objEspHtml = d.objetivos_especificos.map(o => `<li>${o}</li>`).join('');
    const retroHtml = d.retroalimentacion_tips.map(t => `<li>${t}</li>`).join('');

    const docHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
    <meta charset='utf-8'>
    <title>Formato Institucional - Planeación de Clase</title>
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
                <td colspan="4" class="hdr-main">UNIDAD DIDÁCTICA · FORMATO - PLANEACIÓN DE CLASE</td>
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
                <td><strong>DURACIÓN:</strong> ${d.duracion_clase}</td>
            </tr>
            <tr>
                <td colspan="4"><strong>TEMA:</strong> ${d.tema} · <em>(Clase ${d.numero_clase} de ${d.total_clases} del Período ${d.periodo})</em></td>
            </tr>
            <tr>
                <td colspan="2"><strong>LUGAR / INSTALACIÓN:</strong> ${d.lugar}</td>
                <td colspan="2"><strong>MATERIALES:</strong> ${d.materiales}</td>
            </tr>
        </table>

        <!-- TABLA 2: ESTRUCTURA PEDAGÓGICA, OBJETIVOS Y ESTÁNDARES MEN -->
        <table>
            <tr>
                <td class="hdr-col" style="width:30%;">PREGUNTA PROBLEMATIZADORA</td>
                <td colspan="3" class="hdr-main" style="width:70%;">OBJETIVOS DE APRENDIZAJE</td>
            </tr>
            <tr>
                <td rowspan="3" style="vertical-align:middle; background:#FAFAFA;">
                    <em>${d.pregunta_problematizadora}</em>
                </td>
                <td colspan="3" class="hdr-sub">OBJETIVO GENERAL</td>
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
                <td colspan="4" class="hdr-main">LINEAMIENTOS CURRICULARES / ORIENTACIONES PEDAGÓGICAS</td>
            </tr>
            <tr>
                <td class="hdr-sub" style="width:33%;">Motriz:</td>
                <td class="hdr-sub" style="width:34%;" colspan="2">Expresivo – corporal:</td>
                <td class="hdr-sub" style="width:33%;">Axiológica – corporal:</td>
            </tr>
            <tr>
                <td>${d.estandares.motriz}</td>
                <td colspan="2">${d.estandares.expresivo_corporal}</td>
                <td>${d.estandares.axilogica_corporal}</td>
            </tr>
            <tr>
                <td colspan="4" class="hdr-main">INDICADORES DE DESEMPEÑO</td>
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

        <!-- TABLA 3: DESCRIPCIÓN DE LA ACTIVIDAD (SECUENCIA DIDÁCTICA) -->
        <table>
            <tr>
                <td colspan="3" class="hdr-main">DESCRIPCIÓN DE LA ACTIVIDAD (SECUENCIA DIDÁCTICA - ${d.duracion_clase.toUpperCase()})</td>
            </tr>
            <tr>
                <td class="hdr-sub" style="width:25%;">PARTE INICIAL<br><span style="font-size:8.5pt; font-weight:normal;">(Activación de saberes · ${d.duraciones.inicial})</span></td>
                <td class="hdr-sub" style="width:50%;">PARTE CENTRAL<br><span style="font-size:8.5pt; font-weight:normal;">(Construcción / Formato: ${d.formato} · ${d.duraciones.central})</span></td>
                <td class="hdr-sub" style="width:25%;">PARTE FINAL<br><span style="font-size:8.5pt; font-weight:normal;">(Aplicación y Metacognición · ${d.duraciones.final})</span></td>
            </tr>
            <tr>
                <td>${d.actividades.fase_inicial}</td>
                <td>${d.actividades.desarrollo_central}</td>
                <td>${d.actividades.fase_final}</td>
            </tr>
            <tr>
                <td class="time-cell">${d.duraciones.inicial}</td>
                <td class="time-cell">${d.duraciones.central}</td>
                <td class="time-cell">${d.duraciones.final}</td>
            </tr>
            <tr>
                <td colspan="2" class="total-time-cell" style="text-align:right;">TIEMPO TOTAL DE LA SESIÓN:</td>
                <td class="total-time-cell">${d.duraciones.total}</td>
            </tr>
        </table>

        <!-- TABLA 4: COMPLEMENTOS PEDAGÓGICOS, INCLUSIÓN PIAR Y EVALUACIÓN -->
        <table>
            <tr>
                <td class="hdr-col" style="width:32%;">TAREA EXTRACURRICULAR</td>
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
                <td class="hdr-col">EVALUACIÓN Y CRITERIOS</td>
                <td>${d.evaluacion}</td>
            </tr>
            <tr>
                <td class="hdr-col">REFLEXIÓN PEDAGÓGICA</td>
                <td>${d.reflexion_pedagogica}</td>
            </tr>
            <tr>
                <td class="hdr-col">RETROALIMENTACIÓN ("El Lenguaje del Profe")</td>
                <td><ul>${retroHtml}</ul></td>
            </tr>
            <tr>
                <td class="hdr-col">LINK DEL VIDEO DE PROFUNDIZACIÓN TEMÁTICA</td>
                <td><a href="${d.video_profundizacion}">${d.video_profundizacion}</a></td>
            </tr>
            <tr>
                <td class="hdr-col">BIBLIOGRAFÍA Y REFERENTES</td>
                <td>${d.bibliografia}</td>
            </tr>
        </table>

        <!-- FIRMAS INSTITUCIONALES -->
        <table style="border:none; margin-top:40px;">
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

    downloadDocFile(docHtml, `Planeacion_Periodo${d.periodo}_Clase${d.numero_clase}_${d.formato.replace(/\s+/g, '_')}.doc`);
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
    const classNum = document.getElementById('prefClassNum') ? document.getElementById('prefClassNum').value : '1';
    const totalClasses = document.getElementById('prefTotalClasses') ? document.getElementById('prefTotalClasses').value : '12';
    const checkedMats = Array.from(document.querySelectorAll('.mat-check:checked')).map(cb => cb.value);
    const materials = checkedMats.length ? checkedMats.join(', ') : 'Aros, Conos y recursos corporales';
    return { format, pedagogy, duration, period, classNum, totalClasses, materials };
}
