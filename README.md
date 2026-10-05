# Acervo da Biblioteca

Site de acervo digital para a biblioteca da escola. Mostra título, autor, gênero, onde o livro está e se está disponível. Só texto, sem imagens, e roda nos planos gratuitos do Cloudflare e do Supabase.

## O que tem aqui

```
public/                  tudo o que vai para o ar
  index.html             catálogo público (busca, filtros, detalhes do livro)
  admin.html             área da equipe (login, empréstimos, livros)
  css/styles.css         tema escuro
  js/config.js           URL e chave do Supabase (você preenche)
  js/supabase.js         cliente do Supabase
  js/util.js             funções auxiliares
  js/catalog.js          lógica do catálogo
  js/admin.js            lógica do painel da equipe
  _headers               cabeçalhos de segurança
supabase/
  schema.sql             tabelas, segurança e visão pública
  dados-exemplo.sql      seis livros para testar
.github/workflows/
  manter-ativo.yml       evita a pausa do plano gratuito do Supabase
wrangler.jsonc           diz ao Cloudflare qual pasta servir
README.md                este guia
```

Não tem etapa de build. São arquivos estáticos: o que está em `public/` é o que vai ao ar.

## Como a privacidade funciona

- O público nunca acessa as tabelas. Ele lê só a visão `catalogo`, que mostra a disponibilidade e a data de devolução, sem nome de aluno.
- Os nomes e turmas ficam na tabela `emprestimos`, que só administradores conseguem ler ou alterar (segurança por linha do Postgres).
- Ser administrador significa ter o seu usuário listado na tabela `admins`. Criar uma conta no Supabase não dá acesso a nada por si só.

O Supabase pode mostrar um aviso sobre "security definer view" para `catalogo`. É intencional: é isso que permite contar os empréstimos sem expor a tabela.

## Instalação

### 1. Supabase

1. Crie um projeto novo.
2. Em **SQL Editor**, cole e execute `supabase/schema.sql`.
3. Opcional: execute `supabase/dados-exemplo.sql` para ter livros de teste.
4. Em **Authentication**, desligue o cadastro aberto (**Allow new users to sign up**). Assim só quem você convidar cria conta.
5. Em **Authentication > Users**, crie o usuário de cada administrador (e-mail e senha).
6. Registre cada administrador na tabela `admins`, trocando o e-mail abaixo:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'email-do-administrador@escola.com';
```

### 2. Configurar o site

Abra `public/js/config.js` e preencha:

- `SUPABASE_URL` e `SUPABASE_ANON_KEY` (em **Project Settings > API**). A chave `anon` é pública por natureza. Nunca use a `service_role` no site.
- `NOME_ESCOLA`.

### 3. GitHub

1. Crie um repositório no GitHub (pode ser privado).
2. Envie para ele todo o conteúdo desta pasta, mantendo a estrutura. Confira se a pasta `.github/workflows` apareceu. Se o envio pelo navegador ignorar pastas que começam com ponto, crie o arquivo à mão em **Add file > Create new file**, digitando o caminho `.github/workflows/manter-ativo.yml`.

### 4. Cloudflare

1. Em **Workers & Pages**, escolha **Create** e importe o repositório do GitHub.
2. Build command: deixe vazio. Deploy command: `npx wrangler deploy` (é o padrão).
3. O nome do projeto vem do `wrangler.jsonc` (`acervo`). Se quiser outro endereço, troque o nome no arquivo antes do primeiro deploy.
4. A cada alteração enviada ao repositório, o Cloudflare publica de novo sozinho.

### 5. Evitar a pausa do Supabase

O plano gratuito pausa o projeto depois de cerca de uma semana sem uso, e as férias escolares costumam passar disso. O arquivo `.github/workflows/manter-ativo.yml` faz uma consulta leve duas vezes por semana.

No GitHub, em **Settings > Secrets and variables > Actions**, crie dois segredos: `SUPABASE_URL` e `SUPABASE_ANON_KEY`.

## Cadastro dos livros

Duas formas:

- **Pela tela:** aba **Livros** do painel da equipe.
- **Em lote, por planilha:** exporte do Google Planilhas como CSV com estas colunas, nesta grafia: `tombo, titulo, autor, editora, genero, estante, prateleira, exemplares`. No Supabase, em **Table Editor > livros > Insert > Import data from CSV**.

O `tombo` precisa ser único. É a chave que vai permitir sincronizar com a planilha mais para frente.

## Backups

O plano gratuito não tem backup automático. De tempos em tempos, exporte as tabelas `livros` e `emprestimos` em CSV pelo Table Editor.

## Próximos passos possíveis

- Editar livros pela tela (hoje só cadastra, ativa e desativa).
- Histórico de empréstimos por livro e por aluno.
- Sincronização com a planilha do Google (Apps Script).
- Páginas de novidades e de horários.
- Reserva de livros, se a equipe sentir falta.
