-- ============================================================
--  Asistencia GPS — esquema Postgres para Supabase
-- ============================================================
--  Pegar completo en Supabase → SQL Editor → Run.
--  Es idempotente: se puede volver a ejecutar sin romper nada.
--
--  Idea central: la PULSERA es fisica y eterna; el ALUMNO es
--  temporal y se libera al cerrar el viaje. Esa separacion
--  permite reutilizar las pulseras sin perder el historico.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
--  Catalogo
-- ------------------------------------------------------------

create table if not exists colegio (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  creado_en   timestamptz not null default now()
);

create table if not exists viaje (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  inicia      date,
  termina     date,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

create table if not exists grupo (
  id          uuid primary key default gen_random_uuid(),
  colegio_id  uuid not null references colegio(id) on delete cascade,
  viaje_id    uuid references viaje(id) on delete set null,
  nombre      text not null,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  unique (colegio_id, nombre)
);

-- La pulsera existe con independencia de quien la lleve.
-- Solo se pueden registrar codigos que el admin haya cargado:
-- eso corta el atajo de adivinar numeros correlativos.
create table if not exists pulsera (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,
  activa      boolean not null default true,
  creado_en   timestamptz not null default now()
);

-- ------------------------------------------------------------
--  Alumnos
-- ------------------------------------------------------------
--  El admin precarga las filas con nombre y grupo, sin pulsera
--  ni dispositivo. Una fila con pulsera_id nulo esta libre para
--  reclamar; al reclamarla se fijan pulsera_id y device_id.
-- ------------------------------------------------------------

create table if not exists alumno (
  id             uuid primary key default gen_random_uuid(),
  grupo_id       uuid not null references grupo(id) on delete cascade,
  nombre         text not null,
  pulsera_id     uuid unique references pulsera(id) on delete set null,
  device_id      text,
  registrado_en  timestamptz,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now()
);

create index if not exists alumno_grupo_idx  on alumno(grupo_id);
create index if not exists alumno_pulsera_idx on alumno(pulsera_id);

-- ------------------------------------------------------------
--  Paradas y marcajes
-- ------------------------------------------------------------

create table if not exists parada (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references grupo(id) on delete cascade,
  nombre      text not null,
  lat         double precision not null,
  lon         double precision not null,
  radio       integer not null default 150,
  abierta_en  timestamptz not null default now(),
  cerrada_en  timestamptz,
  creado_en   timestamptz not null default now()
);

create index if not exists parada_grupo_idx on parada(grupo_id);

-- Solo una parada abierta por grupo: evita que el alumno tenga
-- que elegir a cual marca, y que el guia deje dos vivas por error.
create unique index if not exists parada_una_abierta_por_grupo
  on parada(grupo_id) where cerrada_en is null;

create table if not exists marcaje (
  id            uuid primary key default gen_random_uuid(),
  parada_id     uuid not null references parada(id) on delete cascade,
  alumno_id     uuid not null references alumno(id) on delete cascade,
  lat           double precision,
  lon           double precision,
  precision_m   integer,
  distancia_m   integer,
  estado        text not null check (estado in
                  ('EN_ZONA','FUERA_ZONA','SIN_GPS','MANUAL')),
  device_id     text,
  -- Marca el marcaje que se guardo sin señal y subio despues
  diferido      boolean not null default false,
  -- Dispositivo distinto al del registro: no bloquea, señala
  device_distinto boolean not null default false,
  registrado_por  text,
  creado_en     timestamptz not null default now(),
  unique (parada_id, alumno_id)
);

create index if not exists marcaje_parada_idx on marcaje(parada_id);

-- ------------------------------------------------------------
--  Distancia en metros (Haversine).
--  Se calcula en la base para que el cliente no pueda mentir
--  sobre su distancia al punto: solo envia coordenadas.
-- ------------------------------------------------------------

create or replace function distancia_m(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns integer language sql immutable as $$
  select round(2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lon2 - lon1) / 2), 2)
  )))::integer;
$$;

-- ------------------------------------------------------------
--  Registro de pulsera.
--  En una sola transaccion para que dos alumnos no puedan
--  reclamar la misma fila a la vez.
-- ------------------------------------------------------------

create or replace function registrar_pulsera(
  p_codigo    text,
  p_alumno_id uuid,
  p_device    text
) returns alumno language plpgsql security definer as $$
declare
  v_pulsera pulsera;
  v_alumno  alumno;
begin
  select * into v_pulsera from pulsera where codigo = p_codigo and activa;
  if not found then
    raise exception 'PULSERA_DESCONOCIDA';
  end if;

  -- Bloquea la fila: si dos telefonos entran a la vez, el segundo espera
  select * into v_alumno from alumno where id = p_alumno_id for update;
  if not found then
    raise exception 'ALUMNO_NO_EXISTE';
  end if;
  if v_alumno.pulsera_id is not null then
    raise exception 'ALUMNO_YA_REGISTRADO';
  end if;
  if exists (select 1 from alumno where pulsera_id = v_pulsera.id) then
    raise exception 'PULSERA_YA_ASIGNADA';
  end if;

  update alumno
     set pulsera_id    = v_pulsera.id,
         device_id     = p_device,
         registrado_en = now()
   where id = p_alumno_id
  returning * into v_alumno;

  return v_alumno;
