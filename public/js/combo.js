import { normalizar } from "./util.js";

// Distância de edição: quantas letras precisam mudar para uma palavra virar a outra.
// "fatasia" e "fantasia" estão a 1 de distância.
export function distancia(a, b) {
  const anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = anterior[0];
    anterior[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = anterior[j];
      anterior[j] = Math.min(
        anterior[j] + 1,
        anterior[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = guardado;
    }
  }
  return anterior[b.length];
}

// Conta quantas vezes cada valor aparece em um campo dos livros.
// Grafias que só mudam em maiúsculas ou acentos contam como o mesmo valor.
export function opcoesDoCampo(livros, campo) {
  const grupos = new Map();
  for (const livro of livros) {
    const valor = String(livro[campo] ?? "").trim();
    if (!valor) continue;
    const chave = normalizar(valor);
    if (!grupos.has(chave)) grupos.set(chave, { chave, total: 0, variantes: new Map() });
    const g = grupos.get(chave);
    g.total++;
    g.variantes.set(valor, (g.variantes.get(valor) || 0) + 1);
  }
  return [...grupos.values()]
    .map((g) => ({
      chave: g.chave,
      qtd: g.total,
      valor: [...g.variantes.entries()].sort((x, y) => y[1] - x[1])[0][0], // grafia mais usada
    }))
    .sort((a, b) => a.valor.localeCompare(b.valor, "pt-BR"));
}

// Compara o que foi digitado com o que já existe.
// Devolve { exato } se já existe (mesmo com outra caixa ou acento),
// ou { parecido } se há um valor muito parecido, ou {} se é novo.
export function conferir(valor, opcoes) {
  const chave = normalizar(valor);
  if (!chave) return {};
  const exato = opcoes.find((o) => o.chave === chave);
  if (exato) return { exato };

  const limite = chave.length >= 6 ? 2 : chave.length >= 4 ? 1 : 0;
  if (!limite) return {};
  let melhor = null;
  for (const o of opcoes) {
    const d = distancia(chave, o.chave);
    if (d <= limite && (!melhor || d < melhor.d)) melhor = { o, d };
  }
  return melhor ? { parecido: melhor.o } : {};
}

// Liga a caixinha de sugestões a um campo de texto.
//   obterOpcoes(): devolve a lista atual de { valor, qtd, chave }
//   avisarParecidos: mostra "Parecido com ..." quando há um nome quase igual
export function criarCombo(input, obterOpcoes, { avisarParecidos = false } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "combo";
  input.before(wrap);
  wrap.append(input);

  const lista = document.createElement("ul");
  lista.className = "combo-lista";
  lista.id = `combo-${input.name}`;
  lista.hidden = true;
  lista.setAttribute("role", "listbox");
  wrap.append(lista);

  const dica = document.createElement("p");
  dica.className = "combo-dica";
  dica.hidden = true;
  dica.setAttribute("role", "status");
  wrap.append(dica);

  input.setAttribute("autocomplete", "off");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", lista.id);

  let itens = [];
  let ativo = -1;

  function sugestoes() {
    const termo = normalizar(input.value);
    return obterOpcoes()
      .filter((o) => o.chave !== termo && (!termo || o.chave.includes(termo)))
      .sort((a, b) => {
        const ia = a.chave.startsWith(termo) ? 0 : 1;
        const ib = b.chave.startsWith(termo) ? 0 : 1;
        return ia - ib || b.qtd - a.qtd || a.valor.localeCompare(b.valor, "pt-BR");
      })
      .slice(0, 8);
  }

  function desenhar() {
    lista.replaceChildren();
    itens.forEach((o, i) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === ativo));
      li.dataset.indice = i;
      const nome = document.createElement("span");
      nome.textContent = o.valor;
      const qtd = document.createElement("span");
      qtd.className = "combo-qtd";
      qtd.textContent = o.qtd === 1 ? "1 livro" : `${o.qtd} livros`;
      li.append(nome, qtd);
      lista.append(li);
    });
  }

  function abrir() {
    itens = sugestoes();
    ativo = -1;
    desenhar();
    const aberta = itens.length > 0;
    lista.hidden = !aberta;
    input.setAttribute("aria-expanded", String(aberta));
  }

  function fechar() {
    lista.hidden = true;
    input.setAttribute("aria-expanded", "false");
    ativo = -1;
  }

  function escolher(valor) {
    input.value = valor;
    fechar();
    atualizarDica();
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
  }

  function atualizarDica() {
    const r = avisarParecidos ? conferir(input.value, obterOpcoes()) : {};
    const sugerido = r.parecido ? r.parecido.valor : "";

    // Se o aviso é o mesmo que já está na tela, não refaz: refazer removeria
    // o botão no meio de um clique.
    if (dica.dataset.valor === sugerido) return;

    dica.dataset.valor = sugerido;
    dica.replaceChildren();
    dica.hidden = !sugerido;
    if (!sugerido) return;

    dica.append(`Parecido com “${sugerido}”, que já está no acervo. `);
    const usar = document.createElement("button");
    usar.type = "button";
    usar.className = "combo-usar";
    usar.textContent = `Usar “${sugerido}”`;
    usar.addEventListener("click", () => escolher(sugerido));
    dica.append(usar);
  }

  input.addEventListener("focus", abrir);
  input.addEventListener("input", () => {
    abrir();
    atualizarDica();
  });

  input.addEventListener("blur", () => {
    fechar();
    // "fantasia" vira "Fantasia" se já existe com outra grafia de maiúsculas ou acento
    const r = conferir(input.value, obterOpcoes());
    if (r.exato && r.exato.valor !== input.value.trim()) input.value = r.exato.valor;
    atualizarDica();
  });

  input.addEventListener("keydown", (e) => {
    if (lista.hidden && e.key === "ArrowDown") {
      abrir();
      e.preventDefault();
      return;
    }
    if (lista.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      ativo = (ativo + (e.key === "ArrowDown" ? 1 : -1) + itens.length) % itens.length;
      desenhar();
      e.preventDefault();
    } else if (e.key === "Enter" && ativo >= 0) {
      escolher(itens[ativo].valor);
      e.preventDefault();
    } else if (e.key === "Escape") {
      fechar();
    }
  });

  // mousedown não tira o foco do campo, então a lista e o aviso não somem antes do clique
  lista.addEventListener("mousedown", (e) => e.preventDefault());
  dica.addEventListener("mousedown", (e) => e.preventDefault());
  lista.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (li) escolher(itens[Number(li.dataset.indice)].valor);
  });

  return { fechar, atualizarDica };
}
