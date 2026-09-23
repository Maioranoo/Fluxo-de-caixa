# Importação de extratos e planilhas financeiras

**Data:** 23 de setembro de 2026
**Status:** design aprovado em conversa; implementação ainda não iniciada

## Objetivo

Permitir que qualquer integrante de uma família migre gastos antigos mantidos em planilhas e importe extratos de cartão sem cadastrar cada lançamento manualmente. O sistema deve ler Excel, CSV e PDF digital, relacionar colunas quando necessário, sugerir categorias, exigir uma conferência completa e somente então gravar os itens selecionados.

A importação deve atualizar os mesmos totais, gráficos, filtros e relatórios usados pelos gastos cadastrados manualmente. Todo item importado pertence a um lote, para que a família possa excluir uma importação inteira sem apagar os lançamentos um por um.

## Escopo aprovado

- Arquivos Excel `.xlsx` e `.xls` usados anteriormente pela pessoa para controlar gastos.
- Arquivos CSV.
- Extratos e faturas de cartão em PDF digital com texto selecionável.
- PDFs escaneados, fotografias e OCR não fazem parte desta versão.
- Qualquer integrante da família pode importar, consultar e excluir lotes da própria carteira.
- A categorização combina regras iniciais com aprendizado privado por família.
- A conferência é obrigatória antes de qualquer gravação.
- Cada importação exige a escolha de um mês de destino, inclusive quando o arquivo contém datas.

## Modos de importação

### Importação completa

O sistema tenta obter valor, descrição, data, categoria, pagamento e pessoa. A pessoa pode escolher pagamento e integrante padrão para o arquivo, inclusive a opção “Não informado”, e alterar esses valores em linhas individuais. Esses padrões são decisões explícitas da pessoa e não inferências do sistema.

Somente o valor é obrigatório. Qualquer outra informação ausente no arquivo e não definida explicitamente como padrão permanece em branco. O sistema não inventa datas, descrições, pagamentos ou pessoas. A categoria só é preenchida quando uma regra confiável for encontrada ou quando a pessoa fizer a escolha na conferência.

Datas que não pertencem ao mês de destino são preservadas, mas a linha recebe o estado **Data divergente** na conferência. O mês de destino continua sendo o período contábil em que o item será somado.

### Não trazer detalhes

O sistema importa apenas o local ou descrição disponível e o valor. Categoria, observação, data individual, pagamento e pessoa permanecem vazios. O mês de destino do lote define em qual período os valores entram.

A conferência deste modo mostra somente seleção, local, valor e estado da linha. A pessoa pode corrigir local e valor antes de confirmar.

## Fluxo da interface

### 1. Configuração

A área de gastos terá uma ação **Importar arquivo**. A primeira etapa solicita:

- mês de destino;
- modo completo ou sem detalhes;
- arquivo;
- pagamento e integrante padrão, apenas no modo completo.

Os formatos e limites aceitos devem aparecer antes da seleção do arquivo.

### 2. Relacionamento de colunas

Em Excel e CSV, a aplicação mostra os cabeçalhos encontrados e permite relacioná-los com valor, descrição e data. Valor é o único relacionamento obrigatório. Colunas opcionais podem ficar sem associação.

Em PDF, o sistema identifica automaticamente as linhas e os campos. Quando a estrutura não puder ser reconhecida com segurança, a aplicação informa que nenhum dado foi gravado e orienta a pessoa a usar CSV/Excel ou outro PDF digital.

### 3. Conferência obrigatória

A prévia mostra todas as linhas em uma tabela geral. No modo completo, cada linha contém:

- seleção para importar;
- data;
- descrição;
- valor;
- categoria sugerida;
- pagamento;
- pessoa;
- estado e avisos.

Cada linha pode ser editada ou retirada da importação. A pessoa também pode aplicar uma categoria, pagamento ou pessoa a várias linhas selecionadas.

Possíveis duplicidades, valores negativos, estornos, créditos, pagamentos de fatura e linhas sem valor válido aparecem desmarcados. Linhas sem valor não podem ser selecionadas até que o valor seja corrigido. Datas fora do mês escolhido aparecem marcadas como divergentes, mas podem ser confirmadas.

