/* ============================================================
   CONFIGURACION
   Para pasar de DEMO a REAL: pega abajo la URL /exec de tu
   Apps Script. Si queda vacia, la plataforma corre en modo
   DEMO con datos anonimos (no toca tu hoja real).
   ============================================================ */
window.CONFIG = {
  // Ej: 'https://script.google.com/macros/s/AKfy.../exec'
  API_URL: '',

  // Metros de tolerancia por defecto si el lugar no define radio propio
  RADIO_DEFAULT: 150,

  // Milisegundos que se insiste esperando que el GPS fije satelites.
  // No es un plazo de fallo: es cuanto se sigue escuchando lecturas
  // cada vez mejores antes de quedarse con la mejor lograda.
  GPS_TIMEOUT: 25000,

  // Precision (m) con la que se corta de inmediato: es una lectura
  // de satelite y no vale la pena seguir esperando.
  PRECISION_OBJETIVO: 30,

  // Por encima de esto la lectura se considera de antena o wifi y el
  // marcaje se rechaza. Una posicion de antena puede errar kilometros.
  PRECISION_MAXIMA: 150,

  // Refresco automatico del panel (ms)
  REFRESCO_PANEL: 30000,

  // Nombre visible del evento/viaje
  EVENTO: 'ASUNTA CUSCO',
};

window.CONFIG.DEMO = !window.CONFIG.API_URL;
