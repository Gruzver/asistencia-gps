/* ============================================================
   DATOS DE DEMOSTRACION - 100% FICTICIOS
   Ningun nombre, DNI ni ubicacion aqui corresponde a una
   persona real. Los datos reales viven solo en el backend
   privado (Google Sheets), nunca en este repositorio.
   ============================================================ */
window.DEMO_DATA = {
  lugares: [
    { id: 1, nombre: 'Embarque',             lat: -16.4090, lon: -71.5375, radio: 200, activo: true },
    { id: 2, nombre: 'Plaza de Armas',       lat: -16.3989, lon: -71.5370, radio: 180, activo: true },
    { id: 3, nombre: 'Mirador de Yanahuara', lat: -16.3906, lon: -71.5445, radio: 150, activo: true },
    { id: 4, nombre: 'Canon del Colca',      lat: -15.6019, lon: -71.9847, radio: 300, activo: true },
    { id: 5, nombre: 'Hospedaje',            lat: -16.3955, lon: -71.5320, radio: 120, activo: true },
  ],

  lugarActual: 3,

  personas: [
    { id: 'NFC001', nombre: 'Ana Lucia Ramirez Soto',      seccion: '5A', activo: true },
    { id: 'NFC002', nombre: 'Brenda Sofia Quispe Loayza',  seccion: '5A', activo: true },
    { id: 'NFC003', nombre: 'Carla Daniela Mendoza Rios',  seccion: '5A', activo: true },
    { id: 'NFC004', nombre: 'Diana Paola Escalante Vera',  seccion: '5A', activo: true },
    { id: 'NFC005', nombre: 'Elena Mariana Torres Puma',   seccion: '5A', activo: true },
    { id: 'NFC006', nombre: 'Fiorella Nicole Ayala Cruz',  seccion: '5A', activo: true },
    { id: 'NFC007', nombre: 'Gabriela Rocio Salas Nina',   seccion: '5A', activo: true },
    { id: 'NFC008', nombre: 'Helena Victoria Pinto Chura', seccion: '5A', activo: true },
    { id: 'NFC009', nombre: 'Irene Camila Vargas Ticona',  seccion: '5B', activo: true },
    { id: 'NFC010', nombre: 'Julia Antonella Rojas Mamani',seccion: '5B', activo: true },
    { id: 'NFC011', nombre: 'Karina Belen Flores Apaza',   seccion: '5B', activo: true },
    { id: 'NFC012', nombre: 'Lucia Fernanda Huaman Coila', seccion: '5B', activo: true },
    { id: 'NFC013', nombre: 'Marina Esther Zevallos Lipa', seccion: '5B', activo: true },
    { id: 'NFC014', nombre: 'Natalia Grace Ibanez Suca',   seccion: '5B', activo: true },
    { id: 'NFC015', nombre: 'Olivia Renata Castro Yana',   seccion: '5B', activo: true },
    { id: 'NFC016', nombre: 'Paula Alejandra Guzman Arce', seccion: '5C', activo: true },
    { id: 'NFC017', nombre: 'Quenia Isabel Lopez Condori', seccion: '5C', activo: true },
    { id: 'NFC018', nombre: 'Rosa Milagros Delgado Hancco',seccion: '5C', activo: true },
    { id: 'NFC019', nombre: 'Sara Valentina Nunez Machaca',seccion: '5C', activo: true },
    { id: 'NFC020', nombre: 'Tamara Luana Bejar Quispe',   seccion: '5C', activo: true },
  ],

  // Marcajes sembrados alrededor del Mirador de Yanahuara,
  // con dispersion realista y dos casos fuera de zona.
  asistencia: (function () {
    const base = { lat: -16.3906, lon: -71.5445 };
    const hoy = new Date();
    const f = (d) => String(d).padStart(2, '0');
    const fecha = `${f(hoy.getDate())}/${f(hoy.getMonth() + 1)}/${hoy.getFullYear()}`;
    const filas = [
      ['NFC001',  25, 8,  14],  ['NFC002',  40, 12, 22],
      ['NFC003',  18, 6,  9],   ['NFC005',  62, 15, 31],
      ['NFC007',  35, 9,  17],  ['NFC009',  88, 20, 44],
      ['NFC010',  51, 11, 26],  ['NFC012', 420, 25, 210],
      ['NFC014',  29, 7,  15],  ['NFC016',  73, 18, 37],
      ['NFC017', 640, 30, 320], ['NFC019',  46, 10, 23],
    ];
    return filas.map(([id, dist, prec, offset], i) => {
      const ang = (i * 137.5 * Math.PI) / 180;
      const dLat = (dist * Math.cos(ang)) / 111320;
      const dLon = (dist * Math.sin(ang)) / (111320 * Math.cos((base.lat * Math.PI) / 180));
      const h = new Date(hoy.getTime() - (filas.length - i) * 4 * 60000);
      return {
        fecha,
        hora: `${f(h.getHours())}:${f(h.getMinutes())}:${f(h.getSeconds())}`,
        id,
        lugar: 'Mirador de Yanahuara',
        lat: +(base.lat + dLat).toFixed(6),
        lon: +(base.lon + dLon).toFixed(6),
        precision: prec,
        distancia: dist,
        estado: dist <= 150 ? 'EN_ZONA' : 'FUERA_ZONA',
      };
    });
  })(),
};