Uma linha sem correspondência confiável fica **Sem categoria**. A pessoa pode selecionar uma categoria existente ou criar uma nova durante a conferência.

### 4. Confirmação

O resumo final informa quantidade selecionada, valor total, novas categorias e itens ignorados. O botão **Confirmar importação** envia somente o estado revisado.

O servidor revalida arquivo, mês, valores, categorias, integrante e pagamento dentro da carteira atual. Lote, categorias novas, regras aprendidas e gastos são gravados atomicamente. Se qualquer operação falhar, nada do lote é persistido.

## Histórico e exclusão de lotes

O histórico de importações mostra:

- nome do arquivo;
- tipo e modo;
- mês de destino;
- integrante que importou;
- data da importação;
- quantidade de itens;
- valor total.

Ao abrir um lote, a pessoa pode consultar seus lançamentos. **Excluir importação** remove em uma única operação todos os gastos ligados ao lote.

Categorias criadas por esse lote podem ser removidas quando não tiverem gastos, regras válidas ou uso fora do lote. Categorias preexistentes ou reutilizadas permanecem. Se uma categoria criada pelo lote for removida, regras que apontem para ela também são removidas.

## Categorização automática

### Ordem de decisão

1. Regra aprendida e exata da família.
2. Associação suficientemente semelhante a gastos anteriores da família.
3. Regra inicial conhecida pelo sistema.
4. Sem categoria.

As regras iniciais cobrem grupos evidentes, por exemplo:

- Uber, ônibus e moto táxi → Transporte;
- compra do mês, Coop, Walmart e Atacadão → Mercado;
- iFood e serviços equivalentes → Delivery;
- farmácias e drogarias → Saúde/Farmácia;
- escola, faculdade e cursos → Educação;
- água, energia, gás, condomínio e internet → Contas fixas.

O catálogo deve ficar em um módulo testável, sem depender de serviços externos.

### Normalização e confiança

A comparação ignora caixa, acentos, espaços repetidos e códigos variáveis do estabelecimento. Números de loja, códigos de autorização e marcadores de parcela podem ser desconsiderados quando não distinguirem o fornecedor.

Somente correspondências de alta confiança preenchem a categoria automaticamente. Similaridade incerta não deve produzir um palpite: o item permanece sem categoria.

### Aprendizado privado

Quando a pessoa corrige uma categoria na conferência ou depois edita um gasto importado, a associação normalizada é criada ou atualizada apenas para aquela família. Nenhuma regra aprendida atravessa carteiras.

Regras e gastos apontam para o ID da categoria. Renomear uma categoria atualiza sua apresentação em histórico, resumo, gráficos, filtros, relatórios e futuras sugestões sem recriar as associações. Mover um gasto para outra categoria recalcula todos os agregados e atualiza o aprendizado correspondente.

## Modelo de dados

### Lotes de importação

Uma tabela `import_batches` deve armazenar:

- `id`;
- `household_id`;
- nome original do arquivo;
- hash SHA-256 do arquivo;
- tipo `xlsx`, `xls`, `csv` ou `pdf`;
- modo `full` ou `minimal`;
- mês de referência `YYYY-MM`;
- integrante que realizou a importação;
- pagamento e pessoa padrão quando aplicáveis;
- quantidade e total confirmados;
- data de criação.

Índices por família, mês e hash permitem consultar histórico e reconhecer reimportações.

### Gastos

Os gastos recebem `import_batch_id` e `reference_month` opcionais. Para itens importados, `reference_month` define o período contábil. Gastos manuais continuam usando o mês de `occurred_at`.

Para suportar o modo sem detalhes e campos ausentes no modo completo, descrição, categoria, pagamento, pessoa e data individual passam a aceitar ausência somente nos registros importados. A API de cadastro manual continua exigindo todos os campos atuais.

As consultas mensais selecionam gastos pelo mês de referência quando ele existir e usam a data individual nos demais casos. Componentes devem exibir campos vazios como “Não informado” e agrupar ausência de categoria como “Sem categoria”, sem criar uma categoria fictícia.

### Regras aprendidas

Uma tabela `category_rules` armazena família, categoria, padrão normalizado, origem e datas de criação/atualização. A categoria deve pertencer à mesma família. Um índice exclusivo por família e padrão impede regras conflitantes.

