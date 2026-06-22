-- ════════════════════════════════════════════════════════════════
-- MIGRAÇÃO — Adiciona a tabela "ocorrencias"
--
-- Use este script se você já rodou o schema.sql original e só
-- precisa adicionar a funcionalidade de Ocorrências do Turno.
-- Se está configurando o projeto do zero, não precisa rodar este
-- arquivo — ele já está incluído no schema.sql completo.
-- ════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

create table if not exists ocorrencias (
  id          uuid primary key default gen_random_uuid(),
  data        date not null,
  turno       text not null check (turno in ('NOITE','MANHÃ','TARDE')),
  categoria   text not null default 'GERAL'
              check (categoria in ('GERAL','EQUIPAMENTO','SEGURANCA','QUALIDADE','ABASTECIMENTO','PESSOAL')),
  titulo      text not null,
  descricao   text not null default '',
  gravidade   text not null default 'BAIXA' check (gravidade in ('BAIXA','MEDIA','ALTA')),
  autor       text not null,
  perfil      text,
  resolvida   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ocorrencias_data on ocorrencias (data);
create index if not exists idx_ocorrencias_turno on ocorrencias (turno);

alter table ocorrencias enable row level security;

-- Se a política já existir (de uma tentativa anterior), este comando
-- pode dar erro "already exists" — nesse caso, pode ignorar com segurança.
create policy "permite tudo - ocorrencias" on ocorrencias for all using (true) with check (true);
