/* ============================================================
   CONFIGURACION

   Con SUPABASE_URL vacio la plataforma corre en MODO LOCAL: todo
   el flujo funciona (registro, paradas, marcaje, tiempo real
   entre pestañas) pero los datos viven solo en este navegador.
   Sirve para validar el recorrido antes de crear la cuenta.

   Para conectar de verdad, pega abajo los dos valores de
   Supabase → Project Settings → API.
   ============================================================ */
window.CONFIG = {
  // Ej: 'https://abcdefgh.supabase.co'
  SUPABASE_URL: 'https://luivrngudsqhqeuaaife.supabase.co',
  // La clave "anon public". Es publica por diseño: la seguridad
  // real la imponen las politicas RLS del esquema.
  SUPABASE_ANON_KEY: 'sb_publishable_XU3vkx791_t2D5ltagaDng_13foEg9V',

  // Metros de tolerancia por defecto al abrir una parada
  RADIO_DEFAULT: 150,

  // Milisegundos que se insiste esperando que el GPS fije
  // satelites. No es un plazo de fallo: es cuanto se sigue
  // escuchando lecturas cada vez mejores.
  GPS_TIMEOUT: 25000,

  // Precision (m) con la que se corta de inmediato: ya es
  // lectura de satelite y no vale la pena seguir esperando.
  PRECISION_OBJETIVO: 30,

  // Por encima de esto la lectura viene de antena o wifi y el
  // marcaje se rechaza: puede errar kilometros.
  PRECISION_MAXIMA: 150,

  // Respaldo del panel del guia por si cae el websocket
  REFRESCO_PANEL: 20000,

  EVENTO: 'Asistencia GPS',

  /* ----------------------------------------------------------
     ACCESO DE GUIAS Y ADMINISTRACION

     Lista simple de usuarios. Edita, añade o quita los que
     quieras: se aplican al recargar, sin tocar nada mas.

     IMPORTANTE — que protege y que no:

     · SI evita que un alumno curioso entre a la pantalla del
       guia, vea donde esta todo el mundo o cierre una parada.
     · NO es seguridad real. Estas claves viajan en el codigo de
       la pagina, asi que quien sepa mirar el fuente las ve. Y
       aunque no las viera, la clave publica de Supabase permite
       llamar a la base directamente.

     Para cerrarlo de verdad hay que pasar a Supabase Auth: poner
     ACCESO_SUPABASE en true, crear los usuarios en Supabase →
     Authentication → Users, y aplicar el bloque comentado al
     final de backend/schema.sql. Ver el README.
     ---------------------------------------------------------- */
  ACCESO_SUPABASE: false,

  ACCESO: [
    { usuario: 'guia1', clave: 'colca-4291',    nombre: 'Guía 1',         rol: 'guia'  },
    { usuario: 'guia2', clave: 'condor-4904',   nombre: 'Guía 2',         rol: 'guia'  },
    { usuario: 'guia3', clave: 'chili-9334',    nombre: 'Guía 3',         rol: 'guia'  },
    { usuario: 'guia4', clave: 'sillar-4314',   nombre: 'Guía 4',         rol: 'guia'  },
    { usuario: 'admin', clave: 'chachani-6257', nombre: 'Administración', rol: 'admin' },
  ],
};

// Solo hay backend real si estan los DOS valores; con uno suelto
// el motor cae al local y el indicador debe decir lo mismo.
window.CONFIG.DEMO = !(window.CONFIG.SUPABASE_URL &&
                       window.CONFIG.SUPABASE_ANON_KEY);
