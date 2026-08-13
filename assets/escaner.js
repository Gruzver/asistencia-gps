/* ============================================================
   Escaner de QR por camara.

   Dos caminos: BarcodeDetector nativo cuando existe (Android /
   Chrome, mucho mas rapido y sin descargar nada) y jsQR como
   respaldo universal, que cubre iPhone.

   Pensado para una fila de alumnos: tras cada lectura valida se
   hace una pausa corta y se sigue, sin que el guia tenga que
   volver a tocar nada entre uno y otro.
   ============================================================ */
(function (global) {
  'use strict';

  function Escaner(video, canvas) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.flujo = null;
    this.detector = null;
    this.activo = false;
    this.ultimo = null;
    this.ultimoEn = 0;
    this.pausaMs = 2200;   // evita releer la misma pulsera al vuelo
    this.alLeer = null;
  }

  Escaner.prototype.disponible = function () {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  };

  Escaner.prototype.iniciar = async function () {
    if (this.activo) return;

    if (!this.disponible()) {
      throw { codigo: 'SIN_CAMARA', mensaje: 'Este dispositivo no expone cámara.' };
    }
    if (!global.isSecureContext) {
      throw { codigo: 'SIN_HTTPS', mensaje: 'La cámara requiere HTTPS.' };
    }

    try {
      this.flujo = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 }, height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (e) {
      const codigo = (e && e.name === 'NotAllowedError') ? 'PERMISO_DENEGADO'
                   : (e && e.name === 'NotFoundError')   ? 'SIN_CAMARA'
                   : 'CAMARA_ERROR';
      throw { codigo, mensaje: (e && e.message) || 'No se pudo abrir la cámara.' };
    }

    this.video.srcObject = this.flujo;
    this.video.setAttribute('playsinline', '');  // iOS: no abrir a pantalla completa
    await this.video.play();

    if (global.BarcodeDetector) {
      try {
        const formatos = await global.BarcodeDetector.getSupportedFormats();
        if (formatos.includes('qr_code')) {
          this.detector = new global.BarcodeDetector({ formats: ['qr_code'] });
        }
      } catch (e) { this.detector = null; }
    }

    this.activo = true;
    this._bucle();
  };

  Escaner.prototype.detener = function () {
    this.activo = false;
    if (this.flujo) {
      this.flujo.getTracks().forEach((t) => t.stop());
      this.flujo = null;
    }
    this.video.srcObject = null;
  };

  Escaner.prototype._emitir = function (texto) {
    const ahora = Date.now();
    // Misma lectura dentro de la ventana de pausa: se ignora
    if (texto === this.ultimo && ahora - this.ultimoEn < this.pausaMs) return;
    this.ultimo = texto;
    this.ultimoEn = ahora;
    if (this.alLeer) this.alLeer(texto);
  };

  Escaner.prototype._bucle = async function () {
    if (!this.activo) return;

    try {
      if (this.detector) {
        const codigos = await this.detector.detect(this.video);
        if (codigos.length) this._emitir(codigos[0].rawValue);
      } else if (global.jsQR && this.video.videoWidth) {
        const w = 480;
        const h = Math.round(this.video.videoHeight * (w / this.video.videoWidth));
        this.canvas.width = w; this.canvas.height = h;
        this.ctx.drawImage(this.video, 0, 0, w, h);
        const img = this.ctx.getImageData(0, 0, w, h);
        const r = global.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
        if (r && r.data) this._emitir(r.data);
      }
    } catch (e) { /* un fotograma fallido no detiene el bucle */ }

    // ~8 fps: suficiente para leer y mucho mas suave con la bateria,
    // que en el telefono del guia es un recurso critico todo el dia.
    setTimeout(() => requestAnimationFrame(() => this._bucle()), 120);
  };

  /**
   * Extrae el codigo de pulsera de lo leido. Acepta la URL
   * completa del QR y tambien el codigo suelto, por si algun dia
   * se imprime solo el numero o llega desde NFC.
   */
  Escaner.codigoDe = function (texto) {
    if (!texto) return null;
    const t = String(texto).trim();
    const m = t.match(/[?&](?:p|id|nfc)=([^&#\s]+)/i);
    if (m) return decodeURIComponent(m[1]).toUpperCase();
    if (/^[A-Z0-9._-]{2,32}$/i.test(t)) return t.toUpperCase();
    return null;
  };

  global.Escaner = Escaner;
})(window);
