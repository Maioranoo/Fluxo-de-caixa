# Finanças da Família

Aplicação web para organizar o fluxo financeiro de diferentes famílias em ambientes separados. O sistema reúne lançamentos, indicadores mensais, categorias, formas de pagamento e relatórios em uma interface responsiva.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=101010)

## Preview

A versão implantada está disponível para integrantes previamente autorizados:

[Acessar Finanças da Família](https://painel-financas.maioranoo.chatgpt.site)

> O acesso é restrito às contas vinculadas a uma família no painel administrativo.

## Sobre o projeto

O **Finanças da Família** centraliza o acompanhamento financeiro mensal e separa os dados de cada família. A aplicação permite registrar movimentações, entender a distribuição dos gastos e manter integrantes, categorias e formas de pagamento organizados em um único painel.

O produto prioriza leitura rápida, operação simples e consistência entre computador e celular. Famílias que controlam somente despesas recebem uma experiência reduzida; famílias com entradas habilitadas também acompanham receitas e saldo mensal.

## Funcionalidades

- Visão geral mensal com total de gastos, entradas e saldo, conforme a configuração da família.
- Indicadores por categoria, forma de pagamento e cartão.
- Cadastro, edição e exclusão de gastos e entradas.
- Parcelamento de compras feitas no cartão, com distribuição automática entre os meses.
- Filtros de gastos por categoria e forma de pagamento.
- Filtro de entradas por categoria.
- Categorias separadas entre entradas e saídas.
- Cadastro de formas de pagamento, incluindo identificação de cartões.
- Relatório mensal preparado para impressão ou exportação em PDF.
- Ambientes independentes para diferentes famílias.
- Painel administrativo para criar famílias, configurar o controle de entradas e gerenciar integrantes.
- Controle de acesso por conta vinculada à família, com estados específicos para acesso não autorizado.
- Página 404 personalizada e navegação adaptada para telas menores.

## Tecnologias

### Front-end

- [Next.js](https://nextjs.org/) com App Router
- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- CSS responsivo com propriedades personalizadas e regras específicas para impressão

### Back-end e dados

- Route Handlers do Next.js
- [Drizzle ORM](https://orm.drizzle.team/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/) sobre SQLite
- Migrações SQL versionadas
- Isolamento das consultas por família

### Infraestrutura e ferramentas

- [Vinext](https://github.com/cloudflare/vinext) e [Vite](https://vite.dev/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- ESLint
- Test runner nativo do Node.js
- npm

## Como executar o projeto

### Pré-requisitos

- Node.js `>= 22.13.0`
- npm
- Git

### Instalação

```bash
git clone https://github.com/Maioranoo/Fluxo-de-caixa.git
cd Fluxo-de-caixa
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador. A configuração de desenvolvimento fornece um administrador local e um banco D1 simulado pelo plugin da Cloudflare, portanto não é necessário criar um arquivo `.env` para o uso local básico.

### Comandos disponíveis

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia o ambiente de desenvolvimento. |
| `npm run build` | Gera o build de produção com Vinext. |
| `npm run start` | Inicia o build de produção. |
| `npm test` | Executa o build e a suíte de testes. |
| `npm run lint` | Analisa o código com ESLint. |

### Configuração do ambiente hospedado

O projeto usa o binding `DB`, declarado em `.openai/hosting.json`, para acessar o Cloudflare D1. A hospedagem também pode fornecer as seguintes variáveis de execução:

| Variável | Finalidade |
| --- | --- |
| `ADMIN_EMAIL` | Define a conta com acesso administrativo. |
| `INITIAL_HOUSEHOLD_NAME` | Define o nome da família inicial. |
| `INITIAL_HOUSEHOLD_MEMBERS` | Lista os integrantes iniciais da família. |
| `LOCAL_ADMIN_ENABLED` | Habilita o administrador local em `localhost`. |

`INITIAL_HOUSEHOLD_MEMBERS` usa o formato `Nome|email,Outro nome|outro@email.com`.

Valores reais de contas e credenciais devem permanecer fora do repositório.

## Estrutura do projeto

```text
.
├── app/
│   ├── api/                 # Endpoints financeiros e administrativos
│   ├── components/          # Componentes da interface
│   ├── lib/                 # Tipos e utilitários financeiros
│   ├── globals.css          # Design system, responsividade e impressão
│   └── page.tsx             # Fluxos e telas principais
├── db/                      # Schema, conexão e isolamento por família
├── drizzle/                 # Migrações SQL
├── tests/                   # Testes de regras e estrutura renderizada
├── worker/                  # Entrada do Cloudflare Worker
├── build/                   # Integração do build com Sites
├── public/                  # Ícones e metadados visuais
└── .openai/hosting.json     # Bindings do ambiente hospedado
```

## Responsividade e experiência de uso

A interface adapta a navegação, os formulários, os indicadores e as tabelas para computador e celular. O projeto também inclui foco visível, navegação semântica, feedback de carregamento e erro, estados vazios, redução opcional de movimento e um layout de impressão próprio para os relatórios mensais.

## Segurança e isolamento

- Cada consulta financeira é limitada à família ativa.
- Operações de escrita validam a origem da solicitação.
- O painel administrativo exige uma conta autorizada.
- Integrantes só acessam a família à qual estão vinculados.
- Valores, datas, categorias, pessoas e formas de pagamento são validados no servidor.

### Proteções e configuração de segurança

- Segredos de produção pertencem aos **secrets de runtime do Worker**, acessados no backend por `env` de `cloudflare:workers`. Não coloque valores em `vars`, no código, no build do navegador ou em `.openai/hosting.json`.
- `.env*`, `.dev.vars*` e arquivos de chaves são ignorados pelo Git. O build rejeita variáveis `VITE_*` e `NEXT_PUBLIC_*`; módulos de banco/autenticação usam `server-only`.
- O administrador local é habilitado somente na configuração de desenvolvimento. O build gera `LOCAL_ADMIN_ENABLED=false`.
- Todos os pedidos que chegam ao Worker compartilham uma cota de **300/min por IP**. APIs têm **120/min**, escritas **30/min** e POSTs de importação **10/min**, compartilhados entre as rotas. Integrantes autenticados também têm essas cotas por integrante, independentemente da família selecionada ou IP.
- Contadores atômicos ficam no D1. O excesso retorna `429` e `Retry-After`; indisponibilidade do contador retorna `503`. A janela é fixa de 60 segundos, com possível rajada na mudança de janela.
- JSON é limitado a 64 KiB nas APIs comuns e 10 MiB nas importações, contando os bytes recebidos. Campos são validados no servidor; SQL usa Drizzle ou parâmetros vinculados com `.bind()`.
- Não há modelo de IA nem execução de prompts: o classificador de importações usa regras locais. Não existe um filtro genérico que garanta proteção contra prompt injection em uma futura integração com IA.

**Antes de publicar estas alterações:** aplique `drizzle/0006_request_rate_limits.sql` no D1 de destino junto das migrações anteriores. Sem essa tabela, o Worker recusa os pedidos com `503`. Confirme também que o proxy de autenticação substitui os cabeçalhos `oai-authenticated-*` e `CF-Connecting-IP`, e que o Worker não pode ser acessado diretamente fora desse proxy. Rotas de login/callback e assets servidos pela plataforma antes do Worker precisam de limites no próprio proxy/WAF.

Auditoria reproduzível: `node scripts/audit-secrets.mjs --history`. O script mostra apenas os locais de possíveis credenciais; ele usa heurísticas e não inspeciona os secrets da hospedagem. Consulte [o relatório de segurança](docs/security-audit-2026-09-25.md) para escopo, testes e pendências.

## Deploy

O projeto está configurado para publicação no **Sites**, com aplicação server-side executada sobre Cloudflare Workers e persistência no Cloudflare D1.

**Aplicação:** [painel-financas.maioranoo.chatgpt.site](https://painel-financas.maioranoo.chatgpt.site)

O ambiente publicado possui acesso controlado; somente integrantes autorizados conseguem abrir uma carteira.

## SEO e descoberta por IA

- `public/robots.txt` permite rastrear a página inicial e os recursos públicos, exclui `/api/` e aponta para o sitemap.
- `public/sitemap.xml` lista a única URL de página existente: `/`. As abas internas não possuem URLs independentes.
- `app/layout.tsx` define título, descrição, canonical absoluto e metadados sociais para o domínio oficial, sem depender do cabeçalho Host.
- A página 404 possui título e descrição próprios, `noindex` e nenhum canonical.
- `public/llms.txt` descreve o produto, suas URLs e as restrições de acesso aos dados.

Ao adicionar páginas públicas, defina seus metadados e canonical e atualize o sitemap e o llms.txt. Se o domínio mudar, atualize os quatro arquivos que contêm o domínio oficial. A indexação depende de a hospedagem permitir acesso anônimo à página inicial e aos arquivos de descoberta; estes arquivos não removem a autenticação da plataforma. Não inclua APIs, dados privados ou páginas protegidas no sitemap.

## Status

> Em desenvolvimento e recebendo melhorias contínuas.

## Autor

**João Pedro Maiorano**

- [GitHub](https://github.com/Maioranoo)
- [LinkedIn](https://linkedin.com/in/joão-pedro-maiorano-28a10a3b8)
