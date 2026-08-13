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
  SUPABASE_URL: '',
  // La clave "anon public". Es publica por diseño: la seguridad
  // real la imponen las politicas RLS del esquema.
  SUPABASE_ANON_KEY: '',

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
};

window.CONFIG.DEMO = !window.CONFIG.SUPABASE_URL;