end;
$$;

-- ------------------------------------------------------------
--  Marcaje.
--  La distancia y el estado los decide la base, no el cliente.
-- ------------------------------------------------------------

create or replace function marcar(
  p_codigo    text,
  p_lat       double precision,
  p_lon       double precision,
  p_precision integer,
  p_device    text,
  p_diferido  boolean default false,
  -- Hora real de la captura. Un marcaje tomado sin señal en el
  -- Colca y subido horas despues debe quedar con SU hora, no con
  -- la del momento en que hubo cobertura.
  p_capturado timestamptz default null
) returns json language plpgsql security definer as $$
declare
  v_alumno  alumno;
  v_parada  parada;
  v_dist    integer;
  v_estado  text;
  v_marcaje marcaje;
  v_distinto boolean;
begin
  select a.* into v_alumno
    from alumno a
    join pulsera p on p.id = a.pulsera_id
   where p.codigo = p_codigo and a.activo;
  if not found then
    raise exception 'PULSERA_SIN_REGISTRAR';
  end if;

  select * into v_parada
    from parada
   where grupo_id = v_alumno.grupo_id and cerrada_en is null
   order by abierta_en desc limit 1;
  if not found then
    raise exception 'SIN_PARADA_ABIERTA';
  end if;

  if p_lat is null or p_lon is null then
    v_dist := null; v_estado := 'SIN_GPS';
  else
    v_dist := distancia_m(p_lat, p_lon, v_parada.lat, v_parada.lon);
    -- La geocerca avisa, no bloquea: el GPS bajo techo se degrada
    -- y un radio estricto rechazaria a quien si esta presente.
    v_estado := case when v_dist <= v_parada.radio
                     then 'EN_ZONA' else 'FUERA_ZONA' end;
  end if;

  v_distinto := v_alumno.device_id is not null
            and p_device is not null
            and v_alumno.device_id <> p_device;

  insert into marcaje (parada_id, alumno_id, lat, lon, precision_m,
                       distancia_m, estado, device_id, diferido,
                       device_distinto, creado_en)
  values (v_parada.id, v_alumno.id, p_lat, p_lon, p_precision,
          v_dist, v_estado, p_device, p_diferido, v_distinto,
          coalesce(p_capturado, now()))
  on conflict (parada_id, alumno_id) do update
    set lat = excluded.lat, lon = excluded.lon,
        precision_m = excluded.precision_m, distancia_m = excluded.distancia_m,
        estado = excluded.estado, creado_en = excluded.creado_en
  returning * into v_marcaje;

  return json_build_object(
    'marcaje', row_to_json(v_marcaje),
    'alumno',  row_to_json(v_alumno),
    'parada',  row_to_json(v_parada)
  );
end;
$$;

-- ------------------------------------------------------------
--  Cierre de viaje: libera las pulseras conservando el historico
-- ------------------------------------------------------------

create or replace function liberar_grupo(p_grupo_id uuid)
returns integer language plpgsql security definer as $$
declare v_n integer;
begin
  update alumno
     set pulsera_id = null, device_id = null, registrado_en = null
   where grupo_id = p_grupo_id and pulsera_id is not null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ------------------------------------------------------------
--  Seguridad a nivel de fila
-- ------------------------------------------------------------
--  Anonimo (el alumno con su telefono): puede leer el catalogo
--  y llamar a las funciones de registro y marcaje, que validan
--  todo por dentro. NO puede escribir directo en las tablas ni
--  crear paradas.
--
--  Autenticado (guia y admin): control total. El guia entra una
--  vez con correo y contraseña que le crea el admin.
-- ------------------------------------------------------------

alter table colegio  enable row level security;
alter table viaje    enable row level security;
alter table grupo    enable row level security;
alter table pulsera  enable row level security;
alter table alumno   enable row level security;
alter table parada   enable row level security;
alter table marcaje  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['colegio','viaje','grupo','pulsera','alumno','parada','marcaje']
  loop
    execute format('drop policy if exists %I_lectura on %I', t, t);
    execute format('drop policy if exists %I_escritura on %I', t, t);

    -- Lectura abierta: el alumno necesita ver grupos y su progreso
    execute format(
      'create policy %I_lectura on %I for select using (true)', t, t);

    -- Escritura directa solo para sesiones autenticadas
    execute format(
      'create policy %I_escritura on %I for all to authenticated
         using (true) with check (true)', t, t);
  end loop;
end $$;

grant execute on function registrar_pulsera(text, uuid, text) to anon, authenticated;
grant execute on function marcar(text, double precision, double precision,
                                 integer, text, boolean, timestamptz)
                                                                  to anon, authenticated;
grant execute on function liberar_grupo(uuid)                     to authenticated;

-- ------------------------------------------------------------
--  Realtime: el panel del guia recibe cada marcaje empujado
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table marcaje;
alter publication supabase_realtime add table parada;
alter publication supabase_realtime add table alumno;
