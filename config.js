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

  // Milisegundos de espera maxima por una lectura GPS
  GPS_TIMEOUT: 20000,

  // Si la precision reportada supera esto (m), se avisa al usuario
  PRECISION_ACEPTABLE: 100,

  // Refresco automatico del panel (ms)
  REFRESCO_PANEL: 30000,

  // Nombre visible del evento/viaje
  EVENTO: 'ASUNTA CUSCO',
};

window.CONFIG.DEMO = !window.CONFIG.API_URL;
