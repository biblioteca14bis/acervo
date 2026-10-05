import { supabase } from "./supabase.js";
import { escapeHtml, normalizar, hoje, formatarData, buscarTudo } from "./util.js";
import { lerCSV, gerarCSV, decodificar, baixar, lerData, lerBooleano, nomeDeColuna } from "./csv.js";

const $ = (seletor) => document.querySelector(seletor);

const COLUNAS_LIVROS = ["tombo", "titulo", "autor", "editora", "genero", "estante", "prateleira", "exemplares", "ativo"];
const COLUNAS_EMPRESTIMOS = ["tombo", "titulo", "aluno_nome", "turma", "emprestado_em", "devolucao_prevista", "devolvido_em"];
const APELIDOS = { aluno: "aluno_nome", nome: "aluno_nome", exemplar: "exemplares" };
const LOTE = 200;

function mostrar(elemento, texto, tipo = "") {
  elemento.textContent = texto;
  elemento.className = `mensagem ${tipo}`.trim();
}

// ---------- acesso: só administradores ----------

async function iniciar() {
  const { data } = await supabase.auth.getSession();
  const usuario = data.session?.user;
  if (!usuario) return negar("Entre com a sua conta de administrador para continuar.");

  const { data: admin, error } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", usuario.id)
    .maybeSingle();
  if (error || !admin) return negar("Esta conta não tem permissão de administrador.");

  $("#conteudo").hidden = false;
  mostrarUltimoBackup();
}

function negar(texto) {
  $("#texto-acesso").textContent = texto;
  $("#acesso-negado").hidden = false;
}

// ---------- dados ----------

const buscarLivros = () =>
  buscarTudo((de, ate) => supabase.from("livros").select("*").order("tombo").range(de, ate));

const buscarEmprestimos = () =>
  buscarTudo((de, ate) =>
    supabase
      .from("emprestimos")
      .select("id, livro_id, aluno_nome, turma, emprestado_em, devolucao_prevista, devolvido_em, livros(tombo, titulo)")
      .order("id")
      .range(de, ate)
  );

// ---------- baixar ----------

function lerUltimo(tipo) {
  try {
    return localStorage.getItem(`ultimoBackup:${tipo}`);
  } catch {
    return null;
  }
}

function gravarUltimo(tipo) {
  try {
    localStorage.setItem(`ultimoBackup:${tipo}`, hoje());
  } catch {
    /* sem armazenamento: só não mostra a data */
  }
}

function mostrarUltimoBackup() {
  for (const tipo of ["livros", "emprestimos"]) {
    const data = lerUltimo(tipo);
    $(`#ultimo-${tipo}`).textContent = data
      ? `Último backup baixado neste computador: ${formatarData(data, false)}.`
      : "Nenhum backup baixado neste computador ainda.";
  }
}

$("#baixar-livros").addEventListener("click", async () => {
  const msg = $("#msg-baixar");
  mostrar(msg, "Preparando o arquivo...");
  try {
    const livros = await buscarLivros();
    const linhas = livros.map((l) => ({ ...l, ativo: l.ativo ? "true" : "false" }));
    baixar(`acervo-livros-${hoje()}.csv`, gerarCSV(COLUNAS_LIVROS, linhas));
    gravarUltimo("livros");
    mostrarUltimoBackup();
    mostrar(msg, `Backup de livros baixado: ${livros.length} ${livros.length === 1 ? "livro" : "livros"}.`, "ok");
  } catch (erro) {
    mostrar(msg, `Não foi possível baixar: ${erro.message}`, "erro");
  }
});

$("#ciente-emprestimos").addEventListener("change", (e) => {
  $("#baixar-emprestimos").disabled = !e.target.checked;
});

$("#baixar-emprestimos").addEventListener("click", async () => {
  const msg = $("#msg-baixar");
  mostrar(msg, "Preparando o arquivo...");
  try {
    const itens = await buscarEmprestimos();
    const linhas = itens.map((e) => ({
      tombo: e.livros?.tombo,
      titulo: e.livros?.titulo,
      aluno_nome: e.aluno_nome,
      turma: e.turma,
      emprestado_em: e.emprestado_em,
      devolucao_prevista: e.devolucao_prevista,
      devolvido_em: e.devolvido_em,
    }));
    baixar(`acervo-emprestimos-${hoje()}.csv`, gerarCSV(COLUNAS_EMPRESTIMOS, linhas));
    gravarUltimo("emprestimos");
    mostrarUltimoBackup();
    mostrar(msg, `Backup de empréstimos baixado: ${itens.length} ${itens.length === 1 ? "registro" : "registros"}. Guarde em local restrito.`, "ok");
  } catch (erro) {
    mostrar(msg, `Não foi possível baixar: ${erro.message}`, "erro");
  }
});

