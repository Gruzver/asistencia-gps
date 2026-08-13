/* ============================================================
   Panel: mapa Leaflet + metricas + tabla + pendientes.
   Tiles de OpenStreetMap (sin API key ni facturacion).
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let mapa, capaMarcas, capaZonas;
  let estado = { personas: [], asistencia: [], lugares: [], lugarActual: null };
  const marcasPorId = {};

  /* ---------- mapa ---------- */

  function iniciarMapa() {
    mapa = L.map('mapa', { zoomControl: true }).setView([-16.3989, -71.537], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(mapa);
    capaZonas = L.layerGroup().addTo(mapa);
    capaMarcas = L.layerGroup().addTo(mapa);
  }

  /**
   * @param {boolean} ajustarVista  Reencuadrar para abarcar todos los
   *   puntos. Solo en la primera carga o al pulsar "Centrar": hacerlo
   *   en cada refresco automatico le arrancaba el zoom al usuario cada
   *   30 segundos.
   */
  function pintarMapa(ajustarVista) {
    capaMarcas.clearLayers();
    capaZonas.clearLayers();
    Object.keys(marcasPorId).forEach((k) => delete marcasPorId[k]);

    const lugar = estado.lugarActual;

    // Circulo de geocerca del lugar activo
    if (lugar && lugar.lat != null) {
      const radio = lugar.radio || CONFIG.RADIO_DEFAULT;
      L.circle([lugar.lat, lugar.lon], {
        radius: radio,
        color: '#0071e3',
        weight: 1.5,
        fillColor: '#0071e3',
        fillOpacity: 0.06,
      }).addTo(capaZonas);

      L.marker([lugar.lat, lugar.lon], {
        icon: L.divIcon({
          className: '',
          html: '<div style="width:13px;height:13px;background:#0071e3;border:3px solid #fff;' +
                'border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>',
          iconSize: [13, 13],
          iconAnchor: [6, 6],
        }),
      })
        .addTo(capaZonas)
        .bindPopup(`<b>${lugar.nombre}</b>Punto de encuentro · radio ${radio} m`);
    }

    const puntos = [];
    filtradas().forEach((a) => {
      if (a.lat == null || a.lon == null) return;
      const p = persona(a.id);
      const fuera = a.estado === 'FUERA_ZONA';

      const m = L.marker([a.lat, a.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div class="pin ${fuera ? 'fuera' : 'ok'}"></div>`,
          iconSize: [15, 15],
          iconAnchor: [7, 7],
        }),
      }).bindPopup(
        `<b>${p ? p.nombre : a.id}</b>` +
          `${a.hora} · ${a.lugar}<br>` +
          `Distancia: ${Utils.metros(a.distancia)}<br>` +
          `Precisión: ± ${a.precision} m` +
          (fuera ? '<br><strong style="color:#d1231b">Fuera de zona</strong>' : '')
      );

      m.addTo(capaMarcas);
      marcasPorId[a.id] = m;
      puntos.push([a.lat, a.lon]);
    });

    if (lugar && lugar.lat != null) puntos.push([lugar.lat, lugar.lon]);
    if (ajustarVista && puntos.length) {
      mapa.fitBounds(L.latLngBounds(puntos).pad(0.25));
    }
  }

  /* ---------- datos ---------- */

  const persona = (id) => estado.personas.find((p) => p.id === id);

  function filtradas() {
    const sec = $('f-seccion').value;
    const est = $('f-estado').value;
    return estado.asistencia.filter((a) => {
      const p = persona(a.id);
      if (sec && (!p || p.seccion !== sec)) return false;
      if (est && a.estado !== est) return false;
      return true;
    });
  }

  function pintarMetricas() {
    const hoy = Utils.fechaHoy();
    const deHoy = estado.asistencia.filter((a) => a.fecha === hoy);
    const idsHoy = new Set(deHoy.map((a) => a.id));
    const activas = estado.personas.filter((p) => p.activo !== false);

    $('m-presentes').textContent = idsHoy.size;
    $('m-presentes-pie').textContent = `de ${activas.length} registradas`;
    $('m-enzona').textContent = deHoy.filter((a) => a.estado === 'EN_ZONA').length;
    $('m-fuera').textContent = deHoy.filter((a) => a.estado === 'FUERA_ZONA').length;

    const faltan = activas.filter((p) => !idsHoy.has(p.id));
    $('m-faltan').textContent = faltan.length;

    const lugar = estado.lugarActual;
    $('m-lugar').textContent = lugar ? lugar.nombre : '--';
    $('m-lugar-pie').textContent = lugar
      ? `radio ${lugar.radio || CONFIG.RADIO_DEFAULT} m`
      : '';

    // Pendientes
    const cuerpo = $('cuerpo-faltan');
    cuerpo.innerHTML = faltan
      .map(
        (p) =>
          `<tr><td class="num">${p.id}</td><td>${p.nombre}</td>` +
          `<td>${p.seccion || '--'}</td></tr>`
      )
      .join('');
    $('faltan-vacia').classList.toggle('oculto', faltan.length > 0);
    $('chip-faltan').textContent = `${faltan.length} pendiente${faltan.length === 1 ? '' : 's'}`;
  }

  function pintarTabla() {
    const filas = filtradas().slice().sort((a, b) => (a.hora < b.hora ? 1 : -1));
    const cuerpo = $('cuerpo-tabla');

    cuerpo.innerHTML = filas
      .map((a) => {
        const p = persona(a.id);
        const fuera = a.estado === 'FUERA_ZONA';
        return (
          `<tr data-id="${a.id}">` +
          `<td class="num">${a.hora}</td>` +
          `<td>${p ? p.nombre : `<em>${a.id}</em>`}</td>` +
          `<td>${p ? p.seccion || '--' : '--'}</td>` +
          `<td class="num">${Utils.metros(a.distancia)}</td>` +
          `<td><span class="insignia ${fuera ? 'fuera' : 'ok'}">` +
          `${fuera ? 'Fuera' : 'En zona'}</span></td>` +
          `</tr>`
        );
      })
      .join('');

    $('tabla-vacia').classList.toggle('oculto', filas.length > 0);

    // Click en fila -> centra y abre el popup del marcador
    cuerpo.querySelectorAll('tr').forEach((tr) => {
      tr.addEventListener('click', () => {
        cuerpo.querySelectorAll('tr').forEach((x) => x.classList.remove('resaltada'));
        tr.classList.add('resaltada');
        const m = marcasPorId[tr.dataset.id];
        if (m) {
          mapa.setView(m.getLatLng(), 17, { animate: true });
          m.openPopup();
        }
      });
    });
  }

  function llenarFiltroSecciones() {
    const secciones = [...new Set(estado.personas.map((p) => p.seccion).filter(Boolean))].sort();
    const sel = $('f-seccion');
    const previo = sel.value;
    sel.innerHTML =
      '<option value="">Todas</option>' +
      secciones.map((s) => `<option value="${s}">${s}</option>`).join('');
    sel.value = previo;
  }

  function exportarCSV() {
    const filas = filtradas();
    const cab = ['Fecha', 'Hora', 'Codigo', 'Nombre', 'Seccion', 'Lugar', 'Lat', 'Lon', 'Precision_m', 'Distancia_m', 'Estado'];
    const cuerpo = filas.map((a) => {
      const p = persona(a.id);
      return [
        a.fecha, a.hora, a.id,
        p ? p.nombre : '', p ? p.seccion || '' : '',
        a.lugar, a.lat, a.lon, a.precision, a.distancia, a.estado,
      ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
    });

    const blob = new Blob(['﻿' + [cab.join(','), ...cuerpo].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `asistencia_${Utils.fechaHoy().replace(/\//g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------- ciclo ---------- */

  let primeraCarga = true;

  async function cargar() {
    try {
      const r = await API.datos();
      estado = {
        personas: r.personas || [],
        asistencia: r.asistencia || [],
        lugares: r.lugares || [],
        lugarActual: r.lugarActual || null,
      };
      $('banner-error').classList.add('oculto');
      $('banner-demo').classList.toggle('oculto', !r.demo);

      llenarFiltroSecciones();
      pintarMetricas();
      pintarTabla();
      pintarMapa(primeraCarga);
      primeraCarga = false;
      $('ts').textContent = Utils.horaAhora();
    } catch (e) {
      const b = $('banner-error');
      b.innerHTML = `<span>✕</span><span><strong>No se pudo cargar.</strong> ${e.message}</span>`;
      b.classList.remove('oculto');
    }
  }

  function repintar() {
    pintarTabla();
    pintarMapa(false);
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('titulo-evento').textContent = CONFIG.EVENTO;
    document.title = `Panel · ${CONFIG.EVENTO}`;
    iniciarMapa();
    $('f-seccion').addEventListener('change', repintar);
    $('f-estado').addEventListener('change', repintar);
    $('btn-csv').addEventListener('click', exportarCSV);
    $('btn-centrar').addEventListener('click', function () { pintarMapa(true); });

    // Marcaje hecho en otra pestana del mismo navegador: el evento
    // storage solo llega a las demas pestanas, que es justo el caso.
    window.addEventListener('storage', function (ev) {
      if (ev.key === null || ev.key === 'asistencia_gps_demo') cargar();
    });

    // Al volver a la pestana tras marcar en el movil o en otra ventana
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) cargar();
    });
    $('btn-limpiar-demo').addEventListener('click', function () {
      if (!confirm('¿Borrar los marcajes de prueba de este navegador?')) return;
      API.limpiarDemo();
      cargar();
    });
    cargar();
    setInterval(cargar, CONFIG.REFRESCO_PANEL);
  });
})();
