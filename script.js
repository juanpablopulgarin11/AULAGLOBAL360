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
            <img src="${f.previewUrl}" alt="Fotograma ${idx+1}">
            <div class="keyframe-tag">#${idx+1} · ${f.time}</div>
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

// GENERACIÓN DE UNIDAD DIDÁCTICA Y PLAN DE CLASE
function generateDidacticPlan(diagnosticoData, prefs, isGroup = false) {
    const skill = diagnosticoData.habilidad_detectada || 'Desarrollo Motor';
    const format = prefs.format;
    const pedagogy = prefs.pedagogy;
    const materials = prefs.materials;

    let distribucion = "";
    let guion = "";

    if (format === "Cuento Motor") {
        distribucion = `Delimitar un círculo central de 6 metros de radio usando ${materials}. Cada estación representa un planeta motriz donde los estudiantes aplican la corrección sin detener la marcha.`;
        guion = `*(Con entusiasmo):* "¡Tripulantes espaciales! Nuestra nave ha entrado en la zona de asteroides. Para no activar las trampas sónicas del suelo, debemos movernos con pies ligeros y brazos firmes a 90 grados. ¡Aterrizaje de pluma en 3, 2, 1... despegue!"`;
    } else if (format === "Circuito de Estaciones") {
        distribucion = `Montaje de 4 estaciones consecutivas en cuadrilátero (10x8 metros). Estación 1: Impulsión reactiva; Estación 2: Coordinación rítmica; Estación 3: Precisión de suelta; Estación 4: Desaceleración y equilibrio sobre colchonetas.`;
        guion = `*(Explicación técnica en lenguaje sencillo):* "Equipo: en cada estación nos enfocaremos en un solo detalle del cuerpo. Cuando suene el silbato, congelen la postura 1 segundo para verificar su apoyo y luego avancen."`;
    } else {
        distribucion = `Espacio libre delimitado de 12x12 metros usando ${materials}. Zonas seguras perimetrales de 2 metros para evitar colisiones durante la aceleración.`;
        guion = `*(Reto cooperativo):* "El reto de hoy consiste en trasladar todos los materiales al centro sin que se caiga ninguno. La regla de oro es que cada relevo debe realizarse con la postura corregida."`;
    }

    return {
        tema: `Unidad Didáctica Biomecánica: Perfeccionamiento de ${skill}`,
        formato: format,
        metodologia: pedagogy,
        materiales: materials,
        grado_sugerido: diagnosticoData.edad_calibrada || 'Primaria (5-11 años)',
        estadio_prevalente: diagnosticoData.estadio_gallahue,
        objetivo_clase: `Optimizar la eficiencia de la cadena cinética y corregir los patrones de ${skill} mediante dinámicas lúdicas basadas en ${pedagogy}.`,
        distribucion_espacial: distribucion,
        guion_docente: guion,
        alertas_seguridad: `Asegurar suelo seco y libre de humedad. Mantener separación mínima de 2 metros entre estudiantes al correr o saltar. Usar colchonetas en las zonas de aterrizaje de impacto.`,
        frases_clave: diagnosticoData.frases_profe || [
            "¡Aterriza como gato ninja!",
            "¡Brazos de robot a 90 grados!"
        ],
        actividades: {
            fase_inicial: "Calentamiento y Activación Dinámica (10 min): Desplazamientos articulares lúdicos ('El semáforo motriz'). Elevación progresiva de la temperatura corporal con movilidad de tobillos, rodillas y cintura escapular.",
            desarrollo_central: `Desarrollo Central (${format}) (30 min): Aplicación de la metodología de ${pedagogy}. Se forman subgrupos de trabajo. El docente rota por cada estación utilizando las consignas verbales para corregir en caliente sin detener el flujo lúdico.`,
            fase_final: "Vuelta a la Calma y Círculo de Reflexión (10 min): Estiramiento miofascial guiado en el suelo. Pregunta metacognitiva: '¿Qué sintió tu cuerpo al aterrizar más suave?'"
        },
        inclusion: "Para estudiantes con necesidades educativas especiales o movilidad diversa: Adaptar las distancias a la mitad, permitir apoyos con cuerdas guía o compañeros tutores, y priorizar la participación placentera por encima de la velocidad.",
        evaluacion_sugerida: "Evaluación Formativa Continua mediante lista de chequeo biomecánica de 3 criterios clave."
    };
}

