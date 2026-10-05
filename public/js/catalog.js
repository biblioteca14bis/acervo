import { supabase } from "./supabase.js";
import { NOME_ESCOLA } from "./config.js";
import { escapeHtml, normalizar, formatarData, corDaCapa, buscarTudo } from "./util.js";

const estado = {
  livros: [],
  busca: "",
  genero: "",
  status: "todos", // todos | disponiveis | emprestados
  selecionadoId: null,
};

const el = {
  escola: document.querySelector("#nome-escola"),
  busca: document.querySelector("#busca"),
  generos: document.querySelector("#generos"),
  status: document.querySelector("#status"),
  contagem: document.querySelector("#contagem"),
  lista: document.querySelector("#lista"),
  painel: document.querySelector("#painel"),
  fechar: document.querySelector("#fechar-painel"),
};

el.escola.textContent = NOME_ESCOLA;

// ---------- dados ----------

async function carregar() {
  try {
    estado.livros = await buscarTudo((de, ate) =>
      supabase.from("catalogo").select("*").order("titulo").range(de, ate)
    );
    renderGeneros();
    renderLista();
  } catch (erro) {
    console.error(erro);
    el.lista.innerHTML = `<p class="aviso">Não foi possível carregar o acervo agora. Tente de novo em alguns minutos.</p>`;
  }
}

function filtrar() {
  const termo = normalizar(estado.busca);
  return estado.livros.filter((l) => {
    if (termo && !l.busca.includes(termo)) return false;
    if (estado.genero && l.genero !== estado.genero) return false;
    if (estado.status === "disponiveis" && l.disponiveis === 0) return false;
    if (estado.status === "emprestados" && l.disponiveis > 0) return false;
    return true;
  });
}

// ---------- pedaços de HTML ----------

function pilula(l) {
  if (l.disponiveis > 0) {
    return `<span class="pill pill-ok"><i></i>Disponível</span>`;
  }
  const quando = l.proxima_devolucao ? `Até ${formatarData(l.proxima_devolucao)}` : "Indisponível";
  return `<span class="pill pill-aviso"><i></i>${escapeHtml(quando)}</span>`;
}

function local(l) {
  const partes = [];
  if (l.estante) partes.push(`Estante ${escapeHtml(l.estante)}`);
  if (l.prateleira) partes.push(`prateleira ${escapeHtml(l.prateleira)}`);
  return partes.join(" · ") || "Local não informado";
}

function capa(l, classe) {
  return `<span class="${classe}" style="background:${corDaCapa(l.titulo)}">
    <span class="capa-genero">${escapeHtml(l.genero)}</span>
    <span class="capa-titulo">${escapeHtml(l.titulo)}</span>
  </span>`;
}

// ---------- telas ----------

function renderGeneros() {
  const generos = [...new Set(estado.livros.map((l) => l.genero).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
  const botoes = ["", ...generos].map((g) => {
    const ativo = estado.genero === g;
    return `<button type="button" class="chip" data-genero="${escapeHtml(g)}" aria-pressed="${ativo}">${
      g ? escapeHtml(g) : "Todos"
    }</button>`;
  });
  el.generos.innerHTML = botoes.join("");
}

function renderLista() {
  const livros = filtrar();
  el.contagem.textContent = livros.length === 1 ? "1 livro" : `${livros.length} livros`;

  if (livros.length === 0) {
    el.lista.innerHTML = `<p class="aviso">Nenhum livro encontrado. Tente outro título, autor ou gênero.</p>`;
    return;
  }

  el.lista.innerHTML = livros
    .map(
      (l) => `
    <button type="button" class="card" data-id="${l.id}" aria-pressed="${l.id === estado.selecionadoId}">
      ${capa(l, "capa")}
      <span class="card-info">
        <span class="autor">${escapeHtml(l.autor)}</span>
        ${pilula(l)}
        <span class="local">${local(l)}</span>
      </span>
    </button>`
    )
    .join("");
}

function renderPainel() {
  const l = estado.livros.find((x) => x.id === estado.selecionadoId);
  if (!l) return;

  const disponivel = l.disponiveis > 0;
  const resumo = disponivel ? "Disponível" : "Emprestado";
  const detalhe = `${l.disponiveis} de ${l.exemplares} ${l.exemplares === 1 ? "exemplar" : "exemplares"} na biblioteca`;

  el.painel.querySelector("#painel-conteudo").innerHTML = `
    ${capa(l, "capa capa-grande")}
    <div class="painel-corpo">
      <p class="painel-autor">${escapeHtml(l.autor)}</p>
      <div class="status-bloco ${disponivel ? "status-ok" : "status-aviso"}">
        <strong>${resumo}</strong>
        <span>${escapeHtml(detalhe)}</span>
      </div>
      <div class="posicao">
        <div><span>Estante</span><strong>${escapeHtml(l.estante) || "?"}</strong></div>
        <div><span>Prateleira</span><strong>${escapeHtml(l.prateleira) || "?"}</strong></div>
      </div>
      <dl class="ficha">
        <dt>Editora</dt><dd>${escapeHtml(l.editora) || "Não informada"}</dd>
        <dt>Tombo</dt><dd>${escapeHtml(l.tombo)}</dd>
        ${
          l.proxima_devolucao
            ? `<dt>Próxima devolução</dt><dd>${formatarData(l.proxima_devolucao)}</dd>`
            : ""
        }
      </dl>
    </div>`;

  el.painel.classList.add("com-livro", "aberto");
}

// ---------- eventos ----------

el.busca.addEventListener("input", (e) => {
  estado.busca = e.target.value;
  renderLista();
});

el.generos.addEventListener("click", (e) => {
  const botao = e.target.closest("[data-genero]");
  if (!botao) return;
  estado.genero = botao.dataset.genero;
  renderGeneros();
  renderLista();
});

el.status.addEventListener("click", (e) => {
  const botao = e.target.closest("[data-status]");
  if (!botao) return;
  estado.status = botao.dataset.status;
  el.status.querySelectorAll("[data-status]").forEach((b) =>
    b.setAttribute("aria-pressed", String(b === botao))
  );
  renderLista();
});

el.lista.addEventListener("click", (e) => {
  const card = e.target.closest("[data-id]");
  if (!card) return;
  estado.selecionadoId = Number(card.dataset.id);
  renderLista();
  renderPainel();
});

el.fechar.addEventListener("click", () => el.painel.classList.remove("aberto"));

carregar();
