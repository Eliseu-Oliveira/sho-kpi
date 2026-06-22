# KPI SHO — ADM Brasil

Sistema de gestão de KPIs para a planta de Uberlândia (SHO Preparação/Extração).
Construído em React + Vite, com gráficos via Recharts e banco de dados real
via Supabase — os dados são compartilhados entre todos os dispositivos
(celular, desktop, qualquer navegador).

## Passo 1 — Criar o backend no Supabase (5 minutos, grátis)

1. Crie uma conta em [supabase.com](https://supabase.com) (pode entrar com GitHub/Google).
2. Clique em **New Project**. Escolha um nome, uma senha de banco (guarde-a)
   e a região mais próxima (ex: South America).
3. Aguarde ~2 minutos enquanto o projeto é criado.
4. No menu lateral, vá em **SQL Editor** → **New query**.
5. Abra o arquivo `supabase/schema.sql` deste projeto, copie todo o conteúdo,
   cole no editor e clique em **Run**. Isso cria as tabelas, as permissões e
   já insere os 4 usuários de teste e as metas padrão.
6. Vá em **Project Settings** (ícone de engrenagem) → **API**.
   Copie dois valores:
   - **Project URL** (algo como `https://xxxxx.supabase.co`)
   - **anon public key** (uma chave longa começando com `eyJ...`)

> 🔄 **Já tinha rodado uma versão anterior do `schema.sql`?** Você pode estar
> faltando uma ou mais tabelas novas — rode os scripts de migração
> correspondentes no SQL Editor, sem precisar rodar o `schema.sql` inteiro:
> - `supabase/migration_ocorrencias.sql` — tela "Ocorrências do Turno"
> - `supabase/migration_relatorios_turno.sql` — botão "Relatório do Líder"
>   na tela de Relatórios (inclui o controle de Hexano puxado)
> - `supabase/migration_paradas_fabrica.sql` — tela "Paradas de Fábrica"
> - `supabase/migration_escala_funcoes.sql` — tela "Escala de Funções"

## Passo 2 — Configurar o projeto localmente

```bash
npm install
cp .env.example .env
```

Abra o `.env` que foi criado e cole os dois valores do Supabase:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## Passo 3 — Rodar localmente

```bash
npm run dev
```

Abre em `http://localhost:5173`. Entre com um dos usuários de teste
criados pelo `schema.sql` (veja a tabela abaixo) — **troque essas senhas**
antes de usar com a equipe de verdade.

| E-mail | Senha | Perfil |
|---|---|---|
| eliseu@adm.com | 1234 | Operador |
| roni@adm.com | 1234 | Operador |
| diogo@adm.com | 1234 | Líder |
| carlos@adm.com | 1234 | Supervisor |

## Build de produção

```bash
npm run build
```

Gera a pasta `dist/` com os arquivos estáticos finais.

## Deploy no Netlify

**Opção A — Arrastar e soltar**
1. Rode `npm install` e `npm run build` localmente (com o `.env` já configurado).
2. Acesse [app.netlify.com/drop](https://app.netlify.com/drop).
3. Arraste a pasta `dist/` gerada.

⚠️ Essa opção embute as credenciais do Supabase no build estático, o que é
normal (a chave "anon" é pública por design — a segurança real vem das
políticas de RLS no banco). Mas toda vez que mudar o `.env` precisa rebuildar.

**Opção B — Conectar ao Git (recomendado)**
1. Suba este projeto para um repositório (GitHub/GitLab/Bitbucket).
2. No Netlify, clique em "Add new site" → "Import an existing project".
3. Build command: `npm run build` — Publish directory: `dist`
   (já configurado em `netlify.toml`).
4. Em **Site settings → Environment variables**, adicione
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os mesmos valores do `.env`.
   **Nunca** suba o arquivo `.env` para o Git — ele já está no `.gitignore`.

## Como os dados são compartilhados entre dispositivos

Toda escrita (novo registro de KPI, validação, alteração de meta, novo
usuário, etc.) vai direto para as tabelas do Supabase via `src/api.js`.
Qualquer outro dispositivo aberto no mesmo site recebe a atualização quase
instantaneamente através do **Supabase Realtime** — não é preciso atualizar
a página manualmente. Por exemplo: lançar um KPI no celular do operador
aparece imediatamente na tela de Verificação do líder no desktop.

A única coisa que continua sendo por dispositivo (intencionalmente) é a
preferência de **modo escuro/claro** e a sessão de login — isso fica salvo
no `localStorage` do navegador, igual a qualquer site comum.

## Funcionalidades principais

- **KPIs Moagem / +KPIs** — registro de análises hora a hora, com média ao vivo
  e validação de desvios.
- **Ocorrências do Turno** — diário de bordo onde o Líder (ou Supervisor)
  registra paradas de equipamento, problemas de segurança, qualidade,
  abastecimento ou questões de pessoal durante o turno. Cada ocorrência tem
  categoria, gravidade (baixa/média/alta) e pode ser marcada como resolvida.
  Operadores podem consultar o histórico, mas só Líder/Supervisor registram
  ou gerenciam. Fica salvo na tabela `ocorrencias` do Supabase, então
  qualquer dispositivo vê o mesmo diário de bordo em tempo real.
- **Relatório do Líder** — na tela de Relatórios, o Líder (ou Supervisor)
  pode descrever em texto livre como foi o turno e informar se houve puxada
  de Hexano. Se marcar "Sim", o campo de quantidade (em litros) é liberado
  para preenchimento; se marcar "Não", o campo de quantidade fica
  desabilitado e a informação não é salva. Todos os relatórios ficam
  listados na própria tela de Relatórios.
- **Rastreabilidade** — consulta de registros de KPI Moagem por período
  (mês, dia ou intervalo), turno e presença de desvio.
- **Paradas de Fábrica** — o Operador registra os minutos parados, o motivo
  (manutenção, falta de matéria-prima, falha elétrica/mecânica, limpeza,
  troca de turno, segurança ou outro) e uma observação opcional. O Líder
  (ou Supervisor) valida ou rejeita cada registro. A tela mostra a
  somatória de minutos **validados** separada por turno (Noite/Manhã/Tarde),
  com opção de ver o total do dia ou do mês.
- **Escala de Funções** — calendário mensal onde o Líder de cada turno
  define se cada operador do seu turno está em **Farelo** ou **Processo**
  naquele dia. Cada Líder só atribui para os operadores do próprio turno
  (Líder da Noite não vê/edita o turno da Manhã, por exemplo). Operadores
  e Supervisor visualizam a escala (Supervisor pode trocar de turno na
  visualização), mas não editam. O calendário mostra pontos coloridos nos
  dias com atribuição, e um clique no dia abre o detalhe por operador.
- **Verificação** — Líder/Supervisor validam ou rejeitam registros pendentes,
  com auditoria automática de quem validou e quando.
- **Painel Gerencial, Relatórios, Auditoria** — visão consolidada para
  liderança e supervisão.

## Estrutura

```
src/
  App.jsx             → aplicativo completo (todas as telas e componentes)
  api.js              → camada de acesso ao banco (todas as leituras/escritas)
  supabaseClient.js    → inicialização do cliente Supabase
  main.jsx             → ponto de entrada React
  index.css            → estilos base + regras responsivas
supabase/
  schema.sql           → script para criar as tabelas no Supabase
```

## Responsividade

O layout se adapta a três faixas de tela:

- **Acima de 1100px** (desktop): menu lateral fixo, grids completos (3, 4 ou 5 colunas).
- **861px–1100px** (tablet): grids de 3-5 colunas colapsam para 2 colunas.
- **Até 860px** (celular): o menu lateral some e vira uma gaveta deslizante
  acionada por um botão "☰" na barra superior; todos os grids de cards passam
  para 1 coluna; tabelas ganham rolagem horizontal própria; o cabeçalho de cada
  página empilha título e botões de ação verticalmente; o painel de
  notificações do sino calcula sua posição via JavaScript para nunca vazar
  da tela, em qualquer tamanho de janela.

Tecnicamente, os grids usam classes utilitárias (`.grid-2`, `.grid-3`, `.grid-4`,
`.grid-5`, etc. — veja `src/index.css`) em vez de `gridTemplateColumns` inline.
Isso foi uma correção importante: depender de seletores de atributo CSS
(`div[style*="..."]`) para sobrepor estilo inline se mostrou pouco confiável,
porque o navegador normaliza o atributo `style` internamente (por exemplo,
insere um espaço depois da vírgula em `repeat(3,1fr)` ao ler de volta via
`getAttribute`), fazendo o seletor de atributo falhar silenciosamente em
alguns elementos. Com classes reais, a media query sempre funciona.

## Segurança — pontos de atenção antes de usar com dados reais

- As senhas dos usuários ficam em texto puro na tabela `usuarios`. Para um
  ambiente de produção real, migre o login para o **Supabase Auth**
  (`supabase.auth.signInWithPassword`), que já cuida de hashing de senha,
  recuperação de conta e sessões com token — o `schema.sql` foi desenhado
  para facilitar essa migração depois.
- As políticas de RLS (Row Level Security) atuais liberam leitura e escrita
  para qualquer requisição autenticada com a chave "anon" — ou seja, a
  segurança de quem pode editar o quê é controlada pela própria interface
  (perfil Operador/Líder/Supervisor), não pelo banco. Para reforçar isso no
  nível do banco de dados, vale criar políticas RLS mais específicas depois
  que o login migrar para o Supabase Auth.

## Stack

- React 18
- Vite 5
- Supabase (Postgres + Realtime)
- Recharts (gráficos)