### Categorias criadas pelo lote

Uma relação entre lote e categoria registra quais categorias nasceram durante cada importação. Ela permite a limpeza segura ao excluir o lote sem afetar categorias anteriores ou reutilizadas.

## Leitura e privacidade dos arquivos

O arquivo é processado no navegador e não é armazenado. A aplicação calcula seu hash e mantém apenas a prévia em memória até a confirmação. O servidor recebe os dados revisados, o hash e os metadados necessários para revalidação e persistência.

Limites iniciais:

- arquivo de até 10 MB;
- até 5.000 linhas por importação;
- valor obrigatório e sujeito às regras financeiras já existentes;
- nenhum conteúdo executável de células é interpretado;
- fórmulas são tratadas apenas pelo valor calculado disponível no arquivo.

O servidor limita quantidade e tamanho do payload novamente. IDs de categoria, pagamento e integrantes são conferidos contra a família autenticada.

## Duplicidades

O hash identifica reenvio do mesmo arquivo e produz um aviso antes da conferência. Cada linha também recebe uma impressão digital construída com família, mês de destino, valor, descrição normalizada e data quando disponível.

Uma correspondência é tratada como possível duplicidade, não como exclusão definitiva, pois duas compras legítimas podem ter os mesmos dados. A linha aparece desmarcada e pode ser reativada conscientemente pela pessoa.

## Atualização do restante do produto

- Resumo e total mensal incluem todos os gastos confirmados no mês de referência.
- Gráficos e filtros mostram **Sem categoria** para itens sem categoria.
- Relatório preserva colunas vazias como “Não informado”.
- A edição de gasto aceita campos opcionais para itens importados e permite alterar seu mês de referência.
- A edição manual de gastos comuns mantém as validações atuais.
- Alterar categoria, mês, valor ou demais campos recalcula imediatamente todos os derivados.
- Renomear uma categoria reflete em todos os gastos porque o vínculo permanece pelo ID.

## Tratamento de erros

- Falha ao abrir ou interpretar arquivo: nenhuma prévia parcial é confirmada automaticamente.
- PDF sem texto ou estrutura reconhecível: mensagem específica, sem OCR silencioso.
- Linha inválida: permanece visível e desmarcada para correção.
- Falha de rede na confirmação: a prévia continua disponível para nova tentativa.
- Conflito ou remoção de categoria durante a conferência: o servidor rejeita a confirmação e solicita atualização da prévia.
- Falha na exclusão do lote: a operação é revertida integralmente.

## Testes e critérios de aceitação

### Leitores

- Planilhas com cabeçalhos e ordens diferentes.
- Datas e valores em formatos brasileiros e internacionais.
- CSV com delimitadores e codificações comuns.
- PDF digital reconhecido e PDF não reconhecido.
- Fórmulas, linhas vazias e arquivos acima dos limites.

### Classificação

- Regras fixas conhecidas.
- Regra aprendida por família.
- Normalização de descrições variáveis.
- Isolamento entre famílias.
- Correspondência incerta permanecendo sem categoria.
- Renomeação e troca de categoria preservando regras e agregados.

### Importação e lotes

- Nada é gravado antes da confirmação.
- Somente linhas selecionadas são persistidas.
- Valor é obrigatório e demais campos podem permanecer vazios.
- Data divergente é sinalizada e preservada.
- Lote e gastos são confirmados atomicamente.
- Exclusão remove todos os itens do lote sem afetar outros gastos.
- Categorias são limpas somente quando deixam de ter qualquer uso válido.
- Reimportação de arquivo e possíveis duplicidades são sinalizadas.
- Qualquer integrante pode operar somente na própria família.

### Integração visual

- Totais, gráficos, filtros e relatório usam o mês de destino.
- Os dois modos apresentam os campos corretos.
- A prévia permite edição individual e ações em massa.
- Linhas desmarcadas e avisos são acessíveis sem depender apenas de cor.
- O fluxo permanece utilizável no computador e no celular.

## Fora de escopo

- OCR de PDFs escaneados ou imagens.
- Integração direta com bancos ou Open Finance.
- Categorização por serviço externo de inteligência artificial.
- Armazenamento dos arquivos originais.
- Importação automática sem conferência humana.
