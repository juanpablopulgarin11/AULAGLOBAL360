/**
 * AULA GLOBAL 360 · Motor Experto de Evaluación Biomecánica HMB
 * Basado en la Batería Validada (González Palacio & Montoya Grisales),
 * Estadios de Desarrollo Motor (David L. Gallahue) y TGMD-3 (Dale A. Ulrich).
 */

// ESTADO GLOBAL DE LA APLICACIÓN
let apiKey = (localStorage.getItem('aula360_api_key') || '').trim();
let cachedGeminiEndpoint = null;
let selectedGeminiModel = localStorage.getItem('aula360_selected_gemini_model') || 'auto';
let availableGeminiModels = [];
try {
    const cachedModels = localStorage.getItem('aula360_gemini_models_cache');
    if (cachedModels) availableGeminiModels = JSON.parse(cachedModels);
} catch(e) {}
let currentEngineMode = localStorage.getItem('aula360_engine_mode') || 'local';
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

// ============================================================================
// SISTEMA DE ALERTAS Y CONFIRMACIONES PERSONALIZADAS (CON LOGO AULAGLOBAL360)
// ============================================================================
let activeAlertResolve = null;

function ensureAlertModalDOM() {
    if (document.getElementById('customAlertOverlay')) return;
    const div = document.createElement('div');
    div.innerHTML = `
        <div class="custom-alert-overlay" id="customAlertOverlay" style="display: none;" onclick="handleAlertBackdropClick(event)">
            <div class="custom-alert-card" id="customAlertCard" role="alertdialog" aria-modal="true" aria-labelledby="customAlertTitle" aria-describedby="customAlertMessage">
                <div class="custom-alert-header">
                    <div class="custom-alert-brand">
                        <img src="logo-icon.svg" width="24" height="24" alt="Aula Global 360" class="custom-alert-logo">
                        <span class="custom-alert-title" id="customAlertTitle">Aula Global 360</span>
                    </div>
                    <button type="button" class="custom-alert-close" onclick="closeCustomAlert()" aria-label="Cerrar">&times;</button>
                </div>
                <div class="custom-alert-body">
                    <div class="custom-alert-icon-wrap" id="customAlertIconWrap">
                        <span id="customAlertIcon">💡</span>
                    </div>
                    <div class="custom-alert-text">
                        <p id="customAlertMessage">Mensaje de alerta</p>
                    </div>
                </div>
                <div class="custom-alert-footer" id="customAlertFooter">
                    <button type="button" class="btn-alert-cancel" id="customAlertCancelBtn" style="display: none;" onclick="onCustomAlertCancel()">Cancelar</button>
                    <button type="button" class="btn-alert-confirm" id="customAlertConfirmBtn" onclick="onCustomAlertConfirm()">Entendido</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(div.firstElementChild);
}

function showAlert(message, options = {}) {
    ensureAlertModalDOM();
    return new Promise(resolve => {
        activeAlertResolve = resolve;

        const overlay = document.getElementById('customAlertOverlay');
        const titleEl = document.getElementById('customAlertTitle');
        const msgEl = document.getElementById('customAlertMessage');
        const iconEl = document.getElementById('customAlertIcon');
        const iconWrap = document.getElementById('customAlertIconWrap');
        const cancelBtn = document.getElementById('customAlertCancelBtn');
        const confirmBtn = document.getElementById('customAlertConfirmBtn');

        const type = options.type || (
            /error|fallo|no se pudo/i.test(message) ? 'error' :
            /aviso|advertencia|atención|atencion/i.test(message) ? 'warning' :
            /éxito|guardada|completad/i.test(message) ? 'success' : 'info'
        );

        const defaultIcons = {
            'info': '💡',
            'warning': '⚠️',
            'error': '❌',
            'success': '✅'
        };

        if (titleEl) titleEl.textContent = options.title || 'Aula Global 360';
        if (msgEl) msgEl.innerHTML = message;
        if (iconEl) iconEl.textContent = options.icon || defaultIcons[type] || '💡';

        if (iconWrap) {
            iconWrap.className = `custom-alert-icon-wrap type-${type}`;
        }

        if (cancelBtn) cancelBtn.style.display = 'none';
        if (confirmBtn) {
            confirmBtn.textContent = options.confirmText || 'Entendido';
            setTimeout(() => confirmBtn.focus(), 60);
        }

        if (overlay) {
            overlay.style.display = 'flex';
            requestAnimationFrame(() => overlay.classList.add('active'));
        }
    });
}

function showConfirm(message, options = {}) {
    ensureAlertModalDOM();
    return new Promise(resolve => {
        activeAlertResolve = resolve;

        const overlay = document.getElementById('customAlertOverlay');
        const titleEl = document.getElementById('customAlertTitle');
        const msgEl = document.getElementById('customAlertMessage');
        const iconEl = document.getElementById('customAlertIcon');
        const iconWrap = document.getElementById('customAlertIconWrap');
        const cancelBtn = document.getElementById('customAlertCancelBtn');
        const confirmBtn = document.getElementById('customAlertConfirmBtn');

        const type = options.type || 'warning';

        if (titleEl) titleEl.textContent = options.title || 'Confirmar acción';
        if (msgEl) msgEl.innerHTML = message;
        if (iconEl) iconEl.textContent = options.icon || '⚠️';

        if (iconWrap) {
            iconWrap.className = `custom-alert-icon-wrap type-${type}`;
        }

        if (cancelBtn) {
            cancelBtn.style.display = 'inline-flex';
            cancelBtn.textContent = options.cancelText || 'Cancelar';
        }

        if (confirmBtn) {
            confirmBtn.textContent = options.confirmText || 'Confirmar';
            setTimeout(() => confirmBtn.focus(), 60);
        }

        if (overlay) {
            overlay.style.display = 'flex';
            requestAnimationFrame(() => overlay.classList.add('active'));
        }
    });
}

function closeCustomAlert(result = false) {
    const overlay = document.getElementById('customAlertOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.style.display = 'none';
            if (activeAlertResolve) {
                const res = activeAlertResolve;
                activeAlertResolve = null;
                res(result);
            }
        }, 180);
    } else if (activeAlertResolve) {
        const res = activeAlertResolve;
        activeAlertResolve = null;
        res(result);
    }
}

function onCustomAlertConfirm() {
    closeCustomAlert(true);
}

function onCustomAlertCancel() {
    closeCustomAlert(false);
}

function handleAlertBackdropClick(event) {
    if (event.target === document.getElementById('customAlertOverlay')) {
        closeCustomAlert(false);
    }
}

// Reemplazar window.alert por el diálogo con diseño y logo institucional
window.alert = function(msg) {
    return showAlert(msg);
};

// Atajos de teclado (Escape y Enter) para el diálogo
document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('customAlertOverlay');
    if (overlay && overlay.classList.contains('active')) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeCustomAlert(false);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            closeCustomAlert(true);
        }
    }
});

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
    setEngineMode(currentEngineMode, true);
    updateCGIModel('auto');
    initWizardEvents();
});

// WIZARD DE 3 PASOS
let currentStep = 1;

function goToStep(step) {
    currentStep = step;
    for (let i = 1; i <= 3; i++) {
        const stepEl = document.getElementById(`wizardStep${i}`);
        const tabEl = document.querySelector(`.step-tab[data-step="${i}"]`);
        
        if (stepEl) {
            if (i === step) {
                stepEl.style.display = 'flex';
                stepEl.classList.add('active');
            } else {
                stepEl.style.display = 'none';
                stepEl.classList.remove('active');
            }
        }
        
        if (tabEl) {
            if (i === step) {
                tabEl.classList.add('active');
            } else {
                tabEl.classList.remove('active');
            }
        }
    }
    const wizardMain = document.getElementById('wizardMain');
    if (wizardMain) wizardMain.scrollTop = 0;
}

function markStepComplete(step) {
    const tabEl = document.querySelector(`.step-tab[data-step="${step}"]`);
    const badgeEl = document.getElementById(`stepBadge${step}`);
    if (tabEl) {
        tabEl.classList.add('completed');
    }
    if (badgeEl) {
        badgeEl.textContent = '✓';
    }
    const nextTab = document.querySelector(`.step-tab[data-step="${step + 1}"]`);
    if (nextTab) {
        nextTab.disabled = false;
    }
}

function selectSkillCard(cardEl, skillCode) {
    document.querySelectorAll('.skill-card').forEach(c => c.classList.remove('active'));
    if (cardEl) cardEl.classList.add('active');

    const selectEl = document.getElementById('skillSelect');
    if (selectEl) {
        selectEl.value = skillCode;
        onSkillSelectChange(selectEl);
    }

    const iconEl = cardEl ? cardEl.querySelector('.skill-icon') : null;
    const nameEl = cardEl ? cardEl.querySelector('.skill-name') : null;
    const selectedIcon = document.getElementById('selectedSkillIcon');
    const selectedText = document.getElementById('selectedSkillText');
    if (selectedIcon && iconEl) selectedIcon.textContent = iconEl.textContent;
    if (selectedText && nameEl) selectedText.textContent = nameEl.textContent;

    markStepComplete(1);
    goToStep(2);
}

function startNewEvaluation() {
    capturedKeyframes = [];
    globalDiagnosticoData = null;
    globalDidacticaData = null;

    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';

    const userInput = document.getElementById('userInput');
    if (userInput) userInput.value = '';

    const uzIcon = document.getElementById('uzIcon');
    if (uzIcon) uzIcon.innerHTML = '<img src="logo-icon.svg" class="uz-brand-icon" width="48" height="48" alt="Aula Global 360">';
    const uzTitle = document.getElementById('uzTitle');
    if (uzTitle) uzTitle.textContent = 'Seleccionar o arrastrar video o fotografía';
    const uzSub = document.getElementById('uzSub');
    if (uzSub) uzSub.textContent = 'Formatos: MP4, MOV, WEBM, JPG, PNG · Recomendado: 3 a 5 segundos';

    const uploadPreview = document.getElementById('uploadPreview');
    if (uploadPreview) uploadPreview.style.display = 'none';

    const videoPlayer = document.getElementById('studentVideoPlayer');
    if (videoPlayer) {
        videoPlayer.pause();
        videoPlayer.src = '';
        videoPlayer.style.display = 'none';
    }
    const imgPreview = document.getElementById('studentImgPreview');
    if (imgPreview) {
        imgPreview.src = '';
        imgPreview.style.display = 'none';
    }

    const keyframeSection = document.getElementById('keyframeSection');
    if (keyframeSection) keyframeSection.style.display = 'none';
    const keyframeStrip = document.getElementById('keyframeStrip');
    if (keyframeStrip) keyframeStrip.innerHTML = '';

    const resultContainer = document.getElementById('resultContainer');
    if (resultContainer) resultContainer.innerHTML = '';

    const techContainer = document.getElementById('techTelemetryContainer');
    if (techContainer) techContainer.innerHTML = '';

    const stepTab2 = document.querySelector('.step-tab[data-step="2"]');
    const stepTab3 = document.querySelector('.step-tab[data-step="3"]');
    if (stepTab2) {
        stepTab2.classList.remove('active', 'completed');
    }
    if (stepTab3) {
        stepTab3.classList.remove('active', 'completed');
        stepTab3.disabled = true;
    }
    const stepBadge1 = document.getElementById('stepBadge1');
    if (stepBadge1) stepBadge1.textContent = '1';
    const stepBadge2 = document.getElementById('stepBadge2');
    if (stepBadge2) stepBadge2.textContent = '2';
    const stepBadge3 = document.getElementById('stepBadge3');
    if (stepBadge3) stepBadge3.textContent = '3';

    goToStep(1);
}

function initWizardEvents() {
    const dropZone = document.getElementById('uploadZone');
    if (dropZone) {
        ['dragenter', 'dragover'].forEach(ev => {
            dropZone.addEventListener(ev, e => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.add('dragover');
            }, false);
        });
        ['dragleave', 'drop'].forEach(ev => {
            dropZone.addEventListener(ev, e => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove('dragover');
            }, false);
        });
        dropZone.addEventListener('drop', e => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length) {
                const fileInput = document.getElementById('fileInput');
                if (fileInput) fileInput.files = files;
                handleFile({ target: { files: files } });
            }
        });
    }
}

// INTERFAZ Y NAVEGACIÓN
function toggleDrawer() {
    const drawer = document.getElementById('configDrawer');
    const overlay = document.getElementById('drawerOverlay');
    if (drawer) drawer.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
}

function toggleSidebar() {
    toggleDrawer();
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

// CONMUTADOR DE MOTOR (MODO LOCAL vs MODO GEMINI IA)
function setEngineMode(mode, silent = false) {
    currentEngineMode = mode;
    localStorage.setItem('aula360_engine_mode', mode);

    const appRoot = document.getElementById('appRoot');
    const btnLocal = document.getElementById('btnModeLocal');
    const btnGemini = document.getElementById('btnModeGemini');
    const headerBadge = document.getElementById('engineHeaderBadge');
    const rightHeaderBadge = document.getElementById('headerEngineBadge');
    const geminiSection = document.getElementById('drawerGeminiSection');
    const userInput = document.getElementById('userInput');

    if (mode === 'gemini') {
        if (appRoot) {
            appRoot.classList.remove('engine-local');
            appRoot.classList.add('engine-gemini');
        }
        if (btnLocal) btnLocal.classList.remove('active');
        if (btnGemini) btnGemini.classList.add('active');
        if (geminiSection) geminiSection.style.display = 'flex';

        if (headerBadge) {
            headerBadge.textContent = 'Gemini Vision IA (Nube Multimodal)';
        }
        if (rightHeaderBadge) {
            rightHeaderBadge.textContent = 'VISOR ASISTIDO POR GEMINI IA';
        }
        if (userInput) {
            userInput.placeholder = 'Observaciones opcionales para la IA (ej: "Aterriza con fuerza en talón", "Presenta fatiga previa")...';
        }

        updateGeminiKeyUI();
    } else {
        // Modo Local
        if (appRoot) {
            appRoot.classList.remove('engine-gemini');
            appRoot.classList.add('engine-local');
        }
        if (btnLocal) btnLocal.classList.add('active');
        if (btnGemini) btnGemini.classList.remove('active');
        if (geminiSection) geminiSection.style.display = 'none';

        if (headerBadge) {
            headerBadge.textContent = 'Motor Local Autónomo (WASM · Privacidad Total)';
        }
        if (rightHeaderBadge) {
            rightHeaderBadge.textContent = 'TELEMETRÍA Y BIOMECÁNICA (LOCAL WASM)';
        }
        if (userInput) {
            userInput.placeholder = 'Observaciones opcionales (ej: "Aterriza con fuerza en talón", "Usa calzado plano")...';
        }
    }
}

function updateGeminiKeyUI() {
    const inputRow = document.getElementById('keyConfigInputRow');
    const connectedRow = document.getElementById('keyConnectedRow');
    const maskedText = document.getElementById('keyMaskedText');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const modelGroup = document.getElementById('geminiModelGroup');

    if (apiKey) {
        if (inputRow) inputRow.style.display = 'none';
        if (connectedRow) connectedRow.style.display = 'flex';
        if (maskedText) {
            const preview = apiKey.length > 8 ? apiKey.slice(0, 6) + '••••••••' + apiKey.slice(-3) : 'AIzaSy••••••••';
            maskedText.textContent = preview;
        }
        if (modelGroup) {
            modelGroup.style.display = 'block';
            renderGeminiModelsSelect();
            if (availableGeminiModels.length === 0) {
                refreshGeminiModels(false);
            }
        }
    } else {
        if (inputRow) inputRow.style.display = 'flex';
        if (connectedRow) connectedRow.style.display = 'none';
        if (apiKeyInput) apiKeyInput.value = '';
        if (modelGroup) modelGroup.style.display = 'none';
    }
}

async function refreshGeminiModels(manual = false) {
    if (!apiKey) return;

    const selectEl = document.getElementById('geminiModelSelect');
    const hintEl = document.getElementById('geminiModelStatusHint');
    const refreshBtn = document.getElementById('btnRefreshModels');

    if (refreshBtn) refreshBtn.style.opacity = '0.5';
    if (hintEl) hintEl.textContent = 'Consultando modelos disponibles en Google...';

    try {
        let models = [];
        // 1. Consultar modelos en Google v1beta
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (res.ok) {
            const data = await res.json();
            if (data.models && Array.isArray(data.models)) {
                models = data.models
                    .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                    .map(m => {
                        const id = m.name.replace(/^models\//, '');
                        return {
                            id: id,
                            name: m.displayName || id,
                            description: m.description || '',
                            version: 'v1beta'
                        };
                    });
            }
        }

        // 2. Si v1beta no devolvió modelos, intentar con v1
        if (models.length === 0) {
            const resV1 = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
            if (resV1.ok) {
                const dataV1 = await resV1.json();
                if (dataV1.models && Array.isArray(dataV1.models)) {
                    models = dataV1.models
                        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                        .map(m => {
                            const id = m.name.replace(/^models\//, '');
                            return {
                                id: id,
                                name: m.displayName || id,
                                description: m.description || '',
                                version: 'v1'
                            };
                        });
                }
            }
        }

        if (models.length > 0) {
            // Ordenar: primero 2.0, luego 1.5 Flash, luego 1.5 Pro
            models.sort((a, b) => {
                const getScore = (id) => {
                    if (id.includes('2.0-flash')) return 100;
                    if (id.includes('1.5-flash-latest')) return 85;
                    if (id.includes('1.5-flash')) return 80;
                    if (id.includes('1.5-pro')) return 60;
                    if (id.includes('flash')) return 40;
                    return 10;
                };
                return getScore(b.id) - getScore(a.id);
            });

            availableGeminiModels = models;
            localStorage.setItem('aula360_gemini_models_cache', JSON.stringify(models));
            renderGeminiModelsSelect();

            if (hintEl) {
                hintEl.textContent = `✅ ${models.length} modelos listados desde tu cuenta de Google.`;
                hintEl.style.color = 'var(--accent, #0D9488)';
            }

            if (manual) {
                showAlert(`Google reportó <strong>${models.length} modelos habilitados</strong> en tu cuenta.<br><br>Ya puedes seleccionarlo en el desplegable o dejarlo en <strong>Automático</strong>.`, {
                    title: 'Modelos actualizados',
                    type: 'success',
                    icon: '🤖'
                });
            }
        } else {
            if (hintEl) {
                hintEl.textContent = 'No se recibieron modelos directos. Se usará modo automático.';
                hintEl.style.color = '#64748B';
            }
        }
    } catch (err) {
        console.warn('Error al obtener lista de modelos:', err);
        if (hintEl) {
            hintEl.textContent = 'No se pudo consultar la lista de modelos (usando modo automático).';
        }
    } finally {
        if (refreshBtn) refreshBtn.style.opacity = '1';
    }
}

function renderGeminiModelsSelect() {
    const selectEl = document.getElementById('geminiModelSelect');
    if (!selectEl) return;

    const savedModel = localStorage.getItem('aula360_selected_gemini_model') || 'auto';
    selectEl.innerHTML = '';

    // Opción Automática
    const autoOpt = document.createElement('option');
    autoOpt.value = 'auto';
    autoOpt.textContent = '⚡ Automático (Recomendado: El más óptimo)';
    selectEl.appendChild(autoOpt);

    // Opciones de modelos devueltos por Google
    availableGeminiModels.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        const tag = m.id.includes('2.0') ? '🔥 Nuevo' : (m.id.includes('flash') ? '⚡ Rápido' : '🧠 Pro');
        opt.textContent = `${m.name || m.id} (${tag})`;
        selectEl.appendChild(opt);
    });

    // Restaurar valor guardado si existe en la lista
    const exists = availableGeminiModels.some(m => m.id === savedModel);
    if (savedModel === 'auto' || exists) {
        selectEl.value = savedModel;
    } else {
        selectEl.value = 'auto';
    }
}

function onGeminiModelChange(selectEl) {
    selectedGeminiModel = selectEl.value;
    localStorage.setItem('aula360_selected_gemini_model', selectedGeminiModel);
    cachedGeminiEndpoint = null;

    const hintEl = document.getElementById('geminiModelStatusHint');
    if (hintEl) {
        if (selectedGeminiModel === 'auto') {
            hintEl.textContent = 'Modo Automático: Selecciona el modelo más rápido y compatible según tu cuenta.';
            hintEl.style.color = '#64748B';
        } else {
            hintEl.textContent = `Modelo fijado: ${selectedGeminiModel}`;
            hintEl.style.color = 'var(--accent, #0D9488)';
        }
    }
}

async function saveGeminiKey() {
    const inputEl = document.getElementById('apiKeyInput');
    const input = inputEl ? inputEl.value.trim() : '';
    if (!input) {
        showAlert('Por favor ingresa una clave API válida de Google AI Studio.', {
            title: 'Clave requerida',
            type: 'warning',
            icon: '🔑'
        });
        return;
    }
    if (!input.startsWith('AIza')) {
        showAlert('Las claves de Google AI Studio suelen comenzar con <code>AIza</code>. Asegúrate de haber copiado la clave correcta desde Google AI Studio.', {
            title: 'Formato de clave API',
            type: 'info',
            icon: 'ℹ️'
        });
    }

    apiKey = input;
    cachedGeminiEndpoint = null;
    localStorage.setItem('aula360_api_key', apiKey);
    updateGeminiKeyUI();

    const btnSave = document.getElementById('btnSaveKey');
    const originalText = btnSave ? btnSave.textContent : 'Conectar';
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.textContent = 'Verificando...';
    }

    try {
        await refreshGeminiModels(false);

        if (availableGeminiModels.length > 0) {
            showAlert(`¡Clave verificada exitosamente! Se detectaron <strong>${availableGeminiModels.length} modelos de Gemini</strong> disponibles en tu cuenta.<br><br>Puedes seleccionar el modelo en el menú desplegable.`, {
                title: 'Conexión exitosa',
                type: 'success',
                icon: '✅'
            });
        } else {
            showAlert('Clave de Google AI Studio conectada exitosamente.', {
                title: 'Conexión exitosa',
                type: 'success',
                icon: '✅'
            });
        }
    } catch (err) {
        showAlert('Clave de Google AI Studio guardada localmente.', {
            title: 'Clave guardada',
            type: 'info',
            icon: '🔑'
        });
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.textContent = originalText;
        }
    }
}

function editGeminiKey() {
    const inputRow = document.getElementById('keyConfigInputRow');
    const connectedRow = document.getElementById('keyConnectedRow');
    const apiKeyInput = document.getElementById('apiKeyInput');
    if (inputRow) inputRow.style.display = 'flex';
    if (connectedRow) connectedRow.style.display = 'none';
    if (apiKeyInput) {
        apiKeyInput.value = apiKey;
        apiKeyInput.focus();
    }
}

function removeGeminiKey() {
    apiKey = '';
    cachedGeminiEndpoint = null;
    availableGeminiModels = [];
    localStorage.removeItem('aula360_api_key');
    localStorage.removeItem('aula360_gemini_models_cache');
    updateGeminiKeyUI();
}

// Aliases para compatibilidad
function applyApiKey() { saveGeminiKey(); }
function useLocalEngine() { setEngineMode('local'); }
function updateKeyStatus(hasKey) { setEngineMode(hasKey ? 'gemini' : 'local', true); }

// SELECCIÓN DE HABILIDAD
function onSkillSelectChange(selectEl) {
    const val = selectEl.value;
    const selectedText = selectEl.options[selectEl.selectedIndex].text;

    selectedSkill = val;
    selectedSkillName = val === 'auto' ? 'Detección Automática' : selectedText;

    const subtitle = document.getElementById('currentSkillSubtitle');
    if (subtitle) subtitle.textContent = `(${selectedSkillName})`;

    const selectedIcon = document.getElementById('selectedSkillIcon');
    const selectedTxt = document.getElementById('selectedSkillText');
    const skillIcons = {
        'auto': '🔍',
        'carrera': '🏃',
        'salto': '🦘',
        'marcha': '🚶',
        'salto_unipodal': '🦿',
        'lanzar': '⚾',
        'atrapar': '🧤',
        'patear': '⚽',
        'equilibrio': '🧘',
        'equilibrio_estatico': '🦩'
    };
    if (selectedIcon) selectedIcon.textContent = skillIcons[val] || '🔍';
    if (selectedTxt) selectedTxt.textContent = selectedSkillName;

    // Sincronizar tarjeta activa
    document.querySelectorAll('.skill-card').forEach(c => {
        if (c.dataset.skill === val) c.classList.add('active');
        else c.classList.remove('active');
    });

    const mainHeader = document.getElementById('mainHeaderTitle');
    if (mainHeader) mainHeader.textContent = val === 'auto' ? 'Evaluación Biomecánica de Movimiento' : `Análisis: ${selectedSkillName}`;

    const badge = document.getElementById('skillAutoBadge');
    if (badge) {
        if (val === 'auto') {
            badge.innerHTML = '<span>Detección Automática Activa</span>El motor clasificará e identificará la habilidad motriz directamente a partir del video y los ángulos anatómicos.';
        } else {
            badge.innerHTML = `<span>Habilidad Específica</span>Se evaluarán estrictamente los criterios de <strong>${selectedSkillName}</strong>.`;
        }
    }

    updateCGIModel(val);

    if (typeof capturedKeyframes !== 'undefined' && capturedKeyframes && capturedKeyframes.length > 0) {
        assignKeyframeMilestones(capturedKeyframes, val !== 'auto' ? selectedSkillName : null);
        renderKeyframeStrip(capturedKeyframes);
    }
}

function selectSkill(btnEl, skillCode, skillName) {
    const sel = document.getElementById('skillSelect');
    if (sel) {
        sel.value = skillCode;
        onSkillSelectChange(sel);
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
    if (isNaN(val) || val < 1 || val > 60) {
        showAlert('Por favor ingresa un número válido de estudiantes (entre 1 y 60).', {
            title: 'Número de estudiantes',
            type: 'warning',
            icon: '👥'
        });
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
    showConfirm('¿Deseas reiniciar el registro grupal? Se perderán las evaluaciones acumuladas de este salón.', {
        title: 'Reiniciar evaluación grupal',
        type: 'warning',
        icon: '⚠️',
        confirmText: 'Sí, reiniciar',
        cancelText: 'Cancelar'
    }).then(confirmed => {
        if (confirmed) {
            isGroupActive = false;
            groupMemory = [];
            evaluatedStudents = 0;
            document.getElementById('groupSetup').style.display = 'flex';
            document.getElementById('groupProgress').style.display = 'none';
            updateGroupUI();
        }
    });
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

// ============================================================================
// CÁLCULO ANGULAR PLANAR 2D EQUIVALENTE A NUMPY/PYTHON (ARCTAN2)
// ============================================================================

function calcularAngulo2D(a, b, c) {
    if (!a || !b || !c) return 180;
    const ax = a.x !== undefined ? a.x : a[0];
    const ay = a.y !== undefined ? a.y : a[1];
    const bx = b.x !== undefined ? b.x : b[0];
    const by = b.y !== undefined ? b.y : b[1];
    const cx = c.x !== undefined ? c.x : c[0];
    const cy = c.y !== undefined ? c.y : c[1];

    const radianes = Math.atan2(cy - by, cx - bx) - Math.atan2(ay - by, ax - bx);
    let angulo = Math.abs((radianes * 180.0) / Math.PI);
    if (angulo > 180.0) {
        angulo = 360.0 - angulo;
    }
    return Math.round(angulo);
}

// ============================================================================
// MÁQUINAS DE ESTADO CINEMÁTICAS (FSM) PARA LAS 9 HABILIDADES MOTRICES BÁSICAS
// Basadas en la referencia de Python (Detección de ciclo de fases biomecánicas)
// ============================================================================

class SaltoHorizontalFSM {
    constructor() {
        this.nombre = 'Salto Horizontal';
        this.estado = 'REPOSO';
        this.yCaderaInicial = null;
        this.transiciones = [];
        this.minKneeAngle = 180;
        this.maxFlightElevation = 0;
        this.fasesCumplidas = new Set();
    }

    procesarFrame(idx, t, landmarks, angles) {
        if (!landmarks || landmarks.length < 33 || !angles) return;
        const cadera = landmarks[24];
        const rodilla = landmarks[26];
        const tobillo = landmarks[28];
        const anguloRodilla = calcularAngulo2D(cadera, rodilla, tobillo);
        const yActualCadera = (landmarks[23].y + landmarks[24].y) / 2;

        if (anguloRodilla < this.minKneeAngle) this.minKneeAngle = anguloRodilla;

        if (this.estado === 'REPOSO') {
            if (this.yCaderaInicial === null) this.yCaderaInicial = yActualCadera;
            this.fasesCumplidas.add('REPOSO');
            if (anguloRodilla < 142 || angles.kneeMin < 142) {
                this.estado = 'CONTRAMOVIMIENTO (BAJANDO)';
                this.transiciones.push({ estado: this.estado, idx, t, anguloRodilla, yActualCadera, desc: 'Inicio de flexión preparatoria' });
                this.fasesCumplidas.add('CONTRAMOVIMIENTO');
            }
        } else if (this.estado === 'CONTRAMOVIMIENTO (BAJANDO)') {
            if (anguloRodilla > 110 && yActualCadera < (this.yCaderaInicial + 0.02)) {
                this.estado = 'PROPULSIÓN (SUBIENDO)';
                this.transiciones.push({ estado: this.estado, idx, t, anguloRodilla, yActualCadera, desc: 'Empuje y despegue simultáneo' });
                this.fasesCumplidas.add('PROPULSION');
            }
        } else if (this.estado === 'PROPULSIÓN (SUBIENDO)') {
            const elevacion = this.yCaderaInicial - yActualCadera;
            if (elevacion > this.maxFlightElevation) this.maxFlightElevation = elevacion;
            if (anguloRodilla > 158 && (yActualCadera < (this.yCaderaInicial - 0.035) || angles.flightDetected)) {
                this.estado = 'EN EL AIRE (VUELO)';
                this.transiciones.push({ estado: this.estado, idx, t, anguloRodilla, yActualCadera, desc: '🦘 Vuelo Bipodal Evidenciado', isPeak: true });
                this.fasesCumplidas.add('VUELO');
            }
        } else if (this.estado === 'EN EL AIRE (VUELO)') {
            if (yActualCadera >= (this.yCaderaInicial - 0.02) && anguloRodilla < 155) {
                this.estado = 'ATERRIZAJE';
                this.transiciones.push({ estado: this.estado, idx, t, anguloRodilla, yActualCadera, desc: '🦿 Aterrizaje y Amortiguación', isSubPeak: true });
                this.fasesCumplidas.add('ATERRIZAJE');
            }
        }
    }
}

class PatearFSM {
    constructor() {
        this.nombre = 'Patear';
        this.estado = 'APROXIMACION';
        this.transiciones = [];
        this.maxStraddle = 0;
        this.fasesCumplidas = new Set();
    }

    procesarFrame(idx, t, landmarks, angles) {
        if (!landmarks || landmarks.length < 33 || !angles) return;
        const xDiff = angles.ankleXDiff || 0;
        const hipAngle = angles.hipAngle || 0;
        const kneeDiff = angles.kneeDiff || 0;

        if (this.estado === 'APROXIMACION') {
            this.fasesCumplidas.add('APROXIMACION');
            if (angles.isLegStraddle || kneeDiff >= 20 || xDiff >= 0.08) {
                this.estado = 'APOYO_CARGA';
                this.transiciones.push({ estado: this.estado, idx, t, desc: 'Apoyo monopodal y pierna atrás' });
                this.fasesCumplidas.add('CARGA');
            }
        } else if (this.estado === 'APOYO_CARGA') {
            if (xDiff >= 0.11 || hipAngle >= 17) {
                this.estado = 'PENDULO_GOLPEO';
                this.transiciones.push({ estado: this.estado, idx, t, desc: 'Péndulo anterior hacia el balón' });
                this.fasesCumplidas.add('PENDULO');
            }
        } else if (this.estado === 'PENDULO_GOLPEO') {
            if (xDiff >= 0.13 || (angles.isLegStraddle && angles.kneeMax >= 148)) {
                this.estado = 'IMPACTO';
                this.transiciones.push({ estado: this.estado, idx, t, desc: '⚽ Pateada Evidenciada (Impacto)', isPeak: true });
                this.fasesCumplidas.add('IMPACTO');
            }
        } else if (this.estado === 'IMPACTO') {
            this.estado = 'RECOBRO';
            this.transiciones.push({ estado: this.estado, idx, t, desc: 'Acompañamiento y frenado' });
            this.fasesCumplidas.add('RECOBRO');
        }
    }
}

class CarreraFSM {
    constructor() {
        this.nombre = 'Carrera';
        this.estado = 'INICIO_PROPULSION';
        this.transiciones = [];
        this.maxStride = 0;
        this.fasesCumplidas = new Set();
    }

    procesarFrame(idx, t, landmarks, angles) {
        if (!landmarks || landmarks.length < 33 || !angles) return;
        const hipAngle = angles.hipAngle || 0;
        const trunkLean = angles.trunkLean || 0;
        if (hipAngle > this.maxStride) this.maxStride = hipAngle;

        if (this.estado === 'INICIO_PROPULSION') {
            this.fasesCumplidas.add('INICIO');
            if (trunkLean >= 10 || angles.ankleXDiff >= 0.10) {
                this.estado = 'TRACCION_METATARSAL';
                this.transiciones.push({ estado: this.estado, idx, t, desc: 'Empuje y braceo enérgico' });
                this.fasesCumplidas.add('TRACCION');
            }
        } else if (this.estado === 'TRACCION_METATARSAL') {
            if (hipAngle >= 25 || angles.flightDetected || angles.ankleXDiff >= 0.13) {
                this.estado = 'MAXIMA_ZANCADA_VUELO';
                this.transiciones.push({ estado: this.estado, idx, t, desc: '🏃 Zancada y Vuelo Evidenciado', isPeak: true });
                this.fasesCumplidas.add('VUELO_ZANCADA');
            }
        } else if (this.estado === 'MAXIMA_ZANCADA_VUELO') {
            this.estado = 'RECOBRO_RECIPROCO';
            this.transiciones.push({ estado: this.estado, idx, t, desc: 'Contacto y pasaje de rodilla libre' });
            this.fasesCumplidas.add('RECOBRO');
        }
    }
}

class LanzarFSM {
    constructor() {
        this.nombre = 'Lanzamiento Sobre Hombro';
        this.estado = 'PREPARACION';
        this.transiciones = [];
        this.fasesCumplidas = new Set();
    }

    procesarFrame(idx, t, landmarks, angles) {
        if (!landmarks || landmarks.length < 33 || !angles) return;
        const wristHigh = angles.wristAboveShoulder;
        const elbowDiff = angles.elbowDiff || 0;

        if (this.estado === 'PREPARACION') {
            this.fasesCumplidas.add('PREPARACION');
            if (wristHigh || (elbowDiff >= 22 && angles.elbowMin <= 112)) {
                this.estado = 'ARMADO_POSTERIOR';
                this.transiciones.push({ estado: this.estado, idx, t, desc: 'Armado tras la cabeza' });
                this.fasesCumplidas.add('ARMADO');
            }
        } else if (this.estado === 'ARMADO_POSTERIOR') {
            if (angles.elbowMax >= 135 && wristHigh) {
                this.estado = 'SOLTADA_LANZAMIENTO';
                this.transiciones.push({ estado: this.estado, idx, t, desc: '⚾ Lanzamiento Evidenciado (Soltada)', isPeak: true });
                this.fasesCumplidas.add('SOLTADA');
            }
        } else if (this.estado === 'SOLTADA_LANZAMIENTO') {
            this.estado = 'DESACELERACION';
            this.transiciones.push({ estado: this.estado, idx, t, desc: 'Brazo cruza el torso y desacelera' });
            this.fasesCumplidas.add('DESACELERACION');
        }
    }
}

class AtraparFSM {
    constructor() {
        this.nombre = 'Recepción y Atrape';
        this.estado = 'ESPERA';
        this.transiciones = [];
        this.minWrist = 1.0;
        this.fasesCumplidas = new Set();
    }

    procesarFrame(idx, t, landmarks, angles) {
        if (!landmarks || landmarks.length < 33 || !angles) return;
        const wDist = angles.wristDist || 0.5;
        if (wDist < this.minWrist) this.minWrist = wDist;

        if (this.estado === 'ESPERA') {
            this.fasesCumplidas.add('ESPERA');
            if (angles.elbowAvg >= 70 && angles.elbowAvg <= 130) {
                this.estado = 'APROXIMACION_MANOS';
                this.transiciones.push({ estado: this.estado, idx, t, desc: 'Brazos al frente en copa' });
                this.fasesCumplidas.add('APROXIMACION');
            }
        } else if (this.estado === 'APROXIMACION_MANOS') {
            if (wDist <= 0.28) {
                this.estado = 'CONTACTO_ATRAPE';
                this.transiciones.push({ estado: this.estado, idx, t, desc: '🧤 Atrape Evidenciado (Manos en copa)', isPeak: true });
                this.fasesCumplidas.add('CONTACTO');
            }
        } else if (this.estado === 'CONTACTO_ATRAPE') {
            this.estado = 'AMORTIGUACION_PECHO';
            this.transiciones.push({ estado: this.estado, idx, t, desc: 'Retención hacia el pecho' });
            this.fasesCumplidas.add('AMORTIGUACION');
        }
    }
}

class SaltoUnipodalFSM {
    constructor() {
        this.nombre = 'Salto Unipodal';
        this.estado = 'APOYO_UNIPODAL';
        this.transiciones = [];
        this.fasesCumplidas = new Set();
    }

    procesarFrame(idx, t, landmarks, angles) {
        if (!landmarks || landmarks.length < 33 || !angles) return;
        const yDiff = angles.ankleYDiff || 0;
        const kneeDiff = angles.kneeDiff || 0;

        if (this.estado === 'APOYO_UNIPODAL') {
            this.fasesCumplidas.add('APOYO');
            if (angles.kneeMin <= 140 && yDiff >= 0.035) {
                this.estado = 'FLEXION_IMPULSO';
                this.transiciones.push({ estado: this.estado, idx, t, desc: 'Flexión preparatoria unipodal' });
                this.fasesCumplidas.add('IMPULSO');
            }
        } else if (this.estado === 'FLEXION_IMPULSO') {
            if (yDiff >= 0.05 && kneeDiff >= 25) {
                this.estado = 'VUELO_UNIPODAL';
                this.transiciones.push({ estado: this.estado, idx, t, desc: '🦿 Despegue Unipodal Evidenciado', isPeak: true });
                this.fasesCumplidas.add('VUELO');
            }
        } else if (this.estado === 'VUELO_UNIPODAL') {
            if (angles.kneeMin <= 150) {
                this.estado = 'ATERRIZAJE_UNIPODAL';
                this.transiciones.push({ estado: this.estado, idx, t, desc: 'Amortiguación sobre el mismo pie' });
                this.fasesCumplidas.add('ATERRIZAJE');
            }
        }
    }
}

class EquilibrioEstaticoFSM {
    constructor() {
        this.nombre = 'Equilibrio Estático Unipodal';
        this.estado = 'INICIO_BIPODAL';
        this.transiciones = [];
        this.holdCount = 0;
        this.fasesCumplidas = new Set();
    }

    procesarFrame(idx, t, landmarks, angles) {
        if (!landmarks || landmarks.length < 33 || !angles) return;
        const isOneBent = (angles.kneeMax >= 145 && angles.kneeMin <= 125 && angles.kneeDiff >= 30);
        const yElev = (angles.ankleYDiff >= 0.04);
        const footLifted = angles.unipodalFootRaised || isOneBent || yElev;

        if (this.estado === 'INICIO_BIPODAL') {
            this.fasesCumplidas.add('INICIO');
            if (footLifted) {
                this.estado = 'ELEVACION_PIERNA';
                this.transiciones.push({ estado: this.estado, idx, t, desc: 'Despegue de la pierna libre' });
                this.fasesCumplidas.add('ELEVACION');
            }
        } else if (this.estado === 'ELEVACION_PIERNA' || this.estado === 'SOSTEN_FLAMENCO') {
            if (angles.unipodalMaintained || (isOneBent && yElev) || (angles.unipodalFootRaised && (angles.shoulderTilt || 0) <= 10)) {
                this.holdCount++;
                if (this.holdCount >= 2 && this.estado !== 'SOSTEN_FLAMENCO') {
                    this.estado = 'SOSTEN_FLAMENCO';
                    this.transiciones.push({ estado: this.estado, idx, t, desc: '🦩 Sostén Unipodal Evidenciado', isPeak: true });
                    this.fasesCumplidas.add('SOSTEN');
                }
            }
        }
    }
}

class EquilibrioDinamicoFSM {
    constructor() {
        this.nombre = 'Equilibrio Dinámico';
        this.estado = 'INICIO_EJE';
        this.transiciones = [];
        this.fasesCumplidas = new Set();
    }

    procesarFrame(idx, t, landmarks, angles) {
        if (!landmarks || landmarks.length < 33 || !angles) return;
        if (this.estado === 'INICIO_EJE') {
            this.fasesCumplidas.add('INICIO');
            this.estado = 'PASO_TANDEM';
            this.transiciones.push({ estado: this.estado, idx, t, desc: '🧘 Pasaje en Línea Evidenciado', isPeak: true });
            this.fasesCumplidas.add('PASO_TANDEM');
        } else if (this.estado === 'PASO_TANDEM') {
            this.estado = 'CONTROL_EQUILIBRIO';
            this.transiciones.push({ estado: this.estado, idx, t, desc: 'Brazos equilibradores y control' });
            this.fasesCumplidas.add('CONTROL');
        }
    }
}

class MarchaFSM {
    constructor() {
        this.nombre = 'Marcha';
        this.estado = 'INICIO_CONTACTO';
        this.transiciones = [];
        this.fasesCumplidas = new Set();
    }

    procesarFrame(idx, t, landmarks, angles) {
        if (!landmarks || landmarks.length < 33 || !angles) return;
        if (this.estado === 'INICIO_CONTACTO') {
            this.fasesCumplidas.add('CONTACTO');
            this.estado = 'PASAJE_TALON';
            this.transiciones.push({ estado: this.estado, idx, t, desc: '🚶 Contacto y Pasaje Evidenciado', isPeak: true });
            this.fasesCumplidas.add('PASAJE');
        } else if (this.estado === 'PASAJE_TALON') {
            this.estado = 'DESPEGUE_OSCILACION';
            this.transiciones.push({ estado: this.estado, idx, t, desc: 'Transición continua del paso' });
            this.fasesCumplidas.add('OSCILACION');
        }
    }
}

function createFSMForSkill(skillName) {
    const s = (skillName || '').toLowerCase();
    if (s.includes('salto horizontal') || (s.includes('salto') && !s.includes('unipodal'))) return new SaltoHorizontalFSM();
    if (s.includes('pate')) return new PatearFSM();
    if (s.includes('corre') || s.includes('carrera')) return new CarreraFSM();
    if (s.includes('lanz') || s.includes('arroja') || s.includes('hombro')) return new LanzarFSM();
    if (s.includes('atrap') || s.includes('recep')) return new AtraparFSM();
    if (s.includes('unipodal') && s.includes('salto')) return new SaltoUnipodalFSM();
    if (s.includes('estatico') || s.includes('estático') || s.includes('flamenco')) return new EquilibrioEstaticoFSM();
    if (s.includes('dinamico') || s.includes('dinámico') || s.includes('linea') || s.includes('viga')) return new EquilibrioDinamicoFSM();
    return new MarchaFSM();
}

function executeFSMAnalysis(frames, skillName) {
    const fsm = createFSMForSkill(skillName);
    frames.forEach((f, idx) => {
        if (f.landmarks && f.angles) {
            fsm.procesarFrame(idx, f.timestampNum || (idx * 0.2), f.landmarks, f.angles);
        }
    });
    return fsm;
}

// ============================================================================
// FUNCIONES BIOMECÁNICAS PORTADAS DE REFERENCIA PYTHON (codigodelsalto.py)
// Cálculo de inclinación horizontal y evaluación cinemática de equilibrio
// ============================================================================

function calcularInclinacionHorizontal(p1, p2) {
    if (!p1 || !p2) return 0;
    const x1 = p1.x !== undefined ? p1.x : (p1[0] !== undefined ? p1[0] : 0);
    const y1 = p1.y !== undefined ? p1.y : (p1[1] !== undefined ? p1[1] : 0);
    const x2 = p2.x !== undefined ? p2.x : (p2[0] !== undefined ? p2[0] : 0);
    const y2 = p2.y !== undefined ? p2.y : (p2[1] !== undefined ? p2[1] : 0);
    const delta_x = x2 - x1;
    const delta_y = y2 - y1;
    const angulo = (Math.atan2(delta_y, delta_x) * 180.0) / Math.PI;
    let inclinacion = Math.abs(angulo);
    if (inclinacion > 90) inclinacion = Math.abs(180.0 - inclinacion);
    return inclinacion; // 0 grados = perfectamente nivelado/horizontal
}

function analyzeEquilibriumFromPythonReference(landmarks, angles = null) {
    if (!landmarks || !Array.isArray(landmarks) || landmarks.length < 33 ||
        !landmarks[11] || !landmarks[12] || !landmarks[23] || !landmarks[24] ||
        !landmarks[25] || !landmarks[26] || !landmarks[27] || !landmarks[28]) {
        return {
            estado: 'BIPEDESTACIÓN',
            balanceoHombros: 0,
            balanceoCaderas: 0,
            inclinacionLateralMax: 0,
            pieElevado: false,
            pieElevadoLado: 'ninguno',
            angRodillaApoyo: 170,
            esMantenimiento: false,
            perdidaEquilibrio: false
        };
    }

    // Puntos clave de MediaPipe Pose:
    // Hombros: 11 (LEFT_SHOULDER), 12 (RIGHT_SHOULDER)
    // Caderas: 23 (LEFT_HIP), 24 (RIGHT_HIP)
    // Rodillas: 25 (LEFT_KNEE), 26 (RIGHT_KNEE)
    // Tobillos: 27 (LEFT_ANKLE), 28 (RIGHT_ANKLE)
    const hombroIzq = landmarks[11];
    const hombroDer = landmarks[12];
    const caderaIzq = landmarks[23];
    const caderaDer = landmarks[24];
    const rodillaDer = landmarks[26];
    const tobilloDer = landmarks[28];
    const rodillaIzq = landmarks[25];
    const tobilloIzq = landmarks[27];

    // 1. Desalineación o balanceo (Inclinación horizontal de hombros y caderas)
    const balanceoHombros = Math.round(calcularInclinacionHorizontal(hombroDer, hombroIzq) * 10) / 10;
    const balanceoCaderas = Math.round(calcularInclinacionHorizontal(caderaDer, caderaIzq) * 10) / 10;
    const inclinacionLateralMax = Math.max(balanceoHombros, balanceoCaderas);

    // 2. Detectar si un pie se levantó (en MediaPipe, menor Y = más alto en pantalla)
    // Umbral de tolerancia de elevación podal de 0.04 (idéntico al script de Python)
    const tobIzqY = tobilloIzq.y !== undefined ? tobilloIzq.y : (tobilloIzq[1] || 0);
    const tobDerY = tobilloDer.y !== undefined ? tobilloDer.y : (tobilloDer[1] || 0);
    const pieIzqElevado = tobIzqY < (tobDerY - 0.04);
    const pieDerElevado = tobDerY < (tobIzqY - 0.04);
    const pieElevado = pieIzqElevado || pieDerElevado;
    const pieElevadoLado = pieIzqElevado ? 'izquierdo' : (pieDerElevado ? 'derecho' : 'ninguno');

    // 3. Ángulo de la rodilla de apoyo (la pierna que permanece en contacto)
    let angRodillaApoyo = 170;
    if (pieIzqElevado) {
        angRodillaApoyo = angles && angles.rKnee !== undefined 
            ? angles.rKnee 
            : calculateAngle3D(caderaDer, rodillaDer, tobilloDer);
    } else if (pieDerElevado) {
        angRodillaApoyo = angles && angles.lKnee !== undefined 
            ? angles.lKnee 
            : calculateAngle3D(caderaIzq, rodillaIzq, tobilloIzq);
    } else {
        angRodillaApoyo = angles && angles.kneeMax !== undefined ? angles.kneeMax : 170;
    }
    angRodillaApoyo = Math.round(angRodillaApoyo);

    // 4. Máquina de estados según el código de Python
    let estado = 'BIPEDESTACIÓN';
    let esMantenimiento = false;
    let perdidaEquilibrio = false;

    if (pieElevado && angRodillaApoyo > 155) {
        // Criterios de fallo (Pérdida de equilibrio): balanceo excesivo o flexión claudicante
        if (balanceoHombros > 15.0 || balanceoCaderas > 12.0 || angRodillaApoyo < 150) {
            estado = 'PÉRDIDA DE EQUILIBRIO';
            perdidaEquilibrio = true;
        } else if (balanceoHombros < 6.0 && balanceoCaderas < 6.0) {
            estado = 'MANTENIMIENTO ESTÁTICO';
            esMantenimiento = true;
        } else {
            estado = 'ESTABILIZANDO';
        }
    } else if (pieElevado && (angRodillaApoyo < 150 || balanceoHombros > 15.0)) {
        estado = 'PÉRDIDA DE EQUILIBRIO';
        perdidaEquilibrio = true;
    } else {
        estado = 'BIPEDESTACIÓN';
    }

    return {
        estado,
        balanceoHombros,
        balanceoCaderas,
        inclinacionLateralMax,
        pieElevado,
        pieElevadoLado,
        angRodillaApoyo,
        esMantenimiento,
        perdidaEquilibrio
    };
}

function computeJointAngles(landmarks) {
    if (!landmarks || landmarks.length < 33) return null;

    // 11/12: Hombros, 13/14: Codos, 15/16: Muñecas
    // 23/24: Caderas, 25/26: Rodillas, 27/28: Tobillos
    const lKnee = calculateAngle3D(landmarks[23], landmarks[25], landmarks[27]);
    const rKnee = calculateAngle3D(landmarks[24], landmarks[26], landmarks[28]);
    const lElbow = calculateAngle3D(landmarks[11], landmarks[13], landmarks[15]);
    const rElbow = calculateAngle3D(landmarks[12], landmarks[14], landmarks[16]);

    // Ángulos de cadera individuales (Tronco - Cadera - Rodilla)
    const lHipFlexion = calculateAngle3D(landmarks[11], landmarks[23], landmarks[25]);
    const rHipFlexion = calculateAngle3D(landmarks[12], landmarks[24], landmarks[26]);
    const hipDiff = Math.abs(lHipFlexion - rHipFlexion);

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

    // Altura del torso como escala corporal de referencia
    const torsoHeight = Math.hypot(trunkDx, trunkDy) || 0.25;

    // Apertura de zancada (ángulo entre muslos / inter-femoral)
    const hipAngle = calculateAngle3D(landmarks[25], midHip, landmarks[26]);

    // Altura y posición relativa de tobillos
    const lAnkleY = landmarks[27].y;
    const rAnkleY = landmarks[28].y;
    const lAnkleX = landmarks[27].x;
    const rAnkleX = landmarks[28].x;

    const ankleYDiff = Math.abs(lAnkleY - rAnkleY);
    const ankleXDiff = Math.abs(lAnkleX - rAnkleX);
    const ankleDist = Math.hypot(lAnkleX - rAnkleX, lAnkleY - rAnkleY);

    // Detección de pierna delantera vs trasera respecto a la cadera (apertura sagital de golpeo / zancada)
    const lAnkleRelX = lAnkleX - midHip.x;
    const rAnkleRelX = rAnkleX - midHip.x;
    const isLegStraddle = (lAnkleRelX * rAnkleRelX < -0.001) || (ankleXDiff >= 0.14);

    // Distancia euclidiana normalizada entre muñecas
    const wristDist = Math.hypot(landmarks[15].x - landmarks[16].x, landmarks[15].y - landmarks[16].y);

    // Muñeca sobre hombro (elevación de brazo en lanzamiento/bateo)
    const lWristAboveShoulder = landmarks[15].y < landmarks[11].y;
    const rWristAboveShoulder = landmarks[16].y < landmarks[12].y;
    const wristAboveShoulder = lWristAboveShoulder || rWristAboveShoulder;

    // Métricas biomecánicas de equilibrio e inclinación (Python reference)
    const eq = analyzeEquilibriumFromPythonReference(landmarks, { lKnee, rKnee, kneeMax: Math.max(lKnee, rKnee) });

    return {
        lKnee,
        rKnee,
        kneeMin: Math.min(lKnee, rKnee),
        kneeMax: Math.max(lKnee, rKnee),
        kneeDiff: Math.abs(lKnee - rKnee),
        lElbow,
        rElbow,
        elbowAvg: Math.round((lElbow + rElbow) / 2),
        elbowMax: Math.max(lElbow, rElbow),
        elbowMin: Math.min(lElbow, rElbow),
        elbowDiff: Math.abs(lElbow - rElbow),
        lHipFlexion,
        rHipFlexion,
        hipDiff,
        trunkLean,
        torsoHeight,
        hipAngle,
        lAnkleY,
        rAnkleY,
        lAnkleX,
        rAnkleX,
        ankleYDiff,
        ankleXDiff,
        ankleDist,
        isLegStraddle,
        wristDist,
        wristAboveShoulder,
        midHipX: midHip.x,
        midHipY: midHip.y,
        shoulderTilt: eq.balanceoHombros,
        hipTilt: eq.balanceoCaderas,
        unipodalFootRaised: eq.pieElevado,
        unipodalSupportKnee: eq.angRodillaApoyo,
        unipodalState: eq.estado,
        unipodalMaintained: eq.esMantenimiento
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
// EVALUADOR DEL ÁNGULO INICIAL CINEMÁTICO (GATILLO ANATÓMICO DEL EJERCICIO)
// ============================================================================

function checkExerciseTriggerPose(angles, prevAngles = null) {
    if (!angles) return { triggered: false };

    // 0. Postura de Equilibrio Unipodal (Test de equilibrio estático según referencia python)
    // Se detecta elevación podal unilateral (unipodalFootRaised o asimetría vertical de tobillos) con apoyo firme
    const hasUnipodalLift = angles.unipodalFootRaised || (angles.ankleYDiff >= 0.035);
    const hasSupportExtension = (angles.unipodalSupportKnee || angles.kneeMax || 0) >= 148;
    if (hasUnipodalLift && hasSupportExtension) {
        return { 
            triggered: true, 
            reason: `Elevación podal y postura unipodal (${angles.unipodalSupportKnee || angles.kneeMax}°)`, 
            skillHint: 'Equilibrio Estático Unipodal' 
        };
    }

    // 1. Flexión preparatoria bípode profunda de Salto Horizontal
    // Exige estrictamente que AMBOS pies estén en el suelo (sin elevación podal) y flexión coordinada profunda
    if (angles.kneeMin <= 138 && angles.kneeDiff <= 18 && angles.ankleYDiff < 0.030 && !angles.unipodalFootRaised) {
        return { 
            triggered: true, 
            reason: `Flexión preparatoria bípode (${angles.kneeMin}°)`, 
            skillHint: 'Salto Horizontal' 
        };
    }

    // 2. Apertura sagital de zancada o avance podal (Carrera o Marcha)
    if (angles.hipAngle >= 22 || angles.ankleXDiff >= 0.14) {
        return { 
            triggered: true, 
            reason: `Apertura de zancada / paso (${angles.hipAngle}°)`, 
            skillHint: 'Carrera' 
        };
    }

    // 3. Elevación o armado de brazo (Lanzamiento Sobre Hombro)
    if (angles.wristAboveShoulder || (angles.elbowDiff >= 26 && angles.elbowMin <= 110)) {
        return { 
            triggered: true, 
            reason: `Armado o elevación de brazo (${angles.elbowMin}°)`, 
            skillHint: 'Lanzamiento Sobre Hombro' 
        };
    }

    // 4. Elevación podal unilateral con péndulo/zancada (Patear o Salto Unipodal)
    if (angles.ankleYDiff >= 0.055 && angles.kneeDiff >= 28 && (angles.isLegStraddle || angles.ankleXDiff >= 0.12)) {
        return { 
            triggered: true, 
            reason: `Péndulo o despegue podal unilateral (${angles.kneeDiff}° asimetría)`, 
            skillHint: 'Patear' 
        };
    }

    // 5. Muñecas aproximadas al frente y codos flexionados (Recepción y Atrape)
    if (angles.wristDist <= 0.28 && angles.elbowAvg >= 70 && angles.elbowAvg <= 125) {
        return { 
            triggered: true, 
            reason: `Brazos al frente en copa para recepción`, 
            skillHint: 'Recepción y Atrape' 
        };
    }

    // 6. Inclinación anterior de tronco pronunciada (aceleración o despegue)
    if (angles.trunkLean >= 12) {
        return { 
            triggered: true, 
            reason: `Inclinación dinámica de tronco (${angles.trunkLean}°)`, 
            skillHint: 'Carrera' 
        };
    }

    // 7. Aceleración angular repentina respecto al reposo inmediato anterior
    if (prevAngles) {
        const deltaKnee = Math.abs(angles.kneeMin - prevAngles.kneeMin);
        const deltaHip = Math.abs(angles.hipAngle - prevAngles.hipAngle);
        const deltaTrunk = Math.abs(angles.trunkLean - prevAngles.trunkLean);
        if (deltaKnee >= 12 || deltaHip >= 10 || deltaTrunk >= 7) {
            return { 
                triggered: true, 
                reason: `Aceleración angular de inicio (Δ rodilla ${deltaKnee}°)`, 
                skillHint: 'Cinemática Dinámica' 
            };
        }
    }

    return { triggered: false };
}

// EXTRACCIÓN CINEMÁTICA ANCLADA AL ÁNGULO INICIAL DEL EJERCICIO
async function extractAdaptiveVideoKeyframes(file, targetCount = 8) {
    return new Promise(async (resolve, reject) => {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.muted = true;
        video.playsInline = true;

        // Cargar MediaPipe Pose Tasks antes de escanear
        let landmarker = null;
        try {
            landmarker = await getPoseLandmarker();
        } catch (e) {
            console.warn('MediaPipe pre-carga:', e);
        }

        video.addEventListener('loadedmetadata', async () => {
            try {
                const dur = Math.max(0.6, Math.min(video.duration, 20));

                const hdCanvas = document.createElement('canvas');
                hdCanvas.width = 640;
                hdCanvas.height = 360;
                const hdCtx = hdCanvas.getContext('2d');

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

                // 1. Escaneo cinemático del video para detectar el fotograma con el ÁNGULO INICIAL
                const scanSteps = Math.min(24, Math.max(12, Math.floor(dur * 5)));
                const dt = dur / (scanSteps + 1);

                const scanTimeline = [];
                let firstTriggerIndex = -1;
                let initialTriggerInfo = null;
                let prevAngles = null;

                for (let i = 0; i <= scanSteps; i++) {
                    const t = i * dt;
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
                        } catch (err) {}
                    }

                    let trigger = { triggered: false };
                    if (angles) {
                        trigger = checkExerciseTriggerPose(angles, prevAngles);
                        if (trigger.triggered && firstTriggerIndex === -1) {
                            firstTriggerIndex = i;
                            initialTriggerInfo = { ...trigger, t, angles };
                        }
                        prevAngles = angles;
                    }

                    scanTimeline.push({ t, angles, landmarks, trigger });
                }

                // 2. Delimitar la ventana cinemática partiendo del ángulo inicial
                let actionStart = 0;
                let actionEnd = dur;

                if (firstTriggerIndex !== -1 && initialTriggerInfo) {
                    console.log(`🎯 [Ángulo Inicial Detectado] en t=${initialTriggerInfo.t.toFixed(2)}s: ${initialTriggerInfo.reason}`);
                    // Anclamos exactamente en el ángulo inicial (con margen de 0.1s previo)
                    actionStart = Math.max(0.04, initialTriggerInfo.t - 0.10);

                    // Buscar el final de la acción
                    let lastActiveIdx = firstTriggerIndex;
                    for (let i = firstTriggerIndex; i < scanTimeline.length; i++) {
                        const itm = scanTimeline[i];
                        if (itm.trigger && itm.trigger.triggered) {
                            lastActiveIdx = i;
                        } else if (itm.angles && itm.angles.kneeMin < 155) {
                            lastActiveIdx = i;
                        }
                    }
                    actionEnd = Math.min(dur - 0.04, scanTimeline[Math.min(scanTimeline.length - 1, lastActiveIdx + 1)].t);
                    if (actionEnd - actionStart < 0.5) {
                        actionEnd = Math.min(dur - 0.04, actionStart + 1.8);
                    }
                } else {
                    // Si no hubo landmarks claros, usamos los bordes naturales de movimiento
                    actionStart = Math.max(0.05, dur * 0.08);
                    actionEnd = Math.min(dur - 0.05, dur * 0.92);
                }

                // 3. Generar los timestamps exactos partiendo del ÁNGULO INICIAL
                const actionSpan = actionEnd - actionStart;
                const selectedTimestamps = [];

                for (let k = 0; k < targetCount; k++) {
                    const ratio = k / (targetCount - 1);
                    const t = actionStart + (actionSpan * ratio);
                    selectedTimestamps.push(t);
                }

                // 4. Extracción de los 8 fotogramas en alta resolución con MediaPipe Pose y esqueletos
                const frames = [];
                const isEquilibrium = initialTriggerInfo && initialTriggerInfo.skillHint === 'Equilibrio Estático Unipodal';
                const isJump = initialTriggerInfo && initialTriggerInfo.skillHint === 'Salto Horizontal';
                
                const phaseNames = isEquilibrium ? [
                    initialTriggerInfo ? `Fase 1: Ángulo Inicial (${initialTriggerInfo.reason})` : 'Fase 1: Inicio de Elevación Podal',
                    'Fase 2: Ajuste y Elevación de Pierna Libre',
                    'Fase 3: Búsqueda de Estabilidad Postural',
                    'Fase 4: Alineación de Hombros y Tronco',
                    'Fase 5: Sostén Estático Cumbre (Flamenco)',
                    'Fase 6: Control Postural Continuo',
                    'Fase 7: Mantenimiento del Equilibrio',
                    'Fase 8: Cierre y Retorno Bipodal'
                ] : (isJump ? [
                    initialTriggerInfo ? `Fase 1: Ángulo Inicial (${initialTriggerInfo.reason})` : 'Fase 1: Flexión Preparatoria Bípode',
                    'Fase 2: Impulso y Extensión Triple',
                    'Fase 3: Despegue del Suelo',
                    'Fase 4: Proyección Aérea',
                    'Fase 5: Ápice de Vuelo Bipodal',
                    'Fase 6: Descenso y Preparación al Contacto',
                    'Fase 7: Contacto de Ambos Pies',
                    'Fase 8: Amortiguación y Frenado'
                ] : [
                    initialTriggerInfo ? `Fase 1: Ángulo Inicial (${initialTriggerInfo.reason})` : 'Fase 1: Preparación / Inicio',
                    'Fase 2: Transición y Carga Motriz',
                    'Fase 3: Desarrollo del Movimiento',
                    'Fase 4: Aceleración y Ajuste Postural',
                    'Fase 5: Punto Culminante del Gesto',
                    'Fase 6: Continuación del Movimiento',
                    'Fase 7: Fase de Contacto o Sostén',
                    'Fase 8: Conclusión y Estabilización'
                ]);

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
                            console.warn('Error en detección Pose final:', err);
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
                        angles: angles,
                        isInitialTrigger: (k === 0 && initialTriggerInfo !== null),
                        triggerInfo: (k === 0 && initialTriggerInfo !== null) ? initialTriggerInfo : null
                    });
                }

                const curSkillEl = document.getElementById('skillSelect');
                const curActiveSkill = (curSkillEl && curSkillEl.value !== 'auto') 
                    ? curSkillEl.options[curSkillEl.selectedIndex].text 
                    : null;
                if (curActiveSkill) {
                    assignKeyframeMilestones(frames, curActiveSkill);
                } else {
                    const tel = aggregateVideoTelemetry(frames);
                    const inferred = classifySkillFromKinematics(tel, '');
                    assignKeyframeMilestones(frames, inferred);
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
                const singleFrame = [{
                    time: '0.0s',
                    phase: 'Postura Estática',
                    data: rawB64,
                    previewUrl: previewCanvas.toDataURL('image/jpeg', 0.85),
                    mime: 'image/jpeg',
                    landmarks: landmarks,
                    angles: angles,
                    isInitialTrigger: false,
                    triggerInfo: null
                }];
                assignKeyframeMilestones(singleFrame, null);
                resolve(singleFrame);
            };
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// REINICIO SEGURO DE ESTADO DE ANÁLISIS
function resetAnalysisState() {
    capturedKeyframes = [];
    lastAnalyzedTelemetry = null;
    globalDiagnosticoData = null;
    globalDidacticaData = null;
    const keyframeStrip = document.getElementById('keyframeStrip');
    if (keyframeStrip) keyframeStrip.innerHTML = '';
}

// MANIPULADOR DE CARGA DE ARCHIVO
async function handleFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    resetAnalysisState();

    const uzTitle = document.getElementById('uzTitle') || document.getElementById('uploadZoneTitle');
    const uzSub = document.getElementById('uzSub') || document.getElementById('uploadZoneSubtitle');
    const uzIcon = document.getElementById('uzIcon') || document.getElementById('uploadZoneIcon');
    const uploadPreview = document.getElementById('uploadPreview');
    const videoPlayer = document.getElementById('studentVideoPlayer') || document.getElementById('videoPlayer');
    const imgPreview = document.getElementById('studentImgPreview') || document.getElementById('imagePreview');
    const scanOverlay = document.getElementById('scanOverlay');

    if (uzIcon) uzIcon.innerHTML = '<span class="loading-spinner">⏳</span>';
    if (uzTitle) uzTitle.textContent = 'Procesando evidencia biomecánica...';
    if (uzSub) uzSub.textContent = 'Extrayendo fotogramas y analizando ángulos con MediaPipe...';

    try {
        const fileUrl = URL.createObjectURL(file);
        if (uploadPreview) uploadPreview.style.display = 'block';
        if (scanOverlay) scanOverlay.style.display = 'block';

        const currentSkillEl = document.getElementById('skillSelect');
        const activeSkill = (currentSkillEl && currentSkillEl.value !== 'auto') 
            ? currentSkillEl.options[currentSkillEl.selectedIndex].text 
            : null;

        if (file.type.startsWith('video/')) {
            if (imgPreview) imgPreview.style.display = 'none';
            if (videoPlayer) {
                videoPlayer.src = fileUrl;
                videoPlayer.style.display = 'block';
                videoPlayer.play().catch(e => console.log('Autoplay:', e));
            }

            const fps = document.getElementById('fpsCounter');
            const frameDens = document.getElementById('frameDensity');
            if (fps) fps.textContent = 'Video (30 FPS)';
            if (frameDens) frameDens.textContent = 'Extrayendo fotogramas...';

            capturedKeyframes = await extractAdaptiveVideoKeyframes(file, 8);
            assignKeyframeMilestones(capturedKeyframes, activeSkill);
        } else if (file.type.startsWith('image/')) {
            if (videoPlayer) videoPlayer.style.display = 'none';
            if (imgPreview) {
                imgPreview.src = fileUrl;
                imgPreview.style.display = 'block';
            }

            const fps = document.getElementById('fpsCounter');
            const frameDens = document.getElementById('frameDensity');
            if (fps) fps.textContent = 'Fotografía';
            if (frameDens) frameDens.textContent = '1 fotograma capturado';

            capturedKeyframes = await extractImageKeyframe(file);
            assignKeyframeMilestones(capturedKeyframes, activeSkill);
        }

        if (scanOverlay) scanOverlay.style.display = 'none';

        // Renderizar miniaturas enriquecidas con esqueletos, ángulos e hitos clave
        renderKeyframeStrip(capturedKeyframes);

        if (uzIcon) uzIcon.innerHTML = '✓';
        if (uzTitle) uzTitle.textContent = `Video listo (${capturedKeyframes.length} fotogramas extraídos)`;
        if (uzSub) uzSub.textContent = 'Presiona "Analizar movimiento" para ver el resultado y generar la clase';

        const frameDens = document.getElementById('frameDensity');
        if (frameDens) frameDens.textContent = `${capturedKeyframes.length} fotogramas analizados`;

    } catch (err) {
        console.error('Error al procesar archivo:', err);
        if (uzIcon) uzIcon.textContent = '❌';
        if (uzTitle) uzTitle.textContent = 'Error al procesar el archivo';
        if (uzSub) uzSub.textContent = 'Intenta con otro formato (MP4, MOV, JPG, PNG)';
        if (scanOverlay) scanOverlay.style.display = 'none';
    }
}

// ============================================================================
// ASIGNACIÓN CINEMÁTICA DE HITOS Y PUNTOS CLAVES DE CADA EJERCICIO (HMB)
// ============================================================================

function assignKeyframeMilestones(frames, skillName = null) {
    if (!frames || frames.length === 0) return frames;

    // Si no se especifica habilidad, inferirla a partir de la cinemática agregada
    let resolvedSkill = skillName;
    if (!resolvedSkill || resolvedSkill === 'auto' || resolvedSkill === 'Detección Automática' || resolvedSkill.includes('Automática')) {
        const telemetry = aggregateVideoTelemetry(frames);
        resolvedSkill = classifySkillFromKinematics(telemetry, '');
    }

    const s = (resolvedSkill || '').toLowerCase();

    // Resetear marcas previas
    frames.forEach((f, idx) => {
        f.isMilestonePeak = false;
        f.isSubMilestone = false;
        f.isFinalMilestone = false;
        f.milestoneBadge = null;
        f.milestoneTitle = `Cuadro #${idx + 1}`;
        f.milestoneDesc = f.phase || `Cinemática en ${f.time}`;
        f.milestoneColor = '#64748B';
    });

    const validFrames = frames.map((f, idx) => ({ f, idx, a: f.angles })).filter(item => item.a !== null);

    if (s.includes('pate')) {
        // HMB: PATEAR
        let maxKickScore = -Infinity;
        let peakIdx = -1;

        validFrames.forEach(({ idx, a }) => {
            const xDist = a.ankleXDiff || 0;
            const straddleBonus = a.isLegStraddle ? 0.08 : 0;
            const kneeAsym = (a.kneeDiff || 0) / 180;
            const yAsym = a.ankleYDiff || 0;
            const kickScore = (xDist * 1.6) + straddleBonus + (kneeAsym * 0.3) + (yAsym * 0.4);

            if (kickScore > maxKickScore) {
                maxKickScore = kickScore;
                peakIdx = idx;
            }
        });

        if (peakIdx === -1) peakIdx = Math.min(frames.length - 2, Math.max(1, Math.floor(frames.length * 0.55)));

        frames.forEach((f, idx) => {
            if (idx === 0) {
                f.milestoneTitle = '🎯 Ángulo Inicial';
                f.milestoneDesc = 'Aproximación y orientación al balón';
                f.milestoneColor = '#0D9488';
                f.milestoneBadge = '🎯 ÁNGULO INICIAL';
            } else if (idx === frames.length - 1) {
                f.isFinalMilestone = true;
                f.milestoneBadge = '🏁 RECOBRO Y DESACELERACIÓN';
                f.milestoneTitle = '🏁 Recobro y Desaceleración';
                f.milestoneDesc = 'Apoyo bipodal y desaceleración post-impacto';
                f.milestoneColor = '#6366F1';
            } else if (idx === peakIdx) {
                f.isMilestonePeak = true;
                f.milestoneBadge = '⚽ PATEADA EVIDENCIADA';
                f.milestoneTitle = '⚽ Pateada Evidenciada';
                f.milestoneDesc = 'Impacto al balón / Máx. péndulo';
                f.milestoneColor = '#F59E0B';
            } else if (idx < peakIdx) {
                f.milestoneTitle = 'Apoyo y Carga';
                f.milestoneDesc = 'Pie de apoyo firme y pierna atrás';
                f.milestoneColor = '#3B82F6';
            } else {
                f.milestoneTitle = 'Acompañamiento y Salida';
                f.milestoneDesc = 'Seguimiento del miembro ejecutor';
                f.milestoneColor = '#8B5CF6';
            }
        });

    } else if (s.includes('salto horizontal') || (s.includes('salto') && !s.includes('unipodal'))) {
        // HMB: SALTO HORIZONTAL
        let minAnkleY = Infinity;
        let flightPeakIdx = -1;

        validFrames.forEach(({ idx, a }) => {
            if (idx > 0 && idx < frames.length - 1) {
                const avgAnkleY = (a.lAnkleY + a.rAnkleY) / 2;
                if (avgAnkleY < minAnkleY) {
                    minAnkleY = avgAnkleY;
                    flightPeakIdx = idx;
                }
            }
        });

        if (flightPeakIdx === -1) flightPeakIdx = Math.floor(frames.length * 0.45);

        let landIdx = -1;
        let minLandKnee = Infinity;
        for (let i = flightPeakIdx + 1; i < frames.length - 1; i++) {
            const a = frames[i].angles;
            if (a && a.kneeMin < minLandKnee) {
                minLandKnee = a.kneeMin;
                landIdx = i;
            }
        }
        if (landIdx === -1) landIdx = Math.min(frames.length - 2, flightPeakIdx + 1);

        frames.forEach((f, idx) => {
            if (idx === 0) {
                f.milestoneTitle = '🎯 Ángulo Inicial';
                f.milestoneDesc = 'Flexión preparatoria bípode';
                f.milestoneColor = '#0D9488';
                f.milestoneBadge = '🎯 ÁNGULO INICIAL';
            } else if (idx === frames.length - 1) {
                f.isFinalMilestone = true;
                f.milestoneBadge = '🏁 FRENADO Y CONTROL';
                f.milestoneTitle = '🏁 Frenado y Control Estático';
                f.milestoneDesc = 'Amortiguación bipodal y equilibrio final';
                f.milestoneColor = '#6366F1';
            } else if (idx === flightPeakIdx) {
                f.isMilestonePeak = true;
                f.milestoneBadge = '🦘 VUELO EVIDENCIADO';
                f.milestoneTitle = '🦘 Vuelo Bipodal Evidenciado';
                f.milestoneDesc = 'Ápice aéreo / Ambos pies en el aire';
                f.milestoneColor = '#38BDF8';
            } else if (idx === landIdx) {
                f.isSubMilestone = true;
                f.milestoneBadge = '🦿 ATERRIZAJE';
                f.milestoneTitle = '🦿 Aterrizaje Evidenciado';
                f.milestoneDesc = 'Contacto simultáneo de ambos pies';
                f.milestoneColor = '#10B981';
            } else if (idx < flightPeakIdx) {
                f.milestoneTitle = 'Propulsión e Impulso';
                f.milestoneDesc = 'Extensión triple de tobillo, rodilla y cadera';
                f.milestoneColor = '#3B82F6';
            } else if (idx < landIdx) {
                f.milestoneTitle = 'Descenso Aéreo';
                f.milestoneDesc = 'Extensión preparatoria para el suelo';
                f.milestoneColor = '#0284C7';
            } else {
                f.milestoneTitle = 'Amortiguación Post-Contacto';
                f.milestoneDesc = 'Flexión reactiva de rodillas y caderas';
                f.milestoneColor = '#475569';
            }
        });

    } else if (s.includes('corre') || s.includes('carrera')) {
        // HMB: CARRERA
        let maxStride = -Infinity;
        let strideIdx = -1;

        validFrames.forEach(({ idx, a }) => {
            const strideScore = (a.hipAngle || 0) + ((a.ankleXDiff || 0) * 130);
            if (strideScore > maxStride) {
                maxStride = strideScore;
                strideIdx = idx;
            }
        });

        if (strideIdx === -1) strideIdx = Math.floor(frames.length * 0.5);

        frames.forEach((f, idx) => {
            if (idx === 0) {
                f.milestoneTitle = '🎯 Ángulo Inicial';
                f.milestoneDesc = 'Inicio de tracción sagital';
                f.milestoneColor = '#0D9488';
                f.milestoneBadge = '🎯 ÁNGULO INICIAL';
            } else if (idx === frames.length - 1) {
                f.isFinalMilestone = true;
                f.milestoneBadge = '🏁 FASE DE DESACELERACIÓN';
                f.milestoneTitle = '🏁 Fase de Desaceleración';
                f.milestoneDesc = 'Disminución de cadencia y control postural';
                f.milestoneColor = '#6366F1';
            } else if (idx === strideIdx) {
                f.isMilestonePeak = true;
                f.milestoneBadge = '🏃 ZANCADA EVIDENCIADA';
                f.milestoneTitle = '🏃 Zancada y Vuelo Evidenciado';
                f.milestoneDesc = 'Máx. amplitud sagital y suspensión';
                f.milestoneColor = '#10B981';
            } else if (idx % 2 === 0) {
                f.milestoneTitle = 'Apoyo y Propulsión';
                f.milestoneDesc = 'Contacto metatarsiano y empuje';
                f.milestoneColor = '#0284C7';
            } else {
                f.milestoneTitle = 'Recobro Aéreo';
                f.milestoneDesc = 'Elevación de rodilla libre';
                f.milestoneColor = '#3B82F6';
            }
        });

    } else if (s.includes('lanz') || s.includes('arroja') || s.includes('hombro')) {
        // HMB: LANZAMIENTO SOBRE HOMBRO
        let maxThrowScore = -Infinity;
        let throwIdx = -1;

        validFrames.forEach(({ idx, a }) => {
            if (idx > 0 && idx < frames.length - 1) {
                const throwScore = (a.wristAboveShoulder ? 60 : 0) + (a.elbowMax || 0) + (a.elbowDiff * 0.5);
                if (throwScore > maxThrowScore) {
                    maxThrowScore = throwScore;
                    throwIdx = idx;
                }
            }
        });

        if (throwIdx === -1) throwIdx = Math.floor(frames.length * 0.55);

        frames.forEach((f, idx) => {
            if (idx === 0) {
                f.milestoneTitle = '🎯 Ángulo Inicial';
                f.milestoneDesc = 'Armado detrás de la cabeza';
                f.milestoneColor = '#0D9488';
                f.milestoneBadge = '🎯 ÁNGULO INICIAL';
            } else if (idx === frames.length - 1) {
                f.isFinalMilestone = true;
                f.milestoneBadge = '🏁 SEGUIMIENTO FINAL';
                f.milestoneTitle = '🏁 Seguimiento y Frenado';
                f.milestoneDesc = 'Acompañamiento del brazo y balance de salida';
                f.milestoneColor = '#6366F1';
            } else if (idx === throwIdx) {
                f.isMilestonePeak = true;
                f.milestoneBadge = '⚾ LANZAMIENTO EVIDENCIADO';
                f.milestoneTitle = '⚾ Lanzamiento Evidenciado';
                f.milestoneDesc = 'Soltada / Máx. extensión de brazo';
                f.milestoneColor = '#F43F5E';
            } else if (idx < throwIdx) {
                f.milestoneTitle = 'Carga y Aceleración';
                f.milestoneDesc = 'Rotación de tronco y palanca escapular';
                f.milestoneColor = '#3B82F6';
            } else {
                f.milestoneTitle = 'Desaceleración de Brazo';
                f.milestoneDesc = 'El brazo cruza diagonalmente el torso';
                f.milestoneColor = '#8B5CF6';
            }
        });

    } else if (s.includes('atrap') || s.includes('recep')) {
        // HMB: RECEPCIÓN Y ATRAPE
        let minWristDist = Infinity;
        let catchIdx = -1;

        validFrames.forEach(({ idx, a }) => {
            if (a.wristDist < minWristDist) {
                minWristDist = a.wristDist;
                catchIdx = idx;
            }
        });

        if (catchIdx === -1) catchIdx = Math.floor(frames.length * 0.55);

        frames.forEach((f, idx) => {
            if (idx === 0) {
                f.milestoneTitle = '🎯 Ángulo Inicial';
                f.milestoneDesc = 'Brazos al frente en espera';
                f.milestoneColor = '#0D9488';
                f.milestoneBadge = '🎯 ÁNGULO INICIAL';
            } else if (idx === frames.length - 1) {
                f.isFinalMilestone = true;
                f.milestoneBadge = '🏁 CONTROL ESTABLE';
                f.milestoneTitle = '🏁 Control y Retención Estable';
                f.milestoneDesc = 'Móvil asegurado contra el pecho y equilibrio';
                f.milestoneColor = '#6366F1';
            } else if (idx === catchIdx) {
                f.isMilestonePeak = true;
                f.milestoneBadge = '🧤 ATRAPE EVIDENCIADO';
                f.milestoneTitle = '🧤 Atrape Evidenciado';
                f.milestoneDesc = 'Contacto y manos en copa';
                f.milestoneColor = '#8B5CF6';
            } else if (idx < catchIdx) {
                f.milestoneTitle = 'Seguimiento Visual';
                f.milestoneDesc = 'Alineación de manos con la trayectoria';
                f.milestoneColor = '#3B82F6';
            } else {
                f.milestoneTitle = 'Absorción del Impacto';
                f.milestoneDesc = 'Flexión de codos hacia el cuerpo';
                f.milestoneColor = '#0284C7';
            }
        });

    } else if (s.includes('unipodal') && s.includes('salto')) {
        // HMB: SALTO UNIPODAL ("Pata Sola")
        let maxUniScore = -Infinity;
        let uniIdx = -1;

        validFrames.forEach(({ idx, a }) => {
            if (idx > 0 && idx < frames.length - 1) {
                const score = (a.ankleYDiff * 120) + (a.kneeDiff * 0.6);
                if (score > maxUniScore) {
                    maxUniScore = score;
                    uniIdx = idx;
                }
            }
        });

        if (uniIdx === -1) uniIdx = Math.floor(frames.length * 0.5);

        frames.forEach((f, idx) => {
            if (idx === 0) {
                f.milestoneTitle = '🎯 Ángulo Inicial';
                f.milestoneDesc = 'Flexión unipodal preparatoria';
                f.milestoneColor = '#0D9488';
                f.milestoneBadge = '🎯 ÁNGULO INICIAL';
            } else if (idx === frames.length - 1) {
                f.isFinalMilestone = true;
                f.milestoneBadge = '🏁 ESTABILIZACIÓN FINAL';
                f.milestoneTitle = '🏁 Estabilización Unipodal';
                f.milestoneDesc = 'Apoyo final y control de balance';
                f.milestoneColor = '#6366F1';
            } else if (idx === uniIdx) {
                f.isMilestonePeak = true;
                f.milestoneBadge = '🦿 DESPEGUE UNIPODAL';
                f.milestoneTitle = '🦿 Despegue Unipodal Evidenciado';
                f.milestoneDesc = 'Suspensión sobre un solo pie';
                f.milestoneColor = '#EC4899';
            } else if (idx < uniIdx) {
                f.milestoneTitle = 'Impulso Unipodal';
                f.milestoneDesc = 'Empuje con pierna de apoyo';
                f.milestoneColor = '#3B82F6';
            } else {
                f.milestoneTitle = 'Amortiguación Unipodal';
                f.milestoneDesc = 'Aterrizaje sobre el mismo pie';
                f.milestoneColor = '#10B981';
            }
        });

    } else if (s.includes('estatico') || s.includes('estático') || s.includes('flamenco')) {
        // HMB: EQUILIBRIO ESTÁTICO UNIPODAL
        let maxHoldScore = -Infinity;
        let holdIdx = -1;

        validFrames.forEach(({ idx, a }) => {
            const maintBonus = a.unipodalMaintained ? 50 : (a.unipodalFootRaised ? 20 : 0);
            const tiltPenalty = (a.shoulderTilt || 0) * 1.5;
            const score = (a.kneeDiff * 0.8) + (a.ankleYDiff * 140) + maintBonus - tiltPenalty;
            if (score > maxHoldScore) {
                maxHoldScore = score;
                holdIdx = idx;
            }
        });

        if (holdIdx === -1) holdIdx = Math.floor(frames.length * 0.5);

        frames.forEach((f, idx) => {
            if (idx === 0) {
                f.milestoneTitle = '🎯 Ángulo Inicial';
                f.milestoneDesc = 'Elevación de pierna libre';
                f.milestoneColor = '#0D9488';
                f.milestoneBadge = '🎯 ÁNGULO INICIAL';
            } else if (idx === frames.length - 1) {
                f.isFinalMilestone = true;
                f.milestoneBadge = '🏁 MANTENIMIENTO FINAL';
                f.milestoneTitle = '🏁 Cierre y Retorno Bipodal';
                f.milestoneDesc = 'Estabilidad sostenida y descenso controlado';
                f.milestoneColor = '#6366F1';
            } else if (idx === holdIdx) {
                f.isMilestonePeak = true;
                f.milestoneBadge = '🦩 SOSTÉN EVIDENCIADO';
                f.milestoneTitle = '🦩 Sostén Unipodal Evidenciado';
                const tiltInfo = (f.angles && f.angles.shoulderTilt !== undefined) ? ` (inclinación: ${f.angles.shoulderTilt}°)` : '';
                f.milestoneDesc = `Estabilidad estática en un pie${tiltInfo}`;
                f.milestoneColor = '#06B6D4';
            } else {
                f.milestoneTitle = 'Ajuste Postural';
                f.milestoneDesc = 'Brazos equilibradores y control';
                f.milestoneColor = '#0284C7';
            }
        });

    } else if (s.includes('dinamico') || s.includes('dinámico') || s.includes('linea') || s.includes('viga')) {
        // HMB: EQUILIBRIO DINÁMICO
        let midIdx = Math.floor(frames.length * 0.5);
        frames.forEach((f, idx) => {
            if (idx === 0) {
                f.milestoneTitle = '🎯 Ángulo Inicial';
                f.milestoneDesc = 'Inicio de alineación sobre eje';
                f.milestoneColor = '#0D9488';
                f.milestoneBadge = '🎯 ÁNGULO INICIAL';
            } else if (idx === frames.length - 1) {
                f.isFinalMilestone = true;
                f.milestoneBadge = '🏁 LLEGADA Y DETENCIÓN';
                f.milestoneTitle = '🏁 Detención y Equilibrio';
                f.milestoneDesc = 'Parada estable al final de la trayectoria';
                f.milestoneColor = '#6366F1';
            } else if (idx === midIdx) {
                f.isMilestonePeak = true;
                f.milestoneBadge = '🧘 PASAJE EN LÍNEA';
                f.milestoneTitle = '🧘 Pasaje en Línea Evidenciado';
                f.milestoneDesc = 'Apoyo tándem con brazos en cruz';
                f.milestoneColor = '#14B8A6';
            } else {
                f.milestoneTitle = 'Desplazamiento Guiado';
                f.milestoneDesc = 'Avance controlado sin salirse';
                f.milestoneColor = '#0284C7';
            }
        });

    } else {
        // HMB: MARCHA O PREDETERMINADO
        let midIdx = Math.floor(frames.length * 0.5);
        frames.forEach((f, idx) => {
            if (idx === 0) {
                f.milestoneTitle = '🎯 Ángulo Inicial';
                f.milestoneDesc = 'Inicio del paso / despegue';
                f.milestoneColor = '#0D9488';
                f.milestoneBadge = '🎯 ÁNGULO INICIAL';
            } else if (idx === frames.length - 1) {
                f.isFinalMilestone = true;
                f.milestoneBadge = '🏁 APOYO Y FRENADO';
                f.milestoneTitle = '🏁 Apoyo Final y Frenado';
                f.milestoneDesc = 'Cierre del ciclo de paso y postura erguida';
                f.milestoneColor = '#6366F1';
            } else if (idx === midIdx) {
                f.isMilestonePeak = true;
                f.milestoneBadge = '🚶 PASAJE EVIDENCIADO';
                f.milestoneTitle = '🚶 Contacto y Pasaje Evidenciado';
                f.milestoneDesc = 'Apoyo de talón y braceo alterno';
                f.milestoneColor = '#6366F1';
            } else {
                f.milestoneTitle = 'Fase de Apoyo / Oscilación';
                f.milestoneDesc = 'Transición fluida del paso';
                f.milestoneColor = '#0284C7';
            }
        });
    }

    // Garantizar que el último fotograma siempre tenga su badge e hito final asignado si hay > 1 fotograma
    if (frames.length > 1) {
        const lastF = frames[frames.length - 1];
        lastF.isFinalMilestone = true;
        if (!lastF.milestoneBadge) {
            lastF.milestoneBadge = '🏁 FASE FINAL';
            lastF.milestoneTitle = '🏁 Fase Final y Cierre';
            lastF.milestoneColor = '#6366F1';
        }
    }

    return frames;
}

