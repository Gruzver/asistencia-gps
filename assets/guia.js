/* ============================================================
   Panel del guia.

   El guia esta cuidando cuarenta chicos, no mirando la pantalla.
   Por eso lo primero y mas grande es el contador y la lista de
   quien falta; el detalle y el mapa quedan debajo.

   Abrir parada usa la ubicacion del propio guia como centro: no
   hay que buscar direcciones ni tocar un mapa.
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const CLAVE_GRUPO = 'agps_guia_grupo';

  let mapa, capaMarcas, capaZona;
  let grupoId = null;
  let parada = null;
  let desuscribir = null;
  let posDialogo = null;
  let radioElegido = CONFIG.RADIO_DEFAULT;
  let ajustado = false;

  /* ---------- mapa ---------- */

  function iniciarMapa() {
    if (mapa) return;
    mapa = L.map('mapa', { zoomControl: true }).setView([-16.3989, -71.537], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap',
    }).addTo(mapa);
    capaZona = L.layerGroup().addTo(mapa);
    capaMarcas = L.layerGroup().addTo(mapa);
  }

  function pintarMapa(datos, centrar) {
    if (!mapa) return;
    capaMarcas.clearLayers();
    capaZona.clearLayers();
    const puntos = [];

    if (parada) {
      L.circle([parada.lat, parada.lon], {
        radius: parada.radio, color: '#0071e3', weight: 1.5,
        fillColor: '#0071e3', fillOpacity: 0.06,
      }).addTo(capaZona);
      L.marker([parada.lat, parada.lon], {
        icon: L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7],
          html: '<div style="width:14px;height:14px;background:#0071e3;' +
                'border:3px solid #fff;border-radius:50%;' +
                'box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>' }),
      }).addTo(capaZona).bindPopup(`<b>${parada.nombre}</b>Radio ${parada.radio} m`);
      puntos.push([parada.lat, parada.lon]);
    }

    datos.marcajes.forEach((m) => {
      if (m.lat == null) return;
      const al = datos.alumnos.find((a) => a.id === m.alumno_id);
      const fuera = m.estado === 'FUERA_ZONA';
      L.marker([m.lat, m.lon], {
        icon: L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7],
          html: `<div class="pin ${fuera ? 'fuera' : 'ok'}"></div>` }),
      }).addTo(capaMarcas).bindPopup(
        `<b>${al ? al.nombre : 'Desconocido'}</b>` +
        `${Geo.horaSeg(m.creado_en)}<br>` +
        `A ${Geo.metros(m.distancia_m)} · ± ${Geo.metros(m.precision_m)}` +
        (fuera ? '<br><strong style="color:#d1231b">Fuera de zona</strong>' : '') +
        (m.device_distinto ? '<br><strong style="color:#9a6200">Otro teléfono</strong>' : '')
      );
      puntos.push([m.lat, m.lon]);
    });

    if (centrar && puntos.length) mapa.fitBounds(L.latLngBounds(puntos).pad(0.3));
  }

  /* ---------- render ---------- */

  function pintar(datos) {
    const marcados = datos.marcajes.length;
    const total = datos.alumnos.length;
    const enZona = datos.marcajes.filter((m) => m.estado === 'EN_ZONA').length;
    const fuera = datos.marcajes.filter((m) => m.estado === 'FUERA_ZONA').length;
    const idsMarcados = new Set(datos.marcajes.map((m) => m.alumno_id));
    const faltan = datos.alumnos.filter((a) => !idsMarcados.has(a.id));

    $('c-marcados').textContent = marcados;
    $('c-total').textContent = total;
    $('progreso').style.width = total ? (marcados / total * 100).toFixed(1) + '%' : '0';
    $('progreso').classList.toggle('completo', total > 0 && marcados === total);
    $('chip-zona').textContent = `${enZona} en zona`;
    $('chip-fuera').textContent = `${fuera} lejos`;
    $('chip-faltan').textContent = `${faltan.length} faltan`;

    // Faltantes: cada uno con boton de marcaje manual, para el
    // alumno sin bateria o sin telefono.
    const lf = $('lista-faltan');
    lf.innerHTML = faltan.map((a) =>
      `<li><span class="nombre">${a.nombre}</span>` +
      `<button class="boton chico" data-manual="${a.id}">Marcar</button></li>`
    ).join('');
    $('faltan-vacio').classList.toggle('oculto', faltan.length > 0);
    $('pie-faltan').textContent = faltan.length
      ? `${faltan.length} de ${total}` : '';

    lf.querySelectorAll('[data-manual]').forEach((b) => {
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await Datos.marcarManual({ paradaId: parada.id, alumnoId: b.dataset.manual });
          refrescar();
        } catch (e) { alert('No se pudo: ' + e.message); b.disabled = false; }
      });
    });

    // Marcados, mas reciente primero
    const orden = datos.marcajes.slice()
      .sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1));
    $('lista-marcados').innerHTML = orden.map((m) => {
      const a = datos.alumnos.find((x) => x.id === m.alumno_id);
      const et = m.estado === 'FUERA_ZONA'
        ? `<span class="insignia fuera">${Geo.metros(m.distancia_m)}</span>`
        : m.estado === 'MANUAL'
          ? '<span class="insignia neutra">manual</span>'
          : `<span class="insignia ok">${Geo.metros(m.distancia_m)}</span>`;
      return `<li><span class="nombre">${a ? a.nombre : '--'}` +
             (m.device_distinto ? ' <span class="alerta" title="Marcó desde otro teléfono">⚠</span>' : '') +
             (m.diferido ? ' <span class="alerta" title="Se envió al recuperar señal">◷</span>' : '') +
             `</span><span class="der-lista">${et}` +
             `<span class="hora">${Geo.hora(m.creado_en)}</span></span></li>`;
    }).join('');
    $('marcados-vacio').classList.toggle('oculto', marcados > 0);

    pintarMapa(datos, !ajustado);
    if (datos.marcajes.length || parada) ajustado = true;
  }

  /* ---------- ciclo ---------- */

  async function refrescar() {
    if (!parada) return;
    try {
      const datos = await Datos.progreso(parada.id);
      if (!datos.parada || datos.parada.cerrada_en) return cargarGrupo(grupoId);
      pintar(datos);
      $('punto-vivo').classList.add('vivo');
      setTimeout(() => $('punto-vivo').classList.remove('vivo'), 600);
    } catch (e) { /* reintenta en el siguiente ciclo */ }
  }

  async function cargarGrupo(id) {
    grupoId = id;
    try { localStorage.setItem(CLAVE_GRUPO, id); } catch (e) {}
    if (desuscribir) { desuscribir(); desuscribir = null; }
    ajustado = false;

    parada = await Datos.paradaAbierta(id);

    if (!parada) {
      $('v-activo').classList.add('oculto');
      $('v-inactivo').classList.remove('oculto');
      return;
    }

    $('v-inactivo').classList.add('oculto');
    $('v-activo').classList.remove('oculto');
    $('parada-nombre').textContent = parada.nombre;
    $('parada-info').textContent =
      `Abierta ${Geo.hora(parada.abierta_en)} · radio ${parada.radio} m`;

    iniciarMapa();
    setTimeout(() => mapa.invalidateSize(), 80);
    await refrescar();

    // Websocket: cada marcaje llega empujado. El intervalo es solo
    // respaldo por si el socket se cae en una zona con mala red.
    desuscribir = Datos.suscribir(parada.id, refrescar);
  }

  /* ---------- abrir parada ---------- */

  async function abrirDialogo() {
    $('dlg-abrir').classList.remove('oculta');
    $('in-nombre').value = '';
    $('btn-confirmar-parada').disabled = true;
    posDialogo = null;
    $('dlg-gps').innerHTML = '<div class="girador chico"></div><span>Buscando tu ubicación…</span>';

    try {
      const pos = await Geo.ubicacion((l) => {
        $('dlg-gps').innerHTML =
          `<div class="girador chico"></div><span>Precisión ± ${Geo.metros(l.precision)}…</span>`;
      });
      posDialogo = pos;
      const clase = pos.fiable ? 'bien' : 'mal';
      $('dlg-gps').innerHTML =
        `<span class="marca-gps ${clase}">${pos.fiable ? '✓' : '!'}</span>` +
        `<span>Ubicación lista · ± ${Geo.metros(pos.precision)}` +
        (pos.fiable ? '' : ' — poco precisa, sal a cielo abierto') + '</span>';
      $('btn-confirmar-parada').disabled = !pos.fiable;
      setTimeout(() => $('in-nombre').focus(), 100);
    } catch (e) {
      $('dlg-gps').innerHTML =
        '<span class="marca-gps mal">!</span><span>No se pudo obtener tu ubicación. ' +
        'Activa el GPS y vuelve a intentar.</span>';
    }
  }

  async function confirmarParada() {
    const nombre = $('in-nombre').value.trim();
    if (!nombre) { $('in-nombre').focus(); return; }
    if (!posDialogo) return;

    const btn = $('btn-confirmar-parada');
    btn.disabled = true; btn.textContent = 'Abriendo…';
    try {
      await Datos.abrirParada({
        grupoId, nombre, lat: posDialogo.lat, lon: posDialogo.lon, radio: radioElegido,
      });
      $('dlg-abrir').classList.add('oculta');
      await cargarGrupo(grupoId);
    } catch (e) {
      alert('No se pudo abrir la parada: ' + e.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Abrir parada';
    }
  }

  /* ---------- arranque ---------- */

  async function iniciar() {
    $('banner-demo').classList.toggle('oculto', !Datos.esDemo());

    let grupos = [];
    try {
      grupos = await Datos.grupos();
    } catch (e) {
      document.querySelector('main').innerHTML =
        `<div class="aviso malo"><span>✕</span><span>No se pudo conectar: ${e.message}</span></div>`;
      return;
    }
    if (!grupos.length) {
      $('v-inactivo').classList.remove('oculto');
      $('v-inactivo').querySelector('.panel-vacio').innerHTML =
        '<div class="icono neutro">📋</div><h2>Sin grupos creados</h2>' +
        '<p>Primero crea un grupo y carga su lista de alumnos.</p>' +
        '<a class="boton primario grande" href="admin.html">Ir a administración</a>';
      return;
    }

    $('sel-grupo').innerHTML = grupos
      .map((g) => `<option value="${g.id}">${g.nombre}</option>`).join('');

    let guardado = null;
    try { guardado = localStorage.getItem(CLAVE_GRUPO); } catch (e) {}
    const inicial = grupos.some((g) => g.id === guardado) ? guardado : grupos[0].id;
    $('sel-grupo').value = inicial;
    await cargarGrupo(inicial);

    setInterval(refrescar, CONFIG.REFRESCO_PANEL);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refrescar();
    });
  }

  /* ---------- eventos ---------- */

  $('sel-grupo').addEventListener('change', (e) => cargarGrupo(e.target.value));
  $('btn-abrir').addEventListener('click', abrirDialogo);
  $('btn-cancelar').addEventListener('click', () => $('dlg-abrir').classList.add('oculta'));
  $('btn-confirmar-parada').addEventListener('click', confirmarParada);
  $('btn-centrar').addEventListener('click', () => { ajustado = false; refrescar(); });
  $('in-nombre').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !$('btn-confirmar-parada').disabled) confirmarParada();
  });

  $('opciones-radio').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    radioElegido = Number(b.dataset.r);
    $('opciones-radio').querySelectorAll('button')
      .forEach((x) => x.classList.toggle('activo', x === b));
  });

  $('btn-cerrar').addEventListener('click', async () => {
    if (!confirm('¿Cerrar la parada? Los alumnos ya no podrán marcar aquí.')) return;
    await Datos.cerrarParada(parada.id);
    await cargarGrupo(grupoId);
  });

  iniciar();
})();
