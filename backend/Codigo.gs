/**
 * ============================================================
 *  API de asistencia con GPS  —  Google Apps Script
 * ============================================================
 *
 *  Convierte la hoja de calculo en el backend de la plataforma
 *  web. La hoja deja de ser la interfaz y pasa a ser solo el
 *  almacen; todo se opera desde el panel en GitHub Pages.
 *
 *  INSTALACION
 *  -----------
 *  1. Abre la hoja → Extensiones → Apps Script
 *  2. Pega este archivo completo (reemplaza lo que haya)
 *  3. Ejecuta una vez la funcion  prepararHoja  y autoriza
 *  4. Implementar → Nueva implementacion → Aplicacion web
 *       Ejecutar como:        Yo
 *       Quien tiene acceso:   Cualquier persona
 *  5. Copia la URL /exec y pegala en config.js del frontend
 *
 *  Al cambiar el codigo hay que crear una NUEVA implementacion
 *  (o "Administrar implementaciones" → editar → version nueva)
 *  para que los cambios salgan en vivo.
 * ============================================================
 */

var TZ = 'America/Lima';
var RADIO_DEFAULT = 150;

/* ------------------------------------------------------------
   Utilidades de hoja
   ------------------------------------------------------------ */

function libro_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function hoja_(nombre) {
  var h = libro_().getSheetByName(nombre);
  if (!h) throw new Error('Falta la pestana "' + nombre + '"');
  return h;
}

/** Lee una pestana como array de objetos usando la fila 1 como cabecera. */
function leer_(nombre) {
  var datos = hoja_(nombre).getDataRange().getValues();
  if (datos.length < 2) return [];
  var cab = datos[0].map(function (c) { return String(c).trim(); });
  return datos.slice(1).map(function (fila) {
    var o = {};
    cab.forEach(function (c, i) { if (c) o[c] = fila[i]; });
    return o;
  }).filter(function (o) {
    return Object.keys(o).some(function (k) { return o[k] !== '' && o[k] !== null; });
  });
}

/** Asegura que existan las columnas indicadas; las agrega al final si faltan. */
function asegurarColumnas_(nombre, columnas) {
  var h = hoja_(nombre);
  var ancho = Math.max(h.getLastColumn(), 1);
  var cab = h.getRange(1, 1, 1, ancho).getValues()[0]
             .map(function (c) { return String(c).trim(); });

  var faltantes = columnas.filter(function (c) { return cab.indexOf(c) === -1; });
  if (!faltantes.length) return;

  h.getRange(1, cab.length + 1, 1, faltantes.length).setValues([faltantes]);
  h.getRange(1, 1, 1, cab.length + faltantes.length).setFontWeight('bold');
}

/** Indice 0-based de una columna por su nombre de cabecera. */
function indiceCol_(hojaObj, nombreCol) {
  var cab = hojaObj.getRange(1, 1, 1, hojaObj.getLastColumn()).getValues()[0]
                   .map(function (c) { return String(c).trim(); });
  return cab.indexOf(nombreCol);
}

/* ------------------------------------------------------------
   Geo
   ------------------------------------------------------------ */

