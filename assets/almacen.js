/* ============================================================
   Almacen local: cache de lectura y bandeja de salida.

   La red pasa a ser una optimizacion, no un requisito. El guia
   descarga el grupo con señal antes de salir y a partir de ahi
   la pantalla funciona igual en el Colca que en el hotel: lee de
   cache y encola lo que escribe.

   Se usa localStorage y no IndexedDB a proposito. El volumen es
   pequeño —un grupo de 40 alumnos ocupa unos 12 KB— y a cambio
   se evita toda la asincronia de IndexedDB en la ruta critica
   del escaneo, donde el guia toca y espera respuesta inmediata.
   ============================================================ */
(function (global) {
  'use strict';

  const PRE = 'agps_';
  const oyentes = [];

  function leerJSON(clave, porDefecto) {
    try {
      const v = localStorage.getItem(PRE + clave);
      return v ? JSON.parse(v) : porDefecto;
    } catch (e) { return porDefecto; }
  }

  function escribirJSON(clave, valor) {
    try {
      localStorage.setItem(PRE + clave, JSON.stringify(valor));
      return true;
    } catch (e) {
      // Cuota llena: lo unico que no se puede perder es la bandeja
      console.warn('No se pudo guardar', clave, e);
      return false;
    }
  }

  const uuid = () =>
    (global.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'l-' + Date.now() + '-' + Math.random().toString(16).slice(2);

  /* ---------- cache de lectura ---------- */

  const Cache = {
    poner(clave, valor) {
      escribirJSON('c_' + clave, { en: Date.now(), v: valor });
    },
    sacar(clave) {
      const c = leerJSON('c_' + clave, null);
      return c ? c.v : null;
    },
    edad(clave) {
      const c = leerJSON('c_' + clave, null);
      return c ? Date.now() - c.en : null;
    },
    limpiar() {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith(PRE + 'c_'))
          .forEach((k) => localStorage.removeItem(k));
      } catch (e) {}
    },
  };

  /* ---------- bandeja de salida ---------- */

  function avisar() {
    const n = Bandeja.todas().length;
    oyentes.forEach((fn) => { try { fn(n); } catch (e) {} });
  }

  const Bandeja = {
    todas() { return leerJSON('bandeja', []); },

    /**
     * Encola una escritura. `llave` sirve para deduplicar: dos
     * intentos de marcar al mismo alumno en la misma parada son
     * la misma operacion, no dos.
     */
    poner(op) {
      const filas = this.todas();
      const i = op.llave ? filas.findIndex((f) => f.llave === op.llave) : -1;
      const fila = Object.assign({ id: uuid(), en: Date.now(), intentos: 0 }, op);
      if (i >= 0) filas[i] = fila; else filas.push(fila);
      escribirJSON('bandeja', filas);
      avisar();
      return fila;
    },

    quitar(id) {
      escribirJSON('bandeja', this.todas().filter((f) => f.id !== id));
      avisar();
    },

    reemplazar(filas) { escribirJSON('bandeja', filas); avisar(); },

    /** Pendientes de un tipo, para mezclarlos en la vista. */
    de(tipo) { return this.todas().filter((f) => f.tipo === tipo); },

    limpiar() { escribirJSON('bandeja', []); avisar(); },

    alCambiar(fn) { oyentes.push(fn); fn(this.todas().length); },
  };

  global.Almacen = { Cache, Bandeja, uuid, enLinea: () => navigator.onLine !== false };
})(window);
