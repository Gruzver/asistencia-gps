/* ============================================================
   Pantalla del alumno.

   Dos recorridos segun el estado de la pulsera:

   · Sin registrar → colegio, grupo, nombre, confirmacion. Tres
     toques y ninguna escritura obligatoria. Al confirmar, la
     pulsera queda atada a esa identidad y a ese telefono.
   · Registrada → directo a marcar la parada abierta.

   Sin ubicacion no hay asistencia, y sin precision de satelite
   tampoco: registrar una lectura de antena acusaria de "fuera de
   zona" a quien si estaba presente.
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const PASOS = ['p-carga', 'p-escanear', 'p-colegio', 'p-grupo', 'p-nombre',
                 'p-confirmar', 'p-listo', 'p-gps', 'p-ok', 'p-espera', 'p-error'];
  const RECORDADA = 'agps_mi_pulsera';

  function ir(id) {
    PASOS.forEach((p) => $(p).classList.toggle('oculto', p !== id));
    window.scrollTo(0, 0);
  }

  function fallo(titulo, mensaje, ayuda) {
    $('e-titulo').textContent = titulo;
    $('e-mensaje').textContent = mensaje;
    const a = $('e-ayuda');
    if (ayuda) { a.innerHTML = ayuda; a.classList.remove('oculto'); }
    else a.classList.add('oculto');
    ir('p-error');
  }

  /* De donde sale el codigo de la pulsera, en orden:
     1. El enlace, si vino de un QR con URL (?p=, ?id=, ?nfc=)
     2. La pulsera recordada de la ultima vez
     3. La camara: el alumno escanea el numero impreso en su pulsera

     La opcion 3 es la que importa en campo. Las pulseras traen un QR
     con un numero suelto, y eso NO es una limitacion: un numero cabe
     en un QR de 21x21 modulos mientras que una URL necesita 33x33,
     lo que en una pulsera de 12 mm deja cada modulo por debajo del
     tamaño que un movil lee con fiabilidad. El QR corto es el bueno;
     lo que sobra es pretender que abra una web. */
  const params = new URLSearchParams(location.search);
  let codigo = (params.get('p') || params.get('id') || params.get('nfc') || '')
    .trim().toUpperCase();

  const recordar = (c) => { try { localStorage.setItem(RECORDADA, c); } catch (e) {} };
  const olvidar = () => { try { localStorage.removeItem(RECORDADA); } catch (e) {} };
  const recordada = () => {
    try { return localStorage.getItem(RECORDADA) || ''; } catch (e) { return ''; }
  };

  const est = { alumno: null, grupo: null, colegio: null, parada: null, roster: [] };

  /* ---------- lista de opciones reutilizable ---------- */

  function pintarOpciones(contenedor, items, alElegir) {
    contenedor.innerHTML = '';
    if (!items.length) {
      contenedor.innerHTML = '<p class="vacio-mini">No hay opciones disponibles.</p>';
      return;
    }
    items.forEach((it) => {
      const b = document.createElement('button');
      b.className = 'opcion';
      b.innerHTML = `<span>${it.nombre}</span><span class="flecha">›</span>`;
      b.addEventListener('click', () => alElegir(it));
      contenedor.appendChild(b);
    });
  }

  /* ---------- arranque ---------- */

  let escaner = null;

  /** Abre la camara para leer el numero impreso en la pulsera. */
  async function escanearPulsera() {
    ir('p-escanear');
    $('esc-error').classList.add('oculto');

    if (!escaner) {
      escaner = new Escaner($('video'), $('lienzo'));
      escaner.alLeer = function (texto) {
        const leido = Escaner.codigoDe(texto);
        if (!leido) {
          $('esc-error').textContent = 'Ese código no se reconoce. Prueba otra vez.';
          $('esc-error').classList.remove('oculto');
          return;
        }
        escaner.detener();
        codigo = leido;
        recordar(codigo);
        iniciar();
      };
    }

    try {
      await escaner.iniciar();
    } catch (e) {
      const c = $('esc-error');
      c.innerHTML = e.codigo === 'PERMISO_DENEGADO'
        ? '<span>!</span><span>No diste permiso de cámara. Actívalo en los ajustes ' +
          'del navegador, o escribe el número a mano.</span>'
        : '<span>!</span><span>No se pudo abrir la cámara. Escribe el número a mano.</span>';
      c.classList.remove('oculto');
    }
  }

  async function iniciar() {
    if (escaner) escaner.detener();

    if (!codigo) codigo = recordada();
    if (!codigo) return escanearPulsera();

    $('chip-pulsera').textContent = 'Pulsera ' + codigo;
    $('chip-pulsera').classList.remove('oculto');
    ir('p-carga');

    try {
      const r = await Datos.pulsera(codigo);
      if (!r.existe) {
        // Puede ser un QR ajeno o un numero mal leido: se olvida para
        // no dejar al alumno atrapado con un codigo invalido.
        olvidar();
        return fallo('Pulsera no reconocida',
          `El código ${codigo} no está dado de alta en el sistema.`,
          'Comprueba que escaneaste tu pulsera. Si es la tuya, ' +
          'avisa al guía para que la registre.');
      }
      recordar(codigo);
      $('btn-otra').classList.remove('oculto');
      if (r.alumno) {
        est.alumno = r.alumno;
        est.grupo = r.grupo;
        return revisarParada();
      }
      // Sin dueño: arranca el registro
      const colegios = await Datos.colegios();
      pintarOpciones($('lista-colegios'), colegios, (c) => elegirColegio(c));
      ir('p-colegio');
    } catch (e) {
      fallo('Sin conexión', e.message,
        'Revisa tu internet y toca Reintentar.');
    }
  }

  /* ---------- registro ---------- */

  async function elegirColegio(c) {
    est.colegio = c;
    $('grupo-colegio').textContent = c.nombre;
    try {
      const grupos = await Datos.grupos(c.id);
      pintarOpciones($('lista-grupos'), grupos, (g) => elegirGrupo(g));
      ir('p-grupo');
    } catch (e) { fallo('No se pudo cargar', e.message); }
  }

  async function elegirGrupo(g) {
    est.grupo = g;
    $('nombre-grupo').textContent = `${est.colegio.nombre} · ${g.nombre}`;
    try {
      est.roster = await Datos.rosterLibre(g.id);
      if (!est.roster.length) {
        return fallo('Grupo completo',
          'Ya no quedan nombres libres en este grupo.',
          'Puede que hayas elegido el grupo equivocado, o que alguien ' +
          'haya tomado tu nombre por error. Avisa al guía.');
      }
      $('buscar-nombre').value = '';
      filtrarNombres();
      ir('p-nombre');
      setTimeout(() => $('buscar-nombre').focus(), 250);
    } catch (e) { fallo('No se pudo cargar', e.message); }
  }

  function filtrarNombres() {
    const q = $('buscar-nombre').value.trim().toLowerCase();
    const lista = q
      ? est.roster.filter((a) => a.nombre.toLowerCase().includes(q))
      : est.roster;
    pintarOpciones($('lista-nombres'), lista, (a) => {
      est.candidato = a;
      $('conf-nombre').textContent = a.nombre;
      $('conf-grupo').textContent = `${est.colegio.nombre} · ${est.grupo.nombre}`;
      ir('p-confirmar');
    });
  }

  async function confirmar() {
    const btn = $('btn-confirmar');
    btn.disabled = true;
    btn.textContent = 'Activando…';
    try {
      est.alumno = await Datos.registrar({
        codigo, alumnoId: est.candidato.id,
      });
      await revisarParada();
    } catch (e) {
      const msg = {
        PULSERA_YA_ASIGNADA: 'Esta pulsera ya fue activada por otra persona.',
        ALUMNO_YA_REGISTRADO: 'Ese nombre ya tiene una pulsera activa.',
        PULSERA_DESCONOCIDA: 'La pulsera no está dada de alta.',
      }[e.codigo] || e.message;
      fallo('No se pudo activar', msg, 'Avisa al guía para resolverlo.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sí, soy yo — activar pulsera';
    }
  }

  /* ---------- marcaje ---------- */

  async function revisarParada() {
    try {
      const parada = await Datos.paradaAbierta(est.alumno.grupo_id);
      if (!parada) {
        $('espera-nombre').textContent = est.alumno.nombre;
        return ir('p-espera');
      }
      est.parada = parada;

      const { marcajes } = await Datos.progreso(parada.id);
      const mio = marcajes.find((m) => m.alumno_id === est.alumno.id);
      if (mio) return mostrarHecho(mio, true);

      $('listo-parada').textContent = parada.nombre;
      $('listo-nombre').textContent = est.alumno.nombre;
      ir('p-listo');
    } catch (e) {
      fallo('No se pudo consultar', e.message);
    }
  }

  function progresoGPS(l) {
    const p = l.precision;
    const pct = Math.max(0, Math.min(100,
      ((Math.log10(2000) - Math.log10(Math.max(p, 10))) /
       (Math.log10(2000) - 1)) * 100));
    const barra = $('gps-barra');
    barra.style.width = pct.toFixed(0) + '%';
    barra.classList.toggle('bien', p <= CONFIG.PRECISION_MAXIMA);
    $('gps-precision').textContent = 'precisión ± ' + Geo.metros(p);
    const chip = $('gps-estado');
    if (p <= CONFIG.PRECISION_OBJETIVO)    { chip.className = 'insignia ok'; chip.textContent = 'GPS fijo'; }
    else if (p <= CONFIG.PRECISION_MAXIMA) { chip.className = 'insignia ok'; chip.textContent = 'aceptable'; }
    else                                   { chip.className = 'insignia fuera'; chip.textContent = 'aún por antena'; }
  }

  async function marcar() {
    ir('p-gps');
    $('gps-barra').style.width = '0';
    $('gps-barra').classList.remove('bien');
    $('gps-precision').textContent = 'esperando primera lectura…';
    $('gps-estado').className = 'insignia neutra';
    $('gps-estado').textContent = 'buscando';

    let pos;
    try {
      pos = await Geo.ubicacion(progresoGPS);
    } catch (g) {
      if (g.codigo === 'PERMISO_DENEGADO') {
        return fallo('Ubicación bloqueada',
          'Sin tu ubicación no se puede registrar la asistencia.',
          Geo.ayudaPermiso());
      }
      if (g.codigo === 'SIN_HTTPS') return fallo('Conexión no segura', g.mensaje);
      return fallo('GPS no disponible',
        'Tu teléfono no pudo determinar dónde estás.',
        'Verifica que la ubicación esté encendida, sal a cielo abierto ' +
        'y toca Reintentar.');
    }

    if (!pos.fiable) {
      return fallo('Ubicación imprecisa',
        `La mejor lectura fue de ± ${Geo.metros(pos.precision)}, que viene de ` +
        'antena y no del GPS.',
        Geo.pareceEscritorio()
          ? '<strong>Estás en una computadora.</strong> No tiene GPS: calcula ' +
            'la posición por tu conexión y puede errar kilómetros.<br><br>' +
            'Abre este enlace <strong>en el celular</strong>.'
          : '<strong>Para lograr señal de GPS:</strong><br>' +
            '1. Sal a un espacio abierto, sin techo<br>' +
            '2. Activa la ubicación en "Alta precisión"<br>' +
            '3. Espera unos segundos sin moverte<br>' +
            '4. Toca Reintentar');
    }

    const captura = new Date().toISOString();
    try {
      // Datos.marcar encola solo si falla la red; el GPS ya se
      // capturo, que es lo que no se puede recuperar despues.
      const r = await Datos.marcar({
        codigo, lat: pos.lat, lon: pos.lon,
        precision: pos.precision, capturado_en: captura, origen: 'alumno',
        grupoId: est.alumno.grupo_id,
        paradaId: est.parada && est.parada.id,
        alumnoId: est.alumno.id,
        paradaLat: est.parada && est.parada.lat,
        paradaLon: est.parada && est.parada.lon,
        paradaRadio: est.parada && est.parada.radio,
      });
      mostrarHecho(r.marcaje, false, r.pendiente);
    } catch (e) {
      if (e.codigo === 'SIN_PARADA_ABIERTA') {
        $('espera-nombre').textContent = est.alumno.nombre;
        return ir('p-espera');
      }
      fallo('No se pudo registrar', e.message || e.codigo, 'Toca Reintentar.');
    }
  }

  const fila = (k, v) => `<div class="dato"><span>${k}</span><b>${v}</b></div>`;

  function mostrarHecho(m, previo, pendiente) {
    $('ok-titulo').textContent = pendiente ? 'Guardado sin señal'
                               : previo ? 'Ya marcaste aquí' : 'Asistencia registrada';
    $('ok-nombre').textContent = est.alumno.nombre;
    $('ok-datos').innerHTML =
      fila('Parada', est.parada ? est.parada.nombre : '--') +
      fila('Hora', Geo.horaSeg(m.creado_en)) +
      fila('Distancia', Geo.metros(m.distancia_m)) +
      (m.precision_m ? fila('Precisión', '± ' + Geo.metros(m.precision_m)) : '');

    const z = $('ok-zona');
    if (pendiente) {
      z.className = 'aviso info';
      z.innerHTML = '<span>◷</span><span><strong>Aquí no hay cobertura.</strong> ' +
        'Tu marcaje quedó guardado con esta hora y ubicación, y se enviará solo ' +
        'en cuanto vuelva la señal. No hace falta que hagas nada.</span>';
    } else if (m.estado === 'FUERA_ZONA') {
      z.className = 'aviso info';
      z.innerHTML = '<span>⚠</span><span><strong>Estás lejos del punto.</strong> ' +
        'Tu marcaje quedó registrado a ' + Geo.metros(m.distancia_m) +
        ' del grupo. Acércate: el guía lo está viendo.</span>';
    } else if (m.estado === 'EN_ZONA') {
      z.className = 'aviso bueno';
      z.innerHTML = '<span>✓</span><span>Estás con el grupo.</span>';
    } else {
      z.className = '';
      z.innerHTML = '';
    }
    ir('p-ok');
    // Con el marcaje ya resuelto es cuando hay atencion disponible
    // para proponer guardarlo en la pantalla de inicio.
    setTimeout(proponerInstalar, 900);
  }

  /* ---------- cola pendiente ---------- */

  /* ------------------------------------------------------------
     Aviso para guardar la app en la pantalla de inicio.

     El alumno llega la primera vez por el cartel de acceso, pero en
     la segunda parada no tiene forma de volver salvo buscar el
     cartel otra vez o rebuscar en el historial. Guardarlo en la
     pantalla de inicio lo convierte en un icono mas del telefono, y
     ademas hace que el service worker quede activo, que es lo que
     permite marcar sin señal.

     Se muestra al terminar un marcaje —cuando ya salio bien y hay
     atencion disponible— y nunca si ya se abrio como app instalada.
     ------------------------------------------------------------ */
  const CLAVE_INSTALAR = 'agps_instalar_visto';

  function proponerInstalar() {
    const instalada = window.matchMedia('(display-mode: standalone)').matches ||
                      window.navigator.standalone === true;
    let visto = false;
    try { visto = localStorage.getItem(CLAVE_INSTALAR) === '1'; } catch (e) {}
    if (instalada || visto) return;

    const ua = navigator.userAgent;
    $('instalar-pasos').innerHTML =
      /iPhone|iPad|iPod/i.test(ua)
        ? 'Toca <strong>Compartir</strong> abajo &#8593; y elige ' +
          '<strong>Añadir a pantalla de inicio</strong>.'
        : /Android/i.test(ua)
          ? 'Toca el menú <strong>⋮</strong> arriba y elige ' +
            '<strong>Añadir a pantalla de inicio</strong>.'
          : 'Guarda esta página en tus favoritos para volver rápido.';
    $('instalar').classList.remove('oculto');
  }

  $('btn-instalar-ok').addEventListener('click', () => {
    $('instalar').classList.add('oculto');
  });
  $('btn-instalar-no').addEventListener('click', () => {
    try { localStorage.setItem(CLAVE_INSTALAR, '1'); } catch (e) {}
    $('instalar').classList.add('oculto');
  });

  Datos.alCambiarPendientes(function (n) {
    const c = $('aviso-cola');
    if (!n) return c.classList.add('oculto');
    c.textContent = n === 1
      ? '1 marcaje esperando señal para enviarse'
      : `${n} marcajes esperando señal para enviarse`;
    c.classList.remove('oculto');
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  /* ---------- eventos ---------- */

  document.querySelectorAll('[data-volver]').forEach((b) => {
    b.addEventListener('click', () => ir(b.dataset.volver));
  });
  $('buscar-nombre').addEventListener('input', filtrarNombres);
  $('btn-confirmar').addEventListener('click', confirmar);
  $('btn-marcar').addEventListener('click', marcar);
  $('btn-revisar').addEventListener('click', revisarParada);
  $('btn-reintentar').addEventListener('click', () => {
    if (est.alumno) revisarParada(); else iniciar();
  });

  $('btn-manual').addEventListener('click', () => {
    const n = prompt('Escribe el número que aparece en tu pulsera:');
    if (!n || !n.trim()) return;
    if (escaner) escaner.detener();
    codigo = n.trim().toUpperCase();
    recordar(codigo);
    iniciar();
  });

  // Solo tiene sentido si alguien recibio una pulsera equivocada o
  // se la cambiaron: vuelve a empezar desde la camara.
  $('btn-otra').addEventListener('click', () => {
    if (!confirm('¿Escanear otra pulsera?\n\n' +
                 'Se olvidará la que tienes guardada en este teléfono.')) return;
    olvidar();
    codigo = '';
    est.alumno = null;
    $('chip-pulsera').classList.add('oculto');
    $('btn-otra').classList.add('oculto');
    escanearPulsera();
  });

  iniciar();
})();
