import { supabase } from "./supabase.js";
import { NOME_BIBLIOTECA } from "./config.js";
import { escapeHtml, normalizar, formatarData, hoje, hojeMais, buscarTudo } from "./util.js";

const $ = (seletor) => document.querySelector(seletor);

const telaLogin = $("#tela-login");
const telaApp = $("#tela-app");
const botaoSair = $("#sair");

$("#nome-biblioteca").textContent = NOME_BIBLIOTECA;

let livros = [];
let emprestimos = [];
const livroPorRotulo = new Map(); // texto do campo "Livro" -> id

// ---------- mensagens ----------

function mostrar(elemento, texto, tipo = "") {
  elemento.textContent = texto;
  elemento.className = `mensagem ${tipo}`.trim();
}

// ---------- entrada e saída ----------

async function iniciar() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    await entrar(data.session.user);
  } else {
    mostrarLogin();
  }
}

function mostrarLogin() {
  telaApp.hidden = true;
  botaoSair.hidden = true;
  telaLogin.hidden = false;
}

async function entrar(usuario) {
  // So quem esta na tabela "admins" usa o painel.
  const { data, error } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", usuario.id)
    .maybeSingle();

  if (error || !data) {
    await supabase.auth.signOut();
    mostrarLogin();
    mostrar($("#msg-login"), "Esta conta não tem permissão de administrador.", "erro");
    return;
  }

  telaLogin.hidden = true;
  telaApp.hidden = false;
  botaoSair.hidden = false;

  $('[name="devolucao"]').value = hojeMais(14);
  await Promise.all([carregarLivros(), carregarEmprestimos()]);
}

$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const msg = $("#msg-login");
  mostrar(msg, "Entrando...");

  const { data, error } = await supabase.auth.signInWithPassword({
    email: form.get("email"),
    password: form.get("senha"),
  });

  if (error) {
    mostrar(msg, "E-mail ou senha incorretos.", "erro");
    return;
  }
  mostrar(msg, "");
  await entrar(data.user);
});

botaoSair.addEventListener("click", async () => {
  await supabase.auth.signOut();
  livros = [];
  emprestimos = [];
  mostrarLogin();
});

// ---------- abas ----------

const abas = [
  { botao: $("#aba-emprestimos"), painel: $("#painel-emprestimos") },
  { botao: $("#aba-livros"), painel: $("#painel-livros") },
];

abas.forEach(({ botao }) =>
  botao.addEventListener("click", () => {
    abas.forEach((a) => {
      const ativa = a.botao === botao;
      a.botao.setAttribute("aria-selected", String(ativa));
      a.painel.hidden = !ativa;
    });
  })
);

// ---------- livros ----------

async function carregarLivros() {
  livros = await buscarTudo((de, ate) =>
    supabase.from("livros").select("*").order("titulo").range(de, ate)
  );

  // Lista de sugestões do campo "Livro" (só os ativos).
  livroPorRotulo.clear();
  $("#lista-livros").innerHTML = livros
    .filter((l) => l.ativo)
    .map((l) => {
      const rotulo = `${l.tombo} | ${l.titulo}`;
      livroPorRotulo.set(rotulo, l.id);
      return `<option value="${escapeHtml(rotulo)}"></option>`;
    })
    .join("");

  renderLivros();
}

function renderLivros() {
  const termo = normalizar($("#filtro-livros").value);
  const visiveis = livros.filter(
    (l) => !termo || normalizar(`${l.tombo} ${l.titulo} ${l.autor}`).includes(termo)
  );

  $("#lista-livros-admin").innerHTML =
    visiveis.length === 0
      ? `<p class="vazio">Nenhum livro encontrado.</p>`
      : visiveis
          .slice(0, 200)
          .map(
            (l) => `
      <div class="linha">
        <div class="linha-info">
          <span class="linha-titulo">${escapeHtml(l.titulo)}</span>
          <span class="linha-sub">Tombo ${escapeHtml(l.tombo)} · ${escapeHtml(l.autor)} · ${l.exemplares} ${
              l.exemplares === 1 ? "exemplar" : "exemplares"
            }${l.ativo ? "" : " · desativado"}</span>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap">
          <button type="button" class="botao-suave" data-acao="editar" data-id="${l.id}">Editar</button>
          <button type="button" class="botao-suave" data-acao="alternar-ativo" data-id="${l.id}">${
            l.ativo ? "Desativar" : "Reativar"
          }</button>
        </div>
      </div>`
          )
          .join("");
}

