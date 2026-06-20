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
  index.css     → estilos base
```

## Stack

- React 18
- Vite 5
- Recharts (gráficos)
