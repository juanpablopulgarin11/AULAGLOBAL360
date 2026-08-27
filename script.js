let apiKey = '';
let selectedSkill = 'auto';
let selectedMode = 'diagnostico';
let capturedFrames = [];
let isLoading = false;
let globalDidacticaData = null; 
let globalDiagnosticoData = null; // Para descargar el reporte individual

// VARIABLES PARA EL MODO GRUPAL
let isGroupActive = false;
let targetStudents = 30;
let evaluatedStudents = 0;
let groupErrorsMemory = [];

const chat = document.getElementById('chatScroll');

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('active');
}

function openModal() { document.getElementById('recordingModal').style.display = 'flex'; }
function closeModal() { document.getElementById('recordingModal').style.display = 'none'; }
function closeModalOnOutside(event) { if (event.target === document.getElementById('recordingModal')) closeModal(); }

function selectSkill(el, skillName, videoFileName) {
    document.querySelectorAll('.skill-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    selectedSkill = el.dataset.skill;
    document.getElementById('avatarTitle').textContent = `CGI BIOMECÁNICO: ${skillName.toUpperCase()}`;
    
    const avatarVid = document.getElementById('avatarVideoPlayer');
    const avatarPlc = document.getElementById('avatarPlaceholder');

    if(videoFileName) {
        avatarVid.src = videoFileName; 
        avatarVid.style.display = 'block';
        avatarPlc.style.display = 'none';
        avatarVid.play().catch(e => {
            avatarVid.style.display = 'none';
            avatarPlc.style.display = 'flex';
            avatarPlc.querySelector('span:nth-child(3)').textContent = `Simulando Patrón: ${skillName}`;
        });
    } else {
        avatarVid.style.display = 'none';
        avatarPlc.style.display = 'flex';
        avatarPlc.querySelector('span:nth-child(3)').textContent = `Selecciona una habilidad`;
    }
    
    if(window.innerWidth <= 1024) { toggleSidebar(); }
}

function selectMode(el) {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    selectedMode = el.dataset.mode;
    
    const modeBadge = document.getElementById('modeBadge');
    const groupPanel = document.getElementById('groupPanel');

    if(selectedMode === 'grupal') {
        modeBadge.textContent = `MODO: GRUPAL`;
        modeBadge.style.background = '#FEF3C7';
        modeBadge.style.color = '#D97706';
        groupPanel.style.display = 'flex';
    } else {
        modeBadge.textContent = `MODO: INDIVIDUAL`;
        modeBadge.style.background = 'var(--tag-bg)';
        modeBadge.style.color = 'var(--tag-color)';
        groupPanel.style.display = 'none';
        isGroupActive = false;
        document.getElementById('groupSetup').style.display = 'block';
        document.getElementById('groupProgress').style.display = 'none';
    }
    
    if(window.innerWidth <= 1024) { toggleSidebar(); }
}

function startGroupMode() {
    let val = parseInt(document.getElementById('totalStudents').value);
    if(val < 1) val = 1;
    targetStudents = val;
    evaluatedStudents = 0;
    groupErrorsMemory = []; 
    isGroupActive = true;

    document.getElementById('groupSetup').style.display = 'none';
    document.getElementById('groupProgress').style.display = 'flex';
    
    updateGroupUI();
    addMsg('bot', `🎒 <strong>Registro Grupal Iniciado.</strong><br>Sube el video del Estudiante 1 y presiona enviar. Guardaré sus datos en la memoria.`);
}

function updateGroupUI() {
    document.getElementById('groupCounterText').textContent = `Evaluando: ${evaluatedStudents} de ${targetStudents}`;
    document.getElementById('groupProgressBar').max = targetStudents;
    document.getElementById('groupProgressBar').value = evaluatedStudents;

    const btnFinish = document.getElementById('btnFinishGroup');
    if(evaluatedStudents > 0) {
        btnFinish.style.display = 'inline-block';
    }
    
    if(evaluatedStudents >= targetStudents && targetStudents > 0) {
        btnFinish.textContent = "✅ Grupo Completo - Generar Planeación";
        btnFinish.style.background = "#059669";
        addMsg('bot', `🎉 ¡Has evaluado a los ${targetStudents} estudiantes! Haz clic en el botón verde de arriba para generar la Planeación Consolidada.`);
    }
}

function saveKey() {
    apiKey = 'modo-offline';
    const keyOk = document.getElementById('keyOk');
    keyOk.textContent = "✓ Modo Simulado Activo";
    keyOk.style.display = 'inline';
    setTimeout(() => keyOk.style.display = 'none', 3000);
}

function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
}

