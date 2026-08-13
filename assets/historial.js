/* ============================================================
   Historial y exportacion.

   Es lo que se mira despues del viaje, no durante. Responde tres
   preguntas: que paso en cada parada, como fue cada alumno en el
   conjunto, y como saco todo esto para entregarlo al colegio.
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let grupoId = null, grupo = null;
  let alumnos = [], paradas = [], marcajes = [];

  const nombreDe = (id) => {
    const a = alumnos.find((x) => x.id === id);
    return a ? a.nombre : '(alumno eliminado)';
  };

  const ETIQUETA_ORIGEN = {
    alumno: 'marcó', guia_scan: 'escaneado', guia_manual: 'a mano',
  };

  function fecha(iso) {
    if (!iso) return '--';
    const d = new Date(iso);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) +
           ' · ' + Geo.hora(iso);
  }

  /* ---------- descarga de archivos ---------- */

  function descargar(nombre, filas) {
    const csv = filas.map((f) => f.map((v) =>
      `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\n');
    // El BOM hace que Excel abra las tildes correctamente
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const CABECERA = ['Parada', 'Fecha', 'Hora', 'Alumno', 'Grupo', 'Estado',
                    'Distancia_m', 'Precision_m', 'Origen', 'Lat', 'Lon',
                    'Diferido', 'Otro_dispositivo'];

  function filaCSV(m, par) {
    const d = new Date(m.creado_en);
    return [
      par ? par.nombre : '', d.toLocaleDateString('es-PE'), Geo.horaSeg(m.creado_en),
      nombreDe(m.alumno_id), grupo ? grupo.nombre : '', m.estado,
      m.distancia_m, m.precision_m, ETIQUETA_ORIGEN[m.origen] || m.origen,
      m.lat, m.lon, m.diferido ? 'sí' : '', m.device_distinto ? 'sí' : '',
    ];
  }

  function exportarTodo() {
    if (!marcajes.length) return alert('No hay marcajes que exportar.');
    const filas = [CABECERA].concat(
      marcajes.slice()
        .sort((a, b) => (a.creado_en < b.creado_en ? -1 : 1))
        .map((m) => filaCSV(m, paradas.find((p) => p.id === m.parada_id))));
    descargar(`asistencia_${(grupo && grupo.nombre) || 'grupo'}.csv`, filas);
  }

  /* ---------- render ---------- */

  function pintarMetricas() {
    $('m-paradas').textContent = paradas.length;
    $('m-alumnos').textContent = alumnos.length;
    $('m-lejos').textContent = marcajes.filter((m) => m.estado === 'FUERA_ZONA').length;

    if (!paradas.length || !alumnos.length) { $('m-media').textContent = '--'; return; }
    const media = paradas.reduce((suma, p) =>
      suma + marcajes.filter((m) => m.parada_id === p.id).length, 0) /
      (paradas.length * alumnos.length);
    $('m-media').textContent = Math.round(media * 100) + '%';
  }

  function pintarParadas() {
    const cuerpo = $('cuerpo-paradas');
    cuerpo.innerHTML = paradas.map((p) => {
      const suyos = marcajes.filter((m) => m.parada_id === p.id);
      const lejos = suyos.filter((m) => m.estado === 'FUERA_ZONA').length;
      const pct = alumnos.length ? Math.round(suyos.length / alumnos.length * 100) : 0;
      return `<tr data-parada="${p.id}">` +
        `<td><b>${p.nombre}</b>${p.cerrada_en ? '' :
          ' <span class="insignia ok">abierta</span>'}</td>` +
        `<td class="num">${fecha(p.abierta_en)}</td>` +
        `<td><span class="insignia ${pct === 100 ? 'ok' : 'neutra'}">` +
        `${suyos.length}/${alumnos.length} · ${pct}%</span></td>` +
        `<td>${lejos ? `<span class="insignia fuera">${lejos}</span>` : '—'}</td>` +
        '<td class="num">ver ›</td></tr>';
    }).join('');
    $('paradas-vacio').classList.toggle('oculto', paradas.length > 0);

    cuerpo.querySelectorAll('[data-parada]').forEach((tr) => {
      tr.addEventListener('click', () => detalle(tr.dataset.parada));
    });
  }

  function detalle(paradaId) {
    const p = paradas.find((x) => x.id === paradaId);
    if (!p) return;
    const suyos = marcajes.filter((m) => m.parada_id === paradaId);
    const ids = new Set(suyos.map((m) => m.alumno_id));
    const faltaron = alumnos.filter((a) => !ids.has(a.id));

    $('det-titulo').textContent = p.nombre;
    $('det-info').textContent =
      `${fecha(p.abierta_en)} · radio ${p.radio} m · ${suyos.length}/${alumnos.length}`;

    const filas = suyos.slice()
      .sort((a, b) => (a.creado_en < b.creado_en ? -1 : 1))
      .map((m) => {
        const fuera = m.estado === 'FUERA_ZONA';
        return `<tr><td>${nombreDe(m.alumno_id)}</td>` +
          `<td class="num">${Geo.horaSeg(m.creado_en)}</td>` +
          `<td class="num">${Geo.metros(m.distancia_m)}</td>` +
          `<td>${ETIQUETA_ORIGEN[m.origen] || m.origen}</td>` +
          `<td><span class="insignia ${fuera ? 'fuera' : m.estado === 'MANUAL' ? 'neutra' : 'ok'}">` +
          `${fuera ? 'lejos' : m.estado === 'MANUAL' ? 'a mano' : 'en zona'}</span></td></tr>`;
      })
      // Los que no marcaron van al final, en gris: sin ellos el
      // detalle no sirve para lo que de verdad importa, que es
      // saber a quien no se vio en ese punto.
      .concat(faltaron.map((a) =>
        `<tr style="opacity:.55"><td>${a.nombre}</td><td class="num">—</td>` +
        '<td class="num">—</td><td>—</td>' +
        '<td><span class="insignia fuera">no marcó</span></td></tr>'));

    $('cuerpo-detalle').innerHTML = filas.join('');
    $('panel-detalle').classList.remove('oculto');
    $('btn-csv-parada').onclick = () => {
      descargar(`${p.nombre.replace(/[^\w\sáéíóúñ-]/gi, '')}.csv`,
        [CABECERA].concat(suyos.map((m) => filaCSV(m, p))));
    };
    $('panel-detalle').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function pintarResumen() {
    const total = paradas.length;
    const filas = alumnos.map((a) => {
      const suyos = marcajes.filter((m) => m.alumno_id === a.id);
      const lejos = suyos.filter((m) => m.estado === 'FUERA_ZONA').length;
      const pct = total ? Math.round(suyos.length / total * 100) : 0;
      return { a, marco: suyos.length, falto: total - suyos.length, lejos, pct };
    }).sort((x, y) => x.pct - y.pct || x.a.nombre.localeCompare(y.a.nombre, 'es'));

    $('cuerpo-resumen').innerHTML = filas.map((f) =>
      `<tr><td>${f.a.nombre}</td>` +
      `<td class="num">${f.marco}</td>` +
      `<td class="num">${f.falto || '—'}</td>` +
      `<td class="num">${f.lejos || '—'}</td>` +
      `<td><span class="insignia ${f.pct === 100 ? 'ok' : f.pct >= 80 ? 'neutra' : 'fuera'}">` +
      `${f.pct}%</span></td></tr>`).join('');
    $('resumen-vacio').classList.toggle('oculto', filas.length > 0);
  }

  /* ---------- carga ---------- */

  async function cargar(id) {
    grupoId = id;
    $('panel-detalle').classList.add('oculto');
    try {
      const grupos = await Datos.grupos();
      grupo = grupos.find((g) => g.id === id) || null;
      [alumnos, paradas, marcajes] = await Promise.all([
        Datos.alumnosDe(id), Datos.paradasDe(id), Datos.marcajesDe(id),
      ]);
      alumnos = alumnos.filter((a) => a.activo !== false)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      pintarMetricas(); pintarParadas(); pintarResumen();
    } catch (e) {
      document.querySelector('main').insertAdjacentHTML('afterbegin',
        `<div class="aviso malo"><span>✕</span><span>No se pudo cargar: ${e.message}</span></div>`);
    }
  }

  (async function () {
    await Auth.exigir('Acceso para guías');
    let grupos = [];
    try { grupos = await Datos.grupos(); } catch (e) {}
    if (!grupos.length) {
      document.querySelector('main').innerHTML =
        '<div class="panel-vacio"><div class="icono neutro">📋</div>' +
        '<h2>Sin grupos</h2><p>Crea un grupo primero.</p>' +
        '<a class="boton primario grande" href="admin.html">Ir a administración</a></div>';
      return;
    }
    $('sel-grupo').innerHTML = grupos
      .map((g) => `<option value="${g.id}">${g.nombre}</option>`).join('');
    await cargar(grupos[0].id);
  })();

  $('sel-grupo').addEventListener('change', (e) => cargar(e.target.value));
  $('btn-csv-todo').addEventListener('click', exportarTodo);
  $('btn-imprimir').addEventListener('click', () => window.print());
})();
