# Asistencia GPS

Plataforma de control de asistencia para viajes escolares. Cada alumno lleva una
**pulsera con QR**; el guía abre una **parada** al llegar a un punto y ve en vivo
quién marca, quién falta y quién marcó lejos. Funciona **sin señal**.

**Demo:** https://gruzver.github.io/asistencia-gps/ — corre en modo local con datos
de prueba, sin tocar ninguna base de datos.

---

## Idea central

La **pulsera es física y eterna**; el **alumno es temporal**. Esa separación permite
reutilizar las pulseras entre viajes sin perder el historial: al cerrar un viaje se
liberan y quedan listas para el siguiente grupo.

```
colegio → grupo → alumno ──┐
        └→ guía            ├── marcaje ── parada
pulsera (código fijo) ─────┘
```

---

## Los tres roles

### Alumno

Escanea el QR de su pulsera. Nada que instalar.

- **Primera vez:** colegio → grupo → su nombre de la lista → confirma. Tres toques.
  La pulsera queda ligada a esa identidad y a ese teléfono.
- **Siguientes:** ve la parada activa y marca.

### Guía

Una pantalla, un botón. Está cuidando cuarenta chicos, no mirando el teléfono.

1. **Tomar asistencia** → usa su propia ubicación como centro de la parada
2. Ve el contador `23/40` crecer solo, sin refrescar
3. **Escanear pulseras** → cámara a pantalla completa, uno tras otro sin tocar nada
4. Lista de **quién falta**, con botón *Presente* para quien no tenga batería
5. **Cerrar** cuando el grupo se mueve

### Administración

Antes del viaje: colegios, grupos, guías, listas de alumnos y alta de pulseras.
Avisa si hay **nombres repetidos** en la lista — al registrarse el alumno elige su
nombre, así que dos iguales son indistinguibles y uno acabaría tomando la identidad
del otro. Permite corregir nombres, quitar alumnos y liberar una pulsera suelta.
La **lista impresa** es el respaldo para zonas sin señal.
Después: **Liberar pulseras** las devuelve al stock conservando los marcajes.

### Historial

Después del viaje: qué pasó en cada parada, resumen de asistencia por alumno y
**exportación a CSV** —todo el grupo o una parada— para entregar al colegio.

---

## Sin señal

En el Cañón del Colca no hay cobertura, y ahí es justo donde importa saber si
faltan tres chicos. Todo el diseño asume que la red es la excepción:

- **Instalable** como app (PWA). El service worker cachea la pantalla completa,
  incluido el mapa y el lector de códigos.
- **Precarga**: el guía toca *Descargar* con señal y se lleva el grupo entero
  —alumnos, pulseras, parada activa— en el teléfono.
- **Abrir parada sin señal**: se crea localmente y se sube al reconectar. Si al
  sincronizar resulta que otro guía ya había abierto una, se **adopta la suya** y
  los escaneos locales se reapuntan a ella: nunca se duplica ni se pisa.
- **Escaneo offline**: el código de pulsera se resuelve contra la caché local. El
  guía toca y ve el nombre al instante, sin una barra de señal.
- **Bandeja de salida**: lo que no se puede enviar se encola con su hora y
  coordenadas reales y sube solo al reconectar. El contador avanza igual.

> **Requisito operativo:** hay que abrir la aplicación y precargar el grupo **con
> cobertura, antes de salir**. Un guía que llega al cañón sin haberla abierto nunca
> no tiene nada que cachear.

**Respaldo en papel.** Para un conteo de seguridad con menores, una lista impresa
y un lapicero no tienen modos de fallo. Ninguna app justifica quedarse sin plan B.

---

## Varios guías

Un viaje puede llevar varios guías; el admin los crea y los asigna al grupo. Todos
ven la misma parada y el mismo conteo.

**Si dos abren parada a la vez, el segundo se une a la del primero** en vez de crear
otra o pisarla. Lo garantiza un índice único en la base, y la interfaz lo dice.
Cada parada y cada marcaje registran qué guía los produjo.

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

Vacíos, la plataforma corre en **modo local**: el flujo entero funciona pero los
datos viven solo en ese navegador. Sirve para validar el recorrido antes de conectar.

### 3. Cuentas de acceso

Guía y administración piden usuario y contraseña; el alumno no, porque su QR es su
única credencial. Los usuarios son una **lista en [`config.js`](config.js)** —
edítala, añade o quita a quien quieras:

| Usuario | Contraseña | Rol |
|---|---|---|
| `guia1` | `colca-4291` | guía |
| `guia2` | `condor-4904` | guía |
| `guia3` | `chili-9334` | guía |
| `guia4` | `sillar-4314` | guía |
| `admin` | `chachani-6257` | administración |

