// Escapa texto antes de colocar em innerHTML.
export const escapeHtml = (texto) =>
  String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

// Tira acentos e deixa em minúsculas, para "principe" achar "Príncipe".
export const normalizar = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// "2026-10-12" vira "12/10" (ou "12/10/2026" com curto = false).
export function formatarData(iso, curto = true) {
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  return curto ? `${dia}/${mes}` : `${dia}/${mes}/${ano}`;
}

// Datas no formato AAAA-MM-DD, no fuso do aparelho.
export const hoje = () => new Date().toLocaleDateString("sv-SE");

export function hojeMais(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString("sv-SE");
}

// Cada livro recebe sempre a mesma cor de capa, calculada a partir do título.
const CORES_CAPA = ["#2F5BEA", "#B5179E", "#C2410C", "#0F8F6E", "#6D3AE0", "#C0352F"];

export function corDaCapa(titulo) {
  let h = 0;
  for (const c of String(titulo ?? "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES_CAPA[h % CORES_CAPA.length];
}

// O Supabase devolve no máximo 1000 linhas por consulta.
// Esta função busca em páginas até acabar. Use assim:
//   buscarTudo((de, ate) => supabase.from("catalogo").select("*").range(de, ate))
export async function buscarTudo(montarConsulta, tamanho = 1000) {
  const todas = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await montarConsulta(de, de + tamanho - 1);
    if (error) throw error;
    todas.push(...data);
    if (data.length < tamanho) break;
  }
  return todas;
}
