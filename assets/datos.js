/* ============================================================
   Capa de datos.

   Dos motores tras la misma interfaz:

   · supabase — Postgres real con websockets. El guia recibe
     cada marcaje empujado, sin preguntar.
   · local    — todo en localStorage. Permite recorrer el flujo
     entero sin cuenta creada. El tiempo real se emula con el
     evento storage, que si cruza pestañas del mismo navegador.

   Las escrituras sensibles (registro y marcaje) van siempre por
   funciones de la base: la distancia y el estado los decide el
   servidor, para que el cliente no pueda declararse "en zona".
   ============================================================ */
(function (global) {
  'use strict';

  const CFG = global.CONFIG;
  const CLAVE_LOCAL = 'agps_local_v1';
  const CLAVE_DEVICE = 'agps_device';

  /* ---------- identidad del dispositivo ---------- */

  /**
   * Identificador estable por navegador. No es infalible —se va
   * si borran datos del sitio— pero basta para el proposito: no
   * bloquea a nadie, solo delata cuando una pulsera se marca
   * desde un telefono distinto al del registro.
   */
  function deviceId() {
    let id;
    try {
      id = localStorage.getItem(CLAVE_DEVICE);
      if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID()
                                : String(Date.now()) + Math.random());
        localStorage.setItem(CLAVE_DEVICE, id);
      }
    } catch (e) {
      id = 'sin-almacenamiento';
    }
    return id;
  }

  /* ---------- utilidades ---------- */

  function distancia(lat1, lon1, lat2, lon2) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }

  const uuid = () =>
    crypto.randomUUID ? crypto.randomUUID()
                      : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);

  class ErrorDatos extends Error {
    constructor(codigo, mensaje) { super(mensaje || codigo); this.codigo = codigo; }
  }

  /* ============================================================
     Motor local
     ============================================================ */

  const local = {
    _cache: null,

    _semilla() {
      const cId = uuid(), gA = uuid(), gB = uuid();
      const nombres = [
        'Ana Lucia Ramirez Soto', 'Brenda Sofia Quispe Loayza',
        'Carla Daniela Mendoza Rios', 'Diana Paola Escalante Vera',
        'Elena Mariana Torres Puma', 'Fiorella Nicole Ayala Cruz',
        'Gabriela Rocio Salas Nina', 'Helena Victoria Pinto Chura',
        'Irene Camila Vargas Ticona', 'Julia Antonella Rojas Mamani',
        'Karina Belen Flores Apaza', 'Lucia Fernanda Huaman Coila',
      ];
      const nombresB = [
        'Marina Esther Zevallos Lipa', 'Natalia Grace Ibanez Suca',
        'Olivia Renata Castro Yana', 'Paula Alejandra Guzman Arce',
        'Rosa Milagros Delgado Hancco', 'Sara Valentina Nunez Machaca',
      ];

      const alumnos = []
        .concat(nombres.map((n) => ({ id: uuid(), grupo_id: gA, nombre: n })))
        .concat(nombresB.map((n) => ({ id: uuid(), grupo_id: gB, nombre: n })))
        .concat([
          { id: uuid(), grupo_id: gA, nombre: 'Gruzver Phocco' },
          { id: uuid(), grupo_id: gA, nombre: 'Franck Anthony' },
        ])
        .map((a) => Object.assign(a, {
          pulsera_id: null, device_id: null, registrado_en: null, activo: true,
        }));

      // 40 pulseras fisicas con codigo corto y estable
      const pulseras = [];
      for (let i = 1; i <= 40; i++) {
        pulseras.push({ id: uuid(), codigo: 'PL' + String(i).padStart(3, '0'), activa: true });
      }

      return {
        colegios: [{ id: cId, nombre: 'Colegio Demo' }],
        grupos: [
          { id: gA, colegio_id: cId, nombre: '5A', activo: true },
          { id: gB, colegio_id: cId, nombre: '5B', activo: true },
        ],
        pulseras,
        alumnos,
        paradas: [],
        marcajes: [],
      };
    },

    _leer() {
      if (this._cache) return this._cache;
      try {
        const crudo = localStorage.getItem(CLAVE_LOCAL);
        this._cache = crudo ? JSON.parse(crudo) : this._semilla();
      } catch (e) {
        this._cache = this._semilla();
      }
      return this._cache;
    },

    _guardar(d) {
      this._cache = d;
      try {
        localStorage.setItem(CLAVE_LOCAL, JSON.stringify(d));
        // Despierta a las demas pestañas (el evento storage no
        // llega a la pestaña que escribe)
        localStorage.setItem(CLAVE_LOCAL + '_tick', String(Date.now()));
      } catch (e) { /* sin almacenamiento */ }
    },

    reiniciar() { this._cache = null;
      try { localStorage.removeItem(CLAVE_LOCAL); } catch (e) {} },

    async colegios() { return this._leer().colegios.slice(); },

    async grupos(colegioId) {
      return this._leer().grupos.filter(
        (g) => g.activo && (!colegioId || g.colegio_id === colegioId));
    },

    async pulsera(codigo) {
      const d = this._leer();
      const p = d.pulseras.find((x) => x.codigo === codigo && x.activa);
      if (!p) return { existe: false };
      const alumno = d.alumnos.find((a) => a.pulsera_id === p.id) || null;
      const grupo = alumno ? d.grupos.find((g) => g.id === alumno.grupo_id) : null;
      return { existe: true, pulsera: p, alumno, grupo };
    },

    async rosterLibre(grupoId) {
      return this._leer().alumnos
        .filter((a) => a.grupo_id === grupoId && a.activo && !a.pulsera_id)
        .map((a) => ({ id: a.id, nombre: a.nombre }))
        .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
    },

    async registrar({ codigo, alumnoId }) {
      const d = this._leer();
      const p = d.pulseras.find((x) => x.codigo === codigo && x.activa);
      if (!p) throw new ErrorDatos('PULSERA_DESCONOCIDA');
      if (d.alumnos.some((a) => a.pulsera_id === p.id))
        throw new ErrorDatos('PULSERA_YA_ASIGNADA');
      const al = d.alumnos.find((a) => a.id === alumnoId);
      if (!al) throw new ErrorDatos('ALUMNO_NO_EXISTE');
      if (al.pulsera_id) throw new ErrorDatos('ALUMNO_YA_REGISTRADO');

      al.pulsera_id = p.id;
      al.device_id = deviceId();
      al.registrado_en = new Date().toISOString();
      this._guardar(d);
      return al;
    },

    async paradaAbierta(grupoId) {
      return this._leer().paradas.find(
        (p) => p.grupo_id === grupoId && !p.cerrada_en) || null;
    },

    async marcar({ codigo, lat, lon, precision, diferido, capturado_en }) {
      const d = this._leer();
      const p = d.pulseras.find((x) => x.codigo === codigo);
      const al = p && d.alumnos.find((a) => a.pulsera_id === p.id);
      if (!al) throw new ErrorDatos('PULSERA_SIN_REGISTRAR');

      const parada = d.paradas.find(
        (x) => x.grupo_id === al.grupo_id && !x.cerrada_en);
      if (!parada) throw new ErrorDatos('SIN_PARADA_ABIERTA');

      const dist = (lat == null || lon == null)
        ? null : distancia(lat, lon, parada.lat, parada.lon);
      const estado = dist == null ? 'SIN_GPS'
                   : dist <= parada.radio ? 'EN_ZONA' : 'FUERA_ZONA';
      const dev = deviceId();

      const fila = {
        id: uuid(), parada_id: parada.id, alumno_id: al.id,
        lat, lon, precision_m: precision, distancia_m: dist, estado,
        device_id: dev, diferido: !!diferido,
        device_distinto: !!(al.device_id && al.device_id !== dev),
        creado_en: capturado_en || new Date().toISOString(),
      };
      const i = d.marcajes.findIndex(
        (m) => m.parada_id === parada.id && m.alumno_id === al.id);
      if (i >= 0) d.marcajes[i] = fila; else d.marcajes.push(fila);
      this._guardar(d);

      return { marcaje: fila, alumno: al, parada };
    },

    async abrirParada({ grupoId, nombre, lat, lon, radio }) {
      const d = this._leer();
      d.paradas.filter((p) => p.grupo_id === grupoId && !p.cerrada_en)
               .forEach((p) => { p.cerrada_en = new Date().toISOString(); });
      const parada = {
        id: uuid(), grupo_id: grupoId, nombre, lat, lon,
        radio: radio || CFG.RADIO_DEFAULT,
        abierta_en: new Date().toISOString(), cerrada_en: null,
      };
      d.paradas.push(parada);
      this._guardar(d);
      return parada;
    },

    async cerrarParada(paradaId) {
      const d = this._leer();
      const p = d.paradas.find((x) => x.id === paradaId);
      if (p) { p.cerrada_en = new Date().toISOString(); this._guardar(d); }
      return p;
    },

    async progreso(paradaId) {
      const d = this._leer();
      const parada = d.paradas.find((p) => p.id === paradaId);
      if (!parada) return { parada: null, alumnos: [], marcajes: [] };
      const alumnos = d.alumnos.filter(
        (a) => a.grupo_id === parada.grupo_id && a.activo);
      const marcajes = d.marcajes.filter((m) => m.parada_id === paradaId);
      return { parada, alumnos, marcajes };
    },

    async marcarManual({ paradaId, alumnoId }) {
      const d = this._leer();
      const fila = {
        id: uuid(), parada_id: paradaId, alumno_id: alumnoId,
        lat: null, lon: null, precision_m: null, distancia_m: null,
        estado: 'MANUAL', device_id: null, diferido: false,
        device_distinto: false, registrado_por: 'guia',
        creado_en: new Date().toISOString(),
      };
      const i = d.marcajes.findIndex(
        (m) => m.parada_id === paradaId && m.alumno_id === alumnoId);
      if (i >= 0) d.marcajes[i] = fila; else d.marcajes.push(fila);
      this._guardar(d);
      return fila;
    },

    suscribir(paradaId, cb) {
      const fn = (ev) => {
        if (ev.key === CLAVE_LOCAL + '_tick' || ev.key === CLAVE_LOCAL) {
          this._cache = null;
          cb();
        }
      };
      global.addEventListener('storage', fn);
      return () => global.removeEventListener('storage', fn);
    },

    /* --- admin --- */
    async crearColegio(nombre) {
      const d = this._leer();
      const c = { id: uuid(), nombre };
      d.colegios.push(c); this._guardar(d); return c;
    },
    async crearGrupo({ colegioId, nombre }) {
      const d = this._leer();
      const g = { id: uuid(), colegio_id: colegioId, nombre, activo: true };
      d.grupos.push(g); this._guardar(d); return g;
    },
    async cargarRoster({ grupoId, nombres }) {
      const d = this._leer();
      nombres.forEach((n) => d.alumnos.push({
        id: uuid(), grupo_id: grupoId, nombre: n, pulsera_id: null,
        device_id: null, registrado_en: null, activo: true,
      }));
      this._guardar(d); return nombres.length;
    },
    async cargarPulseras(codigos) {
      const d = this._leer();
      let n = 0;
      codigos.forEach((c) => {
        if (!d.pulseras.some((p) => p.codigo === c)) {
          d.pulseras.push({ id: uuid(), codigo: c, activa: true }); n++;
        }
      });
      this._guardar(d); return n;
    },
    async liberarGrupo(grupoId) {
      const d = this._leer();
      let n = 0;
      d.alumnos.filter((a) => a.grupo_id === grupoId && a.pulsera_id)
        .forEach((a) => {
          a.pulsera_id = null; a.device_id = null; a.registrado_en = null; n++;
        });
      this._guardar(d); return n;
    },
    async alumnosDe(grupoId) {
      return this._leer().alumnos.filter((a) => a.grupo_id === grupoId);
    },
    async pulserasTodas() { return this._leer().pulseras.slice(); },
  };

  /* ============================================================
     Motor Supabase
     ============================================================ */

  const remoto = {
    sb: null,

    _init() {
      if (this.sb) return this.sb;
      if (!global.supabase) throw new ErrorDatos('SIN_LIBRERIA',
        'No cargo la libreria de Supabase.');
      this.sb = global.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 10 } },
      });
      return this.sb;
    },

    async _sel(tabla, cols, filtros) {
      let q = this._init().from(tabla).select(cols);
      Object.entries(filtros || {}).forEach(([k, v]) => { q = q.eq(k, v); });
      const { data, error } = await q;
      if (error) throw new ErrorDatos('CONSULTA', error.message);
      return data;
    },

    async colegios() { return this._sel('colegio', 'id,nombre'); },

    async grupos(colegioId) {
      const f = { activo: true };
      if (colegioId) f.colegio_id = colegioId;
      return this._sel('grupo', 'id,nombre,colegio_id', f);
    },

    async pulsera(codigo) {
      const p = await this._sel('pulsera', 'id,codigo,activa', { codigo });
      if (!p.length) return { existe: false };
      const a = await this._sel('alumno', 'id,nombre,grupo_id,pulsera_id,device_id',
                                { pulsera_id: p[0].id });
      let grupo = null;
      if (a.length) {
        const g = await this._sel('grupo', 'id,nombre,colegio_id', { id: a[0].grupo_id });
        grupo = g[0] || null;
      }
      return { existe: true, pulsera: p[0], alumno: a[0] || null, grupo };
    },

    async rosterLibre(grupoId) {
      const { data, error } = await this._init()
        .from('alumno').select('id,nombre')
        .eq('grupo_id', grupoId).eq('activo', true)
        .is('pulsera_id', null).order('nombre');
      if (error) throw new ErrorDatos('CONSULTA', error.message);
      return data;
    },

    async registrar({ codigo, alumnoId }) {
      const { data, error } = await this._init().rpc('registrar_pulsera', {
        p_codigo: codigo, p_alumno_id: alumnoId, p_device: deviceId(),
      });
      if (error) throw new ErrorDatos(error.message.replace(/.*?([A-Z_]{6,}).*/s, '$1'),
                                      error.message);
      return data;
    },

    async paradaAbierta(grupoId) {
      const { data, error } = await this._init()
        .from('parada').select('*')
        .eq('grupo_id', grupoId).is('cerrada_en', null)
        .order('abierta_en', { ascending: false }).limit(1);
      if (error) throw new ErrorDatos('CONSULTA', error.message);
      return data[0] || null;
    },

    async marcar({ codigo, lat, lon, precision, diferido, capturado_en }) {
      const { data, error } = await this._init().rpc('marcar', {
        p_codigo: codigo, p_lat: lat, p_lon: lon,
        p_precision: precision, p_device: deviceId(), p_diferido: !!diferido,
        p_capturado: capturado_en || null,
      });
      if (error) throw new ErrorDatos(error.message.replace(/.*?([A-Z_]{6,}).*/s, '$1'),
                                      error.message);
      return data;
    },

    async abrirParada({ grupoId, nombre, lat, lon, radio }) {
      const sb = this._init();
      await sb.from('parada').update({ cerrada_en: new Date().toISOString() })
              .eq('grupo_id', grupoId).is('cerrada_en', null);
      const { data, error } = await sb.from('parada').insert({
        grupo_id: grupoId, nombre, lat, lon, radio: radio || CFG.RADIO_DEFAULT,
      }).select().single();
      if (error) throw new ErrorDatos('ABRIR_PARADA', error.message);
      return data;
    },

    async cerrarParada(paradaId) {
      const { data, error } = await this._init().from('parada')
        .update({ cerrada_en: new Date().toISOString() })
        .eq('id', paradaId).select().single();
      if (error) throw new ErrorDatos('CERRAR_PARADA', error.message);
      return data;
    },

    async progreso(paradaId) {
      const sb = this._init();
      const { data: par } = await sb.from('parada').select('*').eq('id', paradaId).single();
      if (!par) return { parada: null, alumnos: [], marcajes: [] };
      const { data: alumnos } = await sb.from('alumno')
        .select('id,nombre,pulsera_id,device_id')
        .eq('grupo_id', par.grupo_id).eq('activo', true).order('nombre');
      const { data: marcajes } = await sb.from('marcaje')
        .select('*').eq('parada_id', paradaId);
      return { parada: par, alumnos: alumnos || [], marcajes: marcajes || [] };
    },

    async marcarManual({ paradaId, alumnoId }) {
      const { data, error } = await this._init().from('marcaje').upsert({
        parada_id: paradaId, alumno_id: alumnoId, estado: 'MANUAL',
        registrado_por: 'guia',
      }, { onConflict: 'parada_id,alumno_id' }).select().single();
      if (error) throw new ErrorDatos('MARCAR_MANUAL', error.message);
      return data;
    },

    /** Websocket: cada marcaje llega empujado, sin preguntar. */
    suscribir(paradaId, cb) {
      const canal = this._init()
        .channel('parada-' + paradaId)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'marcaje',
              filter: 'parada_id=eq.' + paradaId },
            cb)
        .subscribe();
      return () => { this._init().removeChannel(canal); };
    },

    /* --- admin --- */
    async crearColegio(nombre) {
      const { data, error } = await this._init().from('colegio')
        .insert({ nombre }).select().single();
      if (error) throw new ErrorDatos('CREAR_COLEGIO', error.message);
      return data;
    },
    async crearGrupo({ colegioId, nombre }) {
      const { data, error } = await this._init().from('grupo')
        .insert({ colegio_id: colegioId, nombre }).select().single();
      if (error) throw new ErrorDatos('CREAR_GRUPO', error.message);
      return data;
    },
    async cargarRoster({ grupoId, nombres }) {
      const { error } = await this._init().from('alumno')
        .insert(nombres.map((n) => ({ grupo_id: grupoId, nombre: n })));
      if (error) throw new ErrorDatos('CARGAR_ROSTER', error.message);
      return nombres.length;
    },
    async cargarPulseras(codigos) {
      const { error } = await this._init().from('pulsera')
        .upsert(codigos.map((c) => ({ codigo: c })), { onConflict: 'codigo' });
      if (error) throw new ErrorDatos('CARGAR_PULSERAS', error.message);
      return codigos.length;
    },
    async liberarGrupo(grupoId) {
      const { data, error } = await this._init()
        .rpc('liberar_grupo', { p_grupo_id: grupoId });
      if (error) throw new ErrorDatos('LIBERAR', error.message);
      return data;
    },
    async alumnosDe(grupoId) {
      return this._sel('alumno', 'id,nombre,pulsera_id,device_id,registrado_en',
                       { grupo_id: grupoId });
    },
    async pulserasTodas() { return this._sel('pulsera', 'id,codigo,activa'); },
  };

  /* ============================================================
     Seleccion de motor
     ============================================================ */

  const usaRemoto = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const motor = usaRemoto ? remoto : local;

  global.Datos = Object.assign(Object.create(motor), {
    esDemo: () => !usaRemoto,
    deviceId,
    distancia,
    ErrorDatos,
    motorLocal: local,
  });
})(window);
