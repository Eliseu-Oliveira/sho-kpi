# KPI SHO — ADM Brasil

Sistema de gestão de KPIs para a planta de Uberlândia (SHO Preparação/Extração).
Construído em React + Vite, com gráficos via Recharts.

## Rodar localmente

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

## Build de produção

```bash
npm run build
```

Gera a pasta `dist/` com os arquivos estáticos finais.

## Deploy no Netlify

**Opção A — Arrastar e soltar**
1. Rode `npm install` e `npm run build` localmente.
2. Acesse [app.netlify.com/drop](https://app.netlify.com/drop).
3. Arraste a pasta `dist/` gerada.

**Opção B — Conectar ao Git**
1. Suba este projeto para um repositório (GitHub/GitLab/Bitbucket).
2. No Netlify, clique em "Add new site" → "Import an existing project".
3. Build command: `npm run build` — Publish directory: `dist`.
   (Já está configurado em `netlify.toml`, então o Netlify detecta automaticamente.)

## Persistência de dados

Este projeto usa `localStorage` do navegador (arquivo `src/storage.js`) para salvar:
- Registros de KPIs lançados
- Metas customizadas
- Histórico da calculadora
- Preferência de modo escuro

**Importante:** os dados ficam salvos *no navegador de cada usuário*, não em um
banco compartilhado. Para múltiplos usuários acessando os mesmos dados ao mesmo
tempo (uso real em produção), será necessário um backend (API + banco de dados)
ou migrar para o Power Apps + SharePoint, conforme o guia de implementação
fornecido separadamente.

## Estrutura

```
src/
  App.jsx       → aplicativo completo (todas as telas e componentes)
  storage.js    → adaptador de persistência (localStorage)
  main.jsx      → ponto de entrada React
  index.css     → estilos base + regras responsivas
```

## Responsividade

O layout se adapta a três faixas de tela:

- **Acima de 1100px** (desktop): menu lateral fixo, grids completos (3, 4 ou 5 colunas).
- **861px–1100px** (tablet): grids de 4-5 colunas colapsam para 2 colunas.
- **Até 860px** (celular): o menu lateral some e vira uma gaveta deslizante
  acionada por um botão "☰" na barra superior; todos os grids de cards passam
  para 1 coluna; tabelas ganham rolagem horizontal própria; o cabeçalho de cada
  página empilha título e botões de ação verticalmente.

Essas regras estão em `src/index.css`. Como o app usa estilos inline (`style={{}}`)
em quase todo o código, a forma usada para sobrepor esses estilos em telas
pequenas foi via seletores de atributo CSS com `!important` (ex.:
`div[style*="grid-template-columns:repeat(4,1fr)"]`), que é o único caso em
que uma regra de uma folha de estilos externa pode vencer um estilo inline.

## Stack

- React 18
- Vite 5
- Recharts (gráficos)