// ---------- restaurar: partes em comum ----------

async function lerArquivo(input) {
  const arquivo = input.files[0];
  if (!arquivo) return null;
  const texto = decodificar(await arquivo.arrayBuffer());
  return { nome: arquivo.name, linhas: lerCSV(texto) };
}

// Descobre em qual posição fica cada coluna, ignorando maiúsculas e acentos.
function mapearColunas(cabecalho, validas) {
  const posicao = {};
  cabecalho.forEach((texto, i) => {
    let nome = nomeDeColuna(texto);
    nome = APELIDOS[nome] ?? nome;
    if (validas.includes(nome) && posicao[nome] === undefined) posicao[nome] = i;
  });
  return posicao;
}

// O Excel costuma transformar "0001" em "1". Este índice permite reconhecer o livro mesmo assim.
function indiceNumerico(tombos) {
  const mapa = new Map();
  for (const t of tombos) {
    if (!/^\d+$/.test(t)) continue;
    const chave = String(Number(t));
    mapa.set(chave, [...(mapa.get(chave) || []), t]);
  }
  return mapa;
}

function resolverTombo(tombo, existentes, numerico) {
  if (existentes.has(tombo)) return { tombo, ajustado: false };
  if (/^\d+$/.test(tombo)) {
    const candidatos = numerico.get(String(Number(tombo)));
    if (candidatos && candidatos.length === 1) return { tombo: candidatos[0], ajustado: true };
  }
  return { tombo, ajustado: false };
}

function listaDeErros(erros) {
  if (!erros.length) return "";
  const itens = erros
    .slice(0, 12)
    .map((e) => `<li>Linha ${e.linha}: ${escapeHtml(e.motivo)}</li>`)
    .join("");
  const resto = erros.length > 12 ? `<li>... e mais ${erros.length - 12}.</li>` : "";
  return `<details class="detalhes" open><summary>Linhas com problema (não serão importadas)</summary><ul>${itens}${resto}</ul></details>`;
}

function reiniciar(tipo) {
  $(`#previa-${tipo}`).hidden = true;
  $(`#previa-${tipo}`).innerHTML = "";
  $(`#confirmar-${tipo}`).hidden = true;
  const marca = tipo === "livros" ? "#ciente-livros" : "#ciente-restaurar-emprestimos";
  $(marca).checked = false;
  $(`#aplicar-${tipo}`).disabled = true;
  mostrar($(`#msg-${tipo}`), "");
}

function ligarConfirmacao(tipo, marcaId) {
  $(marcaId).addEventListener("change", (e) => {
    $(`#aplicar-${tipo}`).disabled = !e.target.checked;
  });
}
ligarConfirmacao("livros", "#ciente-livros");
ligarConfirmacao("emprestimos", "#ciente-restaurar-emprestimos");

// ---------- restaurar livros ----------

let planoLivros = null;

