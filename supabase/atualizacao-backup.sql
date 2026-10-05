-- Atualização para quem já rodou o schema.sql antes.
-- Cole no SQL Editor do Supabase e execute uma vez.
--
-- O que muda: ao restaurar o histórico de empréstimos de um backup, os
-- empréstimos já devolvidos não podem ser barrados pela regra de exemplares.
-- A conferência passa a valer só para empréstimos ainda em aberto.

create or replace function public.checar_disponibilidade()
returns trigger
language plpgsql
as $$
declare
  total   int;
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