/** Distancia Haversine en metros. */
function distancia_(lat1, lon1, lat2, lon2) {
  var R = 6371000, rad = Math.PI / 180;
  var dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  var a = Math.pow(Math.sin(dLat / 2), 2) +
          Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.pow(Math.sin(dLon / 2), 2);
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/* ------------------------------------------------------------
   Dominio
   ------------------------------------------------------------ */

function lugares_() {
  return leer_('Lugares').map(function (r) {
    return {
      id: Number(r.ID),
      nombre: String(r.Lugar || '').trim(),
      lat: r.Lat === '' || r.Lat == null ? null : Number(r.Lat),
      lon: r.Lon === '' || r.Lon == null ? null : Number(r.Lon),
      radio: Number(r.Radio) || RADIO_DEFAULT,
      activo: String(r.Activo).toUpperCase() === 'SI',
    };
  }).filter(function (l) { return l.nombre; });
}

/**
 * Lee el lugar activo desde la pestana Configuracion.
 * Tolera que la clave LUGAR_ACTUAL este en cualquier fila de la
 * columna A; si no encuentra valor, cae al primer lugar activo.
 */
function lugarActual_() {
  var todos = lugares_();
  var nombre = '';

  try {
    var datos = hoja_('Configuracion').getDataRange().getValues();
    for (var i = 0; i < datos.length; i++) {
      if (String(datos[i][0]).trim().toUpperCase() === 'LUGAR_ACTUAL') {
        nombre = String(datos[i][1] || '').trim();
        break;
      }
    }
    // Respaldo: alguna celda de la columna B que coincida con un lugar conocido
    if (!nombre) {
      for (var j = 0; j < datos.length; j++) {
        var v = String(datos[j][1] || '').trim();
        if (v && todos.some(function (l) { return l.nombre === v; })) { nombre = v; break; }
      }
    }
  } catch (e) { /* sin pestana Configuracion */ }

  var hallado = todos.filter(function (l) { return l.nombre === nombre; })[0];
  if (hallado) return hallado;
  return todos.filter(function (l) { return l.activo; })[0] || todos[0] || null;
}

function personas_() {
  return leer_('Personas').map(function (r) {
    return {
      id: String(r.NFC_ID || '').trim().toUpperCase(),
      nombre: String(r.Nombre || '').trim(),
      seccion: String(r.Seccion || '').trim(),
      activo: String(r.Activo).toUpperCase() !== 'NO',
    };
  }).filter(function (p) { return p.id; });
}

function asistencia_() {
  return leer_('Asistencia').map(function (r) {
    var fecha = r.Fecha instanceof Date
      ? Utilities.formatDate(r.Fecha, TZ, 'dd/MM/yyyy')
      : String(r.Fecha || '').trim();
    var hora = r.Hora instanceof Date
      ? Utilities.formatDate(r.Hora, TZ, 'HH:mm:ss')
      : String(r.Hora || '').trim();
    return {
      fecha: fecha,
      hora: hora,
      id: String(r.NFC_ID || '').trim().toUpperCase(),
      lugar: String(r.Lugar || '').trim(),
      lat: r.Lat === '' || r.Lat == null ? null : Number(r.Lat),
      lon: r.Lon === '' || r.Lon == null ? null : Number(r.Lon),
      precision: r.Precision === '' || r.Precision == null ? null : Number(r.Precision),
      distancia: r.Distancia === '' || r.Distancia == null ? null : Number(r.Distancia),
      estado: String(r.Estado || '').trim() || 'SIN_GPS',
    };
  }).filter(function (a) { return a.id; });
}

/* ------------------------------------------------------------
   Acciones
   ------------------------------------------------------------ */

function accionDatos_() {
  return {
    ok: true,
    lugares: lugares_(),
    lugarActual: lugarActual_(),
    personas: personas_(),
    asistencia: asistencia_(),
  };
}

function accionPersona_(nfc) {
  var p = personas_().filter(function (x) { return x.id === nfc; })[0];
  var lugar = lugarActual_();
  if (!p) return { ok: false, error: 'ID no registrado', lugar: lugar };

  var hoy = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy');
  var yaMarco = asistencia_().some(function (a) {
    return a.id === nfc && a.fecha === hoy;
  });
  return { ok: true, persona: p, lugar: lugar, yaMarco: yaMarco };
}

function accionMarcar_(nfc, lat, lon, precision) {
  if (isNaN(lat) || isNaN(lon)) {
    return { ok: false, error: 'Faltan coordenadas GPS' };
  }

  var p = personas_().filter(function (x) { return x.id === nfc; })[0];
  if (!p) return { ok: false, error: 'ID no registrado: ' + nfc };
  if (!p.activo) return { ok: false, error: 'Esta persona esta marcada como inactiva' };

  var lugar = lugarActual_();
  if (!lugar) return { ok: false, error: 'No hay un lugar activo configurado' };

  var dist = null, estado = 'SIN_REFERENCIA';
  if (lugar.lat != null && lugar.lon != null) {
    dist = distancia_(lat, lon, lugar.lat, lugar.lon);
    estado = dist <= lugar.radio ? 'EN_ZONA' : 'FUERA_ZONA';
  }

  var ahora = new Date();
  var fecha = Utilities.formatDate(ahora, TZ, 'dd/MM/yyyy');
  var hora = Utilities.formatDate(ahora, TZ, 'HH:mm:ss');

  // Serializa las escrituras: 66 alumnas escaneando a la vez
  // pueden pisarse el ultimo renglon.
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var h = hoja_('Asistencia');
    var cab = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0]
               .map(function (c) { return String(c).trim(); });

    var valores = {
      'Fecha': fecha,
      'Hora': hora,
      'NFC_ID': nfc,
      'Nombre': p.nombre,
      'Lugar': lugar.nombre,
      'Dispositivo': 'WEB_GPS',
      'Lat': lat,
      'Lon': lon,
      'Precision': precision,
      'Distancia': dist,
      'Estado': estado,
    };

    var fila = cab.map(function (c) {
      return valores.hasOwnProperty(c) ? valores[c] : '';
    });
    h.appendRow(fila);
  } finally {
    lock.releaseLock();
  }

  return {
    ok: true,
    persona: p,
    lugar: lugar,
    distancia: dist,
    dentroZona: estado === 'EN_ZONA',
    registro: {
      fecha: fecha, hora: hora, id: nfc, lugar: lugar.nombre,
      lat: lat, lon: lon, precision: precision,
      distancia: dist, estado: estado,
    },
  };
}