async function planejarLivros(arquivo) {
  const [cabecalho, ...linhas] = arquivo.linhas;
  const nomes = (cabecalho ?? []).map(nomeDeColuna);
  if (nomes.includes("aluno_nome") || nomes.includes("emprestado_em")) {
    throw new Error("Este arquivo parece ser de empréstimos. Para ele, use a opção “Restaurar empréstimos”, mais abaixo.");
  }
  const col = mapearColunas(cabecalho ?? [], COLUNAS_LIVROS);
  if (col.tombo === undefined || col.titulo === undefined) {
    throw new Error(
      "Não encontrei as colunas “tombo” e “titulo” na primeira linha do arquivo. Use um arquivo baixado em “Baixar livros”."
    );
  }

  const existentes = new Map((await buscarLivros()).map((l) => [l.tombo, l]));
  const numerico = indiceNumerico([...existentes.keys()]);
  const plano = { arquivo: arquivo.nome, lidas: linhas.length, novos: [], atualizar: [], iguais: 0, erros: [], semZeros: 0 };
  const vistos = new Set();

  linhas.forEach((linha, i) => {
    const numero = i + 2; // a linha 1 é o cabeçalho
    const campo = (c) => (col[c] === undefined ? undefined : String(linha[col[c]] ?? "").trim());
    const erro = (motivo) => plano.erros.push({ linha: numero, motivo });

    let tombo = campo("tombo");
    const titulo = campo("titulo");
    if (!tombo) return erro("o tombo está vazio");
    if (!titulo) return erro("o título está vazio");

    const r = resolverTombo(tombo, existentes, numerico);
    tombo = r.tombo;
    if (r.ajustado) plano.semZeros++;
    if (vistos.has(tombo)) return erro(`o tombo ${tombo} aparece mais de uma vez no arquivo`);
    vistos.add(tombo);

    const registro = { tombo, titulo };
    for (const c of ["autor", "editora", "genero", "estante", "prateleira"]) {
      if (col[c] !== undefined) registro[c] = campo(c) || null;
    }
    if (col.exemplares !== undefined) {
      const t = campo("exemplares");
      if (t === "") registro.exemplares = 1;
      else if (!/^\d+$/.test(t)) return erro(`“${t}” não é um número válido de exemplares`);
      else registro.exemplares = Number(t);
    }
    if (col.ativo !== undefined) {
      const b = lerBooleano(campo("ativo"));
      if (b === null) return erro(`“${campo("ativo")}” não é um valor válido para ativo (use true ou false)`);
      registro.ativo = b;
    }

    const atual = existentes.get(tombo);
    if (!atual) {
      plano.novos.push(registro);
      return;
    }
    const diferentes = Object.keys(registro).filter((k) => k !== "tombo" && String(atual[k] ?? "") !== String(registro[k] ?? ""));
    if (diferentes.length === 0) plano.iguais++;
    else plano.atualizar.push({ registro, atual, diferentes });
  });
  return plano;
}

function desenharPreviaLivros(p) {
  const exemplos = p.atualizar
    .slice(0, 6)
    .map(
      (a) =>
        `<li><strong>${escapeHtml(a.atual.titulo)}</strong> (tombo ${escapeHtml(a.registro.tombo)}): muda ${a.diferentes
          .map(escapeHtml)
          .join(", ")}</li>`
    )
    .join("");
  const maisExemplos = p.atualizar.length > 6 ? `<li>... e mais ${p.atualizar.length - 6}.</li>` : "";

  $("#previa-livros").innerHTML = `
    <p><strong>${escapeHtml(p.arquivo)}</strong>: ${p.lidas} ${p.lidas === 1 ? "linha lida" : "linhas lidas"}.</p>
    <ul class="resumo">
      <li><strong>${p.novos.length}</strong> ${p.novos.length === 1 ? "livro novo será cadastrado" : "livros novos serão cadastrados"}</li>
      <li><strong>${p.atualizar.length}</strong> ${p.atualizar.length === 1 ? "livro existente será atualizado" : "livros existentes serão atualizados"}</li>
      <li><strong>${p.iguais}</strong> já ${p.iguais === 1 ? "está igual" : "estão iguais"} ao arquivo</li>
      ${p.erros.length ? `<li class="erro"><strong>${p.erros.length}</strong> ${p.erros.length === 1 ? "linha com problema" : "linhas com problema"}</li>` : ""}
    </ul>
    ${p.semZeros ? `<p class="linha-sub">${p.semZeros} ${p.semZeros === 1 ? "tombo estava sem os zeros à esquerda e foi ligado" : "tombos estavam sem os zeros à esquerda e foram ligados"} ao livro já cadastrado.</p>` : ""}
    ${exemplos ? `<details class="detalhes"><summary>Ver exemplos de atualizações</summary><ul>${exemplos}${maisExemplos}</ul></details>` : ""}
    ${listaDeErros(p.erros)}
    <p class="linha-sub">Livros que estão no site e não estão no arquivo continuam como estão. Nada será apagado.</p>`;
  $("#previa-livros").hidden = false;

  const temMudanca = p.novos.length + p.atualizar.length > 0;
  $("#confirmar-livros").hidden = !temMudanca;
  if (!temMudanca) {
    mostrar($("#msg-livros"), "Nada para restaurar: o acervo já está igual ao arquivo.", "ok");
  }
}

$("#arquivo-livros").addEventListener("change", async (e) => {
  reiniciar("livros");
  planoLivros = null;
  try {
    const arquivo = await lerArquivo(e.target);
    if (!arquivo) return;
    mostrar($("#msg-livros"), "Lendo o arquivo...");
    planoLivros = await planejarLivros(arquivo);
    mostrar($("#msg-livros"), "");
    desenharPreviaLivros(planoLivros);
  } catch (erro) {
    mostrar($("#msg-livros"), erro.message, "erro");
  }
});

