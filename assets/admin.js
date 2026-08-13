/* ============================================================
   Administracion: colegios, grupos, listas y pulseras.

   Lo usa alguien del colegio antes del viaje, no el guia en
   campo. Al terminar, "Liberar pulseras" las devuelve al stock
   conservando el historico de marcajes.
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let colegios = [], grupos = [];

  function opciones(sel, items, etiqueta) {
    const previo = sel.value;
    sel.innerHTML = items.map((i) =>
      `<option value="${i.id}">${etiqueta(i)}</option>`).join('');
    if (items.some((i) => i.id === previo)) sel.value = previo;
  }

  const nombreColegio = (g) => {
    const c = colegios.find((x) => x.id === g.colegio_id);
    return c ? `${c.nombre} · ${g.nombre}` : g.nombre;
  };

  async function recargar() {
    colegios = await Datos.colegios();
    grupos = await Datos.grupos();
    opciones($('sel-colegio'), colegios, (c) => c.nombre);
    ['sel-grupo-roster', 'sel-grupo-estado', 'sel-grupo-guias'].forEach((id) =>
      opciones($(id), grupos, nombreColegio));
    await pintarEstado();
    await pintarGuias();
    await contarPulseras();
  }

  /** Guias del sistema, con casilla de asignacion al grupo elegido. */
  async function pintarGuias() {
    const gid = $('sel-grupo-guias').value;
    const todos = await Datos.guias();
    const asignados = gid ? await Datos.guiasDe(gid) : [];
    const ids = new Set(asignados.map((g) => g.id));
    const lista = $('lista-guias-admin');

    lista.innerHTML = todos.map((g) =>
      `<li><span class="nombre">${g.nombre} ` +
      `<span class="num">${g.codigo}</span></span>` +
      `<button class="boton chico ${ids.has(g.id) ? 'activo' : ''}" ` +
      `data-guia="${g.id}">${ids.has(g.id) ? '✓ en el grupo' : 'Asignar'}</button></li>`
    ).join('');
    $('guias-vacio').classList.toggle('oculto', todos.length > 0);

    lista.querySelectorAll('[data-guia]').forEach((b) => {
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await Datos.asignarGuia({
            grupoId: gid, guiaId: b.dataset.guia,
            quitar: b.classList.contains('activo'),
          });
          await pintarGuias();
        } catch (e) { alert('No se pudo: ' + (e.message || e.codigo)); b.disabled = false; }
      });
    });
  }

  async function contarPulseras() {
    const p = await Datos.pulserasTodas();
    $('cuenta-pulseras').textContent = p.length
      ? `${p.length} pulseras dadas de alta.`
      : 'Todavía no hay pulseras dadas de alta.';
  }

  async function pintarEstado() {
    const gid = $('sel-grupo-estado').value;
    const cuerpo = $('cuerpo-estado');
    if (!gid) { cuerpo.innerHTML = ''; $('estado-vacio').classList.remove('oculto'); return; }

    const alumnos = await Datos.alumnosDe(gid);
    const pulseras = await Datos.pulserasTodas();
    const porId = {};
    pulseras.forEach((p) => { porId[p.id] = p.codigo; });

    cuerpo.innerHTML = alumnos
      .slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map((a) => {
        const cod = a.pulsera_id ? porId[a.pulsera_id] : null;
        return `<tr><td>${a.nombre}</td>` +
          `<td class="num">${cod || '—'}</td><td>` +
          (cod ? '<span class="insignia ok">activa</span>'
               : '<span class="insignia neutra">sin activar</span>') +
          '</td></tr>';
      }).join('');
    $('estado-vacio').classList.toggle('oculto', alumnos.length > 0);
  }

  /* ---------- acciones ---------- */

  async function conAviso(fn, exito) {
    try { const r = await fn(); await recargar(); if (exito) alert(exito(r)); }
    catch (e) { alert('No se pudo: ' + (e.message || e.codigo)); }
  }

  $('btn-colegio').addEventListener('click', () => {
    const n = $('in-colegio').value.trim();
    if (!n) return;
    conAviso(() => Datos.crearColegio(n), () => { $('in-colegio').value = ''; return `Colegio "${n}" creado.`; });
  });

  $('btn-grupo').addEventListener('click', () => {
    const n = $('in-grupo').value.trim();
    const c = $('sel-colegio').value;
    if (!n || !c) return alert('Elige un colegio y escribe el nombre del grupo.');
    conAviso(() => Datos.crearGrupo({ colegioId: c, nombre: n }),
             () => { $('in-grupo').value = ''; return `Grupo "${n}" creado.`; });
  });

  $('in-roster').addEventListener('input', () => {
    const n = $('in-roster').value.split('\n').map((s) => s.trim()).filter(Boolean).length;
    $('cuenta-roster').textContent = n ? `${n} nombre${n === 1 ? '' : 's'} detectado${n === 1 ? '' : 's'}` : '';
  });

  $('btn-roster').addEventListener('click', () => {
    const gid = $('sel-grupo-roster').value;
    const nombres = $('in-roster').value.split('\n')
      .map((s) => s.trim()).filter(Boolean);
    if (!gid) return alert('Elige un grupo.');
    if (!nombres.length) return alert('Pega al menos un nombre.');
    conAviso(() => Datos.cargarRoster({ grupoId: gid, nombres }),
             (n) => { $('in-roster').value = ''; $('cuenta-roster').textContent = '';
                      return `${n} alumnos cargados.`; });
  });

  $('btn-pulseras').addEventListener('click', () => {
    const pre = $('in-prefijo').value.trim().toUpperCase();
    const desde = parseInt($('in-desde').value, 10);
    const hasta = parseInt($('in-hasta').value, 10);
    if (isNaN(desde) || isNaN(hasta) || hasta < desde) return alert('Rango inválido.');
    if (hasta - desde > 2000) return alert('Máximo 2000 pulseras por vez.');

    const ancho = String(hasta).length < 3 ? 3 : String(hasta).length;
    const codigos = [];
    for (let i = desde; i <= hasta; i++) codigos.push(pre + String(i).padStart(ancho, '0'));
    conAviso(() => Datos.cargarPulseras(codigos),
             () => `${codigos.length} pulseras dadas de alta (${codigos[0]} … ${codigos[codigos.length - 1]}).`);
  });

  $('btn-liberar').addEventListener('click', () => {
    const gid = $('sel-grupo-estado').value;
    if (!gid) return;
    if (!confirm('¿Liberar las pulseras de este grupo?\n\n' +
                 'Los alumnos quedan sin pulsera y podrán registrarse de nuevo. ' +
                 'El historial de marcajes se conserva.')) return;
    conAviso(() => Datos.liberarGrupo(gid), (n) => `${n} pulseras liberadas.`);
  });

  $('btn-guia').addEventListener('click', () => {
    const nombre = $('in-guia-nombre').value.trim();
    const codigo = $('in-guia-codigo').value.trim().toUpperCase();
    const email = $('in-guia-email').value.trim().toLowerCase();
    if (!nombre || !codigo) return alert('Escribe al menos nombre y código del guía.');
    conAviso(() => Datos.crearGuia({ nombre, codigo, email }), () => {
      $('in-guia-nombre').value = ''; $('in-guia-codigo').value = '';
      $('in-guia-email').value = '';
      return `Guía "${nombre}" creado.`;
    });
  });

  $('sel-grupo-guias').addEventListener('change', pintarGuias);
  $('sel-grupo-estado').addEventListener('change', pintarEstado);

  /* ---------- arranque ---------- */

  (async function () {
    await Auth.exigir('Acceso de administración', 'admin');
    $('banner-demo').classList.toggle('oculto', !Datos.esDemo());
    try { await recargar(); }
    catch (e) {
      document.querySelector('main').insertAdjacentHTML('afterbegin',
        `<div class="aviso malo"><span>✕</span><span>No se pudo conectar: ${e.message}</span></div>`);
    }
  })();
})();
