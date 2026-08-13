# Asistencia GPS

Plataforma web de control de asistencia por QR con registro de ubicación.
Sustituye el flujo de hoja de cálculo por una interfaz propia: la alumna
escanea su código, el navegador captura su posición GPS y el panel muestra
en un mapa desde dónde marcó cada persona.

**Demo en vivo:** ver la URL de GitHub Pages en la pestaña *Settings → Pages*
del repositorio.

> La demo pública corre con **datos ficticios**. Ningún nombre, documento ni
> ubicación de este repositorio corresponde a una persona real.

---

## Cómo funciona

```
QR de la alumna
      │  marcar.html?id=NFC001
      ▼
GitHub Pages (frontend estático)
      │  GET /exec?action=marcar&nfc=…&lat=…&lon=…
      ▼
Apps Script (API JSON)
      │  appendRow
      ▼
Google Sheets (almacén)
```

El frontend es HTML y JavaScript sin dependencias ni compilación. El backend
es el mismo Apps Script que ya usabas, ampliado para hablar JSON y guardar
coordenadas.

---

## Páginas

| Página | Para quién | Qué hace |
|---|---|---|
| `index.html` | Personal a cargo | Mapa de marcajes, métricas, tabla filtrable, lista de pendientes, exportar CSV |
| `marcar.html?id=NFC001` | Alumna | Consentimiento, captura de GPS y confirmación |
| `qr.html` | Personal a cargo | Genera e imprime los QR de cada persona |

---

## Reglas de negocio

**Sin ubicación no hay asistencia.** Si la alumna deniega el permiso de
geolocalización, el marcaje se bloquea y se muestran instrucciones para
reactivarlo según su navegador (iOS, Android u otro).

**La geocerca avisa, no bloquea.** Se calcula la distancia entre la posición
de la alumna y el punto del lugar activo. Si supera el radio configurado, el
marcaje **se registra igual** pero queda señalado en rojo como `FUERA_ZONA`
para que el personal lo revise. El radio se define por lugar en la pestaña
`Lugares`; si falta, se usa `RADIO_DEFAULT` de `config.js` (150 m).

---

## Puesta en marcha

### 1. Backend (Apps Script)

1. Abre tu hoja → **Extensiones → Apps Script**
2. Pega el contenido de [`backend/Codigo.gs`](backend/Codigo.gs), reemplazando lo que haya
3. Ejecuta la función **`prepararHoja`** una vez y autoriza los permisos
   - Agrega a `Asistencia` las columnas `Lat`, `Lon`, `Precision`, `Distancia`, `Estado`
   - Agrega a `Lugares` las columnas `Lat`, `Lon`, `Radio` y siembra las coordenadas conocidas
   - Te avisa qué lugares quedaron sin coordenadas
4. **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
5. Copia la URL que termina en `/exec`

### 2. Frontend

Pega esa URL en [`config.js`](config.js):

```js
API_URL: 'https://script.google.com/macros/s/AKfy.../exec',
```

Con ese campo vacío la plataforma corre en modo demo y no toca la hoja real.

### 3. Coordenadas de los lugares

`prepararHoja` siembra Plaza de Armas, Mirador de Yanahuara y Cañón del Colca.
Para los demás, párate en el sitio, abre `marcar.html` y usa las coordenadas
que reporte tu teléfono, o sácalas de Google Maps (clic derecho → copiar
coordenadas). Un lugar sin coordenadas registra el marcaje con estado
`SIN_REFERENCIA` y no valida distancia.

### 4. Códigos QR

Abre `qr.html`, verifica la URL base detectada y usa **Imprimir**.

Las etiquetas NFC y QR **ya impresas siguen funcionando**: apuntan a
`/exec?nfc=NFC001` y el script las redirige a la plataforma para que pasen por
el flujo con GPS. Para activarlo, edita `configurarURLPlataforma` en el Apps
Script poniendo tu URL de GitHub Pages y ejecútala una vez.

---

## Configuración

Todo en [`config.js`](config.js):

| Campo | Por defecto | Qué hace |
|---|---|---|
| `API_URL` | `''` | URL `/exec` del Apps Script. Vacío = modo demo |
| `RADIO_DEFAULT` | `150` | Metros de tolerancia si el lugar no define radio |
| `GPS_TIMEOUT` | `25000` | Milisegundos que se insiste esperando que el GPS fije satélites |
| `PRECISION_OBJETIVO` | `30` | Precisión (m) con la que se corta de inmediato |
| `PRECISION_MAXIMA` | `150` | Por encima de esto se rechaza: es lectura de antena, no de GPS |
| `REFRESCO_PANEL` | `30000` | Cada cuánto se recarga el panel |
| `EVENTO` | `'ASUNTA CUSCO'` | Nombre visible del viaje |

Para cambiar el lugar activo, edita `LUGAR_ACTUAL` en la pestaña
`Configuracion` de la hoja. El panel lo toma en el siguiente refresco.

---

## Limitaciones conocidas

- **El GPS no puede capturarse en silencio.** El navegador exige que la persona
  acepte el permiso; no existe forma de evitarlo, y es intencional del estándar.
- **Precisión variable.** 5–20 m al aire libre; bajo techo o entre edificios
  altos puede degradarse a 50–100 m. Por eso la geocerca avisa en vez de
  bloquear.
- **Requiere HTTPS.** GitHub Pages ya lo provee. En local usa `localhost`,
  que el navegador trata como origen seguro.
- **El código de la URL es legible.** Alguien que conozca el formato puede
  intentar marcar por otra persona; la geocerca y el registro de precisión
  limitan el margen, pero no lo eliminan. Ver *Siguientes pasos*.
- **Apps Script tiene cuotas.** El plan gratuito soporta holgadamente decenas
  de marcajes por minuto, suficiente para un grupo de este tamaño.

---

## Protección de datos

La plataforma registra ubicación de menores de edad, lo que en Perú cae bajo
la **Ley 29733 de Protección de Datos Personales**. El diseño incluye:

- Pantalla de consentimiento explícita antes de pedir el permiso
- `noindex, nofollow` en todas las páginas
- Datos reales solo en el backend privado, nunca en este repositorio
- Exportación CSV para que el responsable conserve y luego purgue los registros

Queda a cargo de la institución obtener el **consentimiento informado de los
padres o tutores** antes de usarlo con datos reales, y definir por cuánto
tiempo se conservan los registros.

---

## Siguientes pasos posibles

- Token firmado por persona en la URL, para que el código no sea adivinable
- Selector de lugar activo desde el propio panel, sin abrir la hoja
- Modo quiosco: un QR rotatorio en el punto de encuentro en vez de uno por persona
- Historial por día con comparación entre lugares
