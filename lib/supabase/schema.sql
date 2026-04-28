-- ============================================================
-- Ferova WhatsApp AI — Schema Supabase
-- Correr en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Habilitar extensión de vectores
create extension if not exists vector;

-- ============================================================
-- TABLA: clients
-- Un registro por cliente (negocio) que contrata el servicio
-- ============================================================
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_name text not null,
  email text unique not null,
  phone text,
  -- WhatsApp instance en Evolution API
  instance_name text unique,
  instance_status text default 'disconnected', -- disconnected | connecting | connected
  -- Bot config
  bot_enabled boolean default false,
  custom_prompt text,
  -- Suscripción
  plan text default 'starter', -- starter | business_pro
  subscription_status text default 'trial', -- trial | active | suspended | cancelled
  subscription_expires_at timestamptz,
  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- TABLA: conversations
-- Hilo de chat con cada número de WhatsApp
-- ============================================================
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  whatsapp_number text not null, -- número del cliente final
  last_human_reply_at timestamptz, -- última vez que el dueño respondió
  last_message_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(client_id, whatsapp_number)
);

-- ============================================================
-- TABLA: messages
-- Mensajes individuales de cada conversación
-- ============================================================
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'owner')),
  content text not null,
  whatsapp_message_id text,
  created_at timestamptz default now()
);

-- ============================================================
-- TABLA: knowledge_base
-- Fragmentos de conocimiento del negocio + embeddings vectoriales
-- ============================================================
create table if not exists knowledge_base (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  content text not null,
  source text, -- URL o nombre del PDF
  embedding vector(768), -- dimensión de text-embedding-004 de Gemini
  created_at timestamptz default now()
);

-- Índice para búsqueda vectorial (cosine similarity)
create index if not exists knowledge_base_embedding_idx
  on knowledge_base using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ============================================================
-- FUNCIÓN: match_knowledge
-- Búsqueda semántica por cliente (RLS-safe)
-- ============================================================
create or replace function match_knowledge(
  client_id_input uuid,
  query_embedding vector(768),
  match_count int default 5
)
returns table (
  id uuid,
  content text,
  source text,
  similarity float
)
language sql stable
as $$
  select
    id,
    content,
    source,
    1 - (embedding <=> query_embedding) as similarity
  from knowledge_base
  where client_id = client_id_input
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- RLS: Row Level Security
-- ============================================================
alter table clients enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table knowledge_base enable row level security;

-- Service role bypasea RLS (para el backend)
-- Las políticas de abajo son para acceso futuro del cliente final

-- ============================================================
-- TRIGGER: updated_at automático en clients
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger clients_updated_at
  before update on clients
  for each row execute function update_updated_at();

-- ============================================================
-- TABLA: problem_reports
-- Reportes de problemas enviados desde el portal del cliente
-- ============================================================
create table if not exists problem_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  description text not null,
  resolved boolean default false,
  created_at timestamptz default now()
);

alter table problem_reports enable row level security;
