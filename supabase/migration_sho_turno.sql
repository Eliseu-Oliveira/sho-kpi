-- ════════════════════════════════════════════════════════════════
-- MIGRAÇÃO — Adiciona a tabela "sho_turno"
--
-- Use este script se você já rodou o schema.sql original e só
-- precisa adicionar a funcionalidade de "SHO — Agenda da Troca de
-- Turno" (digitalização do formulário em papel preenchido pelo
-- Operador de Saída e confirmado pelo Operador de Entrada).
-- ════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

create table if not exists sho_turno (
  id                  uuid primary key default gen_random_uuid(),
  data                date not null,
  turno               text not null check (turno in ('NOITE','MANHÃ','TARDE')),
  tema_dds            text not null default '',
  relatorio_turno     text not null default '',
  operador_saida      text not null,
  operador_entrada    text,
  status              text not null default 'AGUARDANDO_ENTRADA'
                      check (status in ('AGUARDANDO_ENTRADA','CONFIRMADO')),
  dados               jsonb not null default '{}'::jsonb,
  data_confirmacao    timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idx_sho_turno_data on sho_turno (data);
create index if not exists idx_sho_turno_turno on sho_turno (turno);
create index if not exists idx_sho_turno_status on sho_turno (status);

alter table sho_turno enable row level security;

-- Se a política já existir, este comando pode dar erro "already exists"
-- — nesse caso, pode ignorar com segurança.
create policy "permite tudo - sho_turno" on sho_turno for all using (true) with check (true);