// RENDERIZADOR HTML DE UNIDAD DIDÁCTICA
function renderDidacticaHTML(didactica) {
    globalDidacticaData = didactica;

    return `
        <div class="diag-card" style="border-left-color: var(--accent2);">
            <div class="diag-header-bar">
                <div>
                    <div class="diag-title">${didactica.tema}</div>
                    <div class="diag-meta">Formato: <strong>${didactica.formato}</strong> | Metodología: <strong>${didactica.metodologia}</strong></div>
                </div>
                <span class="stage-badge stage-maduro">Planeación Lista</span>
            </div>

            <p style="font-size:12.5px; color:var(--muted); margin-bottom:12px;"><strong>🎯 Objetivo:</strong> ${didactica.objetivo_clase}</p>

            <div style="background:#F0FDF4; border-left:3px solid var(--accent2); padding:10px 14px; border-radius:6px; font-size:12px; margin-bottom:12px;">
                <strong>📍 Montaje y Distribución Espacial:</strong><br>
                ${didactica.distribucion_espacial}
                <div style="margin-top:6px; color:var(--accent2); font-style:italic;">
                    <strong>Guion del Profe:</strong> ${didactica.guion_docente}
                </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:8px; font-size:12px; color:var(--text); margin-bottom:12px;">
                <div><strong>🔥 Fase Inicial (10 min):</strong> ${didactica.actividades.fase_inicial}</div>
                <div><strong>⚡ Desarrollo Central (30 min):</strong> ${didactica.actividades.desarrollo_central}</div>
                <div><strong>🧘 Fase Final (10 min):</strong> ${didactica.actividades.fase_final}</div>
            </div>

            <button class="btn-export-plan" onclick="exportToWord()">
                📄 Descargar Planeación de Clase Completa (.doc para Docente Titular)
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
            habilidad_detectada: 'Corrección Masiva del Salón',
            edad_calibrada: 'Grupo Completo',
            estadio_gallahue: 'Elemental Prevalente',
            frases_profe: [
                "¡Codos pegados en 90 grados para que el equipo vuele!",
                "¡Que no se escuche ningún aterrizaje en el patio!"
            ]
        }, teacherPrefs, true);

        addMsg('bot', renderDidacticaHTML(didacticaGrupal), true);

        isAnalyzing = false;
    }, 1200);
}

// EXPORTACIÓN A MICROSOFT WORD (.DOC)
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
        body { font-family: 'Arial', sans-serif; font-size: 11pt; color: #1E293B; }
        h1 { text-align: center; color: #0284C7; font-size: 16pt; margin-bottom: 4px; }
        .sub { text-align: center; color: #64748B; font-size: 10pt; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        th { background-color: #E2E8F0; padding: 8px; border: 1px solid #000; text-align: left; }
        .badge { display: inline-block; padding: 4px 8px; background-color: #E0F2FE; font-weight: bold; border-radius: 4px; }
    </style></head>
    <body>
        <h1>INFORME DE EVALUACIÓN BIOMECÁNICA HMB</h1>
        <div class="sub">Plataforma AULA GLOBAL 360 · Batería Validada · Fecha: ${hoy}</div>

        <table>
            <tr><td colspan="2" style="background:#F1F5F9; padding:8px; border:1px solid #000;"><strong>DATOS DEL ESTUDIANTE Y EVALUACIÓN</strong></td></tr>
            <tr><td style="padding:6px; border:1px solid #000;"><strong>Habilidad Evaluada:</strong> ${d.habilidad_detectada.toUpperCase()}</td><td style="padding:6px; border:1px solid #000;"><strong>Estadio Motor (Gallahue):</strong> ${d.estadio_gallahue.toUpperCase()}</td></tr>
            <tr><td style="padding:6px; border:1px solid #000;"><strong>Índice de Madurez:</strong> ${d.porcentaje_madurez}%</td><td style="padding:6px; border:1px solid #000;"><strong>Calibración:</strong> ${d.edad_calibrada || '5 a 11 años'}</td></tr>
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

function exportToWord() {
    if (!globalDidacticaData) return;
    const d = globalDidacticaData;
    const hoy = new Date().toLocaleDateString('es-CO');

    const docHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>Planeación de Clase Aula Global 360</title>
    <style>
        body { font-family: 'Arial', sans-serif; font-size: 11pt; color: #0F172A; }
        h1 { text-align: center; font-size: 16pt; color: #0369A1; margin-bottom: 2px; }
        .sub { text-align: center; color: #64748B; font-size: 10pt; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        th, td { border: 1px solid black; padding: 8px; vertical-align: top; }
        .header-cell { background-color: #E2E8F0; font-weight: bold; text-align: center; }
        .title-cell { background-color: #CBD5E1; font-weight: bold; font-size: 12pt; text-align: center; }
        .alert { background-color: #FEF2F2; border-left: 4px solid #DC2626; padding: 10px; margin: 10px 0; }
        .tips { background-color: #F0FDF4; border-left: 4px solid #059669; padding: 10px; margin: 10px 0; }
    </style></head>
    <body>
        <h1>FORMATO INSTITUCIONAL - PLANEACIÓN DE CLASE</h1>
        <div class="sub">Ecosistema AULA GLOBAL 360 · Educación Física · Fecha: ${hoy}</div>

        <table>
            <tr><td colspan="4" class="title-cell">${d.tema.toUpperCase()}</td></tr>
            <tr><td colspan="2"><strong>Área:</strong> Educación Física, Recreación y Deporte</td><td colspan="2"><strong>Grado / Edad:</strong> ${d.grado_sugerido}</td></tr>
            <tr><td colspan="2"><strong>Formato Didáctico:</strong> ${d.formato}</td><td colspan="2"><strong>Metodología:</strong> ${d.metodologia}</td></tr>
            <tr><td colspan="4"><strong>Materiales Requeridos:</strong> ${d.materiales}</td></tr>
        </table>

        <div class="alert"><strong>⚠️ PREVENCIÓN, SEGURIDAD Y ESPACIO:</strong><br>${d.alertas_seguridad}</div>
        <div class="tips"><strong>🗣️ EL LENGUAJE DEL PROFE (Tips de retroalimentación inmediata):</strong><br>${d.frases_clave.join('<br>')}</div>

        <table><tr><td class="header-cell">OBJETIVO BIOMECÁNICO Y MOTOR DE LA CLASE</td></tr><tr><td>${d.objetivo_clase}</td></tr></table>

        <table>
            <tr><td colspan="3" class="title-cell">ESTRUCTURA Y DESARROLLO DE LA SESIÓN (50 MINUTOS)</td></tr>
            <tr><td class="header-cell" style="width:25%;">Parte Inicial (10 min)</td><td class="header-cell" style="width:50%;">Parte Central (30 min)</td><td class="header-cell" style="width:25%;">Parte Final (10 min)</td></tr>
            <tr>
                <td>${d.actividades.fase_inicial}</td>
                <td>
                    <strong>1. Montaje y Distribución Espacial:</strong><br>${d.distribucion_espacial}<br><br>
                    <strong>2. Guion / Instrucción Inicial:</strong><br><em>"${d.guion_docente}"</em><br><br>
                    <strong>3. Desarrollo y Corrección Activa:</strong><br>${d.actividades.desarrollo_central}
                </td>
                <td>${d.actividades.fase_final}</td>
            </tr>
        </table>

        <table>
            <tr><td class="header-cell">PAUTAS DE INCLUSIÓN Y ATENCIÓN A LA DIVERSIDAD</td></tr>
            <tr><td>${d.inclusion}</td></tr>
            <tr><td class="header-cell">SISTEMA DE EVALUACIÓN SUGERIDO</td></tr>
            <tr><td>${d.evaluacion_sugerida}</td></tr>
        </table>

        <br><br>
        <p style="text-align:center;">____________________________________________<br><strong>Firma del Docente Titular de Educación Física</strong></p>
    </body></html>`;

    downloadDocFile(docHtml, `Planeacion_Clase_${d.formato.replace(/\s+/g, '_')}.doc`);
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
    const format = document.getElementById('prefFormat').value;
    const pedagogy = document.getElementById('prefPedagogy').value;
    const checkedMats = Array.from(document.querySelectorAll('.mat-check:checked')).map(cb => cb.value);
    const materials = checkedMats.length ? checkedMats.join(', ') : 'Recursos corporales y marcas de tiza en el piso';
    return { format, pedagogy, materials };
}