$("#aplicar-livros").addEventListener("click", async () => {
  const p = planoLivros;
  if (!p) return;
  const confirmado = window.confirm(
    `Você vai cadastrar ${p.novos.length} livro(s) novo(s) e atualizar ${p.atualizar.length} livro(s) existente(s).\n\n` +
      `Nenhum livro será apagado. Já baixou um backup atual?\n\nDeseja continuar?`
  );
  if (!confirmado) return;

  const msg = $("#msg-livros");
  const botao = $("#aplicar-livros");
  botao.disabled = true;
  mostrar(msg, "Restaurando...");

  const registros = [...p.novos, ...p.atualizar.map((a) => a.registro)];
  let gravados = 0;
  try {
    for (let i = 0; i < registros.length; i += LOTE) {
      const lote = registros.slice(i, i + LOTE);
      const { error } = await supabase.from("livros").upsert(lote, { onConflict: "tombo" });
      if (error) throw error;
      gravados += lote.length;
    }
  } catch (erro) {
    mostrar(msg, `Erro: ${erro.message}. ${gravados} registro(s) foram gravados antes do erro. Confira o acervo e tente de novo.`, "erro");
    botao.disabled = false;
    return;
  }

  const resumo = `Pronto: ${p.novos.length} livro(s) novo(s) e ${p.atualizar.length} atualizado(s).`;
  $("#arquivo-livros").value = "";
  planoLivros = null;
  reiniciar("livros");
  mostrar(msg, resumo, "ok");
});

// ---------- restaurar empréstimos ----------

let planoEmprestimos = null;

async function planejarEmprestimos(arquivo) {
  const [cabecalho, ...linhas] = arquivo.linhas;
  const col = mapearColunas(cabecalho ?? [], COLUNAS_EMPRESTIMOS);
  const obrigatorias = ["tombo", "aluno_nome", "emprestado_em", "devolucao_prevista"];
  const faltam = obrigatorias.filter((c) => col[c] === undefined);
  if (faltam.length) {
    throw new Error(
      `Não encontrei as colunas ${faltam.map((c) => `“${c}”`).join(", ")} na primeira linha. Use um arquivo baixado em “Baixar empréstimos”.`
    );
  }

  const livros = await buscarLivros();
  const idPorTombo = new Map(livros.map((l) => [l.tombo, l.id]));
  const numerico = indiceNumerico(livros.map((l) => l.tombo));
  const existentes = await buscarEmprestimos();
  const chaves = new Set(existentes.map((e) => `${e.livro_id}|${normalizar(e.aluno_nome)}|${e.emprestado_em}`));

  const plano = { arquivo: arquivo.nome, lidas: linhas.length, novos: [], jaExistem: 0, erros: [], semZeros: 0 };

  linhas.forEach((linha, i) => {
    const numero = i + 2;
    const campo = (c) => (col[c] === undefined ? "" : String(linha[col[c]] ?? "").trim());
    const erro = (motivo) => plano.erros.push({ linha: numero, motivo });

    const r = resolverTombo(campo("tombo"), idPorTombo, numerico);
    if (!campo("tombo")) return erro("o tombo está vazio");
    const livroId = idPorTombo.get(r.tombo);
    if (livroId === undefined) return erro(`o tombo ${r.tombo} não está cadastrado no acervo`);
    if (r.ajustado) plano.semZeros++;

    const aluno = campo("aluno_nome");
    if (!aluno) return erro("o nome do aluno está vazio");

    const emprestado = lerData(campo("emprestado_em"));
    const prevista = lerData(campo("devolucao_prevista"));
    const devolvido = lerData(campo("devolvido_em"));
    if (!emprestado.ok || !emprestado.valor) return erro(`data de empréstimo inválida (“${campo("emprestado_em")}”)`);
    if (!prevista.ok || !prevista.valor) return erro(`data de devolução prevista inválida (“${campo("devolucao_prevista")}”)`);
    if (!devolvido.ok) return erro(`data de devolução inválida (“${campo("devolvido_em")}”)`);
    if (prevista.valor < emprestado.valor) return erro("a devolução prevista é anterior ao empréstimo");

    const chave = `${livroId}|${normalizar(aluno)}|${emprestado.valor}`;
    if (chaves.has(chave)) {
      plano.jaExistem++;
      return;
    }
    chaves.add(chave);
    plano.novos.push({
      livro_id: livroId,
      aluno_nome: aluno,
      turma: campo("turma") || null,
      emprestado_em: emprestado.valor,
      devolucao_prevista: prevista.valor,
      devolvido_em: devolvido.valor,
    });
  });
  return plano;
}

