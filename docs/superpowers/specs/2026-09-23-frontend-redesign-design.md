# Reformulação profissional do front-end

**Data:** 23 de setembro de 2026
**Status:** design aprovado em conversa; implementação ainda não iniciada

## Objetivo

Reformular completamente a camada visual de **Finanças da Família** para que o produto tenha aparência de software financeiro comercial, moderno, confiável e confortável. A mudança deve melhorar hierarquia, legibilidade, navegação, consistência, feedback, responsividade e acessibilidade sem alterar regras financeiras, autenticação, permissões, APIs, banco de dados ou isolamento entre famílias.

## Contexto do produto

O sistema atende integrantes de diferentes famílias, cada uma em seu ambiente separado. Integrantes registram e consultam as finanças da própria família. Um administrador cria famílias, gerencia integrantes e libera o uso somente de saídas ou de entradas e saídas. O uso principal ocorre no computador, tanto para integrantes quanto para o administrador, mas a experiência móvel deve permanecer completa.

## Direção visual aprovada

### Banco familiar sereno

A interface seguirá uma linguagem de banco digital premium adaptada à gestão financeira familiar. A composição será clara, sóbria e acolhedora. O sistema usará superfícies discretas, verde profundo, tipografia altamente legível e uma hierarquia forte para valores financeiros.

O resultado deve transmitir segurança e organização sem parecer frio, burocrático ou um template genérico. A precisão visual do livro-caixa contemporâneo será incorporada a tabelas, gráficos e valores.

### Paleta

- Fundo: cinza esverdeado suave, confortável em sessões longas.
- Superfícies: tons claros levemente diferenciados, evitando branco absoluto em toda a aplicação.
- Identidade: verde floresta para ações principais, seleção, foco e marca.
- Verde suave: fundos selecionados, estados positivos e indicadores secundários.
- Texto: carvão esverdeado, com cinza mineral para informações secundárias.
- Despesas e perigo: vermelho terroso usado somente com função semântica.
- Atenção: amarelo ou laranja apenas quando existir um estado real de aviso.
- Bordas: neutras e discretas, com contraste suficiente entre áreas.

Todas as combinações de texto devem atender ao contraste WCAG AA.

### Tipografia

A aplicação usará uma família sem serifa consistente e adequada a interfaces densas. Títulos terão peso firme sem dimensões exageradas. Labels e informações secundárias usarão poucos níveis de peso e tamanho. Valores financeiros terão numerais tabulares, alinhamento estável e contraste elevado.

### Forma e profundidade

- Raios de borda restritos a uma pequena escala reutilizável.
- Sombras quase imperceptíveis, reservadas para elementos sobrepostos.
- Separação de conteúdo feita principalmente por espaço, alinhamento e bordas finas.
- Sem glassmorphism, gradientes decorativos, brilhos ou elevação exagerada.

### Movimento

Transições terão duração aproximada de 160 a 220 ms e serão usadas apenas para comunicar estado: hover, foco, seleção, abertura de modal, aplicação de filtro e confirmação de ação. `prefers-reduced-motion` removerá movimentos não essenciais.

## Estrutura geral

### Desktop

- Sidebar estável, visualmente leve e com ícones vetoriais consistentes.
- Cabeçalho compacto com contexto da página e seleção de período.
- Conteúdo principal amplo, limitado por uma largura adequada a leitura e dados.
- Grades responsivas que preservam alinhamento entre indicadores, gráficos e tabelas.
- Administração com espaço suficiente para ações e informações de acesso.

### Mobile

- Cabeçalho reduzido e navegação inferior acessível.
- Cards reorganizados por prioridade.
- Tabelas convertidas em listas estruturadas para toque.
- Ações principais posicionadas sem cobrir conteúdo.
- Respeito a áreas seguras do dispositivo e alvos de toque de pelo menos 44 px.

## Áreas da aplicação

### Resumo

O saldo será o indicador principal quando entradas estiverem liberadas. Entradas e gastos serão indicadores secundários, identificados também por símbolos e texto para não depender somente de cor. Famílias que trabalham apenas com gastos continuarão recebendo uma visão adequada ao seu conjunto de dados.

Gráficos por categoria e método de pagamento usarão barras limpas, trilhas discretas, valores alinhados e uma escala visual coerente. A leitura principal deve ser possível sem interação obrigatória.

### Gastos e entradas

Filtros ficarão em uma barra compacta acima dos dados, junto da quantidade de registros e do total filtrado. No desktop, lançamentos continuarão em tabelas. No celular, cada lançamento será apresentado como uma linha estruturada, com descrição e valor em destaque e metadados em segundo nível.

Entradas e saídas serão diferenciadas por sinal, texto e cor. Ações de editar e excluir terão ícones consistentes, rótulos acessíveis e estados claros.

### Formulários

