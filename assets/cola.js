/* ============================================================
   Cola de marcajes sin señal.

   En el Cañon del Colca no hay cobertura. El GPS si funciona
   —los satelites no necesitan internet— pero enviar el marcaje
   si. Sin esta cola se perderia justo la parada mas aislada.

   El marcaje se guarda con su hora y sus coordenadas REALES del
   momento de la captura, y se sube tal cual al recuperar señal.
   La hora que queda registrada es la de la captura, no la del
   envio: si alguien marca a las 10:00 en el Colca y sincroniza
   a las 14:00 en Arequipa, la asistencia dice 10:00.
   ============================================================ */
(function (global) {
  'use strict';

  const CLAVE = 'agps_cola_v1';
  const oyentes = [];

  function leer() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || []; }
    catch (e) { return []; }
  }

  function guardar(filas) {
    try { localStorage.setItem(CLAVE, JSON.stringify(filas)); }
    catch (e) { /* sin almacenamiento */ }
    avisar();
  }

  function avisar() {
    const n = leer().length;
    oyentes.forEach((fn) => { try { fn(n); } catch (e) {} });
  }

  let sincronizando = false;

  const Cola = {
    /** Guarda un marcaje que no se pudo enviar. */
    encolar(datos) {
      const filas = leer();
      // Una pulsera solo puede tener un pendiente por parada:
      // si reintenta, se reemplaza en vez de duplicar
      const i = filas.findIndex((f) => f.codigo === datos.codigo);
      const fila = Object.assign({}, datos, {
        capturado_en: datos.capturado_en || new Date().toISOString(),
        intentos: 0,
      });
      if (i >= 0) filas[i] = fila; else filas.push(fila);
      guardar(filas);
      return fila;
    },

    pendientes() { return leer(); },
    cuantos() { return leer().length; },

    /** Se notifica cada vez que cambia el numero de pendientes. */
    alCambiar(fn) { oyentes.push(fn); fn(this.cuantos()); },

    limpiar() { guardar([]); },

    /**
     * Intenta subir todo lo pendiente. Seguro de llamar en
     * cualquier momento: si no hay red o ya hay una sincronizacion
     * en curso, no hace nada.
     * @returns {Promise<{subidos:number, quedan:number}>}
     */
    async sincronizar() {
      if (sincronizando) return { subidos: 0, quedan: this.cuantos() };
      if (!navigator.onLine) return { subidos: 0, quedan: this.cuantos() };

      sincronizando = true;
      let subidos = 0;
      try {
        const filas = leer();
        const quedan = [];

        for (const fila of filas) {
          try {
            await global.Datos.marcar({
              codigo: fila.codigo,
              lat: fila.lat,
              lon: fila.lon,
              precision: fila.precision,
              diferido: true,
              capturado_en: fila.capturado_en,
            });
            subidos++;
          } catch (e) {
            // Un error de datos no se arregla reintentando: se
            // descarta para no atascar la cola para siempre.
            const definitivo = e && /PULSERA|ALUMNO|PARADA/.test(e.codigo || '');
            fila.intentos = (fila.intentos || 0) + 1;
            fila.ultimoError = (e && e.codigo) || 'RED';
            if (!definitivo && fila.intentos < 20) quedan.push(fila);
          }
        }
        guardar(quedan);
        return { subidos, quedan: quedan.length };
      } finally {
        sincronizando = false;
      }
    },
  };

  // Reintenta al recuperar conexion y cada minuto por si el
  // evento online no llega (pasa en algunos Android).
  global.addEventListener('online', function () { Cola.sincronizar(); });
  setInterval(function () { if (Cola.cuantos()) Cola.sincronizar(); }, 60000);
  global.addEventListener('load', function () {
    if (Cola.cuantos()) Cola.sincronizar();
  });

  global.Cola = Cola;
})(window);
