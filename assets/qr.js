/* ============================================================
   Genera un QR por persona apuntando a marcar.html?id=<codigo>
   Pensado para imprimirse en hoja A4 (4 por fila).
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let personas = [];

  function urlBase() {
    return $('url-base').value.replace(/\/+$/, '');
  }

  function pintar() {
    const sec = $('f-seccion').value;
    const lista = personas.filter((p) => !sec || p.seccion === sec);
    const rejilla = $('rejilla');
    rejilla.innerHTML = '';

    lista.forEach((p) => {
      const destino = `${urlBase()}/marcar.html?id=${encodeURIComponent(p.id)}`;

      const tarjeta = document.createElement('div');
      tarjeta.className = 'tarjeta-qr';

      const caja = document.createElement('div');
      tarjeta.appendChild(caja);

      // qrcodejs pinta sobre el elemento que recibe
      new QRCode(caja, {
        text: destino,
        width: 148,
        height: 148,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });

      const nombre = document.createElement('div');
      nombre.className = 'qr-nombre';
      nombre.textContent = p.nombre;

      const codigo = document.createElement('div');
      codigo.className = 'qr-id';
      codigo.textContent = `${p.id}${p.seccion ? ' · ' + p.seccion : ''}`;

      tarjeta.append(nombre, codigo);
      rejilla.appendChild(tarjeta);
    });
  }

  async function cargar() {
    // Detecta la URL base del despliegue actual
    $('url-base').value = location.href.replace(/\/[^/]*$/, '');

    try {
      const r = await API.datos();
      personas = (r.personas || []).filter((p) => p.activo !== false);

      const secciones = [...new Set(personas.map((p) => p.seccion).filter(Boolean))].sort();
      $('f-seccion').innerHTML =
        '<option value="">Todas las secciones</option>' +
        secciones.map((s) => `<option value="${s}">Sección ${s}</option>`).join('');

      pintar();
    } catch (e) {
      $('rejilla').innerHTML =
        `<div class="vacio">No se pudieron cargar las personas: ${e.message}</div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('titulo-evento').textContent = CONFIG.EVENTO;
    $('f-seccion').addEventListener('change', pintar);
    $('url-base').addEventListener('change', pintar);
    $('btn-imprimir').addEventListener('click', () => window.print());
    cargar();
  });
})();
