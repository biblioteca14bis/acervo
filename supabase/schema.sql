-- Esquema do acervo da biblioteca escolar
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute uma vez.

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------

create table public.livros (
  id          bigint generated always as identity primary key,
  tombo       text unique not null,          -- numero de controle unico de cada livro
  titulo      text not null,
  autor       text,
  editora     text,
  genero      text,
  estante     text,
  prateleira  text,
  exemplares  int not null default 1 check (exemplares >= 0),
  ativo       boolean not null default true, -- em vez de apagar, desative
  criado_em   timestamptz not null default now()
);

create table public.emprestimos (
  id                  bigint generated always as identity primary key,
  livro_id            bigint not null references public.livros(id) on delete restrict,
  aluno_nome          text not null,
  turma               text,
  emprestado_em       date not null default current_date,
  devolucao_prevista  date not null,
  devolvido_em        date,
  check (devolucao_prevista >= emprestado_em)
);

create index emprestimos_abertos_idx on public.emprestimos (livro_id) where devolvido_em is null;

-- Quem pode administrar. Cada linha é um usuario do Supabase Auth.
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------
-- Seguranca por linha (RLS)
-- Visitantes nao tem acesso direto a nenhuma tabela.
-- ---------------------------------------------------------------

alter table public.livros      enable row level security;
alter table public.emprestimos enable row level security;
alter table public.admins      enable row level security;

create policy "admins gerenciam livros"
  on public.livros for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins gerenciam emprestimos"
  on public.emprestimos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admin le o proprio registro"
  on public.admins for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------
-- Visao publica do catalogo
-- Mostra disponibilidade e data de devolucao, nunca o nome do aluno.
-- A visao roda com os direitos do dono (de proposito), por isso consegue
-- contar os emprestimos sem expor a tabela.
-- ---------------------------------------------------------------

create or replace view public.catalogo
with (security_invoker = false)
as
select
  l.id,
  l.tombo,
  l.titulo,
  l.autor,
  l.editora,
  l.genero,
  l.estante,
  l.prateleira,
  l.exemplares,
  greatest(l.exemplares - coalesce(e.abertos, 0), 0) as disponiveis,
  e.proxima_devolucao,
  lower(extensions.unaccent(
    coalesce(l.titulo, '') || ' ' || coalesce(l.autor, '') || ' ' || coalesce(l.genero, '')
  )) as busca
from public.livros l
left join (
  select livro_id, count(*) as abertos, min(devolucao_prevista) as proxima_devolucao
  from public.emprestimos
  where devolvido_em is null
  group by livro_id
) e on e.livro_id = l.id
where l.ativo;

grant select on public.catalogo to anon, authenticated;

-- ---------------------------------------------------------------
-- Regra: nao emprestar se nao ha exemplar disponivel
-- ---------------------------------------------------------------

create or replace function public.checar_disponibilidade()
returns trigger
language plpgsql
as $$
declare
  total  int;
  abertos int;
begin
  -- Empréstimo que já entra como devolvido não ocupa nenhum exemplar.
  if new.devolvido_em is not null then
    return new;
  end if;

  select exemplares into total from public.livros where id = new.livro_id;
  select count(*) into abertos
    from public.emprestimos
    where livro_id = new.livro_id and devolvido_em is null;

  if abertos >= coalesce(total, 0) then
    raise exception 'Nenhum exemplar disponível para este livro.';
  end if;
  return new;
end;
$$;

create trigger emprestimo_checa_disponibilidade
  before insert on public.emprestimos
  for each row execute function public.checar_disponibilidade();
