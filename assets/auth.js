/* ============================================================
   Acceso de guias y administracion.

   Dos modos, segun CONFIG.ACCESO_SUPABASE:

   · false (por defecto) — lista de usuarios en config.js. Evita
     que un alumno curioso entre al panel del guia, pero NO es
     seguridad: las claves viajan en el codigo de la pagina y la
     clave publica de Supabase permite llamar a la base directo.
   · true — Supabase Auth. Ahi si mandan las politicas RLS, que
     es lo unico que un navegador no puede saltarse.

   El alumno nunca pasa por aqui: su QR es su credencial.

   La sesion se guarda, asi que el guia entra una vez antes de
   salir y sigue dentro todo el viaje aunque se quede sin señal.
   ============================================================ */
(function (global) {
  'use strict';

  const CLAVE = 'agps_sesion';
  const CFG = global.CONFIG;

  const guardar = (v) => { try { localStorage.setItem(CLAVE, JSON.stringify(v)); } catch (e) {} };
  const leerGuardada = () => {
    try { return JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { return null; }
  };

  let sesion = leerGuardada();

  const usaSupabase = () =>
    !!(CFG.ACCESO_SUPABASE && CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

  const Auth = {
    sesion: () => sesion,
    esAdmin: () => !!(sesion && sesion.rol === 'admin'),

    async revisar() {
      if (!usaSupabase()) return sesion;
      try {
        const { data } = await global.Datos.cliente().auth.getSession();
        if (data && data.session) {
          sesion = { usuario: data.session.user.email, nombre: data.session.user.email,
                     rol: 'guia', remota: true };
          guardar(sesion);
        } else {
          sesion = null;
        }
      } catch (e) { /* sin red: vale la sesion guardada */ }
      return sesion;
    },

    async entrar(usuario, clave) {
      usuario = String(usuario || '').trim().toLowerCase();

      if (usaSupabase()) {
        const { data, error } = await global.Datos.cliente()
          .auth.signInWithPassword({ email: usuario, password: clave });
        if (error) {
          throw new Error(/Invalid login/i.test(error.message)
            ? 'Usuario o contraseña incorrectos.' : error.message);
        }
        sesion = { usuario: data.user.email, nombre: data.user.email,
                   rol: 'guia', remota: true };
        guardar(sesion);
        return sesion;
      }

      const u = (CFG.ACCESO || []).find(
        (x) => x.usuario.toLowerCase() === usuario && x.clave === clave);
      if (!u) throw new Error('Usuario o contraseña incorrectos.');
      sesion = { usuario: u.usuario, nombre: u.nombre, rol: u.rol || 'guia' };
      guardar(sesion);
      return sesion;
    },

    async salir() {
      sesion = null;
      try { localStorage.removeItem(CLAVE); } catch (e) {}
      if (usaSupabase()) {
        try { await global.Datos.cliente().auth.signOut(); } catch (e) {}
      }
      location.reload();
    },

    /**
     * Muestra la pantalla de acceso y resuelve cuando hay sesion.
     * Si ya la habia, resuelve enseguida sin pintar nada.
     * @param {string} rol  'admin' exige una cuenta de administracion.
     */
    async exigir(titulo, rol) {
      await Auth.revisar();
      if (sesion && (!rol || rol !== 'admin' || sesion.rol === 'admin')) return sesion;
      if (sesion && rol === 'admin') {
        // Sesion de guia intentando entrar a administracion
        sesion = null;
        try { localStorage.removeItem(CLAVE); } catch (e) {}
      }
      return new Promise((resolver) => pintarAcceso(titulo, rol, resolver));
    },
  };

  function pintarAcceso(titulo, rol, resolver) {
    const capa = document.createElement('div');
    capa.className = 'capa acceso';
    capa.innerHTML =
      '<form class="dialogo" id="f-acceso" autocomplete="on">' +
      '<div class="marca grande" style="justify-content:center;margin-bottom:6px">' +
      '<span class="punto"></span> Asistencia GPS</div>' +
      `<p class="sub" style="text-align:center">${titulo || 'Acceso para el equipo'}</p>` +
      '<label for="a-usuario">Usuario</label>' +
      '<input type="text" id="a-usuario" autocomplete="username" required ' +
      'autocapitalize="none" autocorrect="off" spellcheck="false" ' +
      `placeholder="${usaSupabase() ? 'correo@colegio.edu.pe' : 'guia1'}" style="width:100%">` +
      '<label for="a-clave">Contraseña</label>' +
      '<input type="password" id="a-clave" autocomplete="current-password" required ' +
      'style="width:100%">' +
      '<div class="aviso malo oculto" id="a-error" style="margin:16px 0 0"></div>' +
      '<div class="acciones" style="justify-content:stretch">' +
      '<button type="submit" class="boton primario grande" id="a-entrar">Entrar</button>' +
      '</div>' +
      '<p class="nota" style="text-align:center;margin-top:16px">' +
      (rol === 'admin' ? 'Se necesita una cuenta de administración.'
                       : 'Si no tienes acceso, pídeselo a administración.') +
      '</p></form>';
    document.body.appendChild(capa);

    const err = capa.querySelector('#a-error');
    const btn = capa.querySelector('#a-entrar');
    capa.querySelector('#a-usuario').focus();

    capa.querySelector('#f-acceso').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      err.classList.add('oculto');
      btn.disabled = true; btn.textContent = 'Entrando…';
      try {
        const s = await Auth.entrar(
          capa.querySelector('#a-usuario').value,
          capa.querySelector('#a-clave').value);
        if (rol === 'admin' && s.rol !== 'admin') {
          throw new Error('Esa cuenta no tiene acceso a administración.');
        }
        capa.remove();
        resolver(s);
      } catch (e) {
        err.textContent = e.message || 'No se pudo entrar.';
        err.classList.remove('oculto');
        btn.disabled = false; btn.textContent = 'Entrar';
      }
    });
  }

  global.Auth = Auth;
})(window);