$("#filtro-livros").addEventListener("input", renderLivros);

let editandoId = null;
const formLivro = $("#form-livro");
const CAMPOS_LIVRO = ["tombo", "titulo", "autor", "editora", "genero", "estante", "prateleira", "exemplares"];

function dadosDoFormulario() {
  const f = new FormData(formLivro);
  const opcional = (nome) => f.get(nome).trim() || null;
  return {
    tombo: f.get("tombo").trim(),
    titulo: f.get("titulo").trim(),
    autor: opcional("autor"),
    editora: opcional("editora"),
    genero: opcional("genero"),
    estante: opcional("estante"),
    prateleira: opcional("prateleira"),
    exemplares: Number(f.get("exemplares")),
  };
}

// "0007" vira "0008". Se o tombo não for só número, não sugere nada.
function proximoTombo(tombo) {
  return /^\d+$/.test(tombo) ? String(Number(tombo) + 1).padStart(tombo.length, "0") : "";
}

function entrarModoEdicao(livro) {
  editandoId = livro.id;
  CAMPOS_LIVRO.forEach((c) => (formLivro.elements[c].value = livro[c] ?? ""));
  $("#titulo-form-livro").textContent = "Editar livro";
  $("#botao-livro").textContent = "Salvar alterações";
  $("#cancelar-edicao").hidden = false;
  mostrar($("#msg-livro"), "");
  formLivro.scrollIntoView({ behavior: "smooth", block: "start" });
  formLivro.elements.titulo.focus();
}

function sairDoModoEdicao() {
  editandoId = null;
  formLivro.reset();
  formLivro.elements.exemplares.value = 1;
  $("#titulo-form-livro").textContent = "Cadastrar livro";
  $("#botao-livro").textContent = "Cadastrar livro";
  $("#cancelar-edicao").hidden = true;
}

formLivro.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#msg-livro");
  const dados = dadosDoFormulario();
  const editando = editandoId !== null;

  const { error } = editando
    ? await supabase.from("livros").update(dados).eq("id", editandoId)
    : await supabase.from("livros").insert(dados);

  if (error) {
    const repetido = error.code === "23505";
    mostrar(msg, repetido ? "Já existe um livro com esse tombo." : `Erro: ${error.message}`, "erro");
    return;
  }

  if (editando) {
    sairDoModoEdicao();
    mostrar(msg, "Alterações salvas.", "ok");
  } else {
    // Cadastro rápido: mantém gênero, estante e prateleira para o próximo livro.
    formLivro.elements.tombo.value = proximoTombo(dados.tombo);
    formLivro.elements.titulo.value = "";
    formLivro.elements.autor.value = "";
    formLivro.elements.editora.value = "";
    formLivro.elements.exemplares.value = 1;
    mostrar(msg, `"${dados.titulo}" cadastrado.`, "ok");
    formLivro.elements.titulo.focus();
  }
  await carregarLivros();
});

$("#cancelar-edicao").addEventListener("click", () => {
  sairDoModoEdicao();
  mostrar($("#msg-livro"), "");
});

$("#lista-livros-admin").addEventListener("click", async (e) => {
  const botao = e.target.closest("[data-acao]");
  if (!botao) return;

  const livro = livros.find((l) => l.id === Number(botao.dataset.id));
  if (!livro) return;

  if (botao.dataset.acao === "editar") {
    entrarModoEdicao(livro);
    return;
  }

  if (botao.dataset.acao === "alternar-ativo") {
    const { error } = await supabase.from("livros").update({ ativo: !livro.ativo }).eq("id", livro.id);
    if (error) {
      mostrar($("#msg-livro"), `Erro: ${error.message}`, "erro");
      return;
    }
    await carregarLivros();
  }
});