/* ------------------------------------------------------------
   Enrutador HTTP
   ------------------------------------------------------------ */

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Compatibilidad con las etiquetas NFC y QR ya impresos:
 * las antiguas apuntan a /exec?nfc=NFC001 sin parametro action.
 * En vez de marcar a ciegas (sin GPS), se redirige a la
 * plataforma para que pase por el flujo con ubicacion.
 */
function redirigirAPlataforma_(nfc) {
  var url = PropertiesService.getScriptProperties().getProperty('URL_PLATAFORMA');
  if (!url) {
    return HtmlService.createHtmlOutput(
      '<p style="font-family:system-ui;padding:24px;line-height:1.6">' +
      'Falta configurar <b>URL_PLATAFORMA</b> en las propiedades del script.<br>' +
      'Apps Script → Configuracion del proyecto → Propiedades del script.</p>'
    );
  }
  var destino = url.replace(/\/+$/, '') + '/marcar.html?id=' + encodeURIComponent(nfc);
  var d = JSON.stringify(destino);

  // Apps Script sirve esta salida dentro de un iframe, asi que un
  // location.replace normal navegaria solo el iframe y el usuario se
  // quedaria viendo el marco de Google. Hay que mover el frame
  // superior; si el navegador lo bloquea, queda el enlace manual.
  return HtmlService.createHtmlOutput(
    '<style>body{font-family:system-ui,sans-serif;padding:32px;text-align:center;' +
    'color:#131a29}a{display:inline-block;margin-top:14px;padding:13px 22px;' +
    'background:#2f5fe0;color:#fff;text-decoration:none;border-radius:10px;' +
    'font-weight:600}</style>' +
    '<p>Abriendo el registro de asistencia…</p>' +
    '<a id="ir" href="' + destino + '" target="_top">Continuar</a>' +
    '<script>(function(){try{window.top.location.href=' + d + ';}' +
    'catch(e){try{window.location.href=' + d + ';}catch(e2){}}})();<\/script>'
  )
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .addMetaTag('robots', 'noindex, nofollow');
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var accion = String(p.action || '').trim();
    var nfc = String(p.nfc || p.id || '').trim().toUpperCase();

    if (!accion) {
      // Etiqueta antigua escaneada directamente
      if (nfc) return redirigirAPlataforma_(nfc);
      return json_({ ok: true, servicio: 'asistencia-gps', version: 2 });
    }

    if (accion === 'datos')   return json_(accionDatos_());
    if (accion === 'persona') return json_(accionPersona_(nfc));
    if (accion === 'marcar') {
      return json_(accionMarcar_(
        nfc,
        parseFloat(p.lat),
        parseFloat(p.lon),
        p.precision === undefined ? null : Math.round(parseFloat(p.precision))
      ));
    }
    return json_({ ok: false, error: 'Accion desconocida: ' + accion });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  return doGet(e);
}

