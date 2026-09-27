# Auditoria de segurança — 25/09/2026

Revisão final retomada em 26/09/2026.

## Escopo e resultado

Inspeção do código local, histórico Git disponível, configuração de build, arquivos gerados para o navegador, quatro Route Handlers, autenticação, consultas D1/Drizzle e validação de formulários/importações. Correções aplicadas ao repositório; **não houve deploy nem alteração de secrets ou banco de produção**.

Não foram encontradas credenciais pelos padrões pesquisados. Isso não prova ausência absoluta de segredos: o detector é heurístico, não consulta o painel da hospedagem, não cobre histórico removido nem permite afirmar o que está no site publicado. O identificador de projeto em `.openai/hosting.json` é metadado de hospedagem, não uma chave de API. A busca no código não identificou integração com provedor de IA ou chave de API necessária a ela.

## Achados e correções

| Achado | Impacto | Correção |
| --- | --- | --- |
| Ausência de rate limit | Abuso de endpoints e consumo de recursos | Contadores compartilhados e atômicos em D1 antes do roteamento; segunda cota por integrante autenticado |
| Leitura de JSON sem limite | Consumo excessivo de memória antes da validação | Leitura incremental limitada; verificação do tamanho efetivo, MIME e objeto JSON |
| Campos opcionais inválidos viravam `null` nas importações | Dados inválidos aceitos silenciosamente | Tipos, tamanhos, caracteres de controle, datas e flags rejeitados explicitamente |
| Origem checada apenas por `Sec-Fetch-Site` | Cabeçalho ausente não detectava `Origin` externo | Validação adicional de igualdade exata de `Origin` quando presente |
| Administrador local configurado também no build | Configuração de desenvolvimento indevidamente incluída no artefato de produção | `LOCAL_ADMIN_ENABLED=false` no build; desenvolvimento mantém a funcionalidade |
| `.dev.vars*` não estava ignorado | Risco de versionar secrets locais futuramente | Exclusões de Git adicionadas |
| Falta de barreira explícita servidor/cliente | Risco de importação acidental de módulos privados | `server-only` no acesso ao banco e autenticação; build bloqueia prefixos públicos |
| Exceções completas nos logs de APIs | Possível registro de parâmetros SQL/dados privados | Erros inesperados registrados sem corpo, causa ou parâmetros |
| Alguns IDs, filtros e campos de edição tinham validação permissiva | Formatos inesperados ou valores inválidos convertidos em vazios | Validação estrita de IDs, mês, paginação, família e campos de gastos importados |

## Segredos e variáveis

`ADMIN_EMAIL`, `INITIAL_HOUSEHOLD_NAME`, `INITIAL_HOUSEHOLD_MEMBERS` e `LOCAL_ADMIN_ENABLED` são consumidos no servidor. O binding `DB` é provido pela hospedagem. Não foram encontrados valores reais dessas configurações no código atual revisado. Dados que o produto exibe intencionalmente, como nomes de integrantes e da família, continuam aparecendo nas respostas autorizadas; isso é diferente de expor o objeto de configuração.

Para credenciais futuras, configure secrets de runtime no ambiente do Worker, via mecanismo seguro oferecido pela hospedagem. Runtime e build são etapas diferentes: uma credencial colocada no JavaScript do frontend durante o build pode ser recuperada pelo navegador. Nenhuma chave real foi criada ou migrada nesta auditoria, pois não foi identificada uma chave a transferir. Não cole secrets em arquivos versionados, comandos com valores literais ou mensagens.

O build bloqueia `VITE_*` e `NEXT_PUBLIC_*`, além de desabilitar os prefixos de ambiente do Vite. Essa barreira evita exposição automática por prefixo, mas não substitui revisão de código: serializar manualmente um segredo ainda seria incorreto.

