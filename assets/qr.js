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

  /* ============================================================
     Cartel de acceso.

     Se compone como una imagen normal —QR, titulo e instrucciones—
     en vez de depender de la impresion del navegador. Asi se puede
     mandar por WhatsApp, pegar en una diapositiva o imprimir desde
     la galeria, que es como se reparte esto en la practica.
     ============================================================ */

  const enlaceAlumno = () => urlBase() + '/marcar.html';
  let cartelBlob = null;

  /** Genera el QR fuera de pantalla y devuelve su imagen ya cargada. */
  function qrComoImagen(texto, lado) {
    return new Promise((resolver, rechazar) => {
      const caja = document.createElement('div');
      caja.style.cssText = 'position:absolute;left:-9999px;top:0';
      document.body.appendChild(caja);
      new QRCode(caja, {
        text: texto, width: lado, height: lado,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });

      // qrcodejs pinta en un canvas y ademas deja un <img> con el
      // mismo contenido; segun el navegador muestra uno u otro, asi
      // que se toma el que de verdad tenga los datos.
      setTimeout(() => {
        const lienzo = caja.querySelector('canvas');
        const img = caja.querySelector('img');
        let datos = null;
        try { if (lienzo && lienzo.width) datos = lienzo.toDataURL('image/png'); } catch (e) {}
        if (!datos && img && img.src) datos = img.src;
        caja.remove();
        if (!datos) return rechazar(new Error('No se pudo generar el QR'));

        const salida = new Image();
        salida.onload = () => resolver(salida);
        salida.onerror = () => rechazar(new Error('No se pudo cargar el QR'));
        salida.src = datos;
      }, 120);
    });
  }

  async function pintarCartel() {
    $('enlace-alumno').textContent = enlaceAlumno();

    const lienzo = $('lienzo-cartel');
    const c = lienzo.getContext('2d');
    const A = lienzo.width, H = lienzo.height;

    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, A, H);

    const qr = await qrComoImagen(enlaceAlumno(), 620);
    const lado = 620, x = (A - lado) / 2;

    c.fillStyle = '#1d1d1f';
    c.textAlign = 'center';
    c.font = '600 58px -apple-system, "Segoe UI", Roboto, sans-serif';
    c.fillText('Asistencia del viaje', A / 2, 110);

    c.fillStyle = '#6e6e73';
    c.font = '400 34px -apple-system, "Segoe UI", Roboto, sans-serif';
    c.fillText('Escanea este código con tu cámara', A / 2, 170);

    // Marco suave alrededor del QR
    c.strokeStyle = '#e3e3e8';
    c.lineWidth = 2;
    c.strokeRect(x - 22, 218, lado + 44, lado + 44);
    c.drawImage(qr, x, 240, lado, lado);

    c.fillStyle = '#1d1d1f';
    c.font = '600 40px -apple-system, "Segoe UI", Roboto, sans-serif';
    c.fillText('Después, escanea tu pulsera', A / 2, 950);

    c.fillStyle = '#86868b';
    c.font = '400 28px -apple-system, "Segoe UI", Roboto, sans-serif';
    c.fillText('Solo la primera vez. Guarda la app en tu pantalla de inicio.',
               A / 2, 1000);

    c.font = '400 24px ui-monospace, Menlo, monospace';
    c.fillStyle = '#a1a1a6';
    c.fillText(enlaceAlumno().replace(/^https?:\/\//, ''), A / 2, 1070);

    const datos = lienzo.toDataURL('image/png');
    $('cartel-imagen').src = datos;
    lienzo.toBlob((b) => { cartelBlob = b; }, 'image/png');
  }

  function descargarCartel() {
    const a = document.createElement('a');
    a.href = $('cartel-imagen').src;
    a.download = 'cartel-asistencia.png';
    a.click();
  }

  async function compartirCartel() {
    const archivo = cartelBlob
      ? new File([cartelBlob], 'cartel-asistencia.png', { type: 'image/png' })
      : null;
    try {
      if (archivo && navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({
          files: [archivo],
          title: 'Asistencia del viaje',
          text: 'Escanea este código para marcar tu asistencia.',
        });
      } else {
        await navigator.share({
          title: 'Asistencia del viaje',
          text: 'Abre este enlace para marcar tu asistencia:',
          url: enlaceAlumno(),
        });
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // el usuario cancelo
      alert('Este navegador no permite compartir directamente.\n\n' +
            'Usa "Descargar imagen" o "Copiar enlace".');
    }
  }

  async function copiarEnlace() {
    const btn = $('btn-copiar');
    try {
      await navigator.clipboard.writeText(enlaceAlumno());
      btn.textContent = 'Copiado ✓';
    } catch (e) {
      // Sin permiso de portapapeles: se selecciona para copiar a mano
      const r = document.createRange();
      r.selectNodeContents($('enlace-alumno'));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      btn.textContent = 'Copia con Ctrl+C';
    }
    setTimeout(() => { btn.textContent = 'Copiar enlace'; }, 2200);
  }

  (async function () {
    $('url-base').value = location.href.replace(/\/[^/]*$/, '');
    pintarCartel();
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
  $('url-base').addEventListener('change', () => { pintar(); pintarCartel(); });
  $('btn-descargar').addEventListener('click', descargarCartel);
  $('btn-compartir').addEventListener('click', compartirCartel);
  $('btn-copiar').addEventListener('click', copiarEnlace);

  // Compartir solo existe en moviles y contextos seguros; si no esta,
  // el boton sobra y confunde.
  if (!navigator.share) $('btn-compartir').classList.add('oculto');
  $('btn-imprimir').addEventListener('click', () => window.print());
})();
