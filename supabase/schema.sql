-- ════════════════════════════════════════════════════════════════
-- SHO KPI — Schema Supabase
-- Execute este script inteiro no SQL Editor do seu projeto Supabase
-- (https://app.supabase.com/project/_/sql/new)
-- ════════════════════════════════════════════════════════════════

-- Extensão para gerar UUIDs
create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────────
-- TABELA: usuarios
-- Login simples por e-mail/senha controlado pela própria aplicação
-- (não usa o Supabase Auth para manter compatibilidade com o login
-- existente; pode ser migrado para supabase.auth depois se quiser).
-- ────────────────────────────────────────────────────────────────
create table if not exists usuarios (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  email       text not null unique,
  senha       text not null,
  perfil      text not null check (perfil in ('Operador','Lider','Supervisor')),
  turno       text not null check (turno in ('NOITE','MANHÃ','TARDE','TODOS')),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────
-- TABELA: registros
-- Guarda tanto KPIs Moagem quanto +KPIs (campo "tipo" diferencia).
-- O conteúdo variável de cada formulário fica em "dados" (jsonb)
-- para não precisar de uma coluna por KPI.
-- ────────────────────────────────────────────────────────────────
create table if not exists registros (
  id               uuid primary key default gen_random_uuid(),
  tipo             text not null check (tipo in ('moagem','mais_kpi')),
  data             date not null,
  hora             text not null,
  turno            text not null check (turno in ('NOITE','MANHÃ','TARDE')),
  operador         text not null,
  status           text not null default 'PENDENTE' check (status in ('PENDENTE','VALIDADO','REJEITADO')),
  validado_por     text,
  data_validacao   timestamptz,
  desvios          jsonb default '[]'::jsonb,
  justificativas   jsonb default '{}'::jsonb,
  justificativas_arr jsonb default '[]'::jsonb,
  obs_livre        text,
  dados            jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists idx_registros_data on registros (data);
create index if not exists idx_registros_status on registros (status);
create index if not exists idx_registros_turno on registros (turno);

-- ────────────────────────────────────────────────────────────────
-- TABELA: metas
-- Uma linha por campo de KPI (chave = "campo", ex: ProteinaFarelo)
-- ────────────────────────────────────────────────────────────────
create table if not exists metas (
  campo       text primary key,
  label       text not null,
  min         numeric,
  max         numeric,
  unidade     text default '',
  updated_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────
-- TABELA: auditoria
-- ────────────────────────────────────────────────────────────────
create table if not exists auditoria (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null,
  usuario     text not null,
  perfil      text,
  detalhes    jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_auditoria_created on auditoria (created_at desc);

-- ────────────────────────────────────────────────────────────────
-- TABELA: hist_calc
-- Histórico da calculadora de produção
-- ────────────────────────────────────────────────────────────────
create table if not exists hist_calc (
  id          uuid primary key default gen_random_uuid(),
  usuario     text not null,
  dados       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Liberado para a chave "anon" porque o login é controlado pela
-- própria aplicação (não pelo Supabase Auth). Se quiser reforçar
-- a segurança depois, migre o login para supabase.auth e troque
-- estas políticas por regras baseadas em auth.uid().
-- ════════════════════════════════════════════════════════════════
alter table usuarios   enable row level security;
alter table registros  enable row level security;
alter table metas      enable row level security;
alter table auditoria  enable row level security;
alter table hist_calc  enable row level security;

create policy "permite tudo - usuarios"   on usuarios   for all using (true) with check (true);
create policy "permite tudo - registros"  on registros  for all using (true) with check (true);
create policy "permite tudo - metas"      on metas      for all using (true) with check (true);
create policy "permite tudo - auditoria"  on auditoria  for all using (true) with check (true);
create policy "permite tudo - hist_calc"  on hist_calc  for all using (true) with check (true);

-- ════════════════════════════════════════════════════════════════
-- DADOS INICIAIS — usuários de teste
-- Troque os e-mails e senhas antes de usar em produção!
-- ════════════════════════════════════════════════════════════════
insert into usuarios (nome, email, senha, perfil, turno) values
  ('Eliseu Silva',      'eliseu@adm.com',  '1234', 'Operador',   'NOITE'),
  ('Roni Santos',        'roni@adm.com',    '1234', 'Operador',   'NOITE'),
  ('Diogo Martins',      'diogo@adm.com',   '1234', 'Lider',      'NOITE'),
  ('Carlos Supervisor',  'carlos@adm.com',  '1234', 'Supervisor', 'TODOS')
on conflict (email) do nothing;

-- ════════════════════════════════════════════════════════════════
-- METAS PADRÃO — espelha METAS_DEFAULT do App.jsx
-- ════════════════════════════════════════════════════════════════
insert into metas (campo, label, min, max, unidade) values
  ('UmidSojaEntrada',  'Umid. Soja Entrada',  10,   12,   '%'),
  ('UmidSojaProducao', 'Umid. Soja Produção', 9.5,  10.5, '%'),
  ('UmidFarelo',       'Umidade Farelo',      12,   12.5, '%'),
  ('ProteinaFarelo',   'Proteína Farelo',     46,   46.5, '%'),
  ('OleoFarelo',       'Óleo Farelo',         null, 2.5,  '%'),
  ('FibraFarelo',      'Fibra Farelo',        null, 5.0,  '%'),
  ('LEX',              'LEX',                 null, 0.7,  ''),
  ('OleoCasca',        'Óleo da Casca',       null, 1.2,  '')
on conflict (campo) do nothing;

-- ────────────────────────────────────────────────────────────────
-- TABELA: ocorrencias
-- Diário de bordo do turno — registrado pelo Líder (ou Supervisor),
-- separado das justificativas pontuais de desvio de KPI. Serve para
-- anotar paradas de equipamento, trocas de turno, problemas de
-- abastecimento, intercorrências de segurança, etc.
-- ────────────────────────────────────────────────────────────────
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
create policy "permite tudo - ocorrencias" on ocorrencias for all using (true) with check (true);

-- ────────────────────────────────────────────────────────────────
-- TABELA: relatorios_turno
-- Relatório descritivo que o Líder preenche ao final/durante o
-- turno, na tela de Relatórios. Inclui campo de Hexano: se
-- "puxou_hexano" for true, a quantidade fica disponível para
-- preenchimento; se false, a quantidade fica vazia/desabilitada.
-- ────────────────────────────────────────────────────────────────
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
create policy "permite tudo - relatorios_turno" on relatorios_turno for all using (true) with check (true);

-- ────────────────────────────────────────────────────────────────
-- TABELA: paradas_fabrica
-- Cálculo de tempo de paradas — o Operador registra os minutos
-- parados e o motivo; o Líder/Supervisor valida. A somatória é
-- exibida separada por turno na tela "Paradas de Fábrica".
-- ────────────────────────────────────────────────────────────────
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
create policy "permite tudo - paradas_fabrica" on paradas_fabrica for all using (true) with check (true);

-- ────────────────────────────────────────────────────────────────
-- TABELA: escala_funcoes
-- Atribuição diária de função (Farelo/Processo) por operador,
-- definida pelo Líder do turno daquele operador. Uma linha por
-- combinação de data + operador (não por turno geral, já que cada
-- Líder só atribui para o turno dele).
-- ────────────────────────────────────────────────────────────────
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
create policy "permite tudo - escala_funcoes" on escala_funcoes for all using (true) with check (true);

-- ────────────────────────────────────────────────────────────────
-- TABELA: sho_turno
-- Formulário "Shift Hand Over (SHO) — Agenda da Troca de Turno"
-- preenchido pelo Operador de Saída ao final do turno, confirmado
-- pelo Operador de Entrada. Campos numéricos/booleanos diversos
-- ficam em "dados" (jsonb) para não precisar de 25+ colunas fixas;
-- os campos centrais (data, turno, operadores, tema DDS, relatório)
-- ficam em colunas próprias para facilitar busca e relatórios.
-- ────────────────────────────────────────────────────────────────
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
create policy "permite tudo - sho_turno" on sho_turno for all using (true) with check (true);