function desenharPreviaEmprestimos(p) {
  const abertos = p.novos.filter((n) => !n.devolvido_em).length;
  $("#previa-emprestimos").innerHTML = `
    <p><strong>${escapeHtml(p.arquivo)}</strong>: ${p.lidas} ${p.lidas === 1 ? "linha lida" : "linhas lidas"}.</p>
    <ul class="resumo">
      <li><strong>${p.novos.length}</strong> ${p.novos.length === 1 ? "empréstimo será acrescentado" : "empréstimos serão acrescentados"}${
        p.novos.length ? ` (${abertos} ainda em aberto)` : ""
      }</li>
      <li><strong>${p.jaExistem}</strong> já ${p.jaExistem === 1 ? "existe" : "existem"} no sistema e ${p.jaExistem === 1 ? "será ignorado" : "serão ignorados"}</li>
      ${p.erros.length ? `<li class="erro"><strong>${p.erros.length}</strong> ${p.erros.length === 1 ? "linha com problema" : "linhas com problema"}</li>` : ""}
    </ul>
    ${p.semZeros ? `<p class="linha-sub">${p.semZeros} ${p.semZeros === 1 ? "tombo estava sem os zeros à esquerda e foi ligado" : "tombos estavam sem os zeros à esquerda e foram ligados"} ao livro já cadastrado.</p>` : ""}
    ${listaDeErros(p.erros)}
    <div class="aviso-caixa" role="note"><strong>Atenção:</strong> estes dados incluem nomes de alunos. Empréstimos já existentes não são alterados e nada é apagado.</div>`;
  $("#previa-emprestimos").hidden = false;

  $("#confirmar-emprestimos").hidden = p.novos.length === 0;
  if (p.novos.length === 0) {
    mostrar($("#msg-emprestimos"), "Nada para restaurar: todos os empréstimos do arquivo já existem.", "ok");
  }
}

$("#arquivo-emprestimos").addEventListener("change", async (e) => {
  reiniciar("emprestimos");
  planoEmprestimos = null;
  try {
    const arquivo = await lerArquivo(e.target);
    if (!arquivo) return;
    mostrar($("#msg-emprestimos"), "Lendo o arquivo...");
    planoEmprestimos = await planejarEmprestimos(arquivo);
    mostrar($("#msg-emprestimos"), "");
    desenharPreviaEmprestimos(planoEmprestimos);
  } catch (erro) {
    mostrar($("#msg-emprestimos"), erro.message, "erro");
  }
});

$("#aplicar-emprestimos").addEventListener("click", async () => {
  const p = planoEmprestimos;
  if (!p) return;
  const confirmado = window.confirm(
    `Você vai acrescentar ${p.novos.length} empréstimo(s) ao sistema.\n\n` +
      `Os dados incluem nomes de alunos. Nenhum empréstimo existente será alterado ou apagado.\n\nDeseja continuar?`
  );
  if (!confirmado) return;

  const msg = $("#msg-emprestimos");
  const botao = $("#aplicar-emprestimos");
  botao.disabled = true;
  mostrar(msg, "Restaurando...");

  let gravados = 0;
  try {
    for (let i = 0; i < p.novos.length; i += 100) {
      const lote = p.novos.slice(i, i + 100);
      const { error } = await supabase.from("emprestimos").insert(lote);
      if (error) throw error;
      gravados += lote.length;
    }
  } catch (erro) {
    const dica = /exemplar/i.test(erro.message)
      ? " Se o erro mencionar exemplares, rode o arquivo supabase/atualizacao-backup.sql no Supabase."
      : "";
    mostrar(msg, `Erro: ${erro.message}. ${gravados} empréstimo(s) foram gravados antes do erro.${dica}`, "erro");
    botao.disabled = false;
    return;
  }

  const resumo = `Pronto: ${p.novos.length} empréstimo(s) acrescentado(s).`;
  $("#arquivo-emprestimos").value = "";
  planoEmprestimos = null;
  reiniciar("emprestimos");
  mostrar(msg, resumo, "ok");
});

iniciar();
