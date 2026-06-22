-- ════════════════════════════════════════════════════════════════
-- MIGRAÇÃO — Adiciona a tabela "escala_funcoes"
--
-- Use este script se você já rodou o schema.sql original e só
-- precisa adicionar a funcionalidade de "Escala de Funções"
-- (calendário onde o Líder define quem faz Farelo/Processo cada dia).
-- ════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

create table if not exists escala_funcoes (
  id              uuid primary key default gen_random_uuid(),
  data            date not null,
  turno           text not null check (turno in ('NOITE','MANHÃ','TARDE')),
  operador        text not null,
  funcao          text not null check (funcao in ('FARELO','PROCESSO')),
  definido_por    text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (data, operador)
);

create index if not exists idx_escala_data on escala_funcoes (data);
create index if not exists idx_escala_turno on escala_funcoes (turno);
create index if not exists idx_escala_operador on escala_funcoes (operador);

alter table escala_funcoes enable row level security;

-- Se a política já existir, este comando pode dar erro "already exists"
-- — nesse caso, pode ignorar com segurança.
create policy "permite tudo - escala_funcoes" on escala_funcoes for all using (true) with check (true);