/* ------------------------------------------------------------
   Preparacion inicial  —  ejecutar UNA vez a mano
   ------------------------------------------------------------ */

/**
 * Agrega las columnas nuevas que necesita el GPS y siembra las
 * coordenadas de los lugares conocidos. Es idempotente: se
 * puede volver a ejecutar sin duplicar nada.
 */
function prepararHoja() {
  asegurarColumnas_('Asistencia', ['Lat', 'Lon', 'Precision', 'Distancia', 'Estado']);
  asegurarColumnas_('Lugares', ['Lat', 'Lon', 'Radio']);

  // Coordenadas de referencia (Arequipa). Ajusta las que falten
  // parandote en el sitio y copiando lo que marque tu telefono.
  var conocidos = {
    'PLAZA DE ARMAS':       { lat: -16.398900, lon: -71.537000, radio: 180 },
    'MIRADOR DE YANAHUARA': { lat: -16.390600, lon: -71.544500, radio: 150 },
    'CANON DEL COLCA':      { lat: -15.601900, lon: -71.984700, radio: 300 },
    'CAÑON DEL COLCA':      { lat: -15.601900, lon: -71.984700, radio: 300 },
    'CAÑÓN DEL COLCA':      { lat: -15.601900, lon: -71.984700, radio: 300 },
  };

  var h = hoja_('Lugares');
  var iNombre = indiceCol_(h, 'Lugar');
  var iLat = indiceCol_(h, 'Lat');
  var iLon = indiceCol_(h, 'Lon');
  var iRadio = indiceCol_(h, 'Radio');

  var rango = h.getDataRange();
  var datos = rango.getValues();
  var cambios = 0;

  for (var f = 1; f < datos.length; f++) {
    var nombre = String(datos[f][iNombre] || '').trim().toUpperCase();
    if (!nombre) continue;

    if (!datos[f][iRadio]) { datos[f][iRadio] = RADIO_DEFAULT; cambios++; }

    var c = conocidos[nombre];
    if (c && !datos[f][iLat]) {
      datos[f][iLat] = c.lat;
      datos[f][iLon] = c.lon;
      datos[f][iRadio] = c.radio;
      cambios++;
    }
  }
  if (cambios) rango.setValues(datos);

  var pendientes = [];
  lugares_().forEach(function (l) {
    if (l.lat == null || l.lon == null) pendientes.push(l.nombre);
  });

  var msg = 'Hoja preparada.\n\nColumnas GPS agregadas.\n';
  msg += pendientes.length
    ? '\nFALTAN coordenadas en:\n  · ' + pendientes.join('\n  · ') +
      '\n\nRellena Lat/Lon de esos lugares en la pestana "Lugares".' +
      '\nSin coordenadas no hay validacion de geocerca (se registra igual).'
    : '\nTodos los lugares tienen coordenadas.';

  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* sin UI */ }
  return msg;
}

/**
 * Guarda la URL publica del frontend para que las etiquetas
 * antiguas (/exec?nfc=...) redirijan a la plataforma.
 * Cambia el valor por tu URL de GitHub Pages y ejecuta una vez.
 */
function configurarURLPlataforma() {
  var URL = 'https://USUARIO.github.io/REPOSITORIO';
  PropertiesService.getScriptProperties().setProperty('URL_PLATAFORMA', URL);
  Logger.log('URL_PLATAFORMA = ' + URL);
}
