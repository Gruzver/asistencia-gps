/* ============================================================
   Un QR por pulsera.

   La pulsera es fisica y se reutiliza entre viajes, asi que el
   codigo impreso nunca cambia: quien la reciba se identifica al
   escanearla la primera vez.
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let pulseras = [];

  const urlBase = () => $('url-base').value.replace(/\/+$/, '');

  function pintar() {
    const desde = parseInt($('in-desde').value, 10) || 1;
    const hasta = parseInt($('in-hasta').value, 10) || pulseras.length;
    const lista = pulseras.slice(desde - 1, hasta);

    const rejilla = $('rejilla');
    rejilla.innerHTML = '';
    $('cuenta').textContent = `${lista.length} de ${pulseras.length} pulseras`;

    if (!lista.length) {
      rejilla.innerHTML =
        '<div class="vacio">No hay pulseras en ese rango. ' +
        'Créalas primero en <a href="admin.html">Administración</a>.</div>';
      return;
    }

    lista.forEach((p) => {
      const destino = `${urlBase()}/marcar.html?p=${encodeURIComponent(p.codigo)}`;
      const tarjeta = document.createElement('div');
      tarjeta.className = 'tarjeta-qr';

      const caja = document.createElement('div');
      tarjeta.appendChild(caja);
      new QRCode(caja, {
        text: destino, width: 150, height: 150,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });

      const cod = document.createElement('div');
      cod.className = 'qr-codigo';
      cod.textContent = p.codigo;
      tarjeta.appendChild(cod);
      rejilla.appendChild(tarjeta);
    });
  }

  (async function () {
    $('url-base').value = location.href.replace(/\/[^/]*$/, '');
    try {
      pulseras = (await Datos.pulserasTodas())
        .filter((p) => p.activa !== false)
        .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
      $('in-hasta').value = Math.min(pulseras.length || 40, 60);
      pintar();
    } catch (e) {
      $('rejilla').innerHTML =
        `<div class="vacio">No se pudieron cargar las pulseras: ${e.message}</div>`;
    }
  })();

  $('btn-aplicar').addEventListener('click', pintar);
  $('url-base').addEventListener('change', pintar);
  $('btn-imprimir').addEventListener('click', () => window.print());
})();
