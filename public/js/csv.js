import { normalizar } from "./util.js";

// Lê um CSV e devolve uma lista de linhas, cada linha uma lista de campos.
// Entende aspas, quebras de linha dentro de campos e os dois separadores
// comuns (vírgula e ponto e vírgula, que o Excel em português costuma usar).
export function lerCSV(texto) {
  texto = String(texto).replace(/^\ufeff/, "");
  const primeira = texto.split(/\r?\n/, 1)[0] ?? "";
  const virgulas = (primeira.match(/,/g) || []).length;
  const pontoEVirgulas = (primeira.match(/;/g) || []).length;
  const sep = pontoEVirgulas > virgulas ? ";" : ",";

  const linhas = [];
  let linha = [];
  let campo = "";
  let aspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          aspas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      aspas = true;
    } else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      campo = "";
      linhas.push(linha);
      linha = [];
    } else {
      campo += c;
    }
  }
  if (campo !== "" || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}

// Monta o texto de um CSV a partir de colunas e objetos.
export function gerarCSV(colunas, objetos) {
  const celula = (valor) => `"${String(valor ?? "").replace(/"/g, '""')}"`;
  const linhas = [
    colunas.join(","),
    ...objetos.map((o) => colunas.map((c) => celula(o[c])).join(",")),
  ];
  return linhas.join("\r\n");
}

// Arquivos salvos pelo Excel antigo podem não estar em UTF-8.
export function decodificar(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

// Baixa um texto como arquivo. O \ufeff no começo faz o Excel abrir com acentos certos.
export function baixar(nomeDoArquivo, texto) {
  const arquivo = new Blob(["\ufeff" + texto], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(arquivo);
  link.download = nomeDoArquivo;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

// Aceita "2026-10-12" e "12/10/2026". Vazio é permitido e vira null.
export function lerData(valor) {
  const v = String(valor ?? "").trim();
  if (!v) return { ok: true, valor: null };

  let ano, mes, dia;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    [ano, mes, dia] = [m[1], m[2], m[3]];
  } else {
    m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return { ok: false };
    [dia, mes, ano] = [m[1], m[2], m[3]];
  }

  const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const data = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== iso) return { ok: false };
  return { ok: true, valor: iso };
}

// "sim", "true", "1" viram true. "não", "false", "0" viram false. Outra coisa vira null.
export function lerBooleano(valor) {
  const v = normalizar(valor);
  if (["", "true", "1", "sim", "s", "verdadeiro"].includes(v)) return true;
  if (["false", "0", "nao", "n", "falso"].includes(v)) return false;
  return null;
}

// Cabeçalhos em qualquer capitalização ou com acento: "Título" vira "titulo".
export function nomeDeColuna(texto) {
  return normalizar(texto).replace(/\s+/g, "_");
}
