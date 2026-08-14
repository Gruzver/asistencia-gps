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

    const alumnos = (await Datos.alumnosDe(gid)).filter((a) => a.activo !== false);
    const pulseras = await Datos.pulserasTodas();
    const porId = {};
    pulseras.forEach((p) => { porId[p.id] = p.codigo; });

    // Nombres repetidos: el alumno se identifica eligiendo el suyo
    // de la lista, asi que dos iguales son indistinguibles y uno
    // acabara tomando la identidad del otro. Hay que avisarlo antes
    // de salir de viaje, no descubrirlo en el mirador.
    const cuenta = {};
    alumnos.forEach((a) => {
      const k = a.nombre.trim().toLowerCase();
      cuenta[k] = (cuenta[k] || 0) + 1;
    });
    const repes = Object.entries(cuenta).filter(([, n]) => n > 1);
    const aviso = $('aviso-duplicados');
    if (repes.length) {
      aviso.innerHTML = '<span>⚠</span><span><strong>Hay nombres repetidos.</strong> ' +
        'Al registrarse, los alumnos eligen su nombre de la lista: si hay dos iguales ' +
        'no podrán distinguirlos. Edítalos para diferenciarlos (por ejemplo, añadiendo ' +
        'la inicial del segundo apellido).<br>' +
        repes.map(([n, c]) => `“${n}” ×${c}`).join(' · ') + '</span>';
      aviso.classList.remove('oculto');
    } else {
      aviso.classList.add('oculto');
    }

    cuerpo.innerHTML = alumnos
      .slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map((a) => {
        const cod = a.pulsera_id ? porId[a.pulsera_id] : null;
        const dup = cuenta[a.nombre.trim().toLowerCase()] > 1;
        return `<tr><td>${a.nombre}` +
          (dup ? ' <span class="alerta" title="Nombre repetido">⚠</span>' : '') + '</td>' +
          `<td class="num">${cod || '—'}</td><td>` +
          (cod ? '<span class="insignia ok">activa</span>'
               : '<span class="insignia neutra">sin activar</span>') +
          '</td><td class="acciones-celda">' +
          `<button class="boton chico" data-editar="${a.id}" data-nombre="${
            a.nombre.replace(/"/g, '&quot;')}">Nombre</button>` +
          (cod ? `<button class="boton chico" data-liberar="${a.id}">Liberar</button>` : '') +
          `<button class="boton chico" data-borrar="${a.id}">Quitar</button>` +
          '</td></tr>';
      }).join('');
    $('estado-vacio').classList.toggle('oculto', alumnos.length > 0);

    cuerpo.querySelectorAll('[data-editar]').forEach((b) => {
      b.addEventListener('click', () => {
        const nuevo = prompt('Nombre del alumno:', b.dataset.nombre);
        if (!nuevo || nuevo.trim() === b.dataset.nombre) return;
        conAviso(() => Datos.editarAlumno({ id: b.dataset.editar, nombre: nuevo.trim() }));
      });
    });

    cuerpo.querySelectorAll('[data-liberar]').forEach((b) => {
      b.addEventListener('click', () => {
        if (!confirm('¿Liberar la pulsera de este alumno?\n\n' +
                     'Podrá registrarse de nuevo con otra pulsera. ' +
                     'Sus marcajes se conservan.')) return;
        conAviso(() => Datos.liberarPulsera(b.dataset.liberar));
      });
    });

    cuerpo.querySelectorAll('[data-borrar]').forEach((b) => {
      b.addEventListener('click', () => {
        if (!confirm('¿Quitar a este alumno del grupo?\n\n' +
                     'Si ya tiene marcajes se desactiva en vez de borrarse, ' +
                     'para no dejar huecos en el historial.')) return;
        conAviso(() => Datos.eliminarAlumno(b.dataset.borrar),
                 (r) => r.desactivado
                   ? 'Tenía marcajes: se desactivó y se conserva el historial.'
                   : 'Alumno eliminado.');
      });
    });
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

  /* ============================================================
     Alta de un lote de pulseras por camara.

     Al llegar stock nuevo hay que registrar que numeros existen.
     Teclearlos uno a uno es lento y cuela erratas; escanearlos en
     cadena no. Se acumulan en memoria y se guardan de una vez, para
     no hacer una escritura por pulsera.
     ============================================================ */

  let escaner = null;
  const loteNuevas = [];        // orden de escaneo, sin repetir
  let yaExistentes = new Set();

  function avisoEsc(texto, clase) {
    const el = $('esc-mensaje');
    el.textContent = texto;
    el.className = 'escaner-mensaje ' + (clase || '');
    if (navigator.vibrate) navigator.vibrate(clase === 'mal' ? [70, 60, 70] : 45);
  }

  function pintarLote() {
    $('esc-nuevas').textContent = loteNuevas.length;
    $('esc-ultimos').innerHTML = loteNuevas.slice(-4).reverse()
      .map((c) => `<div class="reciente bien">${c}</div>`).join('');
    $('btn-guardar-lote').classList.toggle('oculto', loteNuevas.length === 0);
    $('btn-guardar-lote').textContent =
      `Guardar ${loteNuevas.length} pulsera${loteNuevas.length === 1 ? '' : 's'}`;
  }

  function alEscanearPulsera(texto) {
    const codigo = Escaner.codigoDe(texto);
    if (!codigo) return avisoEsc('Código no reconocido', 'mal');
    if (yaExistentes.has(codigo)) return avisoEsc(`${codigo} — ya estaba dada de alta`, 'aviso');
    if (loteNuevas.includes(codigo)) return avisoEsc(`${codigo} — ya la escaneaste`, 'aviso');

    loteNuevas.push(codigo);
    avisoEsc(codigo, 'bien');
    pintarLote();
  }

  async function abrirEscanerPulseras() {
    loteNuevas.length = 0;
    yaExistentes = new Set((await Datos.pulserasTodas()).map((p) => p.codigo));
    pintarLote();
    avisoEsc('Apunta al código de la pulsera');
    $('v-escaner').classList.remove('oculta');

    if (!escaner) {
      escaner = new Escaner($('video'), $('lienzo'));
      escaner.alLeer = alEscanearPulsera;
    }
    try {
      await escaner.iniciar();
    } catch (e) {
      avisoEsc(e.codigo === 'PERMISO_DENEGADO'
        ? 'Permiso de cámara denegado. Actívalo en los ajustes del navegador.'
        : 'No se pudo abrir la cámara: ' + (e.mensaje || ''), 'mal');
    }
  }

  function cerrarEscanerPulseras() {
    if (escaner) escaner.detener();
    $('v-escaner').classList.add('oculta');
  }

  $('btn-escanear-pulseras').addEventListener('click', abrirEscanerPulseras);

  $('btn-cerrar-escaner').addEventListener('click', () => {
    if (loteNuevas.length &&
        !confirm(`Tienes ${loteNuevas.length} pulseras escaneadas sin guardar.\n\n` +
                 '¿Salir y descartarlas?')) return;
    cerrarEscanerPulseras();
  });

  $('btn-guardar-lote').addEventListener('click', async function () {
    this.disabled = true;
    const n = loteNuevas.length;
    try {
      await Datos.cargarPulseras(loteNuevas.slice());
      cerrarEscanerPulseras();
      await recargar();
      alert(`${n} pulsera${n === 1 ? '' : 's'} dada${n === 1 ? '' : 's'} de alta.`);
    } catch (e) {
      alert('No se pudo guardar: ' + (e.message || e.codigo));
    } finally {
      this.disabled = false;
    }
  });

  $('in-pulseras-lista').addEventListener('input', () => {
    const n = $('in-pulseras-lista').value.split('\n')
      .map((x) => x.trim()).filter(Boolean).length;
    $('cuenta-lista').textContent = n ? `${n} código${n === 1 ? '' : 's'} detectado${n === 1 ? '' : 's'}` : '';
  });

  $('btn-pulseras-lista').addEventListener('click', () => {
    const codigos = [...new Set($('in-pulseras-lista').value.split('\n')
      .map((x) => x.trim().toUpperCase()).filter(Boolean))];
    if (!codigos.length) return alert('Pega al menos un número.');
    conAviso(() => Datos.cargarPulseras(codigos), (n) => {
      $('in-pulseras-lista').value = ''; $('cuenta-lista').textContent = '';
      return `${n} pulseras dadas de alta.`;
    });
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

  $('btn-imprimir').addEventListener('click', () => window.print());
  $('btn-purgar').addEventListener('click', () => {
    const dias = Number($('sel-retencion').value);
    if (!confirm(`¿Borrar los marcajes anteriores a ${dias} días?\n\n` +
                 'Se pierden ubicación y hora de esos registros, para siempre.\n' +
                 'Asegúrate de haber exportado el informe desde Historial.')) return;
    if (!confirm('Última confirmación: esto no se puede deshacer.')) return;
    conAviso(() => Datos.purgarMarcajes(dias),
             (n) => n ? `${n} marcajes borrados.` : 'No había marcajes tan antiguos.');
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
