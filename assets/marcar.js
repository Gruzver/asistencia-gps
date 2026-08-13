/* ============================================================
   Flujo de marcaje desde el QR.

   Politica configurada: sin GPS NO hay asistencia. Si el
   permiso se deniega el marcaje se bloquea y se muestran las
   instrucciones para reactivarlo segun el navegador.
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const pasos = ['paso-carga', 'paso-consentimiento', 'paso-gps', 'paso-ok', 'paso-error'];

  function mostrar(id) {
    pasos.forEach((p) => $(p).classList.toggle('oculto', p !== id));
  }

  function error(titulo, mensaje, ayuda) {
    $('e-titulo').textContent = titulo;
    $('e-mensaje').textContent = mensaje;
    const cajaAyuda = $('e-ayuda');
    if (ayuda) {
      cajaAyuda.innerHTML = ayuda;
      cajaAyuda.classList.remove('oculto');
    } else {
      cajaAyuda.classList.add('oculto');
    }
    mostrar('paso-error');
  }

  /* Instrucciones por navegador para reactivar el permiso. */
  function ayudaPermiso() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) {
      return (
        '<strong>Para activarlo en iPhone:</strong><br>' +
        '1. Ajustes → Privacidad y seguridad → Localización<br>' +
        '2. Verifica que esté activada<br>' +
        '3. Busca Safari → "Al usar la app"<br>' +
        '4. Vuelve aquí y toca Reintentar'
      );
    }
    if (/Android/i.test(ua)) {
      return (
        '<strong>Para activarlo en Android:</strong><br>' +
        '1. Toca el candado 🔒 junto a la dirección web<br>' +
        '2. Permisos → Ubicación → Permitir<br>' +
        '3. Recarga y toca Reintentar'
      );
    }
    return (
      '<strong>Para activarlo:</strong> toca el icono junto a la dirección ' +
      'web, permite el acceso a la ubicación y recarga la página.'
    );
  }

  const params = new URLSearchParams(location.search);
  // Acepta ?id=NFC001 y tambien ?nfc=NFC001 (formato del sistema anterior)
  const id = (params.get('id') || params.get('nfc') || '').trim().toUpperCase();

  let contexto = null;

  async function iniciar() {
    if (!id) {
      return error(
        'Código faltante',
        'Este enlace no incluye un código de identificación.',
        'Escanea de nuevo tu código QR. Si el problema sigue, avisa al personal a cargo.'
      );
    }

    mostrar('paso-carga');
    try {
      const r = await API.persona(id);
      if (!r.ok) {
        return error(
          'Código no reconocido',
          `El código ${id} no está registrado en este evento.`,
          'Verifica que sea tu código. Si es el correcto, avisa al personal para registrarte.'
        );
      }
      contexto = r;

      $('c-evento').textContent = CONFIG.EVENTO;
      $('c-nombre').textContent = r.persona.nombre;
      $('c-seccion').textContent = r.persona.seccion ? `Sección ${r.persona.seccion}` : '';
      $('c-lugar').textContent = r.lugar ? r.lugar.nombre : '--';
      $('c-fecha').textContent = Utils.fechaHoy();

      if (r.yaMarco) {
        $('btn-marcar').textContent = 'Ya marcaste hoy — marcar otra vez';
        $('btn-marcar').classList.remove('primario');
      }
      mostrar('paso-consentimiento');
    } catch (e) {
      error('Sin conexión', e.message, 'Revisa tu conexión a internet y toca Reintentar.');
    }
  }

  /** Pinta en vivo cuanto ha mejorado la lectura de GPS. */
  function progresoGPS(lectura) {
    const p = lectura.precision;
    // Escala logaritmica: de 2000 m (0%) a 10 m (100%)
    const pct = Math.max(0, Math.min(100,
      ((Math.log10(2000) - Math.log10(Math.max(p, 10))) / (Math.log10(2000) - 1)) * 100
    ));
    const barra = $('gps-barra');
    barra.style.width = pct.toFixed(0) + '%';
    barra.classList.toggle('bien', p <= CONFIG.PRECISION_MAXIMA);

    $('gps-precision').textContent = `precisión ± ${Utils.metros(p)}`;
    const chip = $('gps-estado');
    if (p <= CONFIG.PRECISION_OBJETIVO)      { chip.className = 'insignia ok';     chip.textContent = 'GPS fijo'; }
    else if (p <= CONFIG.PRECISION_MAXIMA)   { chip.className = 'insignia ok';     chip.textContent = 'aceptable'; }
    else                                      { chip.className = 'insignia fuera';  chip.textContent = 'aún por antena'; }
  }

  async function marcar() {
    mostrar('paso-gps');
    $('gps-barra').style.width = '0';
    $('gps-barra').classList.remove('bien');
    $('gps-precision').textContent = 'esperando primera lectura…';
    $('gps-estado').className = 'insignia neutra';
    $('gps-estado').textContent = 'buscando';

    let pos;
    try {
      pos = await Utils.obtenerUbicacion(progresoGPS);
    } catch (g) {
      // Politica: sin ubicacion no se registra la asistencia.
      if (g.codigo === 'PERMISO_DENEGADO') {
        return error(
          'Ubicación bloqueada',
          'No podemos registrar tu asistencia sin tu ubicación.',
          ayudaPermiso()
        );
      }
      if (g.codigo === 'TIEMPO_AGOTADO') {
        return error(
          'GPS tardó demasiado',
          'No se pudo obtener una lectura a tiempo.',
          'Sal a un espacio abierto, aleja el teléfono de paredes y toca Reintentar.'
        );
      }
      if (g.codigo === 'SIN_HTTPS') {
        return error('Conexión no segura', g.mensaje, null);
      }
      return error(
        'Ubicación no disponible',
        'Tu dispositivo no pudo determinar dónde estás.',
        'Verifica que el GPS esté encendido y toca Reintentar.'
      );
    }

    // Una lectura de antena puede errar kilometros: registrarla
    // ensuciaria el mapa y acusaria de "fuera de zona" a alguien que
    // si estaba presente. Mejor rechazar y pedir reintento.
    if (!pos.fiable) {
      return error(
        'Ubicación imprecisa',
        `La mejor lectura fue de ± ${Utils.metros(pos.precision)}, ` +
          'que viene de antena de telefonía y no del GPS.',
        (Utils.pareceEscritorio()
          ? '<strong>Estás en una computadora.</strong> No tiene GPS: ' +
            'calcula la posición por tu conexión a internet y puede errar ' +
            'kilómetros.<br><br>Abre este enlace <strong>en el celular</strong>.'
          : '<strong>Para lograr señal de GPS:</strong><br>' +
            '1. Sal a un espacio abierto, sin techo encima<br>' +
            '2. Activa la ubicación en modo "Alta precisión"<br>' +
            '3. Espera unos segundos sin moverte<br>' +
            '4. Toca Reintentar')
      );
    }

    try {
      const r = await API.marcar({
        nfc: id,
        lat: pos.lat,
        lon: pos.lon,
        precision: pos.precision,
      });
      if (!r.ok) return error('No se pudo registrar', r.error || 'Error desconocido');

      $('ok-nombre').textContent = r.persona.nombre;
      $('ok-lugar').textContent = r.lugar.nombre;
      $('ok-hora').textContent = r.registro.hora;
      $('ok-distancia').textContent = Utils.metros(r.distancia);
      $('ok-precision').textContent = `± ${pos.precision} m`;

      // Geocerca: se registra siempre, solo se avisa.
      const zona = $('ok-zona');
      if (r.dentroZona) {
        zona.className = 'aviso bueno';
        zona.innerHTML = '<span>✓</span><span>Estás dentro de la zona del punto de encuentro.</span>';
      } else {
        zona.className = 'aviso info';
        zona.innerHTML =
          '<span>⚠</span><span><strong>Fuera de la zona.</strong> Tu asistencia quedó ' +
          'registrada, pero marcaste a ' + Utils.metros(r.distancia) +
          ' del punto. El personal lo verá señalado.</span>';
      }

      if (pos.precision > CONFIG.PRECISION_OBJETIVO) {
        zona.innerHTML +=
          '<br><small>Lectura de ± ' + Utils.metros(pos.precision) +
          '. La distancia puede variar en ese margen.</small>';
      }

      mostrar('paso-ok');
    } catch (e) {
      error('No se pudo registrar', e.message, 'Toca Reintentar.');
    }
  }

  $('btn-marcar').addEventListener('click', marcar);
  $('btn-reintentar').addEventListener('click', () => (contexto ? marcar() : iniciar()));

  iniciar();
})();
