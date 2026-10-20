/* AULA GLOBAL 360 · comportamiento mínimo de la interfaz (sin dependencias externas).
 * Todo funciona sin JavaScript (formularios normales); esto solo agrega el panel lateral y el guardado al instante. */
(function () {
    'use strict';

    // Zona de carga: clic, arrastrar y soltar, y vista previa local del video o la foto
    document.querySelectorAll('[data-zona-carga]').forEach(function (zona) {
        var input = zona.querySelector('input[type=file]');
        var previa = document.getElementById(zona.dataset.zonaCarga);
        var titulo = zona.querySelector('.titulo');
        zona.addEventListener('click', function (e) { if (e.target !== input) input.click(); });
        ['dragenter', 'dragover'].forEach(function (ev) {
            zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('arrastrando'); });
        });
        ['dragleave', 'drop'].forEach(function (ev) {
            zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove('arrastrando'); });
        });
        zona.addEventListener('drop', function (e) {
            if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; mostrar(); }
        });
        input.addEventListener('change', mostrar);

        function mostrar() {
            var archivo = input.files[0];
            if (!archivo || !previa) return;
            var url = URL.createObjectURL(archivo);
            previa.innerHTML = '';
            var el = document.createElement(archivo.type.indexOf('video') === 0 ? 'video' : 'img');
            el.src = url;
            if (el.tagName === 'VIDEO') { el.controls = true; el.muted = true; el.playsInline = true; }
            previa.appendChild(el);
            previa.style.display = 'block';
            if (titulo) titulo.textContent = archivo.name + ' · ' + (archivo.size / 1048576).toFixed(1) + ' MB';
        }
    });

    // Evitar doble envío en formularios largos (subida de video, generación de documentos)
    document.querySelectorAll('form[data-un-envio]').forEach(function (form) {
        form.addEventListener('submit', function () {
            var boton = form.querySelector('[type=submit]');
            if (boton) { boton.disabled = true; boton.textContent = boton.dataset.enviando || 'Procesando…'; }
        });
    });

    // Estado de una evaluación en proceso: consulta cada 1.5 s y recarga al terminar
    var estado = document.querySelector('[data-estado-url]');
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

    // Panel lateral «Configurar clase» (como el de la versión web): se abre desde la barra superior
    var panel = document.getElementById('panel-config');
    var fondo = document.querySelector('.panel-fondo');
    function abrirPanel() {
        if (!panel) return false;
        panel.classList.add('abierto');
        panel.removeAttribute('inert');
        panel.setAttribute('aria-hidden', 'false');
        fondo.hidden = false;
        var primero = panel.querySelector('select, input, button');
        if (primero) primero.focus();
        return true;
    }
    function cerrarPanel() {
        if (!panel) return;
        panel.classList.remove('abierto');
        panel.setAttribute('inert', '');
        panel.setAttribute('aria-hidden', 'true');
        fondo.hidden = true;
    }
    document.querySelectorAll('[data-abrir-config]').forEach(function (a) {
        a.addEventListener('click', function (e) { if (abrirPanel()) e.preventDefault(); });
    });
    document.querySelectorAll('[data-cerrar-config]').forEach(function (b) { b.addEventListener('click', cerrarPanel); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarPanel(); });

    function enviar(form) {
        return fetch(form.action, { method: 'POST', body: new FormData(form), headers: { 'X-Requested-With': 'fetch' } })
            .then(function (r) { return r.json(); });
    }

    // Selector de motor de la cabecera: sin clave de Gemini abre el panel en la sección de la clave
    document.querySelectorAll('.selector-motor button[value=gemini]').forEach(function (b) {
        b.addEventListener('click', function (e) {
            if (b.dataset.iaDisponible === '1' || !panel) return;
            e.preventDefault();
            var radio = panel.querySelector('input[name=motor][value=gemini]');
            if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
            abrirPanel();
            var clave = panel.querySelector('input[name=clave]');
            if (clave) clave.focus();
        });
    });

    // Guardado automático al cambiar cualquier opción (la web aplicaba los cambios al instante)
    document.querySelectorAll('form[data-autoguardar]').forEach(function (form) {
        form.querySelectorAll('[data-solo-sin-js]').forEach(function (b) { b.hidden = true; });
        var estadoGuardado = form.querySelector('[data-config-estado]');
        var seccionGemini = form.parentElement.querySelector('[data-seccion-gemini]');
        form.addEventListener('change', function (e) {
            if (e.target.name === 'motor') {
                if (seccionGemini && e.target.value === 'gemini') seccionGemini.removeAttribute('data-oculta');
                document.querySelectorAll('.selector-motor button').forEach(function (b) {
                    b.classList.toggle('activo', b.value === e.target.value);
                });
            }
            estadoGuardado.textContent = 'Guardando…';
            enviar(form).then(function (d) {
                estadoGuardado.textContent = d.ok ? 'Guardado ✓' : 'Revisa los valores';
            }).catch(function () { estadoGuardado.textContent = 'No se pudo guardar'; });
        });
    });

    // Gemini: el modelo se guarda al elegirlo; «Actualizar» consulta los modelos de la cuenta
    document.querySelectorAll('form[data-gemini-modelo]').forEach(function (form) {
        form.querySelectorAll('[data-solo-sin-js]').forEach(function (b) { b.hidden = true; });
        var select = form.querySelector('select');
        var estadoModelos = form.querySelector('[data-modelos-estado]');
        var boton = form.querySelector('[data-actualizar-modelos]');
        select.addEventListener('change', function () {
            enviar(form).then(function (d) { estadoModelos.textContent = d.ok ? 'Modelo guardado ✓' : d.error; });
        });
        function cargar(refrescar) {
            estadoModelos.textContent = 'Consultando modelos disponibles en Google…';
            fetch(boton.dataset.url + (refrescar ? '?refrescar=1' : ''), { headers: { 'Accept': 'application/json' } })
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    if (d.error) { estadoModelos.textContent = d.error; return; }
                    var elegido = d.elegido || select.value;
                    select.length = 1;
                    d.modelos.forEach(function (m) {
                        var op = new Option(m.nombre === m.id ? m.id : m.nombre + ' (' + m.id + ')', m.id);
                        select.add(op);
                    });
                    select.value = Array.prototype.some.call(select.options, function (o) { return o.value === elegido; }) ? elegido : 'auto';
                    estadoModelos.textContent = d.modelos.length + ' modelos activos en tu cuenta de Google';
                })
                .catch(function () { estadoModelos.textContent = 'No se pudo consultar Google'; });
        }
        boton.addEventListener('click', function () { cargar(true); });
        select.addEventListener('focus', function () { cargar(false); }, { once: true });
    });

    // Diálogo de la guía de grabación
    document.querySelectorAll('[data-abrir-dialogo]').forEach(function (b) {
        b.addEventListener('click', function () {
            var d = document.getElementById(b.dataset.abrirDialogo);
            if (d && d.showModal) d.showModal();
        });
    });
})();
