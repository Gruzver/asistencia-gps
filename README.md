# Asistencia GPS

Plataforma de control de asistencia para viajes escolares. Cada alumno lleva una
**pulsera con QR**; el guía abre una **parada** al llegar a un punto y ve en vivo
quién marca, quién falta y quién marcó lejos.

**Demo:** https://gruzver.github.io/asistencia-gps/ — corre en modo local con datos
de prueba, sin tocar ninguna base de datos.

---

## Idea central

La **pulsera es física y eterna**; el **alumno es temporal**. Esa separación es lo
que permite reutilizar las pulseras entre viajes sin perder el historial: al cerrar
un viaje se liberan y quedan listas para el siguiente grupo.

```
colegio → grupo → alumno ──┐
                            ├── marcaje ── parada
pulsera (código fijo) ─────┘
```

---

## Los tres roles

### Alumno

Escanea el QR de su pulsera. Nada que instalar, nada que recordar.

- **Primera vez:** elige colegio → grupo → su nombre de la lista → confirma.
  Tres toques. La pulsera queda ligada a esa identidad y a ese teléfono.
- **Siguientes:** ve el nombre de la parada activa y marca. Si ya marcó, se lo dice.

### Guía

Una pantalla, un botón. Está cuidando cuarenta chicos, no mirando el teléfono.

1. **Tomar asistencia** → usa su propia ubicación como centro de la parada
2. Escribe el nombre del lugar y elige el radio
3. Ve el contador `23/40` crecer solo, sin refrescar
4. Lista de **quién falta**, con botón para marcar a mano a quien no tenga batería
5. **Cerrar parada** cuando el grupo se mueve

### Administración

Antes del viaje: colegios, grupos, listas de alumnos y alta de pulseras.
Después: **Liberar pulseras** las devuelve al stock conservando los marcajes.

---

## Puesta en marcha

### 1. Base de datos

1. Crea un proyecto en [supabase.com](https://supabase.com) (gratis)
2. SQL Editor → pega [`backend/schema.sql`](backend/schema.sql) completo → Run
3. Project Settings → API → copia **Project URL** y la clave **anon public**

### 2. Conectar

En [`config.js`](config.js):

```js
SUPABASE_URL: 'https://xxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbG...',
```

Con esos campos vacíos la plataforma corre en **modo local**: el flujo entero
funciona (registro, paradas, marcaje, tiempo real entre pestañas) pero los datos
viven solo en ese navegador. Sirve para validar el recorrido antes de conectar.

### 3. Cargar datos

En `admin.html`: crea el colegio y los grupos, pega la lista de alumnos y genera
el rango de pulseras que tengas.

### 4. Imprimir

En `qr.html`: elige el rango e imprime. Un QR por pulsera.

---

## Decisiones de diseño

**Sin ubicación no hay asistencia, y sin precisión de satélite tampoco.**
`getCurrentPosition` devuelve la primera lectura disponible, que casi siempre viene
de antena de telefonía: llega en un segundo y puede errar kilómetros. Se usa
`watchPosition`, se conserva la mejor lectura y se corta al bajar de 30 m. Por
encima de 150 m se rechaza, porque registrar una posición de antena acusaría de
"fuera de zona" a alguien que sí estaba presente.

**La geocerca avisa, no bloquea.** El GPS bajo techo se degrada a 50–100 m; un radio
estricto rechazaría a quien sí está. El marcaje se registra y queda señalado en rojo
para que el guía decida.

**La distancia la calcula el servidor.** El cliente solo envía coordenadas. Así nadie
puede declararse "en zona" manipulando la petición.

**Sin señal, el marcaje se encola.** En el Cañón del Colca no hay cobertura. El GPS
funciona igual —los satélites no necesitan internet— pero enviar no. El marcaje se
guarda con su hora y coordenadas reales y sube solo al recuperar señal: si alguien
marca a las 10:00 en el Colca y sincroniza a las 14:00, la asistencia dice 10:00.

**Una sola parada abierta por grupo.** Lo impone un índice único en la base. El
alumno nunca tiene que elegir a cuál marca, y el guía no puede dejar dos vivas.

---

## Atajos y defensas

| Atajo | Defensa |
|---|---|
| Mandar el QR por WhatsApp | La pulsera queda atada al teléfono del registro |
| Prestar la pulsera física | Dos pulseras desde el mismo teléfono quedan señaladas |
| App de GPS falso | Se exige precisión de satélite; el guía ve los patrones raros |
| DevTools en la laptop | El escritorio no da precisión de satélite: se rechaza |
| Adivinar números de pulsera | Solo se activan pulseras dadas de alta por el admin |
| Borrar datos y re-registrarse | El bloqueo vive en la base, no en el navegador |
| Marcar antes de llegar | Solo cuenta dentro de la parada que abre el guía |

El bloqueo por dispositivo **avisa pero no bloquea**: a nadie se le deja fuera en
pleno viaje por cambiar de teléfono, pero queda el rastro.

---

## Limitaciones conocidas

- **El GPS no puede capturarse en silencio.** El navegador exige aceptar el permiso.
- **La clave anon es pública.** La seguridad real la imponen las políticas RLS del
  esquema: anónimo solo puede leer el catálogo y llamar a las funciones de registro
  y marcaje, que validan por dentro. Crear paradas o grupos exige sesión autenticada.
- **Falta el login del guía.** El esquema ya distingue `anon` de `authenticated`,
  pero la pantalla de acceso no está construida: hoy cualquiera con el enlace puede
  abrir paradas. Es lo siguiente a cerrar antes de usarlo con datos reales.
- **El vínculo con el dispositivo se pierde** si el alumno borra los datos del sitio.
- **NFC no está integrado todavía.** Por ahora solo QR.

---

## Protección de datos

Registra ubicación de menores, lo que en Perú cae bajo la **Ley 29733**. El diseño
incluye consentimiento explícito antes de pedir el permiso, `noindex` en todas las
páginas, y liberación de perfiles al cerrar el viaje. Obtener el **consentimiento
de los padres o tutores** y definir el plazo de conservación queda a cargo de la
institución.

---

## Estructura

```
index.html        Portada con los tres roles
marcar.html       Alumno: registro y marcaje
guia.html         Guía: paradas, contador en vivo, mapa
admin.html        Colegios, grupos, listas, pulseras
qr.html           Impresión de códigos

assets/geo.js     GPS de precisión y formato
assets/datos.js   Capa de datos: motor Supabase y motor local
assets/cola.js    Cola de marcajes sin señal
backend/schema.sql  Postgres: tablas, funciones, RLS y realtime
```

Sin compilación ni dependencias que instalar: HTML y JavaScript directos.
