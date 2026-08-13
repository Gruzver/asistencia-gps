/* ============================================================
   Panel del guia.

   Tres cosas mandan el diseño:

   1. El guia cuida al grupo, no mira la pantalla. Lo mas grande
      es el contador y quien falta.
   2. Puede no haber señal. Todo lee de cache y encola lo que
      escribe; el conteo avanza igual.
   3. Puede haber varios guias. El segundo no crea una parada
      nueva: se une a la que ya esta abierta y ambos ven lo mismo.
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const CLAVE_GRUPO = 'agps_guia_grupo';
  const CLAVE_YO = 'agps_guia_yo';

  let mapa, capaMarcas, capaZona;
  let grupoId = null, parada = null, desuscribir = null;
  let posDialogo = null, radioElegido = CONFIG.RADIO_DEFAULT, ajustado = false;
  let yo = null, escaner = null, ultimoProgreso = null;
  const recientes = [];

  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  /* ---------- estado de red ---------- */

  function pintarRed() {
    $('chip-red').classList.toggle('oculto', navigator.onLine !== false);
    const n = Datos.pendientes();
    const chip = $('chip-pendientes');
    chip.classList.toggle('oculto', n === 0);
    chip.className = 'insignia ' + (n ? 'fuera' : 'neutra');
    chip.textContent = n === 1 ? '1 por subir' : n + ' por subir';
  }

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
    capaMarcas.clearLayers(); capaZona.clearLayers();
    const puntos = [];

    if (parada) {
      L.circle([parada.lat, parada.lon], {
        radius: parada.radio, color: '#0071e3', weight: 1.5,
        fillColor: '#0071e3', fillOpacity: 0.06,
      }).addTo(capaZona);
      L.marker([parada.lat, parada.lon], {
        icon: L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7],
          html: '<div style="width:14px;height:14px;background:#0071e3;border:3px solid #fff;' +
                'border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>' }),
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
        `<b>${al ? al.nombre : 'Desconocido'}</b>${Geo.horaSeg(m.creado_en)}<br>` +
        `A ${Geo.metros(m.distancia_m)} · ± ${Geo.metros(m.precision_m)}<br>` +
        `Origen: ${etiquetaOrigen(m.origen)}` +
        (fuera ? '<br><strong style="color:#d1231b">Fuera de zona</strong>' : '') +
        (m.device_distinto ? '<br><strong style="color:#9a6200">Otro teléfono</strong>' : '')
      );
      puntos.push([m.lat, m.lon]);
    });

    if (centrar && puntos.length) mapa.fitBounds(L.latLngBounds(puntos).pad(0.3));
  }

  const etiquetaOrigen = (o) => ({
    alumno: 'el alumno marcó', guia_scan: 'escaneado por el guía',
    guia_manual: 'marcado a mano',
  }[o] || o || 'alumno');

  /* ---------- render ---------- */

  function pintar(datos) {
    ultimoProgreso = datos;
    const marcados = datos.marcajes.length;
    const total = datos.alumnos.length;
    const enZona = datos.marcajes.filter((m) => m.estado === 'EN_ZONA').length;
    const fuera = datos.marcajes.filter((m) => m.estado === 'FUERA_ZONA').length;
    const ids = new Set(datos.marcajes.map((m) => m.alumno_id));
    const faltan = datos.alumnos.filter((a) => !ids.has(a.id));

    $('c-marcados').textContent = marcados;
    $('c-total').textContent = total;
    $('esc-marcados').textContent = marcados;
    $('esc-total').textContent = total;
    $('progreso').style.width = total ? (marcados / total * 100).toFixed(1) + '%' : '0';
    $('progreso').classList.toggle('completo', total > 0 && marcados === total);
    $('chip-zona').textContent = `${enZona} en zona`;
    $('chip-fuera').textContent = `${fuera} lejos`;
    $('chip-faltan').textContent = `${faltan.length} faltan`;

    const lf = $('lista-faltan');
    lf.innerHTML = faltan.map((a) =>
      `<li><span class="nombre">${a.nombre}</span>` +
      `<button class="boton chico" data-manual="${a.id}">Presente</button></li>`).join('');
    $('faltan-vacio').classList.toggle('oculto', faltan.length > 0);
    $('pie-faltan').textContent = faltan.length ? `${faltan.length} de ${total}` : '';

    lf.querySelectorAll('[data-manual]').forEach((b) => {
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await Datos.marcarManual({
            paradaId: parada.id, alumnoId: b.dataset.manual,
            guiaId: yo && yo.id,
          });
          refrescar();
        } catch (e) {
          alert('No se pudo marcar sin conexión. Inténtalo al recuperar señal.');
          b.disabled = false;
        }
      });
    });

    const orden = datos.marcajes.slice().sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1));
    $('lista-marcados').innerHTML = orden.map((m) => {
      const a = datos.alumnos.find((x) => x.id === m.alumno_id);
      const et = m.estado === 'FUERA_ZONA'
        ? `<span class="insignia fuera">${Geo.metros(m.distancia_m)}</span>`
        : m.estado === 'MANUAL'
          ? '<span class="insignia neutra">a mano</span>'
          : `<span class="insignia ok">${Geo.metros(m.distancia_m)}</span>`;
      const marcas =
        (m.origen === 'guia_scan' ? ' <span class="alerta" title="Escaneado por el guía">⌾</span>' : '') +
        (m.device_distinto ? ' <span class="alerta" title="Otro teléfono">⚠</span>' : '') +
        (m.pendiente || m.diferido ? ' <span class="alerta" title="Pendiente de subir">◷</span>' : '');
      return `<li><span class="nombre">${a ? a.nombre : '--'}${marcas}</span>` +
             `<span class="der-lista">${et}<span class="hora">${Geo.hora(m.creado_en)}</span></span></li>`;
    }).join('');
    $('marcados-vacio').classList.toggle('oculto', marcados > 0);

    pintarMapa(datos, !ajustado);
    if (datos.marcajes.length || parada) ajustado = true;
    pintarRed();
  }

  /* ---------- ciclo ---------- */

  async function refrescar() {
    if (!parada) return;
    try {
      const datos = await Datos.progreso(parada.id);
      if (datos.parada && datos.parada.cerrada_en) return cargarGrupo(grupoId);
      pintar(datos);
      $('punto-vivo').classList.add('vivo');
      setTimeout(() => $('punto-vivo').classList.remove('vivo'), 600);
    } catch (e) { pintarRed(); }
  }

  async function cargarGrupo(id) {
    grupoId = id;
    guardar(CLAVE_GRUPO, id);
    if (desuscribir) { desuscribir(); desuscribir = null; }
    ajustado = false;

    const precargado = Datos.precargadoEn(id);
    $('banner-precarga').classList.toggle('oculto', !!precargado);
    $('pie-precarga').textContent = precargado
      ? 'Grupo descargado el ' + new Date(precargado).toLocaleString('es-PE')
      : '';

    try { parada = await Datos.paradaAbierta(id); }
    catch (e) { parada = null; }

    if (!parada) {
      $('v-activo').classList.add('oculto');
      $('v-inactivo').classList.remove('oculto');
      pintarRed();
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

    try { desuscribir = Datos.suscribir(parada.id, refrescar); } catch (e) {}
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
      $('dlg-gps').innerHTML =
        `<span class="marca-gps ${pos.fiable ? 'bien' : 'mal'}">${pos.fiable ? '✓' : '!'}</span>` +
        `<span>Ubicación lista · ± ${Geo.metros(pos.precision)}` +
        (pos.fiable ? '' : ' — poco precisa, sal a cielo abierto') + '</span>';
      $('btn-confirmar-parada').disabled = !pos.fiable;
      setTimeout(() => $('in-nombre').focus(), 100);
    } catch (e) {
      $('dlg-gps').innerHTML =
        '<span class="marca-gps mal">!</span><span>No se pudo obtener tu ubicación. ' +
        'Activa el GPS e inténtalo otra vez.</span>';
    }
  }

  async function confirmarParada() {
    const nombre = $('in-nombre').value.trim();
    if (!nombre || !posDialogo) { $('in-nombre').focus(); return; }

    const btn = $('btn-confirmar-parada');
    btn.disabled = true; btn.textContent = 'Abriendo…';
    try {
      const r = await Datos.abrirParada({
        grupoId, nombre, lat: posDialogo.lat, lon: posDialogo.lon,
        radio: radioElegido, guiaId: yo && yo.id,
      });
      $('dlg-abrir').classList.add('oculta');

      // Otro guia se adelanto: en vez de bloquear o duplicar, se
      // trabaja sobre la parada que ya esta abierta.
      if (r && r.creada === false) {
        alert('Ya había una parada abierta para este grupo:\n\n' +
              r.parada.nombre + '\n\nTe uniste a ella.');
      } else if (r && r.local) {
        alert('Parada abierta sin señal.\n\nPuedes escanear con normalidad. ' +
              'Todo se subirá solo cuando vuelva la cobertura.');
      }
      await cargarGrupo(grupoId);
    } catch (e) {
      alert('No se pudo abrir la parada.\n\n' + (e.message || e.codigo));
    } finally {
      btn.disabled = false; btn.textContent = 'Abrir parada';
    }
  }

  /* ---------- escaner ---------- */

  function avisoEscaner(texto, clase) {
    const el = $('esc-mensaje');
    el.textContent = texto;
    el.className = 'escaner-mensaje ' + (clase || '');
    if (navigator.vibrate) navigator.vibrate(clase === 'mal' ? [70, 60, 70] : 45);
  }

  function apuntarReciente(nombre, clase) {
    recientes.unshift({ nombre, clase });
    recientes.length = Math.min(recientes.length, 4);
    $('esc-ultimos').innerHTML = recientes
      .map((r) => `<div class="reciente ${r.clase}">${r.nombre}</div>`).join('');
  }

  async function alEscanear(texto) {
    const codigo = Escaner.codigoDe(texto);
    if (!codigo) return avisoEscaner('Código no reconocido', 'mal');

    // Resolucion contra la cache: sin esto el escaneo dependeria de
    // la red justo donde no la hay.
    const local = Datos.resolverCodigoLocal(codigo, grupoId);
    if (!local.existe) return avisoEscaner(`${codigo} no está dado de alta`, 'mal');
    if (!local.alumno) return avisoEscaner(`${codigo} sin activar todavía`, 'mal');

    const nombre = local.alumno.nombre;
    const ya = ultimoProgreso &&
      ultimoProgreso.marcajes.some((m) => m.alumno_id === local.alumno.id);
    if (ya) {
      avisoEscaner(nombre + ' — ya estaba', 'aviso');
      apuntarReciente(nombre, 'aviso');
      return;
    }

    avisoEscaner(nombre, 'bien');
    apuntarReciente(nombre, 'bien');

    try {
      await Datos.marcar({
        codigo, lat: posDialogo ? posDialogo.lat : (parada ? parada.lat : null),
        lon: posDialogo ? posDialogo.lon : (parada ? parada.lon : null),
        precision: null, origen: 'guia_scan', guiaId: yo && yo.id,
        capturado_en: new Date().toISOString(),
        grupoId, paradaId: parada.id, alumnoId: local.alumno.id,
        paradaLat: parada.lat, paradaLon: parada.lon, paradaRadio: parada.radio,
      });
    } catch (e) {
      avisoEscaner(nombre + ' — no se pudo', 'mal');
    }
    refrescar();
  }

  async function abrirEscaner() {
    $('v-escaner').classList.remove('oculta');
    recientes.length = 0; $('esc-ultimos').innerHTML = '';
    avisoEscaner('Apunta al código de la pulsera');

    if (!escaner) {
      escaner = new Escaner($('video'), $('lienzo'));
      escaner.alLeer = alEscanear;
    }
    try {
      await escaner.iniciar();
    } catch (e) {
      avisoEscaner(
        e.codigo === 'PERMISO_DENEGADO'
          ? 'Permiso de cámara denegado. Actívalo en los ajustes del navegador.'
          : 'No se pudo abrir la cámara: ' + (e.mensaje || ''), 'mal');
    }
  }

  function cerrarEscaner() {
    if (escaner) escaner.detener();
    $('v-escaner').classList.add('oculta');
    refrescar();
  }

  /* ---------- identidad del guia ---------- */

  async function abrirDialogoYo() {
    $('dlg-yo').classList.remove('oculta');
    const cont = $('lista-guias');
    cont.innerHTML = '<p class="vacio-mini">Cargando…</p>';
    let guias = [];
    try { guias = await Datos.guiasDe(grupoId); } catch (e) {}
    if (!guias.length) { try { guias = await Datos.guias(); } catch (e) {} }

    if (!guias.length) {
      cont.innerHTML = '<p class="vacio-mini">No hay guías dados de alta. ' +
        'Créalos en <a href="admin.html">Administración</a>.</p>';
      return;
    }
    cont.innerHTML = '';
    guias.forEach((g) => {
      const b = document.createElement('button');
      b.className = 'opcion' + (yo && yo.id === g.id ? ' elegida' : '');
      b.innerHTML = `<span>${g.nombre}</span><span class="flecha">${
        yo && yo.id === g.id ? '✓' : '›'}</span>`;
      b.addEventListener('click', () => {
        yo = g;
        guardar(CLAVE_YO, JSON.stringify(g));
        $('btn-yo').textContent = g.nombre.split(' ')[0];
        $('dlg-yo').classList.add('oculta');
      });
      cont.appendChild(b);
    });
  }

  /* ---------- arranque ---------- */

  async function iniciar() {
    // Abrir y cerrar paradas exige sesion; marcar no, porque el QR
    // es la unica credencial del alumno.
    const sesion = await Auth.exigir('Acceso para guías');
    // Si no se ha elegido guia todavia, se propone el de la cuenta
    if (!yo && sesion) $('btn-yo').textContent = sesion.nombre;

    $('banner-demo').classList.toggle('oculto', !Datos.esDemo());
    pintarRed();

    try {
      const g = leer(CLAVE_YO);
      if (g) { yo = JSON.parse(g); $('btn-yo').textContent = yo.nombre.split(' ')[0]; }
    } catch (e) {}

    let grupos = [];
    try { grupos = await Datos.grupos(); } catch (e) {}

    if (!grupos.length) {
      $('v-inactivo').classList.remove('oculto');
      $('v-inactivo').querySelector('.panel-vacio').innerHTML =
        '<div class="icono neutro">📋</div><h2>Sin grupos</h2>' +
        '<p>Crea un grupo y carga su lista de alumnos.</p>' +
        '<a class="boton primario grande" href="admin.html">Ir a administración</a>';
      return;
    }

    $('sel-grupo').innerHTML = grupos
      .map((g) => `<option value="${g.id}">${g.nombre}</option>`).join('');
    const guardado = leer(CLAVE_GRUPO);
    const inicial = grupos.some((g) => g.id === guardado) ? guardado : grupos[0].id;
    $('sel-grupo').value = inicial;
    await cargarGrupo(inicial);

    setInterval(refrescar, CONFIG.REFRESCO_PANEL);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar(); });
    window.addEventListener('online', async () => {
      pintarRed();
      const r = await Datos.sincronizar();
      // Si la parada local acabo fundiendose con la de otro guia,
      // hay que recargar: los marcajes cambiaron de parada.
      const adoptada = (r.adoptadas || []).find((a) => a.ajena);
      if (adoptada) {
        alert('Al recuperar señal se encontró que otro guía ya había abierto\n"' +
              adoptada.real.nombre + '".\n\nTus escaneos se guardaron en esa parada.');
      }
      if (r.adoptadas && r.adoptadas.length) await cargarGrupo(grupoId);
      else refrescar();
    });
    window.addEventListener('offline', pintarRed);
    Datos.alCambiarPendientes(pintarRed);
  }

  /* ---------- eventos ---------- */

  $('sel-grupo').addEventListener('change', (e) => cargarGrupo(e.target.value));
  $('btn-abrir').addEventListener('click', abrirDialogo);
  $('btn-cancelar').addEventListener('click', () => $('dlg-abrir').classList.add('oculta'));
  $('btn-confirmar-parada').addEventListener('click', confirmarParada);
  $('btn-centrar').addEventListener('click', () => { ajustado = false; refrescar(); });
  $('btn-escanear').addEventListener('click', abrirEscaner);
  $('btn-cerrar-escaner').addEventListener('click', cerrarEscaner);
  $('btn-yo').addEventListener('click', abrirDialogoYo);
  $('btn-yo-cerrar').addEventListener('click', () => $('dlg-yo').classList.add('oculta'));
  $('btn-salir').addEventListener('click', () => {
    if (Datos.pendientes()) {
      if (!confirm('Quedan ' + Datos.pendientes() + ' marcajes por subir.\n\n' +
                   'Si cierras sesión ahora podrías perderlos. ¿Continuar?')) return;
    }
    Auth.salir();
  });

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
    try { await Datos.cerrarParada(parada.id); await cargarGrupo(grupoId); }
    catch (e) { alert('Cerrar la parada necesita conexión.'); }
  });

  $('btn-precargar').addEventListener('click', async function () {
    this.disabled = true; this.textContent = 'Descargando…';
    try {
      const r = await Datos.precargar(grupoId);
      alert(`Listo. ${r.alumnos} alumnos y ${r.pulseras} pulseras guardados ` +
            'en este teléfono.\n\nYa puedes trabajar sin señal.');
      await cargarGrupo(grupoId);
    } catch (e) {
      alert('No se pudo descargar: ' + (e.message || e.codigo));
    } finally {
      this.disabled = false; this.textContent = 'Descargar ahora';
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  iniciar();
})();
