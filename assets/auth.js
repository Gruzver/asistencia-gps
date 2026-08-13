/* ============================================================
   Acceso de guias y administracion.

   Con Supabase conectado usa autenticacion real por correo y
   contraseña: las politicas RLS son las que impiden de verdad
   que alguien con el enlace abra paradas, no una comprobacion
   en el navegador —que cualquiera puede saltarse—.

   Las cuentas las crea el admin desde el panel de Supabase
   (Authentication → Users → Add user). No hay registro publico
   a proposito.

   En modo local, sin Supabase, se acepta una lista de claves de
   prueba. Eso NO es seguridad: existe solo para poder recorrer
   el flujo antes de conectar la base.

   La sesion se guarda, asi que el guia entra una vez antes de
   salir y sigue dentro todo el viaje aunque se quede sin señal.
   ============================================================ */
(function (global) {
  'use strict';

  const CLAVE = 'agps_sesion';

  // Solo para modo local. En cuanto hay Supabase, esto se ignora.
  const DEMO = [
    { email: 'guia@demo', clave: 'guia123',  nombre: 'Guía principal' },
    { email: 'guia2@demo', clave: 'guia123', nombre: 'Guía de apoyo' },
    { email: 'admin@demo', clave: 'admin123', nombre: 'Administración' },
  ];

  const guardar = (v) => { try { localStorage.setItem(CLAVE, JSON.stringify(v)); } catch (e) {} };
  const leerLocal = () => {
    try { return JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { return null; }
  };

  let sesion = leerLocal();

  const Auth = {
    esLocal: () => !!(global.Datos && global.Datos.esDemo()),
    sesion: () => sesion,

    async revisar() {
      if (this && Auth.esLocal()) return sesion;
      try {
        const sb = global.Datos.cliente();
        const { data } = await sb.auth.getSession();
        if (data && data.session) {
          sesion = { email: data.session.user.email, remota: true };
          guardar(sesion);
        } else {
          sesion = null;
        }
      } catch (e) { /* sin red: vale la sesion guardada */ }
      return sesion;
    },

    async entrar(email, clave) {
      email = String(email || '').trim().toLowerCase();

      if (Auth.esLocal()) {
        const u = DEMO.find((x) => x.email === email && x.clave === clave);
        if (!u) throw new Error('Correo o contraseña incorrectos.');
        sesion = { email: u.email, nombre: u.nombre, local: true };
        guardar(sesion);
        return sesion;
      }

      const sb = global.Datos.cliente();
      const { data, error } = await sb.auth.signInWithPassword({
        email, password: clave,
      });
      if (error) {
        throw new Error(
          /Invalid login/i.test(error.message)
            ? 'Correo o contraseña incorrectos.'
            : error.message);
      }
      sesion = { email: data.user.email, remota: true };
      guardar(sesion);
      return sesion;
    },

    async salir() {
      sesion = null;
      try { localStorage.removeItem(CLAVE); } catch (e) {}
      if (!Auth.esLocal()) {
        try { await global.Datos.cliente().auth.signOut(); } catch (e) {}
      }
      location.reload();
    },

    /**
     * Muestra la pantalla de acceso y resuelve cuando hay sesion.
     * Si ya la habia, resuelve enseguida sin pintar nada.
     */
    async exigir(titulo) {
      await Auth.revisar();
      if (sesion) return sesion;
      return new Promise((resolver) => pintarAcceso(titulo, resolver));
    },
  };

  function pintarAcceso(titulo, resolver) {
    const capa = document.createElement('div');
    capa.className = 'capa acceso';
    capa.innerHTML =
      '<form class="dialogo" id="f-acceso">' +
      '<div class="marca grande" style="justify-content:center;margin-bottom:6px">' +
      '<span class="punto"></span> Asistencia GPS</div>' +
      `<p class="sub" style="text-align:center">${titulo || 'Acceso para el equipo'}</p>` +
      '<label for="a-email">Correo</label>' +
      '<input type="email" id="a-email" autocomplete="username" required ' +
      'placeholder="guia@colegio.edu.pe" style="width:100%">' +
      '<label for="a-clave">Contraseña</label>' +
      '<input type="password" id="a-clave" autocomplete="current-password" required ' +
      'style="width:100%">' +
      '<div class="aviso malo oculto" id="a-error" style="margin:16px 0 0"></div>' +
      '<div class="acciones" style="justify-content:stretch">' +
      '<button type="submit" class="boton primario grande" id="a-entrar">Entrar</button>' +
      '</div>' +
      (Auth.esLocal()
        ? '<p class="nota" style="text-align:center;margin-top:16px">' +
          'Modo local · prueba con <b>guia@demo</b> / <b>guia123</b><br>' +
          'o <b>admin@demo</b> / <b>admin123</b></p>'
        : '<p class="nota" style="text-align:center;margin-top:16px">' +
          'Si no tienes acceso, pídeselo a administración.</p>') +
      '</form>';
    document.body.appendChild(capa);

    const err = capa.querySelector('#a-error');
    const btn = capa.querySelector('#a-entrar');
    capa.querySelector('#a-email').focus();

    capa.querySelector('#f-acceso').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      err.classList.add('oculto');
      btn.disabled = true; btn.textContent = 'Entrando…';
      try {
        const s = await Auth.entrar(
          capa.querySelector('#a-email').value,
          capa.querySelector('#a-clave').value);
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