> **Qué protege y qué no.** Evita que un alumno curioso entre al panel del guía,
> vea dónde está todo el mundo o cierre una parada. **No es seguridad real:** las
> claves viajan en el código de la página y la clave pública de Supabase permite
> llamar a la base directamente. Para cerrarlo de verdad, pon `ACCESO_SUPABASE: true`,
> crea los usuarios en Supabase → Authentication → Users y aplica el bloque
> **MODO ESTRICTO** al final de `backend/schema.sql`.

### 4. Cargar datos y salir

En `admin.html`: colegio, grupos, guías, lista de alumnos y rango de pulseras.
En `qr.html`: imprime los códigos. En `guia.html`: instala la app y **descarga el
grupo antes de salir**.

---

## Decisiones de diseño

**Se exige lectura de satélite, no la primera posición disponible.**
`getCurrentPosition` devuelve lo que el sistema tenga a mano, que casi siempre viene
de antena: llega en un segundo y puede errar kilómetros. Se usa `watchPosition`, se
conserva la mejor lectura y se corta al bajar de 30 m. Por encima de 150 m se
rechaza, porque registrar una posición de antena acusaría de "fuera de zona" a
alguien que sí estaba presente.

**La geocerca avisa, no bloquea.** El GPS bajo techo se degrada a 50–100 m; un radio
estricto rechazaría a quien sí está.

**La distancia la calcula el servidor.** El cliente solo envía coordenadas.

**Gana el escaneo del guía sobre el automarcaje.** Si ambos ocurren, presentarse
físicamente ante el guía es mejor evidencia que un ping de GPS. Y se conserva
siempre la **hora más temprana**: importa cuándo se vio al alumno por primera vez,
no cuál mensaje llegó último.

**Una sola parada abierta por grupo.** El alumno nunca elige a cuál marca.

---

## Atajos y defensas

| Atajo | Defensa |
|---|---|
| Mandar el QR por WhatsApp | La pulsera queda atada al teléfono del registro |
| Prestar la pulsera física | Dos pulseras desde el mismo teléfono quedan señaladas |
| App de GPS falso | Se exige precisión de satélite; el guía puede escanear en persona |
| DevTools en la laptop | El escritorio no da precisión de satélite: se rechaza |
| Adivinar números de pulsera | Solo se activan pulseras dadas de alta por el admin |
| Borrar datos y re-registrarse | El bloqueo vive en la base, no en el navegador |
| Marcar antes de llegar | Solo cuenta dentro de la parada que abre el guía |

El bloqueo por dispositivo **avisa pero no bloquea**: a nadie se le deja fuera en
pleno viaje por cambiar de teléfono, pero queda el rastro.

---

## Limitaciones conocidas

- **El acceso de guías no es seguridad real** (ver arriba). Consciente, para la fase
  de pruebas; el camino para cerrarlo está preparado y documentado.
- **Cerrar una parada ya subida necesita conexión.** Abrirla sin señal sí funciona.
- **El proyecto de Supabase se pausa tras 7 días sin uso** (plan gratuito). No se
  pierde nada: se restaura desde el panel en un minuto. **Compruébalo antes de cada
  viaje**, no en el paradero.
- **iOS es más limitado:** no hay sincronización en segundo plano (sube al abrir la
  app) y el sistema puede borrar el almacenamiento de una PWA sin usar por semanas.
- **Si el teléfono del guía muere**, se pierde lo no sincronizado.
- **El vínculo con el dispositivo se pierde** si el alumno borra los datos del sitio.
- **NFC no está integrado todavía.** El esquema ya reserva `pulsera.nfc_uid` y el
  lector acepta códigos sueltos, así que añadirlo no cambia el flujo.

---

## Protección de datos

Registra ubicación de menores, lo que en Perú cae bajo la **Ley 29733**. El diseño
incluye consentimiento explícito antes de pedir el permiso, `noindex` en todas las
páginas y liberación de perfiles al cerrar el viaje. Obtener el **consentimiento de
los padres o tutores** y definir el plazo de conservación queda a cargo de la
institución.

---

## Estructura

```
index.html          Portada con los tres roles
marcar.html         Alumno: registro y marcaje
guia.html           Guía: paradas, contador, escáner, mapa
admin.html          Colegios, grupos, guías, listas, pulseras
historial.html      Paradas pasadas, resumen por alumno y exportación
qr.html             Impresión de códigos

assets/geo.js       GPS de precisión y formato
assets/almacen.js   Caché de lectura y bandeja de salida
assets/datos.js     Capa de datos: motor Supabase, motor local, local-first
assets/escaner.js   Lector de QR por cámara
assets/auth.js      Acceso de guías y administración
assets/historial.js Historial y exportación a CSV
sw.js               Service worker: la app abre sin señal
manifest.json       Instalable en la pantalla de inicio
backend/schema.sql  Postgres: tablas, funciones, RLS y realtime
```

Sin compilación ni dependencias que instalar: HTML y JavaScript directos.