Referência: [Cloudflare — secrets de runtime](https://developers.cloudflare.com/workers/configuration/secrets/).

## Cobertura dos endpoints e limites

| Caminho | Métodos implementados | Cotas por minuto |
| --- | --- | --- |
| `/api/finance` | GET, POST, PATCH, DELETE | Geral 300; API 120; escritas 30 |
| `/api/admin/households` | GET, POST, PATCH, DELETE | Geral 300; API 120; escritas 30 |
| `/api/imports` | GET, POST, DELETE | Geral 300; API 120; escritas 30; POST 10 |
| `/api/imports/preview` | POST | Geral 300; API 120; escritas 30; POST 10 |
| `/`, `/_vinext/image` e demais caminhos que chegam ao Worker | Todos | Geral 300 |

As cotas são cumulativas e compartilhadas por grupo, não reiniciam ao trocar de endpoint. A camada do Worker limita por IP antes de autenticação, incluindo tentativas não autenticadas e métodos desconhecidos. Depois de reconhecer um integrante no banco, há cotas adicionais usando seu ID. Trocar a família selecionada não muda a identidade da cota.

Implementação: janela fixa de 60 segundos; `INSERT ... ON CONFLICT ... RETURNING` atômico no D1; limite nos contadores saturados; índice e limpeza probabilística limitada a 1.000 registros expirados. O banco guarda hashes das identidades, não IPs/emails em texto claro. Hash de IP não equivale a anonimização irreversível. Não há fallback para um mapa de memória por instância. Falha no banco/tabela ausente produz `503`, excesso produz `429` com `Retry-After` e `Cache-Control: no-store`.

Limitações operacionais: cada pedido ao Worker faz operações no D1; esta solução tem custo e latência e não substitui proteção volumétrica de borda. IPs compartilhados usam uma cota comum. Sem `CF-Connecting-IP`, há um bucket conservador `unknown`, não um bypass. A janela fixa permite rajadas próximas à virada de minuto. Assets atendidos diretamente pela Cloudflare e login/callback atendidos pelo Sites antes do Worker estão fora do código e precisam de rate limit na plataforma.

## SQL injection, entradas e prompt injection

Consultas revisadas usam operações parametrizadas do Drizzle, seus templates `sql` ou `D1.prepare(...).bind(...)`. Os SQLs de importação são constantes; textos das linhas entram como parâmetros JSON, não como trechos de SQL. Não foi identificada concatenação de input em SQL executável. Um teste HTTP gravou uma categoria com apóstrofo e texto `DROP TABLE` e verificou a preservação literal e o funcionamento posterior da API.

Valores, IDs, datas, categorias, integrantes e formas de pagamento são validados no backend. Campos de texto têm normalização NFC, limites e rejeição de controles invisíveis; o React continua responsável pelo escape de texto apresentado. Não se removem apóstrofos de nomes legítimos. Consultas à família continuam limitadas pelo contexto autenticado. A validação de propriedade ocorre na gravação; sugestões da prévia não autorizam uma gravação.

O classificador atual é determinístico, não usa LLM, não gera SQL e não executa instruções de descrições, PDFs ou planilhas. Portanto, **não há superfície de prompt injection identificada no fluxo atual**. Rejeitar palavras como “ignore instruções” não seria uma garantia útil. Uma futura integração de IA precisará tratar documentos como dados não confiáveis, limitar ferramentas e permissões, validar saídas e exigir autorização no servidor independentemente do modelo.

Referência: [OWASP — prevenção de SQL injection](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html).

## Pendências na hospedagem

1. Aplicar `0006_request_rate_limits.sql` no D1 de destino antes/junto da publicação. Todas as migrações foram executadas com sucesso em um banco local isolado; produção não foi tocada.
2. Publicar o novo build. As alterações locais não mudam automaticamente o site existente.
3. Confirmar que a hospedagem sobrescreve `oai-authenticated-user-id`, `oai-authenticated-user-email` e `CF-Connecting-IP` e impede acesso direto ao Worker sem autenticação do proxy. O código existente confia nesses cabeçalhos; sem essa fronteira confiável, um atacante poderia falsificá-los. Não é possível provar essa configuração somente lendo o repositório.
4. Confirmar os limites nas rotas de autenticação e arquivos servidos pela plataforma antes do Worker. Não foi feita alteração de WAF/proxy.
5. Conferir os secrets reais no painel da hospedagem e manter `LOCAL_ADMIN_ENABLED` desabilitado em produção. Caso uma credencial seja descoberta em histórico externo/antigo, revogá-la e rotacioná-la; remover o texto não basta.

## Verificação

- `npm test`: build de produção concluído e 56 testes aprovados.
- `npm run lint`: aprovado.
- `node scripts/audit-secrets.mjs --history`: nenhuma ocorrência nos padrões pesquisados; nunca imprime valores encontrados.
- Todas as migrações SQL aplicadas em D1 local isolado (49 comandos).
- `node scripts/verify-security-http.mjs`: aprovado contra Worker compilado local, incluindo as quatro APIs, edição de descrições importadas numéricas, retornos 400/403/413/415, SQL como valor literal, cota autenticada mesmo alternando IP e cota no endpoint público com `Retry-After`.
- `npx tsc --noEmit --incremental false`: não passa por configuração de tipos/dependências ausente no projeto (`cloudflare:workers`, `Fetcher`, `D1Database`, `drizzle-kit`). O build e os testes acima são verificações distintas; não se declara que a checagem de tipos passou.

Para repetir o teste HTTP, use um banco **local isolado e vazio**, aplique todas as migrações e execute o build com Wrangler na porta 8788, fornecendo `LOCAL_ADMIN_ENABLED=true` apenas nesse processo local. O teste cria uma categoria e consome cotas; não o execute no banco de desenvolvimento habitual. O script rejeita destinos que não sejam localhost/127.0.0.1.
