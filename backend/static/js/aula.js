/* AULA GLOBAL 360 · comportamiento mínimo de la interfaz (sin dependencias externas). */
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

    // Diálogo de la guía de grabación
    document.querySelectorAll('[data-abrir-dialogo]').forEach(function (b) {
        b.addEventListener('click', function () {
            var d = document.getElementById(b.dataset.abrirDialogo);
            if (d && d.showModal) d.showModal();
        });
    });
})();
