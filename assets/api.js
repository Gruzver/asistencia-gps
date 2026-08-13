/* ============================================================
   Cliente de API + utilidades compartidas.

   Transporte: GET con query params contra el Web App de Apps
   Script. Se usa GET (y no POST con JSON) a proposito: Apps
   Script no permite responder al preflight OPTIONS, asi que
   cualquier POST con Content-Type: application/json falla por
   CORS. GET es una "simple request", no dispara preflight, y
   la respuesta final de script.googleusercontent.com si trae
   Access-Control-Allow-Origin: *.
   ============================================================ */
(function (global) {
  'use strict';

  const CFG = global.CONFIG;

  /* ---------- utilidades de formato ---------- */

  const pad = (n) => String(n).padStart(2, '0');

  function fechaHoy() {
    const d = new Date();
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function horaAhora() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  /** Distancia Haversine en metros entre dos coordenadas. */
  function distancia(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }

  function metros(m) {
    if (m == null || isNaN(m)) return '--';
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
  }

  /* ---------- geolocalizacion ---------- */

  const GeoError = {
    1: 'PERMISO_DENEGADO',
    2: 'POSICION_NO_DISPONIBLE',
    3: 'TIEMPO_AGOTADO',
  };

  /**
   * Pide la posicion del dispositivo con alta precision.
   * Rechaza con { codigo, mensaje } para que la UI decida.
   */
  function obtenerUbicacion() {
    return new Promise((resolve, reject) => {
      if (!global.navigator.geolocation) {
        return reject({
          codigo: 'NO_SOPORTADO',
          mensaje: 'Este navegador no soporta geolocalizacion.',
        });
      }
      if (!global.isSecureContext) {
        return reject({
          codigo: 'SIN_HTTPS',
          mensaje: 'La ubicacion solo funciona sobre HTTPS. Abre la pagina con https://',
        });
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: +pos.coords.latitude.toFixed(6),
            lon: +pos.coords.longitude.toFixed(6),
            precision: Math.round(pos.coords.accuracy),
          }),
        (err) =>
          reject({
            codigo: GeoError[err.code] || 'DESCONOCIDO',
            mensaje: err.message,
          }),
        { enableHighAccuracy: true, timeout: CFG.GPS_TIMEOUT, maximumAge: 0 }
      );
    });
  }

  /* ---------- transporte ---------- */

  async function llamar(accion, params) {
    const url = new URL(CFG.API_URL);
    url.searchParams.set('action', accion);
    url.searchParams.set('_', Date.now()); // anti-cache
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const texto = await res.text();
    let json;
    try {
      json = JSON.parse(texto);
    } catch (e) {
      // Apps Script devuelve HTML cuando el despliegue no es publico
      throw new Error(
        'El backend no devolvio JSON. Revisa que el Apps Script este desplegado ' +
          'con acceso "Cualquier persona".'
      );
    }
    if (json.ok === false) throw new Error(json.error || 'Error del backend');
    return json;
  }

  /* ---------- capa demo ---------- */

  /* Los marcajes de prueba se guardan en localStorage para que el
     recorrido completo funcione: marcas en el telefono y el punto
     aparece en el panel. Es por navegador, no entre dispositivos;
     eso ultimo requiere el backend real conectado. */
  const CLAVE_DEMO = 'asistencia_gps_demo';

  const demo = {
    _leer() {
      try {
        return JSON.parse(global.localStorage.getItem(CLAVE_DEMO)) || [];
      } catch (e) {
        return []; // modo privado o almacenamiento bloqueado
      }
    },

    _guardar(filas) {
      try {
        global.localStorage.setItem(CLAVE_DEMO, JSON.stringify(filas));
      } catch (e) { /* sin almacenamiento: se pierde al salir */ }
    },

    limpiar() {
      try { global.localStorage.removeItem(CLAVE_DEMO); } catch (e) {}
    },

    datos() {
      const d = global.DEMO_DATA;
      return Promise.resolve({
        ok: true,
        demo: true,
        lugares: d.lugares,
        lugarActual: d.lugares.find((l) => l.id === d.lugarActual),
        personas: d.personas,
        asistencia: d.asistencia.concat(this._leer()),
      });
    },

    persona(id) {
      const d = global.DEMO_DATA;
      const p = d.personas.find((x) => x.id === id);
      const lugar = d.lugares.find((l) => l.id === d.lugarActual);
      if (!p) return Promise.resolve({ ok: false, error: 'ID no registrado', lugar });
      const ya = d.asistencia.concat(this._leer())
        .some((a) => a.id === id && a.fecha === fechaHoy());
      return Promise.resolve({ ok: true, demo: true, persona: p, lugar, yaMarco: ya });
    },

    marcar(p) {
      const d = global.DEMO_DATA;
      const per = d.personas.find((x) => x.id === p.nfc);
      const lugar = d.lugares.find((l) => l.id === d.lugarActual);
      if (!per) return Promise.resolve({ ok: false, error: 'ID no registrado' });

      const dist = distancia(p.lat, p.lon, lugar.lat, lugar.lon);
      const radio = lugar.radio || CFG.RADIO_DEFAULT;
      const fila = {
        fecha: fechaHoy(),
        hora: horaAhora(),
        id: p.nfc,
        lugar: lugar.nombre,
        lat: p.lat,
        lon: p.lon,
        precision: p.precision,
        distancia: dist,
        estado: dist <= radio ? 'EN_ZONA' : 'FUERA_ZONA',
      };
      const filas = this._leer();
      filas.push(fila);
      this._guardar(filas);

      return Promise.resolve({
        ok: true,
        demo: true,
        registro: fila,
        persona: per,
        lugar,
        distancia: dist,
        dentroZona: dist <= radio,
      });
    },
  };

  /* ---------- API publica ---------- */

  const API = {
    esDemo: () => CFG.DEMO,

    /** Borra los marcajes de prueba. Solo aplica en modo demo. */
    limpiarDemo() { demo.limpiar(); },

    /** Datos completos para el panel. */
    datos() {
      return CFG.DEMO ? demo.datos() : llamar('datos');
    },

    /** Info de una persona + lugar activo, antes de marcar. */
    persona(id) {
      return CFG.DEMO ? demo.persona(id) : llamar('persona', { nfc: id });
    },

    /** Registra el marcaje. Requiere lat/lon/precision. */
    marcar({ nfc, lat, lon, precision }) {
      const p = { nfc, lat, lon, precision };
      return CFG.DEMO ? demo.marcar(p) : llamar('marcar', p);
    },
  };

  global.API = API;
  global.Utils = { distancia, metros, fechaHoy, horaAhora, obtenerUbicacion, pad };
})(window);