function addMsg(role, content, isHtml = false) {
    const wrap = document.createElement('div');
    wrap.className = `msg ${role}`;
    if(role === 'bot'){ wrap.innerHTML = `<div class="msg-av">✨</div>`; }
    
    const bub = document.createElement('div');
    bub.className = 'bubble';
    if (isHtml) bub.innerHTML = content;
    else bub.textContent = content;
    wrap.appendChild(bub);
    
    if(role === 'user'){ wrap.innerHTML += `<div class="msg-av">TÚ</div>`; }

    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
    return bub;
}

function showTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'msg bot';
    wrap.id = 'typing';
    wrap.innerHTML = `<div class="msg-av">✨</div><div class="bubble"><div class="typing"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>`;
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
}

function removeTyping() { 
    const t = document.getElementById('typing'); 
    if (t) t.remove(); 
}

async function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const uz = document.getElementById('uploadZone');
    const videoPlayer = document.getElementById('studentVideoPlayer');
    const imgPreview = document.getElementById('studentImgPreview');
    const placeholder = document.getElementById('studentPlaceholder');
    const statusDot = document.getElementById('studentStatus');

    uz.innerHTML = `<div class="uz-icon">⏳</div><div class="uz-title">Procesando archivo...</div>`;
    
    try {
        const fileUrl = URL.createObjectURL(file);
        placeholder.style.display = 'none';
        statusDot.classList.add('active');

        if (file.type.startsWith('video/')) {
            imgPreview.style.display = 'none';
            videoPlayer.src = fileUrl;
            videoPlayer.style.display = 'block';
        } else if (file.type.startsWith('image/')) {
            videoPlayer.style.display = 'none';
            imgPreview.src = fileUrl;
            imgPreview.style.display = 'block';
        }

        capturedFrames = await extractFrames(file);
        uz.innerHTML = `<div class="uz-icon">✅</div><div class="uz-title">Archivo en memoria listo para analizar</div>`;
    } catch (e) {
        uz.innerHTML = `<div class="uz-icon">❌</div><div class="uz-title">Error al procesar</div>`;
        statusDot.classList.remove('active');
    }
}

async function extractFrames(file) {
    return new Promise((resolve) => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = e => resolve([{ data: e.target.result.split(',')[1], mime: file.type }]);
            reader.readAsDataURL(file);
            return;
        }
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.muted = true;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const frames = [];
        video.addEventListener('loadedmetadata', () => {
            const dur = Math.min(video.duration, 15);
            const times = [0.2, dur * 0.5, dur * 0.85];
            canvas.width = 640; canvas.height = 360;
            let done = 0;
            times.forEach((t, i) => {
                const v2 = document.createElement('video');
                v2.src = video.src; v2.muted = true;
                v2.addEventListener('seeked', () => {
                    ctx.drawImage(v2, 0, 0, 640, 360);
                    frames[i] = { data: canvas.toDataURL('image/jpeg', 0.8).split(',')[1], mime: 'image/jpeg' };
                    done++;
                    if (done === times.length) resolve(frames.filter(Boolean));
                });
                v2.currentTime = t;
            });
        });
        video.load();
    });
}

function renderDiagnostico(data) {
    globalDiagnosticoData = data; // Guardamos para exportar
    let rows = '';
    data.criterios.forEach(c => {
        const badge = c.puntaje === 1 ? `<span class="badge-1">✓ Lo hace</span>` : `<span class="badge-0">✗ No lo hace</span>`;
        rows += `<tr><td>${c.criterio}</td><td>${badge}</td></tr>`;
    });

    return `
    <div class="diag-header">${data.habilidad.toUpperCase()}</div>
    <div class="diag-stage">Estadio Detectado: <strong>${data.estadio_gallahue}</strong></div>
    <div class="diag-table-container">
        <table class="diag-table">
            <thead><tr><th>Criterio Biomecánico (Batería Validada)</th><th>Puntuación</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </div>
    <br>
    <strong>🔍 Diagnóstico General:</strong><br>
    <span style="color:var(--muted); font-size:13.5px;">${data.diagnostico_general}</span>
    
    <button class="help-btn" style="background: #E2E8F0; color: #1E293B; border: 1px solid #CBD5E1; width: 100%; justify-content: center; font-size: 13px; padding: 10px; border-radius: 8px; margin-top: 15px;" onclick="exportDiagnosticoToWord()">
        📥 Descargar Reporte del Estudiante (Para Padres/Historial)
    </button>
    `;
}