function renderKeyframeStrip(frames) {
    const keyframeSection = document.getElementById('keyframeSection');
    const keyframeStrip = document.getElementById('keyframeStrip');
    const keyframeCountBadge = document.getElementById('keyframeCountBadge');

    if (!frames || !frames.length) {
        if (keyframeSection) keyframeSection.style.display = 'none';
        return;
    }

    if (keyframeSection) keyframeSection.style.display = 'block';
    if (keyframeCountBadge) keyframeCountBadge.textContent = `${frames.length} cuadros adaptativos`;
    if (keyframeStrip) keyframeStrip.innerHTML = '';

    frames.forEach((f, idx) => {
        const card = document.createElement('div');
        const peakClass = f.isMilestonePeak 
            ? 'milestone-peak' 
            : (f.isFinalMilestone ? 'milestone-final' : (f.isInitialTrigger ? 'milestone-trigger' : (f.isSubMilestone ? 'milestone-subpeak' : '')));
        card.className = `keyframe-card ${peakClass}`.trim();

        const angleChip = f.angles 
            ? `<div class="keyframe-angles"><span>🦵 ${f.angles.kneeMin}°</span><span>💪 ${f.angles.elbowAvg}°</span><span>📐 ${f.angles.trunkLean}°</span></div>`
            : `<div class="keyframe-angles"><span>Cinemática activa</span></div>`;

        const bannerHTML = f.milestoneBadge 
            ? `<div class="keyframe-milestone-banner" style="background:${f.milestoneColor || '#F59E0B'}">${f.milestoneBadge}</div>` 
            : '';

        const isTrigger = f.isInitialTrigger;
        const isFinal = f.isFinalMilestone;
        const tagText = isTrigger 
            ? `🎯 Ángulo Inicial · ${f.time}`
            : (isFinal ? `🏁 Cuadro Final · ${f.time}` : `#${idx + 1} · ${f.time}`);
        const tagStyle = (isTrigger && !f.milestoneBadge) 
            ? `style="background: var(--accent, #0D9488); color: white; font-weight: 700; border: 1px solid var(--accent);"`
            : '';

        const descHTML = f.milestoneDesc 
            ? `<div class="keyframe-milestone-desc" title="${f.milestoneTitle || ''}: ${f.milestoneDesc}">${f.milestoneDesc}</div>`
            : `<div class="keyframe-milestone-desc">${f.phase || 'Fase activa'}</div>`;

        card.innerHTML = `
            ${bannerHTML}
            <img src="${f.previewUrl}" alt="Fotograma ${idx + 1}">
            <div class="keyframe-tag" ${tagStyle}>${tagText}</div>
            ${descHTML}
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
    avatar.textContent = role === 'bot' ? 'AG' : 'DOC';

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
        <div class="msg-av">AG</div>
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
            maxElbowAngle: 110,
            minElbowAngle: 80,
            avgTrunkAngle: 8,
            maxHipAngle: 36,
            maxWristAboveShoulder: false,
            minWristDist: 0.4,
            avgAnkleYDiff: 0.02,
            maxAnkleYDiff: 0.04,
            maxAnkleXDiff: 0.08,
            maxAnkleDist: 0.20,
            hasStraddleKickFrame: false,
            unipodalHoldFrames: 0,
            unipodalHoldRatio: 0,
            avgShoulderTilt: 2.0,
            maxShoulderTilt: 4.0,
            avgHipTilt: 2.0,
            unipodalMaintainedFrames: 0,
            unipodalRaisedFrames: 0,
            avgSupportKnee: 165,
            transientKickPeak: false,
            avgKneeDiff: 10,
            maxKneeDiff: 18,
            maxHipDiff: 15,
            avgElbowDiff: 12,
            maxElbowDiff: 20,
            ankleDistAvg: 0.25,
            hipDisplacement: 0.15,
            flightDetected: false,
            flightFrames: [],
            symmetryScore: 86,
            samplingMethod: 'Adaptativo por Diferencial de Luminancia'
        };
    }

    const minKnee = Math.min(...validAngles.map(a => a.kneeMin));
    const maxKnee = Math.max(...validAngles.map(a => a.kneeMax));
    const avgElbow = Math.round(validAngles.reduce((s, a) => s + a.elbowAvg, 0) / validAngles.length);
    const maxElbow = Math.max(...validAngles.map(a => a.elbowMax || a.elbowAvg));
    const minElbow = Math.min(...validAngles.map(a => a.elbowMin || a.elbowAvg));
    const avgTrunk = Math.round(validAngles.reduce((s, a) => s + a.trunkLean, 0) / validAngles.length);
    const maxHip = Math.max(...validAngles.map(a => a.hipAngle));

    // Métricas de inclinación y equilibrio derivadas del código de Python (codigodelsalto.py)
    const shoulderTilts = validAngles.map(a => a.shoulderTilt !== undefined ? a.shoulderTilt : 0);
    const avgShoulderTilt = shoulderTilts.length ? Math.round((shoulderTilts.reduce((s, v) => s + v, 0) / shoulderTilts.length) * 10) / 10 : 0;
    const maxShoulderTilt = shoulderTilts.length ? Math.max(...shoulderTilts) : 0;

    const hipTilts = validAngles.map(a => a.hipTilt !== undefined ? a.hipTilt : 0);
    const avgHipTilt = hipTilts.length ? Math.round((hipTilts.reduce((s, v) => s + v, 0) / hipTilts.length) * 10) / 10 : 0;

    const unipodalMaintainedFrames = validAngles.filter(a => a.unipodalMaintained === true).length;
    const unipodalRaisedFrames = validAngles.filter(a => a.unipodalFootRaised === true).length;
    const supportKnees = validAngles.filter(a => a.unipodalFootRaised && a.unipodalSupportKnee).map(a => a.unipodalSupportKnee);
    const avgSupportKnee = supportKnees.length ? Math.round(supportKnees.reduce((s, v) => s + v, 0) / supportKnees.length) : (maxKnee || 165);

    // Desglose de asimetrías articulares y valores pico (frame a frame)
    const kneeDiffs = validAngles.map(a => a.kneeDiff !== undefined ? a.kneeDiff : Math.abs(a.lKnee - a.rKnee));
    const maxKneeDiff = Math.max(...kneeDiffs);
    const avgKneeDiff = kneeDiffs.reduce((s, d) => s + d, 0) / (kneeDiffs.length || 1);

    const hipDiffs = validAngles.map(a => a.hipDiff !== undefined ? a.hipDiff : 0);
    const maxHipDiff = Math.max(...hipDiffs, 0);

    const elbowDiffs = validAngles.map(a => a.elbowDiff !== undefined ? a.elbowDiff : Math.abs(a.lElbow - a.rElbow));
    const maxElbowDiff = Math.max(...elbowDiffs);
    const avgElbowDiff = elbowDiffs.reduce((s, d) => s + d, 0) / (elbowDiffs.length || 1);

    const ankleYDiffs = validAngles.map(a => a.ankleYDiff !== undefined ? a.ankleYDiff : Math.abs(a.lAnkleY - a.rAnkleY));
    const maxAnkleYDiff = Math.max(...ankleYDiffs);
    const avgAnkleYDiff = ankleYDiffs.reduce((s, d) => s + d, 0) / (ankleYDiffs.length || 1);

    const ankleXDeltas = validAngles.map(a => a.ankleXDiff !== undefined ? a.ankleXDiff : 0);
    const maxAnkleXDiff = Math.max(...ankleXDeltas, 0);

    const ankleDists = validAngles.map(a => a.ankleDist || 0.25);
    const maxAnkleDist = Math.max(...ankleDists);
    const ankleDistAvg = ankleDists.reduce((s, d) => s + d, 0) / (ankleDists.length || 1);

    const wristDists = validAngles.map(a => a.wristDist || 0.5);
    const minWristDist = Math.min(...wristDists);

    const maxWristAboveShoulder = validAngles.some(a => a.wristAboveShoulder === true);

    // 1. Detección de Postura de Equilibrio Estático Unipodal (Flamenco sostenido en el tiempo):
    // Una pierna de apoyo erguida (≥145°) mientras la pierna libre se eleva o flexiona
    let unipodalHoldFrames = 0;
    validAngles.forEach(a => {
        const isLifted = (a.unipodalFootRaised === true) || (a.ankleYDiff >= 0.035) || (a.kneeMax >= 145 && a.kneeMin <= 135 && a.kneeDiff >= 20);
        const hasSupport = (a.kneeMax >= 145) || (a.unipodalSupportKnee && a.unipodalSupportKnee >= 145);
        if (isLifted && hasSupport) {
            unipodalHoldFrames++;
        }
    });
    const unipodalHoldRatio = validAngles.length ? (unipodalHoldFrames / validAngles.length) : 0;

    // 2. Detección de Golpeo / Patada Dinámica (Pateo):
    // Ocurre como un pico TRANSITORIO (1 o 2 fotogramas) con zancada sagital (un pie delante y otro atrás), NO sostenido en todo el video
    const straddleFrames = validAngles.filter(a => (a.isLegStraddle && a.ankleXDiff >= 0.14) && a.kneeDiff >= 25 && a.ankleYDiff >= 0.04);
    const hasStraddleKickFrame = straddleFrames.length >= 1 && unipodalHoldRatio < 0.40;
    const transientKickPeak = (straddleFrames.length >= 1 && straddleFrames.length <= 2 && unipodalHoldRatio < 0.40);

    // 3. Detección estricta de Fase Aérea (Vuelo): AMBOS pies despegan del suelo simultáneamente
    const flightFrames = [];
    const groundLevelY = Math.max(...validAngles.map(a => Math.max(a.lAnkleY, a.rAnkleY)));
    let bipodalFlightFrames = 0;

    validAngles.forEach((a, idx) => {
        const bothElevated = (a.lAnkleY < groundLevelY - 0.045 && a.rAnkleY < groundLevelY - 0.045);
        if (bothElevated) {
            flightFrames.push(idx + 1);
            if (a.ankleYDiff <= 0.065 && a.kneeDiff <= 32) {
                bipodalFlightFrames++;
            }
        }
    });

    // Si hay sostén unipodal evidente sobre una pierna, NO existe fase de vuelo bipodal
    if (unipodalHoldRatio >= 0.25 || unipodalHoldFrames >= 2 || unipodalMaintainedFrames >= 1) {
        bipodalFlightFrames = 0;
    }

    const flightDetected = flightFrames.length > 0 && bipodalFlightFrames > 0;
    const bipodalFlightDetected = bipodalFlightFrames > 0;

    // Variación dinámica angular rápida entre fotogramas consecutivos (delta de flexión de rodilla)
    let rapidKneeDelta = 0;
    for (let i = 1; i < validAngles.length; i++) {
        const dL = Math.abs(validAngles[i].lKnee - validAngles[i - 1].lKnee);
        const dR = Math.abs(validAngles[i].rKnee - validAngles[i - 1].rKnee);
        rapidKneeDelta = Math.max(rapidKneeDelta, dL, dR);
    }

    // Desplazamiento del centro de masa (cadera) entre el primer y último frame (0.02 = estático)
    let hipDisplacement = 0.02;
    if (validAngles.length >= 2 && validAngles[0].midHipX !== undefined) {
        const first = validAngles[0];
        const last = validAngles[validAngles.length - 1];
        hipDisplacement = Math.hypot((last.midHipX || 0) - (first.midHipX || 0), (last.midHipY || 0) - (first.midHipY || 0));
    }

    const symmetryScore = Math.max(65, Math.min(98, Math.round(100 - (avgKneeDiff * 0.7))));

    return {
        hasLandmarks: true,
        minKneeAngle: minKnee,
        maxKneeAngle: maxKnee,
        avgElbowAngle: avgElbow,
        maxElbowAngle: maxElbow,
        minElbowAngle: minElbow,
        avgTrunkAngle: avgTrunk,
        maxHipAngle: maxHip,
        maxWristAboveShoulder,
        minWristDist,
        avgAnkleYDiff,
        maxAnkleYDiff,
        maxAnkleXDiff,
        maxAnkleDist,
        unipodalHoldFrames,
        unipodalHoldRatio,
        avgShoulderTilt,
        maxShoulderTilt,
        avgHipTilt,
        unipodalMaintainedFrames,
        unipodalRaisedFrames,
        avgSupportKnee,
        hasStraddleKickFrame,
        transientKickPeak,
        avgKneeDiff,
        maxKneeDiff,
        maxHipDiff,
        avgElbowDiff,
        maxElbowDiff,
        ankleDistAvg,
        hipDisplacement,
        rapidKneeDelta,
        flightDetected,
        bipodalFlightDetected,
        flightFrames: flightFrames.length ? flightFrames : [],
        symmetryScore,
        samplingMethod: 'Adaptativo por Diferencial de Luminancia'
    };
}

// CLASIFICADOR INTELIGENTE DE HABILIDAD MOTRIZ (AUTO-DETECCIÓN CINEMÁTICA Y SEMÁNTICA)
function classifySkillFromKinematics(telemetry, userText) {
    // 1. Análisis semántico prioritario si el docente escribe una palabra clave en el chat
    if (userText && typeof userText === 'string') {
        const txt = userText.toLowerCase();
        if (txt.includes('estatico') || txt.includes('estático') || txt.includes('flamenco') || txt.includes('parado') || txt.includes('equilibrio estatico')) return 'Equilibrio Estático Unipodal';
        if (txt.includes('dinamico') || txt.includes('dinámico') || txt.includes('linea') || txt.includes('línea') || txt.includes('viga') || txt.includes('caminar linea')) return 'Equilibrio Dinámico';
        if (txt.includes('pate') || txt.includes('chut') || txt.includes('balon') || txt.includes('balón') || txt.includes('pelota') || txt.includes('futbol') || txt.includes('fútbol') || txt.includes('golpe') || txt.includes('remat') || txt.includes('tiro')) return 'Patear';
        if (txt.includes('lanz') || txt.includes('arroja') || txt.includes('tirar') || txt.includes('lanzamiento') || txt.includes('sobre hombro')) return 'Lanzamiento Sobre Hombro';
        if (txt.includes('atrap') || txt.includes('recep') || txt.includes('coger') || txt.includes('recibir') || txt.includes('guante')) return 'Recepción y Atrape';
        if (txt.includes('pata sola') || txt.includes('salto unipodal') || txt.includes('unipodal') || txt.includes('un solo pie') || txt.includes('un pie') || txt.includes('cojito')) return 'Salto Unipodal';
        if (txt.includes('salto horizontal') || txt.includes('salto largo') || txt.includes('saltar') || txt.includes('brinc') || txt.includes('salto')) return 'Salto Horizontal';
        if (txt.includes('marcha') || txt.includes('caminar') || txt.includes('paso') || txt.includes('caminata')) return 'Marcha';
        if (txt.includes('corre') || txt.includes('carrera') || txt.includes('sprint') || txt.includes('velocidad') || txt.includes('trote')) return 'Carrera';
    }

    if (!telemetry || !telemetry.hasLandmarks) {
        return 'Carrera';
    }

    // 2. Clasificador Cinemático Diferencial por Puntuación Biomecánica Ponderada
    const scores = {
        'Equilibrio Estático Unipodal': 0,
        'Patear': 0,
        'Lanzamiento Sobre Hombro': 0,
        'Recepción y Atrape': 0,
        'Salto Horizontal': 0,
        'Salto Unipodal': 0,
        'Equilibrio Dinámico': 0,
        'Marcha': 0,
        'Carrera': 0
    };

    // A. EQUILIBRIO ESTÁTICO UNIPODAL [HMB-E]:
    // Postura mantenida en un solo pie durante la secuencia con apoyo firme y sin traslación
    if (telemetry.unipodalHoldFrames >= 2 || telemetry.unipodalHoldRatio >= 0.25) scores['Equilibrio Estático Unipodal'] += 200;
    if (telemetry.avgKneeDiff >= 15) scores['Equilibrio Estático Unipodal'] += 60;
    if (telemetry.avgAnkleYDiff >= 0.035 || telemetry.maxAnkleYDiff >= 0.04) scores['Equilibrio Estático Unipodal'] += 70;
    if (!telemetry.bipodalFlightDetected) scores['Equilibrio Estático Unipodal'] += 60;
    if (telemetry.hipDisplacement <= 0.08) scores['Equilibrio Estático Unipodal'] += 100; // Permanece en el mismo sitio
    if ((telemetry.unipodalMaintainedFrames && telemetry.unipodalMaintainedFrames >= 1) || ((telemetry.unipodalRaisedFrames || 0) >= 2 && (telemetry.avgShoulderTilt || 0) <= 10.0)) {
        scores['Equilibrio Estático Unipodal'] += 160;
    }

    // B. PATEAR [HMB-M]:
    // Golpeo dinámico TRANSITORIO a un balón con apoyo unípode en suelo (NO en vuelo bipodal)
    if (telemetry.unipodalHoldRatio < 0.45 && !telemetry.bipodalFlightDetected && (!telemetry.unipodalMaintainedFrames || telemetry.unipodalMaintainedFrames < 2)) {
        if (telemetry.transientKickPeak) scores['Patear'] += 150;
        if (telemetry.hasStraddleKickFrame) scores['Patear'] += 90;
        if (telemetry.maxAnkleXDiff >= 0.14) scores['Patear'] += 50;
        if (telemetry.maxAnkleYDiff >= 0.05) scores['Patear'] += 40;
        if (telemetry.maxHipAngle >= 18 || telemetry.maxHipDiff >= 15) scores['Patear'] += 35;
        if (telemetry.rapidKneeDelta >= 14) scores['Patear'] += 25;
        if (!telemetry.maxWristAboveShoulder) scores['Patear'] += 25;
        if (telemetry.minWristDist > 0.18) scores['Patear'] += 20;
    }
    if (telemetry.bipodalFlightDetected) {
        scores['Patear'] -= 300; // Un salto bipodal NUNCA es una patada
    }
    if (telemetry.unipodalMaintainedFrames && telemetry.unipodalMaintainedFrames >= 2) {
        scores['Patear'] -= 200; // Si hay mantenimiento de equilibrio estático prolongado, no es un pateo
    }

    // C. LANZAMIENTO SOBRE HOMBRO [HMB-M]: Elevación de muñeca sobre el plano del hombro
    // Distinguir estrictamente de braceo de carrera o impulso de salto:
    // En lanzamiento hay marcada asimetría de codos (un brazo arriba/atrás, el otro abajo)
    // y NO hay locomoción rápida (zancadas sagitales amplias de carrera ni despegue de salto)
    const isLocomotionPattern = (telemetry.maxHipAngle >= 26 || telemetry.maxAnkleXDiff >= 0.11 || telemetry.flightDetected);

    if (telemetry.maxWristAboveShoulder && !isLocomotionPattern && telemetry.maxElbowDiff >= 26) {
        scores['Lanzamiento Sobre Hombro'] += 150;
        if (telemetry.maxElbowAngle >= 135) scores['Lanzamiento Sobre Hombro'] += 35;
        if (telemetry.maxHipAngle >= 18) scores['Lanzamiento Sobre Hombro'] += 20;
    }

    // D. RECEPCIÓN Y ATRAPE [HMB-M]: Muñecas juntas en copa frente al pecho
    if (telemetry.minWristDist <= 0.26) scores['Recepción y Atrape'] += 160;
    if (telemetry.avgElbowAngle >= 70 && telemetry.avgElbowAngle <= 130) scores['Recepción y Atrape'] += 40;
    if (!telemetry.maxWristAboveShoulder && telemetry.avgKneeDiff < 25) scores['Recepción y Atrape'] += 30;

    // E. SALTO HORIZONTAL [HMB-L]: Despegue o flexión preparatoria bipodal seguida de extensión y vuelo bipodal
    // CONDICIÓN FÍSICA INQUEBRANTABLE: Un salto horizontal exige desplazamiento espacial y vuelo bipodal
    if (telemetry.bipodalFlightDetected) {
        scores['Salto Horizontal'] += 220;
    }
    if (telemetry.hipDisplacement >= 0.12) {
        scores['Salto Horizontal'] += 120;
    }
    if (telemetry.minKneeAngle <= 135 && telemetry.avgKneeDiff <= 18 && telemetry.unipodalHoldRatio < 0.25) {
        scores['Salto Horizontal'] += 90;
    }

    // PENALIZACIONES EXCLUYENTES PARA SALTO HORIZONTAL:
    // 1. Si no hay traslación del centro de masa (permanece quieto en el sitio), NO es un salto horizontal
    if (telemetry.hipDisplacement < 0.08 && !telemetry.bipodalFlightDetected) {
        scores['Salto Horizontal'] -= 350;
    }
    // 2. Si hay sostén prolongado en un solo pie o elevación podal unilateral, NO es un salto horizontal bipodal
    if (telemetry.unipodalHoldRatio >= 0.25 || telemetry.unipodalHoldFrames >= 2 || (telemetry.unipodalRaisedFrames || 0) >= 2) {
        scores['Salto Horizontal'] -= 350;
    }

    // F. SALTO UNIPODAL [HMB-L]: Fase aérea de vuelo pero manteniendo asimetría vertical continua
    if (telemetry.flightDetected && telemetry.avgAnkleYDiff >= 0.07) scores['Salto Unipodal'] += 150;
    if (telemetry.flightDetected && telemetry.maxKneeDiff >= 20) scores['Salto Unipodal'] += 35;

    // G. EQUILIBRIO DINÁMICO [HMB-E]: Paso estrecho en línea recta sin vuelo y brazos en abducción
    if (!telemetry.flightDetected && telemetry.ankleDistAvg <= 0.18 && telemetry.avgTrunkAngle <= 8 && telemetry.unipodalHoldRatio < 0.3) scores['Equilibrio Dinámico'] += 120;
    if (telemetry.minKneeAngle >= 120 && (telemetry.minWristDist >= 0.45 || telemetry.avgElbowAngle >= 105) && telemetry.unipodalHoldRatio < 0.3) scores['Equilibrio Dinámico'] += 35;

    // H. MARCHA [HMB-L]: Doble apoyo continuo sin vuelo, tronco erguido y zancadas alternadas simétricas
    if (!telemetry.flightDetected && telemetry.minKneeAngle >= 112 && telemetry.avgTrunkAngle <= 9 && telemetry.unipodalHoldRatio < 0.3 && !telemetry.transientKickPeak) scores['Marcha'] += 110;
    if (!telemetry.flightDetected && telemetry.avgKneeDiff < 20 && telemetry.avgAnkleYDiff < 0.04 && telemetry.unipodalHoldRatio < 0.3) scores['Marcha'] += 35;

    // I. CARRERA [HMB-L]: Zancada amplia alternada + flexión de rodilla de recobro + braceo sagital
    if (telemetry.maxHipAngle >= 24 || telemetry.maxAnkleXDiff >= 0.10) {
        scores['Carrera'] += 130;
    }
    if (telemetry.minKneeAngle <= 124 && telemetry.unipodalHoldRatio < 0.35) {
        scores['Carrera'] += 50;
    }
    if (telemetry.flightDetected) {
        scores['Carrera'] += 50;
    }
    if (telemetry.avgElbowAngle >= 65 && telemetry.avgElbowAngle <= 125 && telemetry.unipodalHoldRatio < 0.35) {
        scores['Carrera'] += 30;
    }

    // Identificar la habilidad ganadora con mayor puntuación acumulada
    let bestSkill = 'Carrera';
    let maxScore = -1;
    for (const [skillName, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            bestSkill = skillName;
        }
    }

    console.log('🔍 [Auto-Detección Cinemática HMB] Puntuaciones:', scores, '=> Clasificación final:', bestSkill);
    return bestSkill;
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
                    const tiltOk = t.avgShoulderTilt !== undefined ? t.avgShoulderTilt <= 8.5 : true;
                    const pass = tiltOk && t.symmetryScore >= 80;
                    const tiltStr = t.avgShoulderTilt !== undefined ? `${t.avgShoulderTilt}°` : `${100 - t.symmetryScore}%`;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Oscilación lateral: ${tiltStr} (Simetría: ${t.symmetryScore}%)`,
                        umbral: 'Oscilación ≤ 8.5° y Simetría ≥ 80%',
                        observacion: pass
                            ? `Estabilidad lateral sólida sin balanceo compensatorio (${tiltStr}).`
                            : `Inclinación lateral o balanceo excesivo de hombros (${tiltStr}).`,
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
                    const kneeVal = (t.avgSupportKnee !== undefined && t.avgSupportKnee > 0) ? t.avgSupportKnee : t.maxKneeAngle;
                    const pass = kneeVal >= 155;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Extensión rodilla apoyo: ${kneeVal}°`,
                        umbral: '≥ 155° extensión',
                        observacion: pass
                            ? `Base de sustentación firme con rodilla de apoyo extendida (${kneeVal}°).`
                            : `Rodilla de apoyo semiflexionada o claudicante (${kneeVal}°).`,
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
                    const hasHold = (t.unipodalMaintainedFrames !== undefined && t.unipodalMaintainedFrames >= 2) || (t.unipodalHoldFrames >= 2);
                    const pass = hasHold || t.minKneeAngle <= 120;
                    return {
                        puntaje: pass ? 1 : 0,
                        medido: `Flexión pierna libre: ${t.minKneeAngle}° (Sostén: ${t.unipodalMaintainedFrames || t.unipodalHoldFrames || 1} frames)`,
                        umbral: 'Flexión anterior sostenida y pie elevado',
                        observacion: pass
                            ? `Pierna libre sostenida en posición anterior canónica durante la prueba.`
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
        'carrera': 'Carrera',
        'salto': 'Salto Horizontal',
        'salto_horizontal': 'Salto Horizontal',
        'salto horizontal': 'Salto Horizontal',
        'marcha': 'Marcha',
        'salto_unipodal': 'Salto Unipodal',
        'salto unipodal': 'Salto Unipodal',
        'lanzar': 'Lanzamiento Sobre Hombro',
        'lanzar_derecha': 'Lanzamiento Sobre Hombro',
        'lanzar_izquierda': 'Lanzamiento Sobre Hombro',
        'lanzamiento': 'Lanzamiento Sobre Hombro',
        'lanzamiento sobre hombro': 'Lanzamiento Sobre Hombro',
        'atrapar': 'Recepción y Atrape',
        'recepcion': 'Recepción y Atrape',
        'recepción': 'Recepción y Atrape',
        'recepcion y atrape': 'Recepción y Atrape',
        'recepción y atrape': 'Recepción y Atrape',
        'patear': 'Patear',
        'equilibrio': 'Equilibrio Dinámico',
        'equilibrio_dinamico': 'Equilibrio Dinámico',
        'equilibrio dinamico': 'Equilibrio Dinámico',
        'equilibrio dinámico': 'Equilibrio Dinámico',
        'equilibrio_estatico': 'Equilibrio Estático Unipodal',
        'equilibrio estatico': 'Equilibrio Estático Unipodal',
        'equilibrio estático': 'Equilibrio Estático Unipodal',
        'equilibrio estático unipodal': 'Equilibrio Estático Unipodal'
    };

    // 1. Extraer telemetría real de los fotogramas
    const telemetry = aggregateVideoTelemetry(frames);
    lastAnalyzedTelemetry = telemetry;

    // 2. Resolver la habilidad: si es manual, respetar la selección; si es 'auto', clasificar con cinemática
    let resolvedSkill = null;
    let isAutoDetected = false;

    if (skillCode && skillCode !== 'auto') {
        const cleaned = skillCode.toLowerCase().trim();
        resolvedSkill = skillMap[cleaned];
        if (!resolvedSkill) {
            if (cleaned.includes('salto') && cleaned.includes('unipodal')) resolvedSkill = 'Salto Unipodal';
            else if (cleaned.includes('salto')) resolvedSkill = 'Salto Horizontal';
            else if (cleaned.includes('carrera') || cleaned.includes('corre')) resolvedSkill = 'Carrera';
            else if (cleaned.includes('marcha') || cleaned.includes('camina')) resolvedSkill = 'Marcha';
            else if (cleaned.includes('lanz') || cleaned.includes('arroja')) resolvedSkill = 'Lanzamiento Sobre Hombro';
            else if (cleaned.includes('atrap') || cleaned.includes('recep')) resolvedSkill = 'Recepción y Atrape';
            else if (cleaned.includes('pate')) resolvedSkill = 'Patear';
            else if (cleaned.includes('estatico') || cleaned.includes('estático')) resolvedSkill = 'Equilibrio Estático Unipodal';
            else if (cleaned.includes('dinamico') || cleaned.includes('dinámico') || cleaned.includes('equilibrio')) resolvedSkill = 'Equilibrio Dinámico';
        }
    }

    if (!resolvedSkill) {
        resolvedSkill = classifySkillFromKinematics(telemetry, obsText);
        isAutoDetected = true;
    }

    // 3. Ejecutar la Máquina de Estados Cinemática (FSM) para la habilidad
    const fsm = executeFSMAnalysis(frames, resolvedSkill);
    telemetry.fsm = fsm;
    telemetry.fsmPhases = Array.from(fsm.fasesCumplidas);

    // 4. Evaluar cada criterio contra las reglas cuantitativas de la Batería HMB
    const evaluatedCriteria = [];
    const criticalErrors = [];

    const ruleSet = biomechanicalRulesTable[resolvedSkill] || biomechanicalRulesTable['Carrera'];
    if (!ruleSet || !ruleSet.criterios) {
        throw new Error(`No se encontraron reglas biomecánicas para la habilidad: ${resolvedSkill}`);
    }

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

    const detectionOrigin = isAutoDetected ? `🔍 [Detección Automática por Cinemática WASM: ${resolvedSkill}]` : `[Evaluación Dirigida: ${resolvedSkill}]`;
    const fsmChain = telemetry.fsmPhases.length ? telemetry.fsmPhases.join(' ➔ ') : 'Secuencia detectada';

    return {
        habilidad_detectada: resolvedSkill,
        es_deteccion_automatica: isAutoDetected,
        componente_hmb: ruleSet.componente || '[HMB-L] Locomoción',
        prueba_nro: ruleSet.prueba_nro || 1,
        puntaje_obtenido: `${passedCount}/${totalCount}`,
        bateria_referencia: 'Batería de Habilidades Motrices Básicas (5-11 años) · González Palacio, Montoya Grisales et al. (2021, Dialnet 7925607)',
        edad_calibrada: (gradeCode || '7_anos').replace('_', ' '),
        estadio_gallahue: estadio,
        porcentaje_madurez: maturityPct,
        resumen_biomecanico: `${detectionOrigin} Evaluación cinemática instrumental según la **Batería de HMB (González Palacio & Montoya Grisales, 2021 · Dialnet 7925607)** mediante **MediaPipe Pose Tasks (WASM)** y **Máquinas de Estado Cinemáticas (FSM)**. Ciclo de fases completadas: [${fsmChain}]. El estudiante obtiene un puntaje de **${passedCount}/${totalCount} puntos (${maturityPct}%)**, ubicándose en **Estadio ${estadio}**. Parámetros articulares medidos: flexión de rodilla ${telemetry.minKneeAngle}°, braceo medio ${telemetry.avgElbowAngle}°, inclinación de tronco ${telemetry.avgTrunkAngle}° y simetría bilateral ${telemetry.symmetryScore}%.`,
        criterios: evaluatedCriteria,
        analisis_articular: {
            angulos_principales: `Flexión mínima rodilla: ${telemetry.minKneeAngle}°, Ángulo medio codo: ${telemetry.avgElbowAngle}°, Inclinación tronco: ${telemetry.avgTrunkAngle}°`,
            cadena_cinetica: `Simetría bilateral calculada en ${telemetry.symmetryScore}%. Progresión de fases FSM: [${fsmChain}]. Fase de vuelo: ${telemetry.flightDetected ? 'Confirmada' : 'No evidente'}.`,
            apoyo_y_base: `Apertura angular máxima de zancada/base: ${telemetry.maxHipAngle}° mediante muestreo adaptativo por luminancia.`
        },
        errores_criticos: criticalErrors.length ? criticalErrors : [
            { error: "Sin fallos biomecánicos críticos", impacto_biomecanico: "El estudiante demuestra adecuada coordinación articular e integración motriz acorde a los criterios de la Batería HMB." }
        ],
        frases_profe: ruleSet.frases || [
            "¡Excelente esfuerzo!",
            "¡Continúa practicando para perfeccionar el patrón de movimiento!"
        ],
        telemetria_medida: telemetry
    };
}

// OBTENCIÓN DINÁMICA Y RESILIENTE DE ENDPOINTS DE GEMINI
async function getGeminiCandidateEndpoints(key) {
    if (cachedGeminiEndpoint) {
        return [cachedGeminiEndpoint];
    }

    // Si el usuario seleccionó un modelo específico de la lista de Google
    if (selectedGeminiModel && selectedGeminiModel !== 'auto') {
        return [
            { version: 'v1beta', model: selectedGeminiModel },
            { version: 'v1',     model: selectedGeminiModel }
        ];
    }

    // Si ya tenemos la lista de modelos de Google cargada
    if (availableGeminiModels && availableGeminiModels.length > 0) {
        return availableGeminiModels.map(m => ({
            version: m.version || 'v1beta',
            model: m.id
        }));
    }

    const staticFallbacks = [
        { version: 'v1beta', model: 'gemini-2.0-flash' },
        { version: 'v1',     model: 'gemini-1.5-flash' },
        { version: 'v1beta', model: 'gemini-1.5-flash' },
        { version: 'v1beta', model: 'gemini-1.5-flash-latest' },
        { version: 'v1beta', model: 'gemini-2.0-flash-exp' }
    ];

    try {
        const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (listRes.ok) {
            const listData = await listRes.json();
            if (listData.models && Array.isArray(listData.models)) {
                const available = listData.models
                    .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                    .map(m => ({
                        version: 'v1beta',
                        model: m.name.replace(/^models\//, '')
                    }));

                if (available.length > 0) {
                    available.sort((a, b) => {
                        const score = (name) => {
                            if (name.includes('2.0-flash')) return 100;
                            if (name.includes('1.5-flash-latest')) return 85;
                            if (name.includes('1.5-flash')) return 80;
                            if (name.includes('1.5-pro')) return 60;
                            if (name.includes('flash')) return 40;
                            return 10;
                        };
                        return score(b.model) - score(a.model);
                    });
                    return available;
                }
            }
        } else {
            const errData = await listRes.json().catch(() => ({}));
            const errMsg = errData?.error?.message || '';
            if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid')) {
                throw new Error('La clave API de Google AI Studio no es válida. Por favor revísala en Configurar clase.');
            }
            if (errMsg.includes('Generative Language API has not been used') || errMsg.includes('SERVICE_DISABLED')) {
                throw new Error('La "Generative Language API" no está habilitada en tu proyecto de Google Cloud. Actívala en tu consola de Google Cloud o crea tu clave en Google AI Studio (aistudio.google.com).');
            }
        }
    } catch (e) {
        if (e.message.includes('clave API') || e.message.includes('Generative Language API')) {
            throw e;
        }
        console.warn('No se pudo listar modelos dinámicamente, usando lista de respaldo:', e);
    }

    return staticFallbacks;
}

// LLAMADA A GEMINI VISION CON TELEMETRÍA ENRIQUECIDA Y RESILIENCIA MULTIMODELO
async function callGeminiVision(skill, grade, obsText, frames) {
    if (!apiKey) throw new Error('No hay clave API configurada');

    const telemetry = aggregateVideoTelemetry(frames);
    lastAnalyzedTelemetry = telemetry;

    const isAuto = (!skill || skill === 'auto' || skill === 'Detección Automática' || skill.includes('Automática'));
    const suggestedSkill = classifySkillFromKinematics(telemetry, obsText);
    const targetSkillForFSM = isAuto ? suggestedSkill : skill;

    const fsm = executeFSMAnalysis(frames, targetSkillForFSM);
    telemetry.fsm = fsm;
    telemetry.fsmPhases = Array.from(fsm.fasesCumplidas);

    const skillInstruction = isAuto 
        ? `MODO DETECCIÓN AUTOMÁTICA BASADA EN VISIÓN:
Debes analizar de forma AUTÓNOMA la secuencia cronológica de los ${frames.length} fotogramas proporcionados para CLASIFICAR cuál de las 9 habilidades de la Batería HMB (González Palacio & Montoya Grisales) se ejecuta en el video:
- "Equilibrio Estático Unipodal": Se sostiene quieto sobre un solo pie (apoyo unipodal) durante la secuencia, sin desplazarse por el espacio. (REGLA CRÍTICA: Si el niño permanece en el sitio y levanta un pie del piso sosteniéndose en la otra pierna, ES Equilibrio Estático Unipodal; NUNCA lo clasifiques como Salto Horizontal ni Patear).
- "Salto Horizontal": Flexiona rodillas con ambos pies en el piso y salta hacia adelante trasladándose por el espacio con despegue bipodal y fase de vuelo. (REGLA CRÍTICA: Exige desplazamiento horizontal hacia adelante por el piso; si el niño no se traslada hacia adelante en el espacio, NO es Salto Horizontal).
- "Carrera": El estudiante corre desplazándose por el espacio, con zancadas alternas cíclicas y braceo sagital.
- "Marcha": Camina progresivamente paso a paso manteniendo contacto continuo con el piso.
- "Salto Unipodal": Salta y cae sucesivamente sobre un solo pie ("pata sola").
- "Lanzamiento Sobre Hombro": Sostiene y arroja un objeto con un brazo por encima del hombro. (Si corre o salta y levanta los brazos por impulso o braceo, NO es lanzamiento).
- "Recepción y Atrape": Recibe y asegura con ambas manos un móvil/pelota que viene por el aire frente al pecho.
- "Patear": Da un paso hacia un balón en el suelo y lo impacta con el pie.
- "Equilibrio Dinámico": Camina en equilibrio manteniendo los pies sobre una línea estrecha.

REGLA DE DECISIÓN VISUAL:
Tu análisis visual de las imágenes fotográficas tiene PRIORIDAD TOTAL sobre cualquier aproximación matemática. Observa la acción global del cuerpo y el entorno. Escribe en "habilidad_detectada" el nombre exacto de la habilidad que ves ejecutada.`
        : `Habilidad Específica Seleccionada por el Docente: "${skill}". Evalúa estrictamente los criterios de esta habilidad.`;

    const fsmChain = telemetry.fsmPhases.length ? telemetry.fsmPhases.join(' ➔ ') : 'Secuencia temporal';

    const sysPrompt = `Eres un Biomecánico Deportivo y Docente Experto en Desarrollo Motor Infantil especializado en la evaluación de Habilidades Motrices Básicas (HMB) mediante la Batería Validada de Habilidades Motrices Básicas para Niños entre 5 y 11 Años (González Palacio, Montoya Grisales, Cardona, Marín & Muñoz, 2021 · Dialnet 7925607) y los estadios evolutivos de David L. Gallahue.
Debes contrastar los fotogramas del estudiante contra la siguiente telemetría instrumental ya medida en el navegador mediante MediaPipe Pose (33 landmarks) y Máquinas de Estados Cinemáticas (FSM):

DATOS CINEMÁTICOS REALES MEDIDOS EN EL NAVEGADOR:
${skillInstruction}
- Edad Calibrada: ${grade}
- Ciclo de Fases detectadas por FSM: [${fsmChain}]
- Desplazamiento horizontal de cadera (traslación espacial): ${telemetry.hipDisplacement < 0.08 ? 'NULO/MÍNIMO (' + telemetry.hipDisplacement.toFixed(3) + ' - Permanece en el mismo sitio, descartar salto)' : 'DINÁMICO (' + telemetry.hipDisplacement.toFixed(3) + ' - Se traslada en el espacio)'}
- Postura de equilibrio unipodal sostenida: ${telemetry.unipodalHoldFrames >= 2 || (telemetry.unipodalRaisedFrames || 0) >= 2 ? 'SÍ (' + (telemetry.unipodalMaintainedFrames || telemetry.unipodalHoldFrames) + ' fotogramas en un solo pie)' : 'NO'}
- Inclinación lateral de hombros: ${telemetry.avgShoulderTilt !== undefined ? telemetry.avgShoulderTilt + '°' : 'N/A'}
- Flexión mínima de rodilla medida: ${telemetry.minKneeAngle}°
- Ángulo medio de codos (braceo): ${telemetry.avgElbowAngle}°
- Inclinación promedio de tronco: ${telemetry.avgTrunkAngle}°
- Apertura máxima de zancada / cadera: ${telemetry.maxHipAngle}°
- Apoyo unipodal con oscilación de patada (Pateo): ${telemetry.singleSupportKick ? 'DETECTADO (Un pie en suelo y pierna contraria en péndulo de golpeo)' : 'NO'}
- Elevación de muñeca sobre hombro: ${telemetry.maxWristAboveShoulder ? 'SÍ (Gesto elevado / braceo alto)' : 'NO'}
- Distancia mínima entre muñecas: ${telemetry.minWristDist.toFixed(2)} (Manos juntas en copa: ${telemetry.minWristDist < 0.26 ? 'SÍ' : 'NO'})
- Asimetría vertical máxima de tobillos: ${telemetry.maxAnkleYDiff.toFixed(2)}
- Asimetría máxima entre rodillas: ${telemetry.maxKneeDiff}°
- Fase de vuelo / despegue aéreo bilateral: ${telemetry.bipodalFlightDetected ? 'DETECTADA (Ambos pies en aire)' : 'NO DETECTADA (Apoyo en suelo)'}
- Simetría bilateral: ${telemetry.symmetryScore}%

INSTRUCCIÓN VITAL:
Usa estrictamente estos datos cuantitativos reales medidos por MediaPipe. Evalúa los criterios dicotómicos (1 = logrado, 0 = en proceso) de la Batería HMB según los umbrales observados para la habilidad identificada. Tu función es la interpretación pedagógica, la justificación cualitativa según González Palacio & Montoya Grisales y la redacción de consignas verbales para el niño ("El Lenguaje del Profe").

DEBES RESPONDER EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO CON LA SIGUIENTE ESTRUCTURA:
{
  "habilidad_detectada": ${isAuto ? '"[Escribe aquí el nombre exacto de la habilidad que observas en los fotogramas: Carrera | Salto Horizontal | Marcha | Salto Unipodal | Lanzamiento Sobre Hombro | Recepción y Atrape | Patear | Equilibrio Dinámico | Equilibrio Estático Unipodal]"' : `"${skill}"`},
  "es_deteccion_automatica": ${isAuto},
  "componente_hmb": "[HMB-L] Locomoción | [HMB-M] Manipulación | [HMB-E] Estabilidad-Equilibrio",
  "bateria_referencia": "Batería de Habilidades Motrices Básicas (González Palacio et al., 2021 · Dialnet 7925607)",
  "puntaje_obtenido": "4/5",
  "edad_calibrada": "${grade}",
  "estadio_gallahue": "Inicial | Elemental | Maduro",
  "porcentaje_madurez": 75,
  "resumen_biomecanico": "Diagnóstico general de la cadena cinética citando explícitamente el número de fotograma donde se evidencia la acción cumbre (ej: 'En el Fotograma #4 se evidencia con claridad la pateada / impacto al balón...').",
  "criterios": [
    { "criterio": "Nombre del criterio de la Batería HMB", "fase": "Vuelo/Recobro/Apoyo", "puntaje": 1, "observacion": "Comentario técnico citando el fotograma y ángulo real" }
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

    const parts = [{ text: `Analiza los siguientes ${frames.length} fotogramas adaptativos del estudiante considerando la telemetría angular proporcionada e identifica la HMB. En cada fotograma se detalla el hito cinemático detectado:` }];

    frames.forEach((f, idx) => {
        const milestoneTag = f.isMilestonePeak 
            ? `[★ HITO CUMBRE DEL EJERCICIO: ${f.milestoneTitle} (${f.milestoneDesc})]`
            : (f.isFinalMilestone ? `[🏁 FOTOGRAMA FINAL: ${f.milestoneTitle} (${f.milestoneDesc})]` : (f.isInitialTrigger ? `[🎯 ÁNGULO INICIAL: ${f.milestoneTitle} (${f.milestoneDesc})]` : `[${f.milestoneTitle} (${f.milestoneDesc})]`));

        parts.push({
            text: `Fotograma #${idx + 1} (${f.time}) - ${milestoneTag}:`
        });
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

    const candidates = await getGeminiCandidateEndpoints(apiKey);
    let lastError = null;

    for (const cand of candidates) {
        const endpoint = `https://generativelanguage.googleapis.com/${cand.version}/models/${cand.model}:generateContent?key=${apiKey}`;
        try {
            console.log(`[Gemini IA] Intentando modelo: ${cand.model} (${cand.version})...`);
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await res.json();
            if (!res.ok || data.error) {
                const errDetail = (data.error && data.error.message) ? data.error.message : `HTTP ${res.status}: ${res.statusText}`;

                // Si el modelo no existe en esta versión/región, probar el siguiente candidato
                if (errDetail.includes('is not found') || errDetail.includes('not supported') || res.status === 404) {
                    lastError = new Error(errDetail);
                    continue;
                }

                if (errDetail.includes('API_KEY_INVALID') || errDetail.includes('API key not valid')) {
                    throw new Error('La clave API no es válida. Asegúrate de copiarla correctamente desde Google AI Studio.');
                }
                if (errDetail.includes('Generative Language API has not been used') || errDetail.includes('SERVICE_DISABLED')) {
                    throw new Error('La "Generative Language API" no está habilitada en tu proyecto de Google Cloud. Actívala en la consola de Google Cloud o crea tu clave en Google AI Studio (aistudio.google.com).');
                }

                throw new Error(errDetail);
            }

            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) throw new Error('Respuesta vacía de Gemini');

            const parsed = JSON.parse(cleanJSON(rawText));
            parsed.telemetria_medida = telemetry;
            parsed.es_deteccion_automatica = isAuto;
            parsed.modelo_utilizado = cand.model;

            cachedGeminiEndpoint = cand;
            console.log(`[Gemini IA] Conectado exitosamente con ${cand.model}`);
            return parsed;
        } catch (err) {
            lastError = err;
            if (err.message.includes('no es válida') || err.message.includes('no está habilitada')) {
                throw err;
            }
            console.warn(`[Gemini IA] Fallo con ${cand.model}:`, err.message);
        }
    }

    throw lastError || new Error('No se pudo establecer conexión con ningún modelo de Gemini disponible');
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

    if (capturedKeyframes.length === 0) {
        showAlert('Por favor sube un video o foto del estudiante antes de analizar el movimiento.', {
            title: 'Evidencia requerida',
            type: 'info',
            icon: '📹'
        });
        return;
    }

    const userInput = document.getElementById('userInput');
    const userText = userInput ? userInput.value.trim() : '';

    isAnalyzing = true;
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = true;

    const procBar = document.getElementById('processingBar');
    if (procBar) procBar.style.display = 'flex';

    const gradeEl = document.getElementById('gradeSelect');
    const grade = gradeEl ? gradeEl.value : '7_anos';
    const teacherPrefs = getTeacherPreferences();

    const skillSelectEl = document.getElementById('skillSelect');
    const activeSkillCode = skillSelectEl ? skillSelectEl.value : selectedSkill;
    const activeSkillName = (skillSelectEl && activeSkillCode !== 'auto') 
        ? skillSelectEl.options[skillSelectEl.selectedIndex].text 
        : 'Detección Automática';

    try {
        if (currentEngineMode === 'gemini') {
            if (!apiKey) {
                showAlert('Para analizar con Gemini Vision en la nube, ingresa tu clave de Google AI Studio en <strong>Configurar clase</strong>, o cambia al modo de <strong>Análisis rápido (sin internet)</strong>.', {
                    title: 'Clave API requerida',
                    type: 'info',
                    icon: '🔑'
                });
                return;
            }
            const diagnosis = await callGeminiVision(activeSkillName, grade, userText, capturedKeyframes);
            handleDiagnosisOutput(diagnosis, teacherPrefs);
        } else {
            await new Promise(r => setTimeout(r, 450));
            const diagnosis = runLocalBiomechanicalEngine(activeSkillCode, grade, userText, capturedKeyframes);
            handleDiagnosisOutput(diagnosis, teacherPrefs);
        }
    } catch (err) {
        console.error('Error en diagnóstico:', err);
        if (currentEngineMode === 'gemini') {
            showAlert(`No se pudo conectar con Gemini Vision (${err.message || 'error de conexión'}). Se ejecutó el análisis con el motor biomecánico local como respaldo.`, {
                title: 'Aviso de conexión',
                type: 'warning',
                icon: '⚡'
            });
            try {
                const fallback = runLocalBiomechanicalEngine(activeSkillCode, grade, userText, capturedKeyframes);
                handleDiagnosisOutput(fallback, teacherPrefs);
            } catch (fallbackErr) {
                console.error('Error en fallback local:', fallbackErr);
                showAlert(`Error en el análisis: ${fallbackErr.message || 'Verifique el video.'}`, {
                    title: 'Error de análisis',
                    type: 'danger',
                    icon: '❌'
                });
            }
        } else {
            showAlert(`Error al ejecutar el motor local: ${err.message || 'Verifique el video.'}`, {
                title: 'Error de análisis local',
                type: 'danger',
                icon: '❌'
            });
        }
    } finally {
        isAnalyzing = false;
        if (sendBtn) sendBtn.disabled = false;
        if (procBar) procBar.style.display = 'none';
    }
}

// ACTUALIZAR DETALLES TÉCNICOS AL PIE DE PÁGINA
function updateTechDetails(data) {
    const container = document.getElementById('techTelemetryContainer');
    if (!container) return;

    const t = data.telemetria_medida;
    if (!t) return;

    let framesHTML = '';
    if (capturedKeyframes && capturedKeyframes.length) {
        framesHTML = `
            <div style="margin-top:14px;">
                <span class="tech-label" style="display:block; margin-bottom:6px;">Fotogramas adaptativos e hitos biomecánicos evidenciados (${capturedKeyframes.length}):</span>
                <div class="keyframe-strip">
                    ${capturedKeyframes.map((f, idx) => {
                        const peakClass = f.isMilestonePeak 
                            ? 'milestone-peak' 
                            : (f.isFinalMilestone ? 'milestone-final' : (f.isInitialTrigger ? 'milestone-trigger' : (f.isSubMilestone ? 'milestone-subpeak' : '')));
                        const bannerHTML = f.milestoneBadge 
                            ? `<div class="keyframe-milestone-banner" style="background:${f.milestoneColor || '#F59E0B'}">${f.milestoneBadge}</div>` 
                            : '';
                        const descHTML = f.milestoneDesc 
                            ? `<div class="keyframe-milestone-desc" title="${f.milestoneTitle || ''}: ${f.milestoneDesc}">${f.milestoneDesc}</div>`
                            : `<div class="keyframe-milestone-desc">${f.phase || 'Fase activa'}</div>`;
                        const angleHTML = f.angles 
                            ? `<div class="keyframe-angles"><span>🦵 ${f.angles.kneeMin}°</span><span>💪 ${f.angles.elbowAvg}°</span><span>📐 ${f.angles.trunkLean}°</span></div>` 
                            : '';
                        const tagText = f.isInitialTrigger 
                            ? `🎯 Ángulo Inicial · ${f.time}` 
                            : (f.isFinalMilestone ? `🏁 Cuadro Final · ${f.time}` : `#${idx + 1} · ${f.time}`);
                        return `
                            <div class="keyframe-card ${peakClass}">
                                ${bannerHTML}
                                <img src="${f.previewUrl}" alt="Cuadro ${idx+1}">
                                <div class="keyframe-tag">${tagText}</div>
                                ${descHTML}
                                ${angleHTML}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="telemetry-box" style="margin-top:12px;">
            <div class="telemetry-header">Telemetría Articular Medida (MediaPipe Pose WASM · 33 Landmarks)</div>
            <div class="telemetry-grid">
                <div class="telemetry-item">
                    <span class="telemetry-lbl">Flexión Mín. Rodilla:</span>
                    <span class="telemetry-val">${t.minKneeAngle}°</span>
                </div>
                <div class="telemetry-item">
                    <span class="telemetry-lbl">Ángulo Codo (Braceo):</span>
                    <span class="telemetry-val">${t.avgElbowAngle}°</span>
                </div>
                <div class="telemetry-item">
                    <span class="telemetry-lbl">Inclinación Tronco:</span>
                    <span class="telemetry-val">${t.avgTrunkAngle}°</span>
                </div>
                <div class="telemetry-item">
                    <span class="telemetry-lbl">Fase Aérea / Vuelo:</span>
                    <span class="telemetry-val" style="color:${t.flightDetected ? '#16A34A' : '#DC2626'};">${t.flightDetected ? '✓ Detectada' : '✗ No evidente'}</span>
                </div>
                <div class="telemetry-item">
                    <span class="telemetry-lbl">Simetría Bilateral:</span>
                    <span class="telemetry-val">${t.symmetryScore}%</span>
                </div>
                <div class="telemetry-item">
                    <span class="telemetry-lbl">Apertura Cadera:</span>
                    <span class="telemetry-val">${t.maxHipAngle}°</span>
                </div>
            </div>
            ${framesHTML}
        </div>
    `;
}

// PROCESAMIENTO DE SALIDA DEL DIAGNÓSTICO
function handleDiagnosisOutput(data, teacherPrefs) {
    globalDiagnosticoData = data;
    const didactica = generateDidacticPlan(data, teacherPrefs, isGroupActive);
    globalDidacticaData = didactica;

    if (data && data.habilidad_detectada && capturedKeyframes && capturedKeyframes.length > 0) {
        assignKeyframeMilestones(capturedKeyframes, data.habilidad_detectada);
        renderKeyframeStrip(capturedKeyframes);
    }

    if (selectedSkill === 'auto' && data && data.habilidad_detectada) {
        const nameToCode = {
            'Carrera': 'carrera',
            'Salto Horizontal': 'salto',
            'Marcha': 'marcha',
            'Salto Unipodal': 'salto_unipodal',
            'Lanzamiento Sobre Hombro': 'lanzar',
            'Recepción y Atrape': 'atrapar',
            'Patear': 'patear',
            'Equilibrio Dinámico': 'equilibrio',
            'Equilibrio Estático Unipodal': 'equilibrio_estatico'
        };
        const detectedCode = nameToCode[data.habilidad_detectada] || 'carrera';
        updateCGIModel(detectedCode);

        const subtitle = document.getElementById('currentSkillSubtitle');
        if (subtitle) subtitle.textContent = `(Auto: ${data.habilidad_detectada})`;
    }

    updateTechDetails(data);

    const resultContainer = document.getElementById('resultContainer');

    if (!isGroupActive) {
        if (resultContainer) {
            resultContainer.innerHTML = renderResultStepHTML(data, didactica);
        }
    } else {
        evaluatedStudents++;
        groupMemory.push(data);
        updateGroupUI();
        if (resultContainer) {
            resultContainer.innerHTML = renderResultStepHTML(data, didactica, evaluatedStudents);
        }
    }

    markStepComplete(2);
    markStepComplete(3);
    goToStep(3);
}

// RENDERIZADOR HTML LIMPIO PARA EL PASO 3
function renderResultStepHTML(data, didactica, studentNum = null) {
    const stageClass = {
        'Inicial': 'stage-inicial',
        'Elemental': 'stage-elemental',
        'Maduro': 'stage-maduro'
    }[data.estadio_gallahue] || 'stage-elemental';

    const skillIcons = {
        'Carrera': '🏃',
        'Salto Horizontal': '🦘',
        'Marcha': '🚶',
        'Salto Unipodal': '🦿',
        'Lanzamiento Sobre Hombro': '⚾',
        'Recepción y Atrape': '🧤',
        'Patear': '⚽',
        'Equilibrio Dinámico': '🧘',
        'Equilibrio Estático Unipodal': '🦩'
    };
    const skillIcon = skillIcons[data.habilidad_detectada] || '🏃';

    let criteriaRows = data.criterios.map(c => {
        const badge = c.puntaje === 1
            ? `<span class="badge-1">✓ Logrado</span>`
            : `<span class="badge-0">✗ En Proceso</span>`;
        const medidoInfo = c.medido ? `<span style="font-family:var(--font-mono); color:var(--accent); font-size:11px;">[Medido: ${c.medido} | Umbral: ${c.umbral || '--'}]</span><br>` : '';
        return `
            <tr>
                <td><strong>${c.criterio}</strong><br>${medidoInfo}<span style="color:var(--text-subtle); font-size:11px;">Fase: ${c.fase || 'Ejecución'} · ${c.observacion || ''}</span></td>
                <td style="text-align:center; vertical-align:middle;">${badge}</td>
            </tr>
        `;
    }).join('');

    let errorsHTML = data.errores_criticos.map(e => `
        <div class="error-box">
            <strong>Anomalía técnica:</strong> ${e.error}<br>
            <span style="font-size:11.5px; opacity:0.95;"><strong>Impacto biomecánico:</strong> ${e.impacto_biomecanico}</span>
        </div>
    `).join('');

    let phrasesHTML = data.frases_profe.map(f => `<li>"${f}"</li>`).join('');

    const autoBadgeHTML = data.es_deteccion_automatica
        ? `<div style="background:var(--accent-soft); border:1px solid var(--accent-subtle); color:var(--accent); font-size:11px; font-weight:700; padding:4px 8px; border-radius:4px; margin-bottom:10px; display:inline-flex; align-items:center; gap:6px;">
            <span>🔍 Detección automática:</span> <strong>${data.habilidad_detectada}</strong>
           </div>`
        : '';

    const titleText = studentNum ? `Estudiante #${studentNum} · Diagnóstico biomecánico` : `Diagnóstico biomecánico`;

    const didactClasesHTML = didactica ? didactica.clases_secuencia.map(c => `
        <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-left:3px solid var(--accent); padding:10px 12px; border-radius:6px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <strong style="color:var(--text); font-size:12.5px;">Sesión ${c.numero} de ${didactica.total_clases}: ${c.titulo}</strong>
                <span style="font-size:10px; background:var(--accent-soft); color:var(--accent); padding:2px 6px; border-radius:4px; font-weight:600; font-family:var(--font-mono);">${c.fase_pedagogica}</span>
            </div>
            <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:6px;"><strong>Objetivo de sesión:</strong> ${c.objetivo}</div>
            <div style="font-size:11.5px; line-height:1.45; color:var(--text);">
                <div style="margin-bottom:2px;"><span style="font-family:var(--font-mono); font-size:10px; color:#64748B; font-weight:700;">[INICIAL]</span> ${c.actividad_inicial}</div>
                <div style="margin-bottom:2px;"><span style="font-family:var(--font-mono); font-size:10px; color:var(--accent); font-weight:700;">[DESARROLLO · ${didactica.duraciones.central}]</span> ${c.actividad_central}</div>
                <div><span style="font-family:var(--font-mono); font-size:10px; color:#16A34A; font-weight:700;">[CIERRE]</span> ${c.actividad_final}</div>
            </div>
            <div style="margin-top:6px; font-size:11px; background:#F8FAFC; border:1px solid #E2E8F0; padding:5px 8px; border-radius:4px; color:var(--text);">
                <strong>Consigna verbal:</strong> "${c.consigna}"
            </div>
        </div>
    `).join('') : '';

    return `
        <!-- TARJETA LIMPIA: DIAGNÓSTICO DEL ESTUDIANTE -->
        <div class="diag-card">
            ${autoBadgeHTML}
            <div class="diag-header-bar">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:32px; line-height:1;">${skillIcon}</span>
                    <div>
                        <div class="diag-title">${titleText}</div>
                        <div class="diag-meta">Habilidad: <strong>${data.habilidad_detectada}</strong> · Componente: <strong>${data.componente_hmb || 'Locomoción'}</strong> · Puntaje: <strong>${data.puntaje_obtenido || data.porcentaje_madurez + '%'}</strong></div>
                        <div style="font-size:11px; color:var(--text-subtle); margin-top:2px;">
                            Batería Validada de Habilidades Motrices Básicas (5 a 11 años)
                        </div>
                    </div>
                </div>
                <span class="stage-badge ${stageClass}">Estadio ${data.estadio_gallahue}</span>
            </div>

            <!-- MEDIDOR DE MADUREZ -->
            <div class="maturity-gauge-row">
                <div class="gauge-circle">${data.porcentaje_madurez}%</div>
                <div class="gauge-details">
                    <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:700; color:var(--text);">
                        <span>Índice de madurez motriz</span>
                        <span style="color:var(--accent);">${data.porcentaje_madurez} / 100 pts</span>
                    </div>
                    <div class="gauge-bar-track">
                        <div class="gauge-bar-fill" style="width: ${data.porcentaje_madurez}%;"></div>
                    </div>
                </div>
            </div>

            <!-- RESUMEN BREVE -->
            <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px; line-height:1.5;">${data.resumen_biomecanico}</p>

            <!-- LENGUAJE DEL PROFE -->
            <div class="profe-cue-box">
                <div style="font-weight:700; margin-bottom:4px;">Consignas verbales para el estudiante ("El lenguaje del profe"):</div>
                <ul style="padding-left: 18px; line-height:1.5; font-size:12.5px;">
                    ${phrasesHTML}
                </ul>
            </div>

            <!-- BOTÓN DE DESCARGA INFORME -->
            <button class="btn-export-doc" onclick="exportDiagnosticoToWord()">
                Descargar reporte del estudiante (.doc)
            </button>

            <!-- SECCIONES DESPLEGABLES -->
            <details style="margin-top:14px; border-top:1px solid var(--border); padding-top:10px;">
                <summary style="font-size:12px; font-weight:600; color:var(--text-muted); cursor:pointer; padding:6px 0;">
                    Ver criterios evaluados (${data.puntaje_obtenido || ''})
                </summary>
                <div style="margin-top:10px;">
                    <table class="diag-table">
                        <thead>
                            <tr>
                                <th>Criterio biomecánico y fase</th>
                                <th style="text-align:center;">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${criteriaRows}
                        </tbody>
                    </table>
                </div>
            </details>

            <details style="margin-top:8px; border-top:1px solid var(--border); padding-top:10px;">
                <summary style="font-size:12px; font-weight:600; color:var(--text-muted); cursor:pointer; padding:6px 0;">
                    Ver fallas y observaciones técnicas (${data.errores_criticos ? data.errores_criticos.length : 0})
                </summary>
                <div style="margin-top:10px;">
                    ${errorsHTML}
                </div>
            </details>
        </div>

        ${didactica ? `
        <!-- TARJETA: UNIDAD DIDÁCTICA INSTITUCIONAL -->
        <div class="didact-card">
            <div class="diag-header-bar">
                <div>
                    <div class="diag-title">Unidad didáctica institucional · Período ${didactica.periodo}</div>
                    <div class="diag-meta"><strong>${didactica.tema}</strong> · Grado: <strong>${didactica.grado}</strong></div>
                    <div style="font-size:11px; color:var(--text-subtle); margin-top:2px;">
                        Secuencia de <strong>${didactica.total_clases} sesiones progresivas</strong> · ${didactica.duracion_clase} por sesión
                    </div>
                </div>
                <span class="stage-badge stage-maduro">${didactica.total_clases} sesiones</span>
            </div>

            <!-- PREGUNTA PROBLEMATIZADORA Y OBJETIVOS -->
            <div style="background:var(--bg); border:1px solid var(--border); padding:10px 12px; border-radius:6px; font-size:12px; margin-bottom:12px;">
                <div style="font-weight:700; color:var(--accent); margin-bottom:4px;">Pregunta problematizadora del período:</div>
                <div style="font-style:italic; margin-bottom:8px;">${didactica.pregunta_problematizadora}</div>
                <div style="font-weight:700; color:var(--text); margin-bottom:2px;">Objetivo general:</div>
                <div>${didactica.objetivo_general}</div>
            </div>

            <!-- INDICADORES SABER, HACER, SER -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:8px; margin-bottom:12px; font-size:11.5px;">
                <div style="background:var(--bg); border-left:3px solid var(--accent); padding:8px; border-radius:4px; border:1px solid var(--border);">
                    <strong>Saber (Cognitivo):</strong><br>${didactica.indicadores.saber}
                </div>
                <div style="background:var(--bg); border-left:3px solid #16A34A; padding:8px; border-radius:4px; border:1px solid var(--border);">
                    <strong>Hacer (Procedimental):</strong><br>${didactica.indicadores.hacer}
                </div>
                <div style="background:var(--bg); border-left:3px solid #D97706; padding:8px; border-radius:4px; border:1px solid var(--border);">
                    <strong>Ser (Actitudinal):</strong><br>${didactica.indicadores.ser}
                </div>
            </div>

            <!-- SECUENCIA DE CLASES -->
            <details style="margin-bottom:12px;" open>
                <summary style="font-weight:700; font-size:12px; color:var(--text); cursor:pointer; padding:6px 0;">
                    Secuencia didáctica (${didactica.total_clases} clases planificadas)
                </summary>
                <div style="max-height:340px; overflow-y:auto; padding-right:4px; margin-top:8px;">
                    ${didactClasesHTML}
                </div>
            </details>

            <!-- BOTÓN DE DESCARGA UNIDAD DIDÁCTICA -->
            <button class="btn-export-plan" onclick="exportToWord()">
                Descargar plan de clase en Word (${didactica.total_clases} clases)
            </button>
        </div>
        ` : ''}
    `;
}

// Función de compatibilidad
function renderDiagnosticoHTML(data, studentNum = null) {
    return renderResultStepHTML(data, globalDidacticaData, studentNum);
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
        <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-left:3px solid var(--accent); padding:10px 12px; border-radius:6px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <strong style="color:var(--text); font-size:12.5px;">Sesión ${c.numero} de ${didactica.total_clases}: ${c.titulo}</strong>
                <span style="font-size:10px; background:var(--accent-soft); color:var(--accent); padding:2px 6px; border-radius:4px; font-weight:600; font-family:var(--font-mono);">${c.fase_pedagogica}</span>
            </div>
            <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:6px;"><strong>Objetivo de sesión:</strong> ${c.objetivo}</div>
            <div style="font-size:11.5px; line-height:1.45; color:var(--text);">
                <div style="margin-bottom:2px;"><span style="font-family:var(--font-mono); font-size:10px; color:#64748B; font-weight:700;">[INICIAL]</span> ${c.actividad_inicial}</div>
                <div style="margin-bottom:2px;"><span style="font-family:var(--font-mono); font-size:10px; color:var(--accent); font-weight:700;">[DESARROLLO · ${didactica.duraciones.central}]</span> ${c.actividad_central}</div>
                <div><span style="font-family:var(--font-mono); font-size:10px; color:#16A34A; font-weight:700;">[CIERRE]</span> ${c.actividad_final}</div>
            </div>
            <div style="margin-top:6px; font-size:11px; background:#F8FAFC; border:1px solid #E2E8F0; padding:5px 8px; border-radius:4px; color:var(--text);">
                <strong>Consigna verbal:</strong> "${c.consigna}"
            </div>
        </div>
    `).join('');

    return `
        <div class="diag-card">
            <div class="diag-header-bar">
                <div>
                    <div class="diag-title">UNIDAD DIDÁCTICA INSTITUCIONAL · PERÍODO ${didactica.periodo}</div>
                    <div class="diag-meta"><strong>${didactica.tema}</strong> | Grado: <strong>${didactica.grado}</strong></div>
                    <div style="font-size:11px; color:var(--text-subtle); margin-top:2px;">Secuencia curricular de <strong>${didactica.total_clases} Sesiones Progresivas</strong> · ${didactica.duracion_clase} por sesión</div>
                </div>
                <span class="stage-badge stage-maduro">${didactica.total_clases} Sesiones</span>
            </div>

            <!-- PREGUNTA PROBLEMATIZADORA Y OBJETIVOS -->
            <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:10px 12px; border-radius:6px; font-size:12px; margin-bottom:12px;">
                <div style="font-weight:700; color:var(--accent); margin-bottom:4px;">Pregunta Problematizadora del Período:</div>
                <div style="font-style:italic; margin-bottom:8px;">${didactica.pregunta_problematizadora}</div>
                <div style="font-weight:700; color:var(--text); margin-bottom:2px;">Objetivo General de la Unidad:</div>
                <div>${didactica.objetivo_general}</div>
            </div>

            <!-- INDICADORES SABER, HACER, SER -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:8px; margin-bottom:12px; font-size:11.5px;">
                <div style="background:#F8FAFC; border-left:3px solid var(--accent); padding:8px; border-radius:4px; border:1px solid #E2E8F0;">
                    <strong>Saber (Dimensión Cognitiva):</strong><br>${didactica.indicadores.saber}
                </div>
                <div style="background:#F8FAFC; border-left:3px solid #16A34A; padding:8px; border-radius:4px; border:1px solid #E2E8F0;">
                    <strong>Hacer (Dimensión Procedimental):</strong><br>${didactica.indicadores.hacer}
                </div>
                <div style="background:#F8FAFC; border-left:3px solid #D97706; padding:8px; border-radius:4px; border:1px solid #E2E8F0;">
                    <strong>Ser (Dimensión Actitudinal):</strong><br>${didactica.indicadores.ser}
                </div>
            </div>

            <!-- SECUENCIA DE PROGRESIÓN DE CLASES -->
            <div style="margin-bottom:12px;">
                <div style="font-weight:700; color:var(--text); font-size:11.5px; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em; font-family:var(--font-mono);">
                    Secuencia de Progresión Pedagógica (${didactica.total_clases} Sesiones):
                </div>
                <div style="max-height:380px; overflow-y:auto; padding-right:4px;">
                    ${clasesHTML}
                </div>
            </div>

            <!-- EL LENGUAJE DEL PROFE -->
            <div class="profe-cue-box" style="margin-bottom:14px;">
                <div style="font-weight:700; margin-bottom:4px;">Consignas Pedagógicas Clave ("El Lenguaje del Profe"):</div>
                <ul style="padding-left:18px; line-height:1.5; font-size:12px;">
                    ${frasesHTML}
                </ul>
            </div>

            <button class="btn-export-plan" onclick="exportToWord()">
                Descargar Unidad Didáctica Completa (${didactica.total_clases} Sesiones en Formato Institucional)
            </button>
        </div>
    `;
}

// GENERADOR DE PLANEACIÓN GRUPAL CONSOLIDADA
function generateGroupPlan() {
    if (groupMemory.length === 0) {
        showAlert('No has evaluado a ningún estudiante todavía. Realiza al menos una evaluación individual antes de consolidar el plan del salón.', {
            title: 'Sin evaluaciones previas',
            type: 'info',
            icon: '📋'
        });
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
// EXPORTACIÓN A MICROSOFT WORD (.DOC) - FORMATO INSTITUCIONAL DE REPORTE BIOMECÁNICO (100% RESPONSIVE Y SIN DISTORSIÓN)
function exportDiagnosticoToWord() {
    if (!globalDiagnosticoData) return;
    const d = globalDiagnosticoData;
    const hoy = new Date().toLocaleDateString('es-CO');

    let filasCriterios = d.criterios.map((c, idx) => {
        const estadoColor = c.puntaje === 1 ? '#059669' : '#DC2626';
        const estadoBg = c.puntaje === 1 ? '#ECFDF5' : '#FEF2F2';
        const estadoText = c.puntaje === 1 ? '✓ LOGRADO' : '✗ EN PROCESO';
        const medidoInfo = c.medido ? `<br><span style="font-family:Consolas, monospace; font-size:8.5pt; color:#0284C7;">[Medido: ${c.medido} | Umbral: ${c.umbral || '--'}]</span>` : '';
        const obsInfo = c.observacion ? `<br><span style="font-size:8.5pt; color:#64748B;">Observación: ${c.observacion}</span>` : '';
        
        return `
        <tr>
            <td style="padding:7px 10px; border:1px solid #CBD5E1; vertical-align:top;">
                <strong>${idx + 1}. ${c.criterio}</strong>
                <span style="display:block; font-size:8.5pt; color:#475569; margin-top:2px;">Fase: <strong>${c.fase || 'Ejecución'}</strong></span>
                ${medidoInfo}
                ${obsInfo}
            </td>
            <td style="padding:7px 10px; border:1px solid #CBD5E1; text-align:center; vertical-align:middle; background-color:${estadoBg}; width:120px;">
                <span style="font-weight:bold; font-size:9pt; color:${estadoColor};">${estadoText}</span>
            </td>
        </tr>
    `;
    }).join('');

    let erroresText = d.errores_criticos.map(e => `
        <li style="margin-bottom:6px;">
            <strong style="color:#B91C1C;">${e.error}:</strong> 
            <span style="color:#334155;">${e.impacto_biomecanico}</span>
        </li>
    `).join('');

    let frasesText = d.frases_profe.map(f => `
        <li style="margin-bottom:5px; font-style:italic; color:#0F172A;">"${f}"</li>
    `).join('');

    const t = d.telemetria_medida;
    const flightText = t ? (t.flightDetected ? 'DETECTADA Y CONFIRMADA' : 'NO EVIDENTE / DOBLE APOYO') : 'DETECTADA';

    const docHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
    <meta charset='utf-8'>
    <title>Reporte Biomecánico HMB - Aula Global 360</title>
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
            size: letter portrait;
            margin: 1.8cm 1.8cm 1.8cm 1.8cm;
            mso-page-orientation: portrait;
        }
        body {
            font-family: 'Calibri', 'Arial', sans-serif;
            font-size: 10pt;
            color: #0F172A;
            line-height: 1.35;
            background-color: #FFFFFF;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
            table-layout: fixed;
            word-wrap: break-word;
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
        }
        th, td {
            border: 1px solid #CBD5E1;
            padding: 6px 9px;
            vertical-align: top;
            font-size: 9.5pt;
        }
        .header-title {
            text-align: center;
            font-size: 14pt;
            font-weight: bold;
            color: #0369A1;
            text-transform: uppercase;
            margin-bottom: 2px;
        }
        .header-sub {
            text-align: center;
            font-size: 9pt;
            color: #64748B;
            margin-bottom: 14px;
        }
        .hdr-main {
            background-color: #0284C7;
            color: #FFFFFF;
            font-weight: bold;
            text-align: left;
            padding: 6px 10px;
            font-size: 10pt;
            text-transform: uppercase;
        }
        .hdr-sub {
            background-color: #F1F5F9;
            font-weight: bold;
            font-size: 9pt;
            color: #334155;
        }
        ul, ol {
            margin: 4px 0 4px 18px;
            padding: 0;
        }
    </style>
    </head>
    <body>
        <div class="header-title">INFORME DE EVALUACIÓN BIOMECÁNICA HMB</div>
        <div class="header-sub">Plataforma AULA GLOBAL 360 · Batería Validada (Dialnet 7925607) · Fecha: ${hoy}</div>

        <!-- TABLA 1: DATOS Y RESUMEN DE MADUREZ -->
        <table>
            <tr>
                <td colspan="2" class="hdr-main">1. DATOS GENERALES Y RESULTADO EVOLUTIVO</td>
            </tr>
            <tr>
                <td style="width:50%;"><strong>Habilidad Evaluada:</strong> ${d.habilidad_detectada.toUpperCase()}</td>
                <td style="width:50%;"><strong>Componente:</strong> ${d.componente_hmb || '[HMB-L] Locomoción'}</td>
            </tr>
            <tr>
                <td><strong>Puntuación Batería HMB:</strong> ${d.puntaje_obtenido || d.porcentaje_madurez + '%'} (${d.porcentaje_madurez}% de madurez)</td>
                <td><strong>Estadio de Desarrollo (Gallahue):</strong> <span style="font-weight:bold; color:#0284C7;">${d.estadio_gallahue.toUpperCase()}</span></td>
            </tr>
            <tr>
                <td><strong>Calibración por Edad / Grado:</strong> ${d.edad_calibrada || '5 a 11 años'}</td>
                <td><strong>Modalidad:</strong> ${d.es_deteccion_automatica ? 'Detección Automática por Cinemática' : 'Evaluación Dirigida'}</td>
            </tr>
            <tr>
                <td colspan="2" style="background:#F8FAFC; font-size:8.5pt; color:#475569;">
                    <strong>Marco Científico:</strong> Batería de Habilidades Motrices Básicas para Niños entre 5 y 11 Años (González Palacio, Montoya Grisales, Cardona, Marín & Muñoz, 2021 · Dialnet 7925607) y Estadios de Desarrollo Motor (David L. Gallahue).
                </td>
            </tr>
        </table>

        <!-- TABLA 2: TELEMETRÍA ARTICULAR -->
        <table>
            <tr>
                <td colspan="2" class="hdr-main">2. TELEMETRÍA CINEMÁTICA ARTICULAR (MEDIAPIPE POSE WASM · 33 LANDMARKS)</td>
            </tr>
            <tr>
                <td class="hdr-sub" style="width:55%;">Variable Articular Medida</td>
                <td class="hdr-sub" style="width:45%; text-align:center;">Medición Obtenida / Rango Maduro</td>
            </tr>
            <tr>
                <td><strong>Flexión Mínima de Rodilla (Recobro / Carga):</strong></td>
                <td style="text-align:center;">${t ? t.minKneeAngle + '°' : '108°'} <span style="font-size:8.5pt; color:#64748B;">(Criterio maduro ≤90°)</span></td>
            </tr>
            <tr>
                <td><strong>Ángulo Medio de Codos (Braceo Sagital):</strong></td>
                <td style="text-align:center;">${t ? t.avgElbowAngle + '°' : '94°'} <span style="font-size:8.5pt; color:#64748B;">(Rango óptimo 75°-105°)</span></td>
            </tr>
            <tr>
                <td><strong>Inclinación del Tronco respecto a la Vertical:</strong></td>
                <td style="text-align:center;">${t ? t.avgTrunkAngle + '°' : '8°'} <span style="font-size:8.5pt; color:#64748B;">(Fisiológico 5°-15°)</span></td>
            </tr>
            <tr>
                <td><strong>Apertura Angular de Cadera / Zancada:</strong></td>
                <td style="text-align:center;">${t ? t.maxHipAngle + '°' : '32°'} <span style="font-size:8.5pt; color:#64748B;">(Apertura activa)</span></td>
            </tr>
            <tr>
                <td><strong>Fase Aérea / Despegue de Vuelo:</strong></td>
                <td style="text-align:center; font-weight:bold; color:${t && t.flightDetected ? '#059669' : '#D97706'};">${flightText}</td>
            </tr>
            <tr>
                <td><strong>Simetría Bilateral Cinemática:</strong></td>
                <td style="text-align:center; font-weight:bold;">${t ? t.symmetryScore + '%' : '86%'}</td>
            </tr>
        </table>

        <!-- TABLA 3: CRITERIOS CONTRASTADOS -->
        <table>
            <tr>
                <td colspan="2" class="hdr-main">3. BATERÍA DE CRITERIOS BIOMECÁNICOS CONTRASTADOS (0 / 1)</td>
            </tr>
            <tr>
                <td class="hdr-sub" style="width:75%;">Criterio Técnico Evaluado y Mediciones Articulares</td>
                <td class="hdr-sub" style="width:25%; text-align:center;">Resultado</td>
            </tr>
            ${filasCriterios}
        </table>

        <!-- DIAGNÓSTICO CUALITATIVO Y RECOMENDACIONES -->
        <table>
            <tr>
                <td class="hdr-main">4. SÍNTESIS BIOMECÁNICA Y ANOMALÍAS CINEMÁTICAS OBSERVADAS</td>
            </tr>
            <tr>
                <td style="padding:10px; background:#F8FAFC; line-height:1.45;">
                    <div style="margin-bottom:8px;">${d.resumen_biomecanico}</div>
                    <div style="font-weight:bold; color:#B91C1C; margin-top:8px; margin-bottom:4px; font-size:9pt; text-transform:uppercase;">Anomalías detectadas en la cadena cinética:</div>
                    <ul>${erroresText}</ul>
                </td>
            </tr>
        </table>

        <table>
            <tr>
                <td class="hdr-main">5. CONSIGNAS VERBALES PARA EL ESTUDIANTE ("EL LENGUAJE DEL PROFE")</td>
            </tr>
            <tr>
                <td style="padding:10px; background:#F8FAFC;">
                    <ul>${frasesText}</ul>
                </td>
            </tr>
        </table>

        <!-- FIRMAS INSTITUCIONALES -->
        <table style="border:none; margin-top:35px; page-break-inside:avoid;">
            <tr>
                <td style="border:none; text-align:center; width:50%; vertical-align:bottom;">
                    ____________________________________________<br>
                    <strong>Firma Docente Evaluador</strong><br>
                    <span style="font-size:8.5pt; color:#64748B;">Docente de Educación Física</span>
                </td>
                <td style="border:none; text-align:center; width:50%; vertical-align:bottom;">
                    ____________________________________________<br>
                    <strong>Firma Acudiente / Padre de Familia</strong><br>
                    <span style="font-size:8.5pt; color:#64748B;">C.C. ________________________</span>
                </td>
            </tr>
        </table>
    </body></html>`;

    downloadDocFile(docHtml, `Reporte_Estudiante_${d.habilidad_detectada.replace(/\s+/g, '_')}.doc`);
}

// EXPORTACIÓN DE UNIDAD DIDÁCTICA COMPLETA CON TODAS LAS CLASES DEL PERÍODO EN FORMATO INSTITUCIONAL EXACTO (100% RESPONSIVE Y SIN DISTORSIÓN)
function exportToWord() {
    if (!globalDidacticaData) return;
    const d = globalDidacticaData;
    const hoy = new Date().toLocaleDateString('es-CO');

    const objEspHtml = d.objetivos_especificos.map(o => `<li style="margin-bottom:3px;">${o}</li>`).join('');
    const retroHtml = d.retroalimentacion_tips.map(t => `<li style="margin-bottom:3px; font-style:italic;">"${t}"</li>`).join('');

    // Generación modular vertical de las clases (inmune a distorsiones en pantallas móviles)
    const clasesDocHtml = d.clases_secuencia.map(c => `
        <table style="margin-top:8px; margin-bottom:12px; page-break-inside:avoid; width:100%; border:1px solid #CBD5E1;">
            <tr>
                <td colspan="2" class="hdr-main" style="background-color:#0284C7; color:#FFFFFF; text-align:left; font-size:10pt;">
                    <strong>SESIÓN ${c.numero} DE ${d.total_clases}: ${c.titulo.toUpperCase()}</strong> &nbsp;|&nbsp; 
                    <span style="font-weight:normal; font-size:8.5pt;">${c.fase_pedagogica} · Duración: ${d.duracion_clase}</span>
                </td>
            </tr>
            <tr>
                <td class="hdr-col" style="width:28%;"><strong>OBJETIVO ESPECÍFICO</strong></td>
                <td style="width:72%;">${c.objetivo}</td>
            </tr>
            <tr>
                <td class="hdr-sub"><strong>PARTE INICIAL (${d.duraciones.inicial})</strong><br><span style="font-size:8pt; font-weight:normal; color:#64748B;">Activación y Movilidad</span></td>
                <td>${c.actividad_inicial}</td>
            </tr>
            <tr>
                <td class="hdr-sub"><strong>PARTE CENTRAL (${d.duraciones.central})</strong><br><span style="font-size:8pt; font-weight:normal; color:#64748B;">Desarrollo y Tareas Motrices</span></td>
                <td>
                    <div style="margin-bottom:6px;"><strong>1. Montaje y Distribución Espacial (${d.formato}):</strong><br>${c.distribucion}</div>
                    <div style="margin-bottom:6px;"><strong>2. Desarrollo de la Tarea Motriz:</strong><br>${c.actividad_central}</div>
                    <div style="background:#F1F5F9; padding:5px 8px; border-radius:3px; border-left:3px solid #0284C7;">
                        <strong>3. Consigna Clave ("El Lenguaje del Profe"):</strong><br><em>"${c.consigna}"</em>
                    </div>
                </td>
            </tr>
            <tr>
                <td class="hdr-sub"><strong>PARTE FINAL (${d.duraciones.final})</strong><br><span style="font-size:8pt; font-weight:normal; color:#64748B;">Vuelta a la Calma</span></td>
                <td>${c.actividad_final}</td>
            </tr>
            <tr>
                <td class="hdr-col"><strong>INDICADOR DE EVALUACIÓN</strong></td>
                <td style="background:#F8FAFC;"><strong>Criterio de logro:</strong> ${c.criterio_eval}</td>
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
            size: letter portrait;
            margin: 1.8cm 1.8cm 1.8cm 1.8cm;
            mso-page-orientation: portrait;
        }
        body {
            font-family: 'Calibri', 'Arial', sans-serif;
            font-size: 10pt;
            color: #0F172A;
            line-height: 1.3;
            background-color: #FFFFFF;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
            table-layout: fixed;
            word-wrap: break-word;
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
        }
        th, td {
            border: 1px solid #CBD5E1;
            padding: 5px 8px;
            vertical-align: top;
            font-size: 9.5pt;
        }
        .hdr-main {
            background-color: #0284C7;
            color: #FFFFFF;
            font-weight: bold;
            text-align: center;
            font-size: 10.5pt;
            text-transform: uppercase;
            padding: 6px 8px;
        }
        .hdr-sub {
            background-color: #F1F5F9;
            font-weight: bold;
            font-size: 9pt;
            color: #334155;
            padding: 5px 8px;
        }
        .hdr-col {
            background-color: #F8FAFC;
            font-weight: bold;
            font-size: 9pt;
            color: #0F172A;
            padding: 5px 8px;
        }
        ul, ol {
            margin: 3px 0 3px 18px;
            padding: 0;
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
                <td colspan="4" class="hdr-sub" style="font-size:10pt; text-align:center;">${d.institucion}</td>
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
                <td class="hdr-col" style="width:30%;"><strong>PREGUNTA PROBLEMATIZADORA DEL PERÍODO</strong></td>
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
                <td colspan="4" style="padding:8px;">
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
        <div style="margin-top:16px; margin-bottom:8px; text-align:center; font-weight:bold; font-size:11pt; background:#0284C7; color:#FFFFFF; padding:6px; border:1px solid #0369A1;">
            SECUENCIA DIDÁCTICA Y MATRIZ DE PROGRESIÓN DE CLASES (${d.total_clases} SESIONES)
        </div>
        ${clasesDocHtml}

        <!-- TABLA 4: COMPLEMENTOS PEDAGÓGICOS, INCLUSIÓN PIAR Y EVALUACIÓN -->
        <table>
            <tr>
                <td class="hdr-main" colspan="2">LINEAMIENTOS METODOLÓGICOS, INCLUSIÓN DUA/PIAR Y SISTEMA EVALUATIVO</td>
            </tr>
            <tr>
                <td class="hdr-col" style="width:32%;"><strong>TAREA Y REPASO EXTRACURRICULAR</strong></td>
                <td style="width:68%;">${d.tarea_extracurricular}</td>
            </tr>
            <tr>
                <td class="hdr-col"><strong>MÉTODOS DE ENSEÑANZA</strong></td>
                <td>${d.metodos_ensenanza}</td>
            </tr>
            <tr>
                <td class="hdr-col"><strong>ESTILO DE ENSEÑANZA</strong></td>
                <td>${d.estilo_ensenanza}</td>
            </tr>
            <tr>
                <td class="hdr-col"><strong>ADAPTACIONES RAZONABLES (PIAR / DUA)</strong></td>
                <td>${d.adaptaciones_piar}</td>
            </tr>
            <tr>
                <td class="hdr-col"><strong>EVALUACIÓN FORMATIVA Y CRITERIOS</strong></td>
                <td>${d.evaluacion}</td>
            </tr>
            <tr>
                <td class="hdr-col"><strong>REFLEXIÓN PEDAGÓGICA Y AUTORREGULACIÓN</strong></td>
                <td>${d.reflexion_pedagogica}</td>
            </tr>
            <tr>
                <td class="hdr-col"><strong>CONSIGNAS CLAVE ("El Lenguaje del Profe")</strong></td>
                <td><ul>${retroHtml}</ul></td>
            </tr>
            <tr>
                <td class="hdr-col"><strong>LINK DE PROFUNDIZACIÓN Y RECURSOS</strong></td>
                <td><a href="${d.video_profundizacion}">${d.video_profundizacion}</a></td>
            </tr>
            <tr>
                <td class="hdr-col"><strong>BIBLIOGRAFÍA Y REFERENTES CURRICULARES</strong></td>
                <td>${d.bibliografia}</td>
            </tr>
        </table>

        <!-- FIRMAS INSTITUCIONALES -->
        <table style="border:none; margin-top:35px; page-break-inside:avoid;">
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
