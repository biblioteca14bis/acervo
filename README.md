# Acervo da Biblioteca 14 Bis

Site de acervo digital da biblioteca da Escola Santos Dumont. Mostra título, autor, gênero, onde o livro está e se está disponível. Roda nos planos gratuitos do Cloudflare e do Supabase, sem etapa de build.

## O que tem aqui

```
public/                  tudo o que vai para o ar
  index.html             catálogo público (busca, filtros, detalhes do livro)
  sobre.html             página "Sobre"
  admin.html             área da equipe (login, empréstimos, livros)
  backup.html            opções de backup (só administradores)
  logo-14bis.svg         logo em vetor, para fundo escuro
  aviao-14bis.svg        avião em vetor
  favicon.svg            ícone da aba
  css/styles.css         tema escuro
  js/config.js           URL, chave pública do Supabase e nomes (você preenche)
  js/supabase.js         cliente do Supabase
  js/util.js             funções auxiliares
  js/csv.js              leitura e geração de CSV
  js/combo.js            caixinha de sugestões e aviso de nomes parecidos
  js/catalog.js          lógica do catálogo
  js/admin.js            lógica do painel da equipe
  js/backup.js           lógica do backup e da restauração
  _headers               cabeçalhos de segurança
supabase/
  schema.sql             tabelas, segurança e visão pública
  atualizacao-backup.sql ajuste para quem já rodou o schema antes
  dados-exemplo.sql      seis livros para testar
.github/workflows/
  manter-ativo.yml       evita a pausa do plano gratuito do Supabase
wrangler.jsonc           diz ao Cloudflare qual pasta servir
```

## Como a privacidade funciona

- O público nunca acessa as tabelas. Ele lê só a visão `catalogo`, que mostra a disponibilidade e a data de devolução, sem nome de aluno.
- Os nomes e turmas ficam na tabela `emprestimos`, que só administradores conseguem ler ou alterar (segurança por linha do Postgres).
- Ser administrador significa ter o usuário listado na tabela `admins`.
- A página de backup confere o login, mas quem protege os dados de verdade é o banco: mesmo que alguém abrisse a página, as consultas voltariam vazias ou negadas.

O Supabase pode mostrar um aviso sobre "security definer view" para `catalogo`. É intencional: é isso que permite contar os empréstimos sem expor a tabela.

## Instalação

### 1. Supabase

1. Crie um projeto novo.
2. Em **SQL Editor**, cole e execute `supabase/schema.sql`.
3. Opcional: execute `supabase/dados-exemplo.sql` para ter livros de teste.
4. Em **Authentication**, desligue o cadastro aberto (**Allow new users to sign up**).
5. Em **Authentication > Users**, crie o usuário de cada administrador.
6. Registre cada administrador na tabela `admins`, trocando o e-mail:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'email-do-administrador@escola.com';
```

Se você já tinha rodado o `schema.sql` antes desta versão, rode também `supabase/atualizacao-backup.sql` uma vez. Ele ajusta a regra de exemplares para que a restauração de empréstimos já devolvidos funcione.

### 2. Configurar o site

Abra `public/js/config.js` e preencha a `SUPABASE_URL`, a chave pública (`SUPABASE_ANON_KEY`, que no Supabase novo se chama "publishable") e os nomes. Nunca use a chave "secret" nem a `service_role` no site.

### 3. GitHub

1. Crie um repositório. **Deixe-o privado** (veja a seção sobre a pausa do Supabase).
2. Envie todo o conteúdo desta pasta, mantendo a estrutura. Confira se a pasta `.github/workflows` apareceu. Se o envio pelo navegador ignorar pastas que começam com ponto, crie o arquivo à mão em **Add file > Create new file**, digitando o caminho `.github/workflows/manter-ativo.yml`.

### 4. Cloudflare

1. Em **Workers & Pages**, escolha **Create** e importe o repositório do GitHub.
2. Build command: vazio. Deploy command: `npx wrangler deploy` (o padrão).
3. A cada alteração enviada ao repositório, o Cloudflare publica de novo sozinho.

## Evitar a pausa do Supabase

O plano gratuito pausa o projeto depois de cerca de uma semana sem uso, e as férias escolares costumam passar disso. O arquivo `.github/workflows/manter-ativo.yml` faz uma consulta leve ao catálogo toda segunda e quinta.

- Não precisa criar segredos: a URL e a chave que ele usa são públicas, as mesmas do site.
- Para testar, abra o repositório no GitHub, vá em **Actions**, escolha **Manter Supabase ativo** e clique em **Run workflow**. Um círculo verde indica que funcionou.
- **Mantenha o repositório privado.** Em repositórios públicos, o GitHub desativa tarefas agendadas depois de 60 dias sem atividade no repositório. Se isso acontecer, é só reativar em **Actions**.

## Cadastro dos livros

O acervo é cadastrado direto pelo site, na aba **Livros** do painel da equipe.

- **Cadastro rápido:** depois de salvar, gênero, estante e prateleira continuam preenchidos e o próximo tombo já vem sugerido.
- **Sugestões:** ao digitar gênero, editora ou autor, aparece uma caixinha com os nomes já cadastrados (e quantos livros usam cada um). Basta clicar.
- **Nomes parecidos:** se você digitar algo muito parecido com um nome existente, como "Fatasia" no lugar de "Fantasia", o site avisa e oferece o nome certo. Se digitar "fantasia" em minúsculas, ele ajusta para "Fantasia" sozinho.
- **Editar e desativar:** cada livro tem os botões **Editar** e **Desativar**. Desativar tira o livro do catálogo público e mantém o histórico.

## Backups

No painel da equipe, o link **Opções de backup** leva à página `backup.html`, que só administradores conseguem usar.

- **Baixar livros:** tabela CSV com todos os livros, inclusive os desativados.
- **Baixar empréstimos:** tabela CSV com o histórico. Contém nomes de alunos, por isso o site pede uma confirmação antes e lembra de guardar em local restrito.
- **Restaurar:** escolha o arquivo e o site mostra um resumo (quantos livros novos, quantos atualizados, quantas linhas com problema). Só grava depois de você marcar a confirmação e confirmar de novo na janela de aviso. A restauração **nunca apaga nada**.
- Livros são ligados pelo **tombo**. Empréstimos são ligados ao livro pelo tombo e reconhecidos pelo trio livro, aluno e data de empréstimo, então restaurar duas vezes não duplica nada.
- Se o arquivo for aberto no Excel, os zeros à esquerda do tombo (0001) podem sumir. O site tenta reconhecer esses casos, mas o Google Planilhas evita o problema.

Faça um backup de livros de tempos em tempos e guarde em outro lugar, como o Drive da escola, porque o plano gratuito do Supabase não tem backup automático.

## Próximos passos possíveis

- Histórico de empréstimos por livro e por aluno.
- Reserva de livros, se a equipe sentir falta.
- Páginas de novidades e de horários.
