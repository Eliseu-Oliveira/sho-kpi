-- ════════════════════════════════════════════════════════════════
-- MIGRAÇÃO — Adiciona a tabela "paradas_fabrica"
--
-- Use este script se você já rodou o schema.sql original e só
-- precisa adicionar a funcionalidade de "Paradas de Fábrica"
-- (cálculo de tempo de parada, validado pelo Líder).
-- ════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

create table if not exists paradas_fabrica (
  id              uuid primary key default gen_random_uuid(),
  data            date not null,
  turno           text not null check (turno in ('NOITE','MANHÃ','TARDE')),
  minutos         numeric not null check (minutos > 0),
  motivo          text not null,
  observacao      text not null default '',
  status          text not null default 'PENDENTE' check (status in ('PENDENTE','VALIDADO','REJEITADO')),
  operador        text not null,
  validado_por    text,
  data_validacao  timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_paradas_data on paradas_fabrica (data);
create index if not exists idx_paradas_turno on paradas_fabrica (turno);
create index if not exists idx_paradas_status on paradas_fabrica (status);

alter table paradas_fabrica enable row level security;

-- Se a política já existir, este comando pode dar erro "already exists"
-- — nesse caso, pode ignorar com segurança.
create policy "permite tudo - paradas_fabrica" on paradas_fabrica for all using (true) with check (true);
