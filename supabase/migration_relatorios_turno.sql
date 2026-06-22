-- ════════════════════════════════════════════════════════════════
-- MIGRAÇÃO — Adiciona a tabela "relatorios_turno"
--
-- Use este script se você já rodou o schema.sql original (ou já
-- aplicou migration_ocorrencias.sql) e só precisa adicionar a
-- funcionalidade de Relatório do Líder na tela de Relatórios.
-- ════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

create table if not exists relatorios_turno (
  id              uuid primary key default gen_random_uuid(),
  data            date not null,
  turno           text not null check (turno in ('NOITE','MANHÃ','TARDE')),
  descricao       text not null default '',
  puxou_hexano    boolean not null default false,
  qtd_hexano      numeric,
  autor           text not null,
  perfil          text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_relatorios_turno_data on relatorios_turno (data);

alter table relatorios_turno enable row level security;

-- Se a política já existir, este comando pode dar erro "already exists"
-- — nesse caso, pode ignorar com segurança.
create policy "permite tudo - relatorios_turno" on relatorios_turno for all using (true) with check (true);