// Función para descargar solo el diagnóstico del estudiante
function exportDiagnosticoToWord() {
    if(!globalDiagnosticoData) return;
    const d = globalDiagnosticoData;
    const hoy = new Date().toLocaleDateString('es-CO');

    let filasCriterios = "";
    d.criterios.forEach(c => {
        let estado = c.puntaje === 1 ? "LOGRADO" : "EN PROCESO";
        filasCriterios += `<tr><td style="padding: 8px; border: 1px solid #000;">${c.criterio}</td><td style="padding: 8px; border: 1px solid #000; text-align: center;"><strong>${estado}</strong></td></tr>`;
    });

    const docHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>Reporte Biomecánico</title><style>body { font-family: 'Arial', sans-serif; font-size: 11pt; } h1 { text-align: center; color: #1E293B; font-size: 16pt; } .sub { text-align: center; color: #64748B; margin-bottom: 20px;} table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }</style></head>
    <body>
        <h1>REPORTE DE DESARROLLO MOTOR</h1>
        <div class="sub">Generado por Aula Global 360 - Fecha: ${hoy}</div>
        
        <p><strong>Habilidad Evaluada:</strong> ${d.habilidad.toUpperCase()}</p>
        <p><strong>Estadio Motor Detectado (Gallahue):</strong> ${d.estadio_gallahue}</p>
        
        <table>
            <tr style="background-color: #E2E8F0;">
                <th style="padding: 8px; border: 1px solid #000;">Criterio Biomecánico Evaluado</th>
                <th style="padding: 8px; border: 1px solid #000;">Estado</th>
            </tr>
            ${filasCriterios}
        </table>
        
        <h3>Observación del Docente / Sistema:</h3>
        <p style="border: 1px solid #CCC; padding: 10px; background-color: #F8FAFC;">${d.diagnostico_general}</p>
        <br><br>
        <p>______________________________________<br>Firma del Docente Titular</p>
    </body></html>`;

    const blob = new Blob(['\ufeff', docHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = `Reporte_Estudiante_AulaGlobal.doc`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

function renderDidactica(data) {
    globalDidacticaData = data; 
    return `
    <div class="didactic-preview">
        <h3>📖 Unidad Didáctica Generada</h3>
        <p>Se ha estructurado la planeación adaptada al formato <strong>"${data.formato_elegido}"</strong>.<br>
        <em>Incluye guía paso a paso, medidas espaciales y el "Lenguaje del Profe".</em></p>
        <button class="help-btn" style="background: #059669; color: white; border: none; width: 100%; justify-content: center; font-size: 14px; padding: 12px; border-radius: 8px;" onclick="exportToWord()">
            📄 Descargar Planeación de Clase Completa (.doc)
        </button>
    </div>
    `;
}

function exportToWord() {
    if(!globalDidacticaData) return;
    const d = globalDidacticaData;
    const hoy = new Date().toLocaleDateString('es-CO');

    const formatearTexto = (texto) => {
        if(typeof texto === 'string') {
            return texto.replace(/\n/g, '<br>');
        }
        return texto || '';
    };

    const docHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Planeación Aula Global 360</title><style>body { font-family: 'Arial', sans-serif; font-size: 11pt; } table { width: 100%; border-collapse: collapse; margin-bottom: 15px;} th, td { border: 1px solid black; padding: 8px; text-align: left; vertical-align: top;} .header-cell { background-color: #E2E8F0; font-weight: bold; text-align: center;} .title-cell { background-color: #CBD5E1; font-weight: bold; text-align: center; font-size: 12pt;} h1 { text-align: center; font-size: 16pt; color: #1E293B; } .highlight { color: #0284C7; font-weight: bold; } .alert { background-color: #FEF2F2; border-left: 4px solid #DC2626; padding: 10px; margin: 10px 0; } .tips { background-color: #F0FDF4; border-left: 4px solid #059669; padding: 10px; margin: 10px 0; }</style></head><body>
    <h1>Unidad didáctica<br>${formatearTexto(d.tema)}</h1>
    <table><tr><td colspan="4" class="title-cell">FORMATO - PLANEACIÓN DE CLASE PARA DOCENTE TITULAR</td></tr><tr><td colspan="2"><strong>Clase nº:</strong> 1</td><td colspan="2"><strong>Fecha:</strong> ${hoy}</td></tr><tr><td colspan="2"><strong>Área:</strong> Educación Física</td><td colspan="2"><strong>Grado:</strong> ${d.grado_sugerido}</td></tr><tr><td colspan="2"><strong>Formato:</strong> <span class="highlight">${d.formato_elegido}</span></td><td colspan="2"><strong>Metodología:</strong> <span class="highlight">${d.metodologia_elegida}</span></td></tr><tr><td colspan="4"><strong>Material y su distribución:</strong> ${formatearTexto(d.materiales)}</td></tr></table>
    
    <div class="alert"><strong>⚠️ PREVENCIÓN Y SEGURIDAD:</strong><br>${formatearTexto(d.alertas_seguridad)}</div>
    <div class="tips"><strong>🗣️ EL LENGUAJE DEL PROFE (Tips para corregir):</strong><br>${formatearTexto(d.frases_retroalimentacion)}</div>

    <table><tr><td class="header-cell">Pregunta problematizadora</td></tr><tr><td>${formatearTexto(d.pregunta_problematizadora)}</td></tr></table>
    <table><tr><td colspan="3" class="title-cell">Estándares básicos de competencias del ciclo</td></tr><tr><td width="33%"><strong>Motriz:</strong><br>${formatearTexto(d.estandares.motriz)}</td><td width="33%"><strong>Expresivo – corporal:</strong><br>${formatearTexto(d.estandares.expresivo)}</td><td width="33%"><strong>Axiológica – corporal:</strong><br>${formatearTexto(d.estandares.axiologico)}</td></tr></table>
    <table><tr><td class="header-cell">Objetivo Biomecánico de la Clase</td></tr><tr><td>${formatearTexto(d.objetivo_clase)}</td></tr></table>
    
    <table><tr><td colspan="3" class="title-cell">GUÍA PASO A PASO PARA EL DOCENTE (DESARROLLO DE LA CLASE)</td></tr>
    <tr><td class="header-cell">Parte inicial – Activación (10 min)</td><td class="header-cell">Parte central - Construcción (30 min)</td><td class="header-cell">Parte Final - Aplicación (10 min)</td></tr>
    <tr><td>${formatearTexto(d.actividades.fase_inicial)}</td><td>
    <strong>1. Distribución del Espacio (Montaje):</strong><br>${formatearTexto(d.actividades.distribucion_espacial)}<br><br>
    <strong>2. Guion / Instrucción al Estudiante:</strong><br>${formatearTexto(d.actividades.guion_docente)}<br><br>
    <strong>3. Desarrollo y Corrección:</strong><br>${formatearTexto(d.actividades.desarrollo_central)}
    </td><td>${formatearTexto(d.actividades.fase_final)}</td></tr></table>
    
    <table><tr><td><strong>Adaptaciones de Inclusión:</strong><br>${formatearTexto(d.inclusion)}</td></tr><tr><td><strong>Evaluación:</strong><br>${formatearTexto(d.evaluacion_sugerida)}</td></tr></table></body></html>`;

    const blob = new Blob(['\ufeff', docHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = `Planeacion_AulaGlobal360.doc`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

// Función para obtener las preferencias del docente
function getTeacherPreferences() {
    const format = document.getElementById('prefFormat').value;
    const pedagogy = document.getElementById('prefPedagogy').value;
    const matChecks = document.querySelectorAll('.mat-check:checked');
    let materials = Array.from(matChecks).map(cb => cb.value).join(", ");
    if (!materials) materials = "Ninguno (Uso del propio cuerpo o marcas en el piso con tiza/cinta)";
    return { format, pedagogy, materials };
}

// Generador de Narrativa y Distribución Espacial dinámica según formato
function generarContenidoEspecifico(format, materials, fallosText) {
    let distribucion = "";
    let guion = "";
    
    if(format === "Cuento Motor") {
        distribucion = `- Dibuja con tiza o usa cinta para hacer un gran círculo de 5 metros de diámetro en el centro del patio.
- Ubica los materiales (${materials}) dentro del círculo, separados exactamente por 1 metro de distancia entre sí, formando 'islas'.`;
        guion = `*(Leer con entusiasmo a los niños):* "¡Atención exploradores espaciales! Nuestra nave ha aterrizado en un planeta desconocido. El suelo está hecho de lava pegajosa. Para llegar a la base secreta, debemos cruzar pisando únicamente las islas mágicas (${materials}). ¡Pero cuidado! La gravedad aquí es extraña, así que para no caer, debemos asegurarnos de [insertar corrección, ej: mover el brazo contrario a la pierna que pisa]. ¡Adelante!"`;
    } else if (format === "Circuito de Estaciones") {
        distribucion = `- Estación 1: Ubicada en la esquina derecha. Coloca los primeros elementos de (${materials}) en línea recta, con una separación de 2 metros entre cada uno.
- Estación 2: A 5 metros de la Estación 1. Crea una zona de zig-zag.
- El espacio total requerido es un rectángulo libre de obstáculos de al menos 10x5 metros.`;
        guion = `*(Explicación clara):* "Chicos, hoy tenemos un circuito de entrenamiento Ninja. En la primera estación, van a cruzar los obstáculos, pero mi único objetivo hoy como su Sensei es observar cómo ubican su cuerpo. Cuando lleguen al elemento, quiero que pausen 1 segundo, acomoden su postura y avancen."`;
    } else {
        distribucion = `- Delimita un cuadrado de 8x8 metros usando referencias del patio.
- Esparce los materiales (${materials}) de manera aleatoria por todo el cuadrado, asegurando que haya al menos 1.5 metros de espacio libre alrededor de cada objeto para evitar choques al correr o lanzar.`;
        guion = `*(Instrucción del Reto):* "Equipo, el reto de hoy es trabajar juntos para recolectar/superar los obstáculos del área. Tienen 3 minutos. La única regla de oro para que el punto cuente es que deben realizar el movimiento corrigiendo este detalle específico: ${fallosText}."`;
    }

    return { distribucion, guion };
}

async function callGemini(userText) {
    isLoading = true;
    document.getElementById('sendBtn').disabled = true;
    showTyping();

    await new Promise(resolve => setTimeout(resolve, 2000));
    removeTyping();

    const mockResponse = {
        "habilidad": selectedSkill === 'auto' ? "HABILIDAD DETECTADA (Simulación)" : selectedSkill.toUpperCase() + " (Simulación)",
        "estadio_gallahue": "Elemental",
        "criterios": [
            {"criterio": "Fase de vuelo evidente durante el patrón.", "puntaje": Math.random() > 0.5 ? 1 : 0},
            {"criterio": "Brazos en oposición a las piernas.", "puntaje": 0},
            {"criterio": "Postura del tronco adecuada y controlada.", "puntaje": 1},
            {"criterio": "Aterrizaje suave o absorción del impacto.", "puntaje": 0}
        ],
        "diagnostico_general": "El estudiante muestra un desarrollo en proceso. Se evidencian fallos mecánicos principalmente en la coordinación asimétrica (oposición de brazos) y en la absorción del impacto al caer."
    };

    if(selectedMode === 'diagnostico') {
        addMsg('bot', renderDiagnostico(mockResponse), true);
        
        let fallos = mockResponse.criterios.filter(c => c.puntaje === 0).map(c => c.criterio);
        if(fallos.length === 0) fallos.push("Falta de fluidez general"); 
        const fallosText = fallos.join(", ");

        showTyping();
        await new Promise(resolve => setTimeout(resolve, 2000));
        removeTyping();

        const prefs = getTeacherPreferences();
        const contenido = generarContenidoEspecifico(prefs.format, prefs.materials, fallosText);

        const mockDidacticaIndividual = {
            "tema": "Corrección Activa: " + selectedSkill.toUpperCase(),
            "grado_sugerido": "Adaptable al nivel",
            "edades_sugeridas": "5 a 11 años",
            "habilidad_detectada": fallosText,
            "formato_elegido": prefs.format,
            "metodologia_elegida": prefs.pedagogy,
            "materiales": prefs.materials,
            
            // NUEVAS ADICIONES PARA EL DOCENTE
            "alertas_seguridad": "Asegúrese de que el piso esté completamente seco. Al usar " + prefs.materials + ", mantenga una distancia mínima de 1.5 metros entre el estudiante y cualquier pared o columna para evitar colisiones durante la corrección del movimiento.",
            "frases_retroalimentacion": `En lugar de decir 'lo estás haciendo mal' o usar términos técnicos, dígale al niño:
- Para la postura: 'Imagina que tienes un hilo mágico en la cabeza que te jala hacia las nubes'.
- Para brazos en oposición: 'Imagina que tu brazo derecho está amarrado a tu pierna izquierda con un resorte invisible'.
- Para el aterrizaje: 'Cae suavemente como si fueras un gato ninja, ¡que no se escuchen tus pies!'`,
            
            "pregunta_problematizadora": "¿Cómo podemos utilizar nuestro cuerpo de forma eficiente para que el movimiento no nos canse tanto?",
            "estandares": { "motriz": "Ejecuto desplazamientos corrigiendo la postura.", "expresivo": "Manifiesto seguridad al intentar nuevos retos.", "axiologico": "Comprendo la importancia de realizar el movimiento correctamente para no lastimarme." },
            "indicadores": { "conocer": "Identifica qué debe ajustar en su cuerpo.", "hacer": "Aplica la corrección durante el juego.", "ser": "Muestra disposición para repetir tras la retroalimentación." },
            "objetivo_clase": `Corregir los fallos biomecánicos específicos detectados (${fallosText}) mediante un formato de ${prefs.format}.`,
            
            "actividades": { 
                "fase_inicial": `Calentamiento (10 min): Ambientación enfocada en la temática. El estudiante interactúa libremente con los materiales (${prefs.materials}) desplazándose por el espacio para entrar en calor y aumentar la frecuencia cardíaca.`, 
                "distribucion_espacial": contenido.distribucion,
                "guion_docente": contenido.guion,
                "desarrollo_central": `Usando la metodología de ${prefs.pedagogy}, el docente observará al estudiante intentar el recorrido. Detendrá la actividad a los 2 minutos, utilizará las 'Frases de Retroalimentación' (El Lenguaje del Profe) para darle el tip al niño, y le pedirá que repita el ejercicio aplicando el ajuste en su cuerpo.`,
                "fase_final": "Vuelta a la calma (10 min): Estiramiento guiado sentados en el piso. El docente pregunta: '¿Qué sentiste en tus piernas/brazos al hacerlo como gato ninja?'" 
            },
            "inclusion": "Para estudiantes con movilidad reducida: Reducir todas las distancias a la mitad. Permitir que el estudiante realice el recorrido caminando a paso lento o con acompañamiento físico del docente. Priorizar siempre la participación y la sonrisa por encima de la técnica.",
            "tarea_extracurricular": "Practicar el gesto motor frente a un espejo en casa durante 5 minutos diarios.",
            "evaluacion_sugerida": "Observación formativa. El docente verificará visualmente si, tras darle la instrucción con lenguaje sencillo, el estudiante logra aplicar la corrección de: " + fallosText + "."
        };

        addMsg('bot', renderDidactica(mockDidacticaIndividual), true);

    } 
    else if (selectedMode === 'grupal' && isGroupActive) {
        let fallos = mockResponse.criterios.filter(c => c.puntaje === 0).map(c => c.criterio);
        if(fallos.length === 0) fallos.push("Falta de fluidez general"); 
        
        groupErrorsMemory.push(...fallos);
        evaluatedStudents++;
        
        updateGroupUI();
        
        addMsg('bot', `<span style="color:#D97706; font-weight:bold;">🎒 Estudiante ${evaluatedStudents} registrado.</span><br>Se detectaron ${fallos.length} fallos simulados. Sube el siguiente video.`, true);
    }

    isLoading = false;
    document.getElementById('sendBtn').disabled = false;
    capturedFrames = [];
    document.getElementById('uploadZone').innerHTML = `<div class="uz-icon">🎬</div><div class="uz-title">Subir nuevo video</div>`;
}

async function generateGroupPlan() {
    if(groupErrorsMemory.length === 0) {
        alert("No has evaluado a ningún estudiante todavía.");
        return;
    }

    isLoading = true;
    showTyping();

    await new Promise(resolve => setTimeout(resolve, 2500));

    const fallosUnicos = [...new Set(groupErrorsMemory)].join(", ");
    removeTyping();

    const prefs = getTeacherPreferences();
    const contenido = generarContenidoEspecifico(prefs.format, prefs.materials, "los patrones deficientes del grupo");

    const mockDidactica = {
        "tema": "Corrección Grupal Biomecánica",
        "grado_sugerido": "Segundo a Cuarto de Primaria",
        "edades_sugeridas": "7 a 9 años",
        "habilidad_detectada": fallosUnicos,
        "formato_elegido": prefs.format,
        "metodologia_elegida": prefs.pedagogy,
        "materiales": prefs.materials,
        
        "alertas_seguridad": "Debido a que es una actividad grupal, establezca un sistema de señales (ej. silbato = 'estatuas'). Asegúrese de que haya al menos 2 metros de separación entre grupos de trabajo para evitar colisiones masivas.",
        "frases_retroalimentacion": `Diríjase al grupo usando metáforas visuales:
- '¡Brazos de robot!' (si la falla es en los brazos).
- '¡Aterrizaje de pluma!' (si el impacto es muy fuerte).
- '¡Troncos de árbol firme!' (para mejorar la postura).`,

        "pregunta_problematizadora": "¿Cómo podemos superar los obstáculos ayudándonos entre todos y coordinando nuestro cuerpo?",
        "estandares": { "motriz": "Controlo de forma global la realización de movimientos.", "expresivo": "Expreso emociones a través del cuerpo.", "axiologico": "Respeto las reglas del grupo." },
        "indicadores": { "conocer": "Identifica la importancia de la postura.", "hacer": `Mejora las barreras de: ${fallosUnicos}.`, "ser": "Participa activamente en equipo." },
        "objetivo_clase": `Corregir de forma masiva los patrones biomecánicos deficientes detectados en el salón utilizando un enfoque de ${prefs.format}.`,
        
        "actividades": { 
            "fase_inicial": "Calentamiento (10 min): Juego de persecución tradicional modificado ('La lleva'). El docente caminará por el área observando las posturas generales del grupo mientras corren.", 
            "distribucion_espacial": contenido.distribucion,
            "guion_docente": contenido.guion,
            "desarrollo_central": `Se divide al salón en subgrupos de 4 a 5 estudiantes. Mediante la técnica de ${prefs.pedagogy}, el docente planteará el reto y rotará por cada grupo. Utilizará las 'Frases de Retroalimentación' para hacer correcciones generales en voz alta sin detener la fluidez del juego.`,
            "fase_final": "Vuelta a la calma (10 min): Círculo de la palabra. Cada grupo menciona qué fue lo más difícil de coordinar con su cuerpo hoy." 
        },
        "inclusion": "Si en el grupo hay estudiantes con necesidades educativas especiales: Asignarles roles de co-liderazgo (ej. el juez que verifica quién tiene 'aterrizaje de pluma'). Explicar las instrucciones usando apoyos visuales y permitir pausas frecuentes.",
        "tarea_extracurricular": "Practicar en familia caminar sobre una línea imaginaria.",
        "evaluacion_sugerida": "Lista de chequeo simple (Logrado / No Logrado) aplicada al grupo mientras resuelven el circuito o cuento motor."
    };

    addMsg('bot', renderDidactica(mockDidactica), true);
    
    isGroupActive = false;
    document.getElementById('groupSetup').style.display = 'block';
    document.getElementById('groupProgress').style.display = 'none';
    
    isLoading = false;
}

function sendMsg() {
    if (isLoading) return;
    const val = document.getElementById('userInput').value.trim();
    const hasFrames = capturedFrames.length > 0;

    if (!val && !hasFrames) { 
        addMsg('bot', 'Por favor, sube un archivo de video/imagen para el estudiante actual.'); 
        return; 
    }

    if (val) addMsg('user', val);
    document.getElementById('userInput').value = '';
    callGemini(val);
}
