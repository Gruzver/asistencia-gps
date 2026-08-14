/* ============================================================
   Capa de datos, local-first.

   Dos motores tras la misma interfaz:
   · supabase — Postgres con websockets, para varios guias a la vez
   · local    — todo en localStorage, para probar sin cuenta creada

   Encima de ambos hay una capa de cache y bandeja de salida: las
   lecturas caen a lo cacheado cuando no hay red, y las escrituras
   se encolan y se aplican de forma optimista. Asi el contador del
   guia responde igual en el Colca que con wifi.

   Las escrituras sensibles van por funciones de la base: la
   distancia y el estado los decide el servidor, para que nadie
   pueda declararse "en zona" manipulando la peticion.
   ============================================================ */
(function (global) {
  'use strict';

  const CFG = global.CONFIG;
  const { Cache, Bandeja, uuid } = global.Almacen;
  const CLAVE_LOCAL = 'agps_local_v2';
  const CLAVE_DEVICE = 'agps_device';

  function deviceId() {
    let id;
    try {
      id = localStorage.getItem(CLAVE_DEVICE);
      if (!id) { id = uuid(); localStorage.setItem(CLAVE_DEVICE, id); }
    } catch (e) { id = 'sin-almacenamiento'; }
    return id;
  }

  function distancia(lat1, lon1, lat2, lon2) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }

  class ErrorDatos extends Error {
    constructor(codigo, mensaje) { super(mensaje || codigo); this.codigo = codigo; }
  }

  /**
   * Errores que no se arreglan reintentando: encolarlos solo
   * atascaria la bandeja para siempre. Todo lo demas —timeouts,
   * DNS, 5xx— se considera de red y se reintenta.
   *
   * La lista es explicita a proposito. Con una expresion regular
   * suelta, SIN_PARADA_ABIERTA se colaba como reintentable y el
   * marcaje se encolaba en vez de avisar al alumno de que el guia
   * todavia no habia abierto la parada.
   */
  const DEFINITIVOS = new Set([
    'PULSERA_DESCONOCIDA', 'PULSERA_YA_ASIGNADA', 'PULSERA_SIN_REGISTRAR',
    'ALUMNO_NO_EXISTE', 'ALUMNO_YA_REGISTRADO',
    'SIN_PARADA_ABIERTA', 'CODIGO_REPETIDO', 'GRUPO_NO_EXISTE',
  ]);
  const esDefinitivo = (e) => !!(e && e.codigo && DEFINITIVOS.has(e.codigo));

  /* ============================================================
     Motor local
     ============================================================ */

  const local = {
    _cache: null,

    _semilla() {
      const col = uuid(), gA = uuid(), gB = uuid();
      const nombresA = [
        'Ana Lucia Ramirez Soto', 'Brenda Sofia Quispe Loayza',
        'Carla Daniela Mendoza Rios', 'Diana Paola Escalante Vera',
        'Elena Mariana Torres Puma', 'Fiorella Nicole Ayala Cruz',
        'Gabriela Rocio Salas Nina', 'Helena Victoria Pinto Chura',
        'Irene Camila Vargas Ticona', 'Julia Antonella Rojas Mamani',
        'Karina Belen Flores Apaza', 'Lucia Fernanda Huaman Coila',
        'Gruzver Phocco', 'Franck Anthony',
      ];
      const nombresB = [
        'Marina Esther Zevallos Lipa', 'Natalia Grace Ibanez Suca',
        'Olivia Renata Castro Yana', 'Paula Alejandra Guzman Arce',
        'Rosa Milagros Delgado Hancco', 'Sara Valentina Nunez Machaca',
      ];
      const alumno = (n, g) => ({
        id: uuid(), grupo_id: g, nombre: n, pulsera_id: null,
        device_id: null, registrado_en: null, activo: true,
      });

      const pulseras = [];
      for (let i = 1; i <= 40; i++) {
        pulseras.push({ id: uuid(), codigo: 'PL' + String(i).padStart(3, '0'),
                        nfc_uid: null, activa: true });
      }

      const g1 = { id: uuid(), nombre: 'Guía principal', codigo: 'G1', activo: true };
      const g2 = { id: uuid(), nombre: 'Guía de apoyo',  codigo: 'G2', activo: true };

      return {
        colegios: [{ id: col, nombre: 'Colegio Demo' }],
        grupos: [
          { id: gA, colegio_id: col, nombre: '5A', activo: true },
          { id: gB, colegio_id: col, nombre: '5B', activo: true },
        ],
        guias: [g1, g2],
        grupo_guia: [
          { grupo_id: gA, guia_id: g1.id }, { grupo_id: gA, guia_id: g2.id },
          { grupo_id: gB, guia_id: g1.id },
        ],
        pulseras,
        alumnos: nombresA.map((n) => alumno(n, gA))
                 .concat(nombresB.map((n) => alumno(n, gB))),
        paradas: [],
        marcajes: [],
      };
    },

    _leer() {
      if (this._cache) return this._cache;
      try {
        const c = localStorage.getItem(CLAVE_LOCAL);
        this._cache = c ? JSON.parse(c) : this._semilla();
      } catch (e) { this._cache = this._semilla(); }
      return this._cache;
    },

    _guardar(d) {
      this._cache = d;
      try {
        localStorage.setItem(CLAVE_LOCAL, JSON.stringify(d));
        localStorage.setItem(CLAVE_LOCAL + '_tick', String(Date.now()));
      } catch (e) {}
    },

    reiniciar() {
      this._cache = null;
      try { localStorage.removeItem(CLAVE_LOCAL); } catch (e) {}
    },

    async colegios() { return this._leer().colegios.slice(); },

    async grupos(colegioId) {
      return this._leer().grupos.filter(
        (g) => g.activo && (!colegioId || g.colegio_id === colegioId));
    },

    async guias() { return this._leer().guias.filter((g) => g.activo); },

    async guiasDe(grupoId) {
      const d = this._leer();
      const ids = d.grupo_guia.filter((x) => x.grupo_id === grupoId).map((x) => x.guia_id);
      return d.guias.filter((g) => ids.includes(g.id) && g.activo);
    },

    async crearGuia({ nombre, codigo, email }) {
      const d = this._leer();
      if (d.guias.some((g) => g.codigo === codigo)) throw new ErrorDatos('CODIGO_REPETIDO');
      const g = { id: uuid(), nombre, codigo, email: email || null, activo: true };
      d.guias.push(g); this._guardar(d); return g;
    },

    async asignarGuia({ grupoId, guiaId, quitar }) {
      const d = this._leer();
      d.grupo_guia = d.grupo_guia.filter(
        (x) => !(x.grupo_id === grupoId && x.guia_id === guiaId));
      if (!quitar) d.grupo_guia.push({ grupo_id: grupoId, guia_id: guiaId });
      this._guardar(d);
    },

    async gruposDeGuia(guiaId) {
      const d = this._leer();
      const ids = d.grupo_guia.filter((x) => x.guia_id === guiaId).map((x) => x.grupo_id);
      return d.grupos.filter((g) => ids.includes(g.id) && g.activo);
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

    async marcar({ codigo, lat, lon, precision, diferido, capturado_en, origen, guiaId }) {
      const d = this._leer();
      const p = d.pulseras.find((x) => x.codigo === codigo);
      const al = p && d.alumnos.find((a) => a.pulsera_id === p.id);
      if (!al) throw new ErrorDatos('PULSERA_SIN_REGISTRAR');

      const parada = d.paradas.find((x) => x.grupo_id === al.grupo_id && !x.cerrada_en);
      if (!parada) throw new ErrorDatos('SIN_PARADA_ABIERTA');

      const dist = (lat == null || lon == null)
        ? null : distancia(lat, lon, parada.lat, parada.lon);
      const estado = dist == null ? 'SIN_GPS'
                   : dist <= parada.radio ? 'EN_ZONA' : 'FUERA_ZONA';
      const dev = deviceId();
      const org = origen || 'alumno';

      const nuevo = {
        id: uuid(), parada_id: parada.id, alumno_id: al.id,
        lat, lon, precision_m: precision, distancia_m: dist, estado,
        origen: org, guia_id: guiaId || null, device_id: dev,
        diferido: !!diferido,
        device_distinto: !!(al.device_id && al.device_id !== dev),
        creado_en: capturado_en || new Date().toISOString(),
      };

      const i = d.marcajes.findIndex(
        (m) => m.parada_id === parada.id && m.alumno_id === al.id);
      if (i >= 0) {
        d.marcajes[i] = fusionar(d.marcajes[i], nuevo);
      } else {
        d.marcajes.push(nuevo);
      }
      this._guardar(d);
      return { marcaje: d.marcajes[i >= 0 ? i : d.marcajes.length - 1],
               alumno: al, parada };
    },

    async abrirParada({ grupoId, nombre, lat, lon, radio, guiaId }) {
      const d = this._leer();
      const ya = d.paradas.find((p) => p.grupo_id === grupoId && !p.cerrada_en);
      if (ya) return { creada: false, parada: ya };
      const parada = {
        id: uuid(), grupo_id: grupoId, nombre, lat, lon,
        radio: radio || CFG.RADIO_DEFAULT, abierta_por: guiaId || null,
        abierta_en: new Date().toISOString(), cerrada_en: null,
      };
      d.paradas.push(parada);
      this._guardar(d);
      return { creada: true, parada };
    },

    async cerrarParada(paradaId) {
      const d = this._leer();
      const p = d.paradas.find((x) => x.id === paradaId);
      if (p) { p.cerrada_en = new Date().toISOString(); this._guardar(d); }
      return p;
    },

    async reabrirParada(paradaId) {
      const d = this._leer();
      const p = d.paradas.find((x) => x.id === paradaId);
      if (!p) throw new ErrorDatos('PARADA_NO_EXISTE');
      // No puede haber dos abiertas del mismo grupo: el alumno no
      // debe tener que elegir a cual marca.
      if (d.paradas.some((x) => x.grupo_id === p.grupo_id && !x.cerrada_en)) {
        throw new ErrorDatos('YA_HAY_PARADA_ABIERTA');
      }
      p.cerrada_en = null;
      this._guardar(d);
      return p;
    },

    async purgarMarcajes(dias) {
      const d = this._leer();
      const limite = Date.now() - dias * 86400000;
      const antes = d.marcajes.length;
      d.marcajes = d.marcajes.filter((m) => new Date(m.creado_en).getTime() >= limite);
      this._guardar(d);
      return antes - d.marcajes.length;
    },

    async progreso(paradaId) {
      const d = this._leer();
      const parada = d.paradas.find((p) => p.id === paradaId);
      if (!parada) return { parada: null, alumnos: [], marcajes: [] };
      return {
        parada,
        alumnos: d.alumnos.filter((a) => a.grupo_id === parada.grupo_id && a.activo),
        marcajes: d.marcajes.filter((m) => m.parada_id === paradaId),
      };
    },

    async marcarManual({ paradaId, alumnoId, guiaId }) {
      const d = this._leer();
      const nuevo = {
        id: uuid(), parada_id: paradaId, alumno_id: alumnoId,
        lat: null, lon: null, precision_m: null, distancia_m: null,
        estado: 'MANUAL', origen: 'guia_manual', guia_id: guiaId || null,
        device_id: null, diferido: false, device_distinto: false,
        creado_en: new Date().toISOString(),
      };
      const i = d.marcajes.findIndex(
        (m) => m.parada_id === paradaId && m.alumno_id === alumnoId);
      if (i >= 0) d.marcajes[i] = fusionar(d.marcajes[i], nuevo);
      else d.marcajes.push(nuevo);
      this._guardar(d);
      return d.marcajes[i >= 0 ? i : d.marcajes.length - 1];
    },

    suscribir(paradaId, cb) {
      const fn = (ev) => {
        if (ev.key === CLAVE_LOCAL + '_tick' || ev.key === CLAVE_LOCAL) {
          this._cache = null; cb();
        }
      };
      global.addEventListener('storage', fn);
      return () => global.removeEventListener('storage', fn);
    },

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
          d.pulseras.push({ id: uuid(), codigo: c, nfc_uid: null, activa: true }); n++;
        }
      });
      this._guardar(d); return n;
    },
    async liberarGrupo(grupoId) {
      const d = this._leer();
      let n = 0;
      d.alumnos.filter((a) => a.grupo_id === grupoId && a.pulsera_id).forEach((a) => {
        a.pulsera_id = null; a.device_id = null; a.registrado_en = null; n++;
      });
      this._guardar(d); return n;
    },
    async alumnosDe(grupoId) {
      return this._leer().alumnos.filter((a) => a.grupo_id === grupoId);
    },

    async paradasDe(grupoId) {
      return this._leer().paradas
        .filter((p) => p.grupo_id === grupoId)
        .sort((a, b) => (a.abierta_en < b.abierta_en ? 1 : -1));
    },

    async marcajesDe(grupoId) {
      const d = this._leer();
      const ids = new Set(d.paradas.filter((p) => p.grupo_id === grupoId).map((p) => p.id));
      return d.marcajes.filter((m) => ids.has(m.parada_id));
    },

    async editarAlumno({ id, nombre }) {
      const d = this._leer();
      const a = d.alumnos.find((x) => x.id === id);
      if (!a) throw new ErrorDatos('ALUMNO_NO_EXISTE');
      a.nombre = nombre;
      this._guardar(d);
      return a;
    },

    async eliminarAlumno(id) {
      const d = this._leer();
      const a = d.alumnos.find((x) => x.id === id);
      if (!a) throw new ErrorDatos('ALUMNO_NO_EXISTE');
      // Con marcajes registrados se desactiva en vez de borrar: el
      // historial de asistencia no debe quedar con huecos.
      if (d.marcajes.some((m) => m.alumno_id === id)) {
        a.activo = false; a.pulsera_id = null; a.device_id = null;
        this._guardar(d);
        return { desactivado: true };
      }
      d.alumnos = d.alumnos.filter((x) => x.id !== id);
      this._guardar(d);
      return { eliminado: true };
    },

    async liberarPulsera(alumnoId) {
      const d = this._leer();
      const a = d.alumnos.find((x) => x.id === alumnoId);
      if (!a) throw new ErrorDatos('ALUMNO_NO_EXISTE');
      a.pulsera_id = null; a.device_id = null; a.registrado_en = null;
      this._guardar(d);
      return a;
    },

    async pulserasTodas() { return this._leer().pulseras.slice(); },
  };

  /**
   * Fusiona dos marcajes del mismo alumno en la misma parada.
   * Gana el escaneo del guia sobre el automarcaje del alumno
   * —presentarse fisicamente es evidencia mas fuerte que un ping—
   * y se conserva siempre la hora mas temprana, porque lo que
   * importa es cuando se vio al alumno por primera vez.
   */
  function fusionar(viejo, nuevo) {
    const asciende = viejo.origen === 'alumno' && nuevo.origen !== 'alumno';
    const base = asciende ? nuevo : viejo;
    return Object.assign({}, base, {
      origen: nuevo.origen !== 'alumno' ? nuevo.origen : viejo.origen,
      guia_id: nuevo.guia_id || viejo.guia_id,
      lat: base.lat != null ? base.lat : (viejo.lat != null ? viejo.lat : nuevo.lat),
      lon: base.lon != null ? base.lon : (viejo.lon != null ? viejo.lon : nuevo.lon),
      distancia_m: base.distancia_m != null ? base.distancia_m
                   : (viejo.distancia_m != null ? viejo.distancia_m : nuevo.distancia_m),
      diferido: !!(viejo.diferido || nuevo.diferido),
      // Las señales de alerta se acumulan, no se pisan: marcar una
      // vez desde otro telefono debe seguir visible aunque despues
      // se marque desde el propio.
      device_distinto: !!(viejo.device_distinto || nuevo.device_distinto),
      creado_en: viejo.creado_en < nuevo.creado_en ? viejo.creado_en : nuevo.creado_en,
    });
  }

  /* ============================================================
     Motor Supabase
     ============================================================ */

  const remoto = {
    sb: null,

    _init() {
      if (this.sb) return this.sb;
      if (!global.supabase) throw new ErrorDatos('SIN_LIBRERIA',
        'No cargó la librería de Supabase.');
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

    _rpcError(error) {
      const m = String(error.message || '');
      const cod = (m.match(/[A-Z_]{6,}/) || [])[0] || 'RPC';
      return new ErrorDatos(cod, m);
    },

    async colegios() { return this._sel('colegio', 'id,nombre'); },

    async grupos(colegioId) {
      const f = { activo: true };
      if (colegioId) f.colegio_id = colegioId;
      return this._sel('grupo', 'id,nombre,colegio_id', f);
    },

    async guias() { return this._sel('guia', 'id,nombre,codigo,email', { activo: true }); },

    async guiasDe(grupoId) {
      const { data, error } = await this._init()
        .from('grupo_guia').select('guia:guia_id(id,nombre,codigo,activo)')
        .eq('grupo_id', grupoId);
      if (error) throw new ErrorDatos('CONSULTA', error.message);
      return (data || []).map((r) => r.guia).filter((g) => g && g.activo);
    },

    async crearGuia({ nombre, codigo, email }) {
      const { data, error } = await this._init().from('guia')
        .insert({ nombre, codigo, email: email || null }).select().single();
      if (error) throw new ErrorDatos('CREAR_GUIA', error.message);
      return data;
    },

    async asignarGuia({ grupoId, guiaId, quitar }) {
      const sb = this._init();
      if (quitar) {
        const { error } = await sb.from('grupo_guia').delete()
          .eq('grupo_id', grupoId).eq('guia_id', guiaId);
        if (error) throw new ErrorDatos('ASIGNAR', error.message);
      } else {
        const { error } = await sb.from('grupo_guia')
          .upsert({ grupo_id: grupoId, guia_id: guiaId });
        if (error) throw new ErrorDatos('ASIGNAR', error.message);
      }
    },

    async gruposDeGuia(guiaId) {
      const { data, error } = await this._init()
        .from('grupo_guia').select('grupo:grupo_id(id,nombre,colegio_id,activo)')
        .eq('guia_id', guiaId);
      if (error) throw new ErrorDatos('CONSULTA', error.message);
      return (data || []).map((r) => r.grupo).filter((g) => g && g.activo);
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
      if (error) throw this._rpcError(error);
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

    async marcar({ codigo, lat, lon, precision, diferido, capturado_en, origen, guiaId }) {
      const { data, error } = await this._init().rpc('marcar', {
        p_codigo: codigo, p_lat: lat, p_lon: lon, p_precision: precision,
        p_device: deviceId(), p_diferido: !!diferido,
        p_capturado: capturado_en || null,
        p_origen: origen || 'alumno', p_guia: guiaId || null,
      });
      if (error) throw this._rpcError(error);
      return data;
    },

    async abrirParada({ grupoId, nombre, lat, lon, radio, guiaId }) {
      const { data, error } = await this._init().rpc('abrir_parada', {
        p_grupo: grupoId, p_nombre: nombre, p_lat: lat, p_lon: lon,
        p_radio: radio || CFG.RADIO_DEFAULT, p_guia: guiaId || null,
      });
      if (error) throw this._rpcError(error);
      return data;
    },

    async cerrarParada(paradaId) {
      const { data, error } = await this._init().from('parada')
        .update({ cerrada_en: new Date().toISOString() })
        .eq('id', paradaId).select().single();
      if (error) throw new ErrorDatos('CERRAR_PARADA', error.message);
      return data;
    },

    async reabrirParada(paradaId) {
      const sb = this._init();
      const { data: p } = await sb.from('parada').select('*').eq('id', paradaId).single();
      if (!p) throw new ErrorDatos('PARADA_NO_EXISTE');
      const { data: abiertas } = await sb.from('parada').select('id')
        .eq('grupo_id', p.grupo_id).is('cerrada_en', null);
      if (abiertas && abiertas.length) throw new ErrorDatos('YA_HAY_PARADA_ABIERTA');
      const { data, error } = await sb.from('parada')
        .update({ cerrada_en: null }).eq('id', paradaId).select().single();
      if (error) throw new ErrorDatos('REABRIR_PARADA', error.message);
      return data;
    },

    async purgarMarcajes(dias) {
      const limite = new Date(Date.now() - dias * 86400000).toISOString();
      const { data, error } = await this._init().from('marcaje')
        .delete().lt('creado_en', limite).select('id');
      if (error) throw new ErrorDatos('PURGAR', error.message);
      return (data || []).length;
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

    async marcarManual({ paradaId, alumnoId, guiaId }) {
      const { data, error } = await this._init().from('marcaje').upsert({
        parada_id: paradaId, alumno_id: alumnoId, estado: 'MANUAL',
        origen: 'guia_manual', guia_id: guiaId || null,
      }, { onConflict: 'parada_id,alumno_id' }).select().single();
      if (error) throw new ErrorDatos('MARCAR_MANUAL', error.message);
      return data;
    },

    suscribir(paradaId, cb) {
      const canal = this._init()
        .channel('parada-' + paradaId)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'marcaje',
              filter: 'parada_id=eq.' + paradaId }, cb)
        .subscribe();
      return () => { this._init().removeChannel(canal); };
    },

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

    async paradasDe(grupoId) {
      const { data, error } = await this._init().from('parada').select('*')
        .eq('grupo_id', grupoId).order('abierta_en', { ascending: false });
      if (error) throw new ErrorDatos('CONSULTA', error.message);
      return data || [];
    },

    async marcajesDe(grupoId) {
      const paradas = await this.paradasDe(grupoId);
      if (!paradas.length) return [];
      const { data, error } = await this._init().from('marcaje').select('*')
        .in('parada_id', paradas.map((p) => p.id));
      if (error) throw new ErrorDatos('CONSULTA', error.message);
      return data || [];
    },

    async editarAlumno({ id, nombre }) {
      const { data, error } = await this._init().from('alumno')
        .update({ nombre }).eq('id', id).select().single();
      if (error) throw new ErrorDatos('EDITAR_ALUMNO', error.message);
      return data;
    },

    async eliminarAlumno(id) {
      const sb = this._init();
      const { data: m } = await sb.from('marcaje').select('id').eq('alumno_id', id).limit(1);
      if (m && m.length) {
        const { error } = await sb.from('alumno')
          .update({ activo: false, pulsera_id: null, device_id: null }).eq('id', id);
        if (error) throw new ErrorDatos('ELIMINAR_ALUMNO', error.message);
        return { desactivado: true };
      }
      const { error } = await sb.from('alumno').delete().eq('id', id);
      if (error) throw new ErrorDatos('ELIMINAR_ALUMNO', error.message);
      return { eliminado: true };
    },

    async liberarPulsera(alumnoId) {
      const { data, error } = await this._init().from('alumno')
        .update({ pulsera_id: null, device_id: null, registrado_en: null })
        .eq('id', alumnoId).select().single();
      if (error) throw new ErrorDatos('LIBERAR_PULSERA', error.message);
      return data;
    },

    async pulserasTodas() { return this._sel('pulsera', 'id,codigo,activa'); },
  };

  /* ============================================================
     Capa local-first sobre el motor elegido
     ============================================================ */

  const usaRemoto = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const motor = usaRemoto ? remoto : local;

  /** Lee de la red y cachea; si la red falla, cae a lo cacheado. */
  async function conCache(clave, fn, porDefecto) {
    try {
      const v = await fn();
      Cache.poner(clave, v);
      return v;
    } catch (e) {
      if (esDefinitivo(e)) throw e;
      const c = Cache.sacar(clave);
      if (c !== null) return c;
      if (porDefecto !== undefined) return porDefecto;
      throw e;
    }
  }

  const API = {
    esDemo: () => !usaRemoto,
    deviceId, distancia, ErrorDatos, esDefinitivo, fusionar, motorLocal: local,

    /** Cliente de Supabase, para que Auth reuse la misma sesion. */
    cliente: () => remoto._init(),

    /* --- lecturas cacheadas --- */
    colegios() { return conCache('colegios', () => motor.colegios(), []); },
    grupos(c)  { return conCache('grupos_' + (c || 'todos'), () => motor.grupos(c), []); },
    guias()    { return conCache('guias', () => motor.guias(), []); },
    guiasDe(g) { return conCache('guias_' + g, () => motor.guiasDe(g), []); },
    gruposDeGuia(g) { return conCache('gg_' + g, () => motor.gruposDeGuia(g), []); },
    rosterLibre(g)  { return motor.rosterLibre(g); },
    alumnosDe(g)    { return conCache('alumnos_' + g, () => motor.alumnosDe(g), []); },
    pulserasTodas() { return conCache('pulseras', () => motor.pulserasTodas(), []); },
    pulsera(c) { return motor.pulsera(c); },
    registrar(x) { return motor.registrar(x); },

    /* --- guias y admin --- */
    crearGuia(x)     { return motor.crearGuia(x); },
    asignarGuia(x)   { return motor.asignarGuia(x); },
    crearColegio(x)  { return motor.crearColegio(x); },
    crearGrupo(x)    { return motor.crearGrupo(x); },
    cargarRoster(x)  { return motor.cargarRoster(x); },
    cargarPulseras(x){ return motor.cargarPulseras(x); },
    liberarGrupo(x)  { return motor.liberarGrupo(x); },
    liberarPulsera(x){ return motor.liberarPulsera(x); },
    editarAlumno(x)  { return motor.editarAlumno(x); },
    eliminarAlumno(x){ return motor.eliminarAlumno(x); },
    paradasDe(g)     { return conCache('paradas_' + g, () => motor.paradasDe(g), []); },
    marcajesDe(g)    { return conCache('marcajes_' + g, () => motor.marcajesDe(g), []); },
    suscribir(p, cb) { return motor.suscribir(p, cb); },
    reabrirParada(x)  { return motor.reabrirParada(x); },
    purgarMarcajes(d) { return motor.purgarMarcajes(d); },

    /** Descarga varios grupos de una vez, antes de salir. */
    async precargarVarios(ids) {
      const salida = [];
      for (const id of ids) {
        try { salida.push({ id, ok: true, datos: await API.precargar(id) }); }
        catch (e) { salida.push({ id, ok: false, error: e.message || e.codigo }); }
      }
      return salida;
    },

    /* Respaldo de lo pendiente de subir. Si el telefono del guia
       muere, lo que no se sincronizo se pierde; poder exportarlo
       —y recuperarlo en otro telefono— es la unica red de seguridad. */
    exportarPendientes() {
      return JSON.stringify({
        version: 1,
        generado: new Date().toISOString(),
        dispositivo: deviceId(),
        operaciones: Bandeja.todas(),
      }, null, 2);
    },

    importarPendientes(texto) {
      let d;
      try { d = JSON.parse(texto); } catch (e) { throw new ErrorDatos('ARCHIVO_INVALIDO'); }
      if (!d || !Array.isArray(d.operaciones)) throw new ErrorDatos('ARCHIVO_INVALIDO');
      let n = 0;
      d.operaciones.forEach((op) => {
        if (!op || !op.tipo) return;
        Bandeja.poner(op);   // la llave evita duplicar lo ya encolado
        n++;
      });
      return n;
    },

    esParadaLocal: (id) => typeof id === 'string' && id.startsWith('local-'),

    /**
     * Abre una parada. Si no hay red se crea una LOCAL con id de
     * cliente y se encola: sin esto, llegar a un punto sin cobertura
     * dejaba al guia sin poder tomar asistencia, que es justo donde
     * mas falta hace.
     *
     * Al sincronizar, si otro guia ya habia abierto una parada para
     * el grupo, se adopta la del servidor y los marcajes locales se
     * reapuntan a ella. Nunca se crea una parada duplicada ni se
     * pisa la del otro guia.
     */
    async abrirParada(x) {
      try {
        const r = await motor.abrirParada(x);
        Cache.poner('parada_' + x.grupoId, r.parada);
        return r;
      } catch (e) {
        if (esDefinitivo(e)) throw e;
        const parada = {
          id: 'local-' + uuid(), grupo_id: x.grupoId, nombre: x.nombre,
          lat: x.lat, lon: x.lon, radio: x.radio || CFG.RADIO_DEFAULT,
          abierta_por: x.guiaId || null,
          abierta_en: new Date().toISOString(), cerrada_en: null, local: true,
        };
        Cache.poner('parada_' + x.grupoId, parada);
        Bandeja.poner({
          tipo: 'parada', llave: 'parada:' + parada.id,
          paradaLocalId: parada.id,
          datos: { grupoId: x.grupoId, nombre: x.nombre, lat: x.lat, lon: x.lon,
                   radio: parada.radio, guiaId: x.guiaId },
        });
        return { creada: true, parada, local: true };
      }
    },

    async cerrarParada(paradaId) {
      if (API.esParadaLocal(paradaId)) {
        // Todavia no existe en el servidor: se cierra en local y la
        // sincronizacion la creara ya cerrada.
        Bandeja.todas()
          .filter((f) => f.tipo === 'parada' && f.paradaLocalId === paradaId)
          .forEach((f) => Bandeja.poner(Object.assign({}, f, { cerrar: true })));
        return { id: paradaId, cerrada_en: new Date().toISOString() };
      }
      const r = await motor.cerrarParada(paradaId);
      return r;
    },

    /**
     * Descarga todo lo que el guia necesita para operar sin señal.
     * Hay que ejecutarlo CON cobertura, antes de salir: sin esto,
     * llegar al Colca sin haber precargado deja la pantalla vacia.
     */
    async precargar(grupoId) {
      const [alumnos, pulseras, parada, guias] = await Promise.all([
        motor.alumnosDe(grupoId),
        motor.pulserasTodas(),
        motor.paradaAbierta(grupoId),
        motor.guiasDe(grupoId).catch(() => []),
      ]);
      Cache.poner('alumnos_' + grupoId, alumnos);
      Cache.poner('pulseras', pulseras);
      Cache.poner('parada_' + grupoId, parada);
      Cache.poner('guias_' + grupoId, guias);
      if (parada) {
        const prog = await motor.progreso(parada.id);
        Cache.poner('prog_' + parada.id, prog);
      }
      Cache.poner('precarga_' + grupoId, new Date().toISOString());
      return { alumnos: alumnos.length, pulseras: pulseras.length, parada };
    },

    precargadoEn(grupoId) { return Cache.sacar('precarga_' + grupoId); },

    paradaAbierta(grupoId) {
      return conCache('parada_' + grupoId, () => motor.paradaAbierta(grupoId), null);
    },

    /**
     * Resuelve un codigo de pulsera contra la cache, sin red.
     * Es la ruta critica del escaneo: el guia toca y necesita
     * respuesta inmediata aunque no haya una barra de señal.
     */
    resolverCodigoLocal(codigo, grupoId) {
      const pulseras = Cache.sacar('pulseras') || [];
      const p = pulseras.find((x) => x.codigo === codigo);
      if (!p) return { existe: false };
      const alumnos = Cache.sacar('alumnos_' + grupoId) || [];
      const al = alumnos.find((a) => a.pulsera_id === p.id) || null;
      return { existe: true, pulsera: p, alumno: al };
    },

    /** Progreso del servidor mezclado con lo pendiente de subir. */
    async progreso(paradaId) {
      let base;
      if (API.esParadaLocal(paradaId)) {
        // Parada que aun no existe en el servidor: se arma entera
        // desde la cache y la bandeja.
        const op = Bandeja.todas().find(
          (f) => f.tipo === 'parada' && f.paradaLocalId === paradaId);
        const grupoId = op ? op.datos.grupoId : null;
        base = {
          parada: Cache.sacar('parada_' + grupoId),
          alumnos: Cache.sacar('alumnos_' + grupoId) || [],
          marcajes: [],
        };
      } else {
        base = await conCache('prog_' + paradaId, () => motor.progreso(paradaId),
                              { parada: null, alumnos: [], marcajes: [] });
      }
      const pendientes = Bandeja.de('marcaje')
        .filter((o) => o.paradaId === paradaId)
        .map((o) => o.optimista);

      if (!pendientes.length) return base;

      const marcajes = base.marcajes.slice();
      pendientes.forEach((p) => {
        const i = marcajes.findIndex((m) => m.alumno_id === p.alumno_id);
        if (i >= 0) marcajes[i] = fusionar(marcajes[i], p);
        else marcajes.push(p);
      });
      return Object.assign({}, base, { marcajes, pendientes: pendientes.length });
    },

    /**
     * Marca con respaldo offline. Si la red falla, se encola con
     * su hora y coordenadas reales y se devuelve un resultado
     * optimista para que la pantalla del guia avance igual.
     */
    async marcar(datos) {
      // Si la parada todavia es local, el servidor no la conoce:
      // intentarlo daria SIN_PARADA_ABIERTA, que es un error
      // definitivo y tiraria el escaneo. Se encola directamente y
      // la sincronizacion lo reapuntara a la parada real.
      if (API.esParadaLocal(datos.paradaId)) return encolarMarcaje(datos, null);

      try {
        return await motor.marcar(datos);
      } catch (e) {
        if (esDefinitivo(e)) throw e;
        return encolarMarcaje(datos, e);
      }
    },

    async marcarManual(datos) {
      try {
        return await motor.marcarManual(datos);
      } catch (e) {
        if (esDefinitivo(e)) throw e;
        throw e; // el manual necesita la parada; sin red se maneja arriba
      }
    },

    /**
     * Sube todo lo pendiente. Seguro de llamar en cualquier momento.
     *
     * Las paradas van PRIMERO: los marcajes tomados sin señal
     * apuntan a un id local que todavia no existe en el servidor, y
     * hasta que la parada suba no hay donde colgarlos.
     */
    async sincronizar() {
      if (!navigator.onLine) return { subidos: 0, quedan: Bandeja.todas().length };
      if (sincronizando) return { subidos: 0, quedan: Bandeja.todas().length };
      sincronizando = true;

      try {
        let subidos = 0;
        const adoptadas = [];

        // --- 1. Paradas ---
        for (const f of Bandeja.todas().filter((x) => x.tipo === 'parada')) {
          try {
            const r = await motor.abrirParada(f.datos);
            const real = r.parada;

            // Otro guia se adelanto: se adopta la suya y los
            // marcajes locales se reapuntan, en vez de duplicar.
            remapear(f.paradaLocalId, real.id);
            Cache.poner('parada_' + f.datos.grupoId, real);
            if (f.cerrar) { try { await motor.cerrarParada(real.id); } catch (e) {} }

            adoptadas.push({ localId: f.paradaLocalId, real, ajena: r.creada === false });
            Bandeja.quitar(f.id);
            subidos++;
          } catch (e) {
            const g = Bandeja.todas().find((x) => x.id === f.id);
            if (g) {
              g.intentos = (g.intentos || 0) + 1;
              g.ultimoError = (e && e.codigo) || 'RED';
              if (esDefinitivo(e) || g.intentos >= 25) Bandeja.quitar(g.id);
              else Bandeja.poner(g);
            }
          }
        }

        // --- 2. Marcajes ---
        const quedan = [];
        for (const f of Bandeja.todas().filter((x) => x.tipo === 'marcaje')) {
          try {
            await motor.marcar(f.datos);
            subidos++;
          } catch (e) {
            f.intentos = (f.intentos || 0) + 1;
            f.ultimoError = (e && e.codigo) || 'RED';
            if (!esDefinitivo(e) && f.intentos < 25) quedan.push(f);
          }
        }
        Bandeja.reemplazar(
          Bandeja.todas().filter((x) => x.tipo !== 'marcaje').concat(quedan));

        return { subidos, quedan: Bandeja.todas().length, adoptadas };
      } finally {
        sincronizando = false;
      }
    },

    pendientes: () => Bandeja.todas().length,
    alCambiarPendientes: (fn) => Bandeja.alCambiar(fn),
  };

  let sincronizando = false;

  /**
   * Reapunta los marcajes encolados de una parada local a la que
   * el servidor acabo asignando. Es lo que evita perder los
   * escaneos hechos sin señal cuando otro guia ya habia abierto la
   * parada por su cuenta.
   */
  function remapear(idLocal, idReal) {
    if (!idLocal || idLocal === idReal) return;
    const filas = Bandeja.todas().map((f) => {
      if (f.tipo !== 'marcaje' || f.paradaId !== idLocal) return f;
      return Object.assign({}, f, {
        paradaId: idReal,
        llave: idReal + ':' + (f.optimista ? f.optimista.alumno_id : ''),
        datos: Object.assign({}, f.datos, { paradaId: idReal }),
        optimista: Object.assign({}, f.optimista, { parada_id: idReal }),
      });
    });
    Bandeja.reemplazar(filas);
  }

  function encolarMarcaje(datos, err) {
    const cache = Cache.sacar('pulseras') || [];
    const p = cache.find((x) => x.codigo === datos.codigo);
    const alumnos = Cache.sacar('alumnos_' + (datos.grupoId || '')) || [];
    const al = p ? alumnos.find((a) => a.pulsera_id === p.id) : null;

    const dist = (datos.lat != null && datos.paradaLat != null)
      ? distancia(datos.lat, datos.lon, datos.paradaLat, datos.paradaLon) : null;
    const estado = dist == null ? 'SIN_GPS'
                 : dist <= (datos.paradaRadio || CFG.RADIO_DEFAULT)
                   ? 'EN_ZONA' : 'FUERA_ZONA';

    const optimista = {
      id: 'pend-' + uuid(), parada_id: datos.paradaId,
      alumno_id: al ? al.id : datos.alumnoId,
      lat: datos.lat, lon: datos.lon, precision_m: datos.precision,
      distancia_m: dist, estado, origen: datos.origen || 'alumno',
      guia_id: datos.guiaId || null, diferido: true, device_distinto: false,
      pendiente: true,
      creado_en: datos.capturado_en || new Date().toISOString(),
    };

    Bandeja.poner({
      tipo: 'marcaje',
      llave: datos.paradaId + ':' + (optimista.alumno_id || datos.codigo),
      paradaId: datos.paradaId,
      datos: Object.assign({}, datos, { diferido: true }),
      optimista,
    });

    return { marcaje: optimista, alumno: al, pendiente: true, error: err && err.codigo };
  }

  global.Datos = API;

  global.addEventListener('online', () => API.sincronizar());
  setInterval(() => { if (API.pendientes()) API.sincronizar(); }, 45000);
})(window);
