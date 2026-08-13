/* ============================================================
   Geolocalizacion y formato.

   El punto delicado de todo el sistema: conseguir una posicion
   de satelite y no la primera aproximacion que ofrezca el
   sistema operativo.
   ============================================================ */
(function (global) {
  'use strict';

  const CFG = global.CONFIG;
  const pad = (n) => String(n).padStart(2, '0');

  const CODIGOS = { 1: 'PERMISO_DENEGADO', 2: 'POSICION_NO_DISPONIBLE', 3: 'TIEMPO_AGOTADO' };

  function distancia(lat1, lon1, lat2, lon2) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }

  function metros(m) {
    if (m == null || isNaN(m)) return '--';
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
  }

  function hora(iso) {
    const d = iso ? new Date(iso) : new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function horaSeg(iso) {
    const d = iso ? new Date(iso) : new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  /** Un aparato sin pantalla tactil casi nunca tiene chip GPS. */
  function pareceEscritorio() {
    const sinTactil = !('ontouchstart' in global) && navigator.maxTouchPoints === 0;
    const movil = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    return sinTactil && !movil;
  }

  /**
   * Obtiene la posicion insistiendo hasta lograr precision de GPS.
   *
   * getCurrentPosition devuelve la PRIMERA lectura disponible, que
   * casi siempre viene de antena de telefonia o de wifi: llega en
   * un segundo y puede errar kilometros. El chip GPS necesita
   * varios segundos para fijar satelites y sus lecturas mejoran
   * progresivamente.
   *
   * Por eso se usa watchPosition: se escuchan lecturas sucesivas,
   * se conserva la mejor y se corta en cuanto una baja del
   * objetivo. Si se agota el tiempo se devuelve la mejor lograda,
   * marcada con `fiable` para que la interfaz decida.
   */
  function ubicacion(onProgreso) {
    return new Promise((resolve, reject) => {
      if (!global.navigator || !navigator.geolocation) {
        return reject({ codigo: 'NO_SOPORTADO',
                        mensaje: 'Este navegador no soporta geolocalizacion.' });
      }
      if (!global.isSecureContext) {
        return reject({ codigo: 'SIN_HTTPS',
                        mensaje: 'La ubicacion requiere HTTPS.' });
      }

      let mejor = null, vigilancia = null, cerrado = false;

      function cerrar(optima) {
        if (cerrado) return;
        cerrado = true;
        clearTimeout(reloj);
        if (vigilancia !== null) navigator.geolocation.clearWatch(vigilancia);
        if (mejor) {
          mejor.fiable = mejor.precision <= CFG.PRECISION_MAXIMA;
          mejor.optima = !!optima;
          resolve(mejor);
        } else {
          reject({ codigo: 'TIEMPO_AGOTADO',
                   mensaje: 'No se obtuvo ninguna lectura.' });
        }
      }

      vigilancia = navigator.geolocation.watchPosition(
        function (pos) {
          const l = {
            lat: +pos.coords.latitude.toFixed(6),
            lon: +pos.coords.longitude.toFixed(6),
            precision: Math.round(pos.coords.accuracy),
          };
          if (!mejor || l.precision < mejor.precision) {
            mejor = l;
            if (onProgreso) onProgreso(mejor);
          }
          if (mejor.precision <= CFG.PRECISION_OBJETIVO) cerrar(true);
        },
        function (err) {
          if (mejor) return cerrar(false);
          cerrado = true;
          clearTimeout(reloj);
          if (vigilancia !== null) navigator.geolocation.clearWatch(vigilancia);
          reject({ codigo: CODIGOS[err.code] || 'DESCONOCIDO', mensaje: err.message });
        },
        { enableHighAccuracy: true, timeout: CFG.GPS_TIMEOUT, maximumAge: 0 }
      );

      const reloj = setTimeout(function () { cerrar(false); }, CFG.GPS_TIMEOUT);
    });
  }

  /** Instrucciones para reactivar el permiso segun el aparato. */
  function ayudaPermiso() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) {
      return '<strong>En iPhone:</strong><br>' +
             '1. Ajustes → Privacidad y seguridad → Localización<br>' +
             '2. Verifica que esté activada<br>' +
             '3. Busca Safari → "Al usar la app"<br>' +
             '4. Vuelve aquí y toca Reintentar';
    }
    if (/Android/i.test(ua)) {
      return '<strong>En Android:</strong><br>' +
             '1. Toca el candado 🔒 junto a la dirección web<br>' +
             '2. Permisos → Ubicación → Permitir<br>' +
             '3. Recarga y toca Reintentar';
    }
    return '<strong>Para activarlo:</strong> toca el icono junto a la dirección ' +
           'web, permite el acceso a la ubicación y recarga.';
  }

  global.Geo = {
    ubicacion, distancia, metros, hora, horaSeg, pad,
    pareceEscritorio, ayudaPermiso,
  };
})(window);
