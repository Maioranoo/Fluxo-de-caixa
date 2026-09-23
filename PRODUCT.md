# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Integrantes de diferentes famílias que registram e consultam as próprias finanças em ambientes separados.
- Um administrador que cria famílias, gerencia integrantes e controla permissões de acesso.
- O uso principal acontece no computador, tanto para integrantes quanto para o administrador, sem excluir o uso completo pelo celular.

## Product Purpose

Oferecer um painel financeiro compartilhado por família para registrar, organizar e compreender gastos e entradas mensais com clareza. Cada família acessa somente a própria carteira e recebe apenas as funcionalidades liberadas pelo administrador.

## Positioning

Controle financeiro familiar direto e compartilhado, com separação entre famílias, acesso autorizado por conta Google e configuração administrativa centralizada.

## Operating Context

- Integrantes acompanham resumo mensal, gastos, entradas quando permitidas, categorias e relatórios.
- Lançamentos incluem data, descrição, categoria, pessoa e método de pagamento.
- O administrador configura famílias, integrantes e a permissão para trabalhar somente com saídas ou com entradas e saídas.
- Relatórios mensais podem ser impressos ou salvos em PDF.

## Capabilities and Constraints

- Preservar as regras, APIs, banco de dados, autenticação, permissões e isolamento existentes entre famílias.
- Famílias sem acesso a entradas não veem controles ou categorias de entrada.
- Famílias com acesso a entradas podem separar e filtrar categorias por entrada ou saída.
- O acesso depende da conta Google autenticada e do cadastro prévio pelo administrador.
- A interface precisa funcionar bem em desktop, notebook, tablet e celular.
- A reformulação atual é local e não pode ser publicada sem autorização explícita do usuário.

## Brand Commitments

- Nome do produto: Finanças da Família.
- Verde permanece como cor principal da identidade, usado com moderação e finalidade semântica.
- A voz deve ser clara, segura, simples e adequada a um produto financeiro familiar.

## Evidence on Hand

- Aplicação funcional existente em `app/page.tsx`, com estilos globais em `app/globals.css`.
- Dados financeiros reais ou exemplos específicos não devem ser inventados.
- O projeto já possui favicon e imagem de compartilhamento em `public/`.

## Product Principles

1. A informação financeira mais importante deve ser compreendida rapidamente.
2. Consistência e previsibilidade têm prioridade em tarefas recorrentes.
3. A interface deve transmitir confiança sem parecer fria ou burocrática.
4. Permissões e isolamento entre famílias devem permanecer claros e seguros.
5. A experiência móvel deve adaptar os fluxos, não apenas reduzir a interface desktop.

## Accessibility & Inclusion

- Contraste legível, foco visível, navegação por teclado e semântica HTML correta.
- Alvos de toque confortáveis e suporte a `prefers-reduced-motion`.
- Valores positivos e negativos não devem depender somente de cor para serem diferenciados.