// Backup: baixa o acervo inteiro (inclusive livros desativados) em CSV.
$("#exportar").addEventListener("click", () => {
  const colunas = [...CAMPOS_LIVRO, "ativo"];
  const celula = (valor) => `"${String(valor ?? "").replace(/"/g, '""')}"`;
  const linhas = [
    colunas.join(","),
    ...livros.map((l) => colunas.map((c) => celula(l[c])).join(",")),
  ];
  const arquivo = new Blob(["\ufeff" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(arquivo);
  link.download = `acervo-${hoje()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});

// ---------- empréstimos ----------

async function carregarEmprestimos() {
  const { data, error } = await supabase
    .from("emprestimos")
    .select("id, aluno_nome, turma, emprestado_em, devolucao_prevista, livros(titulo, tombo)")
    .is("devolvido_em", null)
    .order("devolucao_prevista");

  if (error) {
    $("#lista-emprestimos").innerHTML = `<p class="vazio">Não foi possível carregar os empréstimos.</p>`;
    return;
  }
  emprestimos = data;
  renderEmprestimos();
}

function renderEmprestimos() {
  const termo = normalizar($("#filtro-emprestimos").value);
  const visiveis = emprestimos.filter(
    (x) =>
      !termo ||
      normalizar(`${x.aluno_nome} ${x.turma} ${x.livros?.titulo} ${x.livros?.tombo}`).includes(termo)
  );

  $("#lista-emprestimos").innerHTML =
    visiveis.length === 0
      ? `<p class="vazio">Nenhum livro emprestado no momento.</p>`
      : visiveis
          .map((x) => {
            const atrasado = x.devolucao_prevista < hoje();
            return `
      <div class="linha">
        <div class="linha-info">
          <span class="linha-titulo">${escapeHtml(x.livros?.titulo)}</span>
          <span class="linha-sub">${escapeHtml(x.aluno_nome)}${x.turma ? ` · ${escapeHtml(x.turma)}` : ""}</span>
          <span class="linha-sub ${atrasado ? "atrasado" : ""}">
            ${atrasado ? "Atrasado desde" : "Devolver até"} ${formatarData(x.devolucao_prevista, false)}
          </span>
        </div>
        <button type="button" class="botao" data-acao="devolver" data-id="${x.id}">Registrar devolução</button>
      </div>`;
          })
          .join("");
}

$("#filtro-emprestimos").addEventListener("input", renderEmprestimos);

$("#form-emprestimo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const msg = $("#msg-emprestimo");

  const livroId = livroPorRotulo.get(form.get("livro"));
  if (!livroId) {
    mostrar(msg, "Escolha um livro da lista de sugestões.", "erro");
    return;
  }

  const { error } = await supabase.from("emprestimos").insert({
    livro_id: livroId,
    aluno_nome: form.get("aluno").trim(),
    turma: form.get("turma").trim() || null,
    devolucao_prevista: form.get("devolucao"),
  });

  if (error) {
    mostrar(msg, error.message, "erro");
    return;
  }

  mostrar(msg, "Empréstimo registrado.", "ok");
  e.target.reset();
  e.target.elements.devolucao.value = hojeMais(14);
  await carregarEmprestimos();
});

$("#lista-emprestimos").addEventListener("click", async (e) => {
  const botao = e.target.closest('[data-acao="devolver"]');
  if (!botao) return;

  const { error } = await supabase
    .from("emprestimos")
    .update({ devolvido_em: hoje() })
    .eq("id", Number(botao.dataset.id));

  if (error) {
    mostrar($("#msg-emprestimo"), `Erro: ${error.message}`, "erro");
    return;
  }
  await carregarEmprestimos();
});

iniciar();