Os formulários de gastos, entradas, categorias, pagamentos, famílias e integrantes serão agrupados por intenção. Labels permanecerão visíveis. Inputs, selects e botões terão estados normal, hover, foco, preenchido, inválido, desabilitado e carregando.

A conclusão de uma operação produzirá feedback imediato. Erros preservarão os dados digitados sempre que possível e indicarão claramente o campo ou a ação que falhou.

### Categorias

Famílias com somente saídas continuarão vendo apenas o campo de nova categoria e a lista, sem seletor ou legenda redundante. Famílias com entradas e saídas poderão classificar categorias e filtrar a lista entre entradas, saídas e todas.

### Relatório

Na tela, o relatório será apresentado como documento financeiro dentro da aplicação. Na impressão ou exportação para PDF, sidebar, cabeçalho da aplicação, navegação móvel, botões e controles serão removidos. O conteúdo ocupará corretamente a folha A4 e preservará cabeçalhos, linhas e totais sem sobreposição.

### Administração

Famílias, permissões e integrantes terão uma organização mais legível. O estado de acesso a entradas será explícito. Edição e remoção terão hierarquia segura, reduzindo a chance de acionamento acidental.

### Modais

Modais compartilharão cabeçalho, conteúdo, rodapé e ações consistentes. Terão overlay discreto, abertura e fechamento suaves, fechamento por botão e `Esc`, restauração do foco e contenção da navegação por teclado.

### Feedback e estados

- Notificações consistentes para sucesso e erro.
- Skeletons discretos durante o carregamento inicial.
- Estados vazios com ícone, título, descrição e ação quando houver uma próxima etapa útil.
- Indicadores de processamento dentro da ação que está sendo executada.
- Telas 404 e de acesso negado integradas à identidade visual.

## Componentes e organização do código

O JSX principal será dividido em componentes com responsabilidades claras:

- shell da aplicação e navegação;
- cabeçalho e seletor de período;
- cards de indicadores;
- gráficos de barras;
- filtros;
- tabelas e listas de lançamentos;
- formulários;
- modais;
- notificações;
- estados vazios e carregamento;
- ícones SVG locais.

Estados, requisições e regras financeiras permanecerão no fluxo existente. A extração será limitada ao que melhora consistência e manutenção da camada visual. Não haverá reestruturação de APIs ou banco.

Os estilos serão organizados por tokens e famílias de componentes. Tokens cobrirão cores, tipografia, espaço, raios, sombras, camadas e duração de transições. O conjunto local de SVGs evitará uma dependência pesada de ícones.

## Fluxo de dados e permissões

As requisições existentes continuarão sendo a fonte de verdade. Componentes visuais receberão dados e callbacks do fluxo atual. Nenhum componente de apresentação decidirá permissões por conta própria.

O comportamento permanecerá:

- cada integrante acessa somente a família autorizada;
- a conta Google autenticada precisa estar cadastrada;
- acesso não cadastrado continua resultando em acesso inválido;
- famílias sem entradas não recebem controles de entrada;
- administradores podem selecionar e gerenciar famílias conforme a lógica atual.

## Acessibilidade

- Link para pular a navegação e ir ao conteúdo principal.
- Ordem semântica de títulos.
- Labels associados a campos.
- Estados de foco visíveis e consistentes.
- Operação completa por teclado.
- Alvos de toque confortáveis.
- ARIA apenas quando a semântica nativa não for suficiente.
- Valores positivos e negativos identificados além da cor.
- Suporte a `prefers-reduced-motion`.

## Responsividade

A interface será verificada em larguras próximas de 375, 768, 1024 e 1440 px. As mudanças entre breakpoints serão estruturais: colunas serão reorganizadas, tabelas se tornarão listas, navegação mudará de formato e ações serão reposicionadas. Não haverá redução indiscriminada de textos ou controles.

## Tratamento de erros

Falhas de carregamento devem exibir mensagem contextual e permitir nova tentativa quando aplicável. Falhas de gravação devem manter o formulário aberto, preservar os campos e remover o estado de carregamento. Acesso negado continuará separado de erros transitórios da aplicação.

## Validação

- Executar o build de produção.
- Executar os testes existentes.
- Validar os principais fluxos com dados locais: resumo, novo gasto, gastos, entradas, categorias, relatório e administração.
- Verificar loading, estados vazios, sucesso, erro, edição e exclusão.
- Verificar navegação por teclado e foco dos modais.
- Inspecionar as larguras de 375, 768, 1024 e 1440 px.
- Inspecionar impressão A4 e confirmar que nenhum elemento fixo cobre os lançamentos.
- Confirmar que APIs, autenticação, permissões e persistência mantêm o comportamento atual.

## Fora do escopo

- Alterações no banco de dados, APIs ou regras financeiras.
- Mudança do sistema de autenticação ou das permissões existentes.
- Metas financeiras, comparações com períodos anteriores, busca, paginação ou ordenação quando não sustentadas pelos dados atuais.
- Publicação, deploy, push ou commit antes de autorização explícita do usuário.
