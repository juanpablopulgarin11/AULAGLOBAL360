/* AULA GLOBAL 360 · Interfaz de la versión Django con el mismo comportamiento que script.js de la web:
 * panel «Configurar clase», selector de motor, asistente de 3 pasos, vista previa con escaneo,
 * alertas propias y guía de grabación. Todo lo importante funciona también sin JavaScript
 * (formularios normales); esto agrega lo inmediato. */
(function () {
    'use strict';

    var $ = function (sel, raiz) { return (raiz || document).querySelector(sel); };
    var $$ = function (sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); };
    var appRoot = $('#appRoot');

    function enviar(form, extra) {
        var datos = new FormData(form);
        if (extra) Object.keys(extra).forEach(function (k) { datos.set(k, extra[k]); });
        return fetch(form.action, { method: 'POST', body: datos, headers: { 'X-Requested-With': 'fetch' } });
    }

    // ------------------------------------------------------------ alertas propias (showAlert / showConfirm de la web)
    var alerta = $('[data-alerta]');
    var alAceptar = null;
    var ICONOS = { info: '💡', success: '✅', warning: '⚠️', error: '❌' };

    function mostrarAlerta(mensaje, opciones) {
        if (!alerta) { window.alert(mensaje); return; }
        opciones = opciones || {};
        var tipo = opciones.tipo || 'info';
        $('#customAlertTitle', alerta).textContent = opciones.titulo || 'Aula Global 360';
        $('#customAlertMessage', alerta).textContent = mensaje;
        $('#customAlertIcon', alerta).textContent = opciones.icono || ICONOS[tipo] || '💡';
        $('#customAlertIconWrap', alerta).className = 'custom-alert-icon-wrap' + (tipo !== 'info' ? ' type-' + tipo : '');
        var pie = $('.custom-alert-footer', alerta);
        var cancelar = $('.btn-alert-cancel', pie);
        if (opciones.confirmar) {
            if (!cancelar) {
                cancelar = document.createElement('button');
                cancelar.type = 'button';
                cancelar.className = 'btn-alert-cancel';
                cancelar.textContent = 'Cancelar';
                cancelar.addEventListener('click', cerrarAlerta);
                pie.insertBefore(cancelar, pie.firstChild);
            }
            cancelar.hidden = false;
        } else if (cancelar) {
            cancelar.hidden = true;
        }
        $('.btn-alert-confirm', pie).textContent = opciones.confirmar ? 'Aceptar' : 'Entendido';
        alAceptar = opciones.alAceptar || null;
        alerta.classList.add('active');
        $('.btn-alert-confirm', pie).focus();
    }
    function cerrarAlerta() { if (alerta) alerta.classList.remove('active'); alAceptar = null; }
    if (alerta) {
        $$('[data-cerrar-alerta]', alerta).forEach(function (b) {
            b.addEventListener('click', function () {
                var accion = b.classList.contains('btn-alert-confirm') ? alAceptar : null;
                cerrarAlerta();
                if (accion) accion();
            });
        });
        alerta.addEventListener('click', function (e) { if (e.target === alerta) cerrarAlerta(); });
    }

    // Mensajes del servidor (messages de Django) en el modal de alertas
    var mensajes = $('#mensajes-django');
    if (mensajes) {
        var parrafos = $$('p', mensajes.content);
        if (parrafos.length) {
            var tipo = parrafos[0].dataset.tipo || 'info';
            mostrarAlerta(parrafos.map(function (p) { return p.textContent; }).join('\n'), {
                tipo: tipo === 'error' ? 'error' : tipo === 'warning' ? 'warning' : tipo === 'success' ? 'success' : 'info'
            });
        }
    }

    // Formularios que piden confirmación (eliminar, reiniciar registro…)
    $$('form[data-confirmar]').forEach(function (form) {
        form.addEventListener('submit', function (e) {
            if (form.dataset.confirmado) return;
            e.preventDefault();
            mostrarAlerta(form.dataset.confirmar, {
                tipo: 'warning', confirmar: true,
                alAceptar: function () { form.dataset.confirmado = '1'; form.submit(); }
            });
        });
    });

    // ------------------------------------------------------------ panel lateral «Configurar clase» (toggleDrawer)
    var drawer = $('#configDrawer');
    var overlay = $('#drawerOverlay');
    function abrirPanel() {
        if (!drawer) return false;
        drawer.classList.add('open');
        overlay.classList.add('active');
        return true;
    }
    function cerrarPanel() {
        if (!drawer) return;
        drawer.classList.remove('open');
        overlay.classList.remove('active');
    }
    $$('[data-abrir-config]').forEach(function (a) {
        a.addEventListener('click', function (e) { if (abrirPanel()) e.preventDefault(); });
    });
    $$('[data-cerrar-config]').forEach(function (b) { b.addEventListener('click', cerrarPanel); });
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        cerrarPanel();
        cerrarAlerta();
        $$('[data-modal]').forEach(function (m) { m.style.display = 'none'; });
    });

    // Guardado al instante de cada opción (la web aplicaba los cambios en el momento)
    var formConfig = $('form[data-autoguardar]');
    var estadoConfig = formConfig && $('[data-config-estado]', formConfig);
    function guardarConfig() {
        if (!formConfig) return Promise.resolve();
        estadoConfig.textContent = 'Guardando…';
        return enviar(formConfig).then(function (r) { return r.json(); }).then(function (d) {
            estadoConfig.textContent = d.ok ? 'Guardado ✓' : 'Revisa los valores';
        }).catch(function () { estadoConfig.textContent = 'No se pudo guardar'; });
    }
    if (formConfig) {
        $$('[data-solo-sin-js]').forEach(function (b) { b.hidden = true; });
        formConfig.addEventListener('change', guardarConfig);

        // Modo de evaluación (selectMode): individual o colectivo
        $$('.mode-btn[data-mode]', formConfig).forEach(function (btn) {
            btn.addEventListener('click', function () {
                $$('.mode-btn[data-mode]', formConfig).forEach(function (b) { b.classList.toggle('active', b === btn); });
                formConfig.elements.modo.value = btn.dataset.mode;
                var colectivo = btn.dataset.mode === 'colectivo';
                var pill = $('#modeBadge');
                if (pill) pill.textContent = colectivo ? 'Colectivo' : 'Individual';
                if (appRoot) appRoot.classList.toggle('modo-colectivo', colectivo);
                guardarConfig().then(function () {
                    // En el asistente la barra del modo colectivo aparece o se va al instante
                    if (document.querySelector('form[data-asistente]')) window.location.reload();
                    else cerrarPanel();
                });
            });
        });
    }
    if (appRoot && formConfig && formConfig.elements.modo.value === 'colectivo') appRoot.classList.add('modo-colectivo');

    // ------------------------------------------------------------ selector de motor (setEngineMode)
    var formMotor = $('form[data-motor]');
    if (formMotor) {
        $$('.toggle-opt', formMotor).forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                var motor = btn.value;
                $$('.toggle-opt', formMotor).forEach(function (b) { b.classList.toggle('active', b === btn); });
                if (appRoot) {
                    appRoot.classList.toggle('engine-gemini', motor === 'gemini');
                    appRoot.classList.toggle('engine-local', motor !== 'gemini');
                }
                if (formConfig) formConfig.elements.motor.value = motor;
                var obs = $('#userInput');
                if (obs) obs.placeholder = motor === 'gemini'
                    ? 'Observaciones opcionales para la IA (ej: "Aterriza con fuerza en talón", "Presenta fatiga previa")...'
                    : 'Observaciones opcionales (ej: "Aterriza con fuerza en talón", "Usa calzado plano")...';
                enviar(formMotor, { motor: motor });
                if (motor === 'gemini' && btn.dataset.iaDisponible !== '1' && abrirPanel()) {
                    var clave = $('#apiKeyInput');
                    if (clave) clave.focus();
                }
            });
        });
    }

    // Gemini: el modelo se guarda al elegirlo; «Actualizar» consulta los modelos de la cuenta
    var formModelo = $('form[data-gemini-modelo]');
    if (formModelo) {
        var select = $('select', formModelo);
        var estadoModelos = $('[data-modelos-estado]', formModelo);
        var botonModelos = $('[data-actualizar-modelos]', formModelo);
        select.addEventListener('change', function () {
            enviar(formModelo).then(function (r) { return r.json(); })
                .then(function (d) { estadoModelos.textContent = d.ok ? 'Modelo guardado ✓' : d.error; });
        });
        var cargarModelos = function (refrescar) {
            estadoModelos.textContent = 'Consultando modelos disponibles en Google...';
            botonModelos.style.opacity = '0.5';
            fetch(botonModelos.dataset.url + (refrescar ? '?refrescar=1' : ''), { headers: { 'Accept': 'application/json' } })
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    botonModelos.style.opacity = '';
                    if (d.error) { estadoModelos.textContent = d.error; return; }
                    var elegido = d.elegido || select.value;
                    select.length = 1;
                    d.modelos.forEach(function (m) {
                        select.add(new Option(m.nombre === m.id ? m.id : m.nombre + ' (' + m.id + ')', m.id));
                    });
                    select.value = $$('option', select).some(function (o) { return o.value === elegido; }) ? elegido : 'auto';
                    estadoModelos.textContent = d.modelos.length + ' modelos activos en tu cuenta de Google';
                })
                .catch(function () { botonModelos.style.opacity = ''; estadoModelos.textContent = 'No se pudo consultar Google'; });
        };
        botonModelos.addEventListener('click', function () { cargarModelos(true); });
        select.addEventListener('focus', function () { cargarModelos(false); }, { once: true });
    }

    // ------------------------------------------------------------ modales (guía de grabación)
    $$('[data-abrir-modal]').forEach(function (b) {
        b.addEventListener('click', function () { document.getElementById(b.dataset.abrirModal).style.display = 'flex'; });
    });
    $$('[data-modal]').forEach(function (m) {
        m.addEventListener('click', function (e) { if (e.target === m) m.style.display = 'none'; });
        $$('[data-cerrar-modal]', m).forEach(function (b) { b.addEventListener('click', function () { m.style.display = 'none'; }); });
    });

    // ------------------------------------------------------------ asistente de 3 pasos (goToStep / selectSkillCard / handleFile)
    var asistente = $('form[data-asistente]');
    if (asistente) {
        var wizardMain = $('#wizardMain');
        var irPaso = function (paso) {
            [1, 2].forEach(function (i) {
                var el = $('#wizardStep' + i);
                el.style.display = i === paso ? 'flex' : 'none';
                el.classList.toggle('active', i === paso);
            });
            $$('.step-tab[data-step]').forEach(function (t) { t.classList.toggle('active', Number(t.dataset.step) === paso); });
            if (wizardMain) wizardMain.scrollTop = 0;
        };
        var completarPaso = function (paso) {
            var tab = $('.step-tab[data-step="' + paso + '"]');
            if (tab) tab.classList.add('completed');
            var badge = $('#stepBadge' + paso);
            if (badge) badge.textContent = '✓';
            var siguiente = $('.step-tab[data-step="' + (paso + 1) + '"]');
            if (siguiente && paso < 2) siguiente.disabled = false;
        };
        var elegirHabilidad = function (tarjeta) {
            $$('.skill-card').forEach(function (c) { c.classList.toggle('active', c === tarjeta); });
            $('#skillSelect').value = tarjeta.dataset.skill;
            $('#selectedSkillIcon').textContent = $('.skill-icon', tarjeta).textContent;
            $('#selectedSkillText').textContent = $('.skill-name', tarjeta).textContent;
        };
        $$('.skill-card').forEach(function (tarjeta) {
            tarjeta.addEventListener('click', function () { elegirHabilidad(tarjeta); completarPaso(1); irPaso(2); });
        });
        $$('.step-tab[data-step]').forEach(function (t) {
            t.addEventListener('click', function () { if (!t.disabled && t.dataset.step !== '3') irPaso(Number(t.dataset.step)); });
        });
        $$('[data-ir-paso]').forEach(function (b) { b.addEventListener('click', function () { irPaso(Number(b.dataset.irPaso)); }); });

        var activa = $('.skill-card.active') || $('.skill-card--auto');
        elegirHabilidad(activa);
        if (asistente.dataset.pasoInicial === '2') { completarPaso(1); irPaso(2); }

        // Carga del archivo: clic, arrastrar y soltar, vista previa
        var zona = $('#uploadZone');
        var input = $('#fileInput');
        var preview = $('#uploadPreview');
        var video = $('#studentVideoPlayer');
        var imagen = $('#studentImgPreview');
        var escaneo = $('#scanOverlay');
        var mostrarArchivo = function () {
            var archivo = input.files[0];
            if (!archivo) return;
            var url = URL.createObjectURL(archivo);
            preview.style.display = 'block';
            var esVideo = archivo.type.indexOf('video') === 0;
            video.style.display = esVideo ? 'block' : 'none';
            imagen.style.display = esVideo ? 'none' : 'block';
            if (esVideo) { video.src = url; video.play().catch(function () {}); } else { imagen.src = url; }
            $('#fpsCounter').textContent = esVideo ? 'Video' : 'Fotografía';
            $('#frameDensity').textContent = (archivo.size / 1048576).toFixed(1) + ' MB · listo para analizar';
            $('#uzIcon').textContent = '✓';
            $('#uzTitle').textContent = esVideo ? 'Video listo: ' + archivo.name : 'Fotografía lista: ' + archivo.name;
            $('#uzSub').textContent = 'Presiona "Analizar movimiento" para ver el resultado y generar la clase';
        };
        zona.addEventListener('click', function () { input.click(); });
        zona.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
        ['dragenter', 'dragover'].forEach(function (ev) {
            zona.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); zona.classList.add('dragover'); });
        });
        ['dragleave', 'drop'].forEach(function (ev) {
            zona.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); zona.classList.remove('dragover'); });
        });
        zona.addEventListener('drop', function (e) {
            if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; mostrarArchivo(); }
        });
        input.addEventListener('change', mostrarArchivo);

        // Analizar: se sube el video, se muestra el escaneo y se espera el diagnóstico (sendMsg)
        var boton = $('#sendBtn');
        var barra = $('#processingBar');
        var textoBarra = $('#processingText');
        var restaurar = function () {
            boton.disabled = false;
            barra.style.display = 'none';
            escaneo.style.display = 'none';
        };
        var esperar = function (url, estadoUrl, intentos) {
            fetch(estadoUrl, { headers: { 'Accept': 'application/json' } })
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    if (d.estado === 'lista' || d.estado === 'error' || intentos > 400) { window.location.href = url; return; }
                    setTimeout(function () { esperar(url, estadoUrl, intentos + 1); }, 1500);
                })
                .catch(function () { setTimeout(function () { esperar(url, estadoUrl, intentos + 1); }, 4000); });
        };
        asistente.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!input.files.length) {
                mostrarAlerta('Sube primero el video o la foto del estudiante.', { titulo: 'Falta la evidencia', tipo: 'warning', icono: '🎥' });
                return;
            }
            boton.disabled = true;
            barra.style.display = 'flex';
            escaneo.style.display = 'block';
            textoBarra.textContent = 'Subiendo la evidencia...';
            var xhr = new XMLHttpRequest();
            xhr.open('POST', asistente.action);
            xhr.setRequestHeader('X-Requested-With', 'fetch');
            xhr.upload.addEventListener('progress', function (ev) {
                if (!ev.lengthComputable) return;
                var pct = Math.round(ev.loaded / ev.total * 100);
                textoBarra.textContent = pct < 100 ? 'Subiendo la evidencia... ' + pct + '%' : 'Analizando el movimiento...';
            });
            xhr.onload = function () {
                var d = {};
                try { d = JSON.parse(xhr.responseText); } catch (err) { /* respuesta no JSON */ }
                if (xhr.status === 200 && d.url) {
                    textoBarra.textContent = 'Analizando el movimiento...';
                    esperar(d.url, d.estado_url, 0);
                    return;
                }
                restaurar();
                mostrarAlerta((d.errores || ['No se pudo subir la evidencia. Intenta de nuevo.']).join('\n'),
                    { titulo: 'Revisa la evidencia', tipo: 'warning' });
            };
            xhr.onerror = function () {
                restaurar();
                mostrarAlerta('Se perdió la conexión al subir el video. Intenta de nuevo.', { tipo: 'error' });
            };
            xhr.send(new FormData(asistente));
        });

        var errores = $('#erroresFormulario');
        if (errores) {
            mostrarAlerta($$('p', errores.content).map(function (p) { return p.textContent; }).join('\n'),
                { titulo: 'Revisa la evidencia', tipo: 'warning' });
        }
    }

    // Resultado en proceso: consulta cada 1.5 s y recarga al terminar
    var estado = $('[data-estado-url]');
    if (estado) {
        var intentos = 0;
        var consultar = function () {
            fetch(estado.dataset.estadoUrl, { headers: { 'Accept': 'application/json' } })
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    if (d.estado === 'lista' || d.estado === 'error') { window.location.reload(); return; }
                    if (++intentos < 400) setTimeout(consultar, 1500);
                })
                .catch(function () { setTimeout(consultar, 4000); });
        };
        setTimeout(consultar, 1500);
    }

    // Evitar doble envío en formularios largos (generación de documentos, registro)
    $$('form[data-un-envio]').forEach(function (form) {
        form.addEventListener('submit', function () {
            var b = form.querySelector('[type=submit]');
            if (b) { b.disabled = true; b.textContent = b.dataset.enviando || 'Procesando…'; }
        });
    });

    // Mostrar / ocultar contraseña en campos de clave (login, registro, cambio de clave)
    $$('[data-ver-clave]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var contenedor = btn.closest('.campo-password');
            var input = contenedor && contenedor.querySelector('input');
            if (!input) return;
            var mostrar = input.type === 'password';
            input.type = mostrar ? 'text' : 'password';
            btn.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
            btn.setAttribute('aria-pressed', mostrar ? 'true' : 'false');
            var ojo = btn.querySelector('.icono-ojo');
            var ojoOculto = btn.querySelector('.icono-ojo-oculto');
            if (ojo) ojo.hidden = mostrar;
            if (ojoOculto) ojoOculto.hidden = !mostrar;
            input.focus();
        });
    });
})();
