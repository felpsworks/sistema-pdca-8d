const corpoAuditoria = document.getElementById("tabela-auditoria-corpo");
const contadorAuditoria = document.getElementById("contador-auditoria");
const buscaAuditoria = document.getElementById("busca-auditoria");

let registrosAuditoria = [];

function formatarDataHora(valor) {
  if (!valor) return "";
  const [dataParte, horaParte] = valor.split(" ");
  const [ano, mes, dia] = dataParte.split("-");
  const hora = horaParte ? horaParte.slice(0, 5) : "";
  return `${dia}/${mes}/${ano}${hora ? " " + hora : ""}`;
}

function badgeAcao(tipoAcao) {
  if (tipoAcao === "exclusao") return `<span class="badge-tipo formal">Exclusão</span>`;
  return `<span class="badge-tipo informal">Edição</span>`;
}

function textoSeguro(valor) {
  const span = document.createElement("span");
  span.textContent = valor ?? "";
  return span.innerHTML;
}

function renderizarAuditoria(lista) {
  if (lista.length === 0) {
    corpoAuditoria.innerHTML = `<tr><td colspan="7" class="empty">Nenhuma alteração registrada.</td></tr>`;
  } else {
    corpoAuditoria.innerHTML = lista
      .map(
        (r) => `
      <tr>
        <td>${formatarDataHora(r.data_hora)}</td>
        <td class="id-mrhb">${textoSeguro(r.id_mrhb)}</td>
        <td>${badgeAcao(r.tipo_acao)}</td>
        <td>${textoSeguro(r.campo) || "—"}</td>
        <td>${textoSeguro(r.valor_anterior) || "—"}</td>
        <td>${textoSeguro(r.valor_novo) || "—"}</td>
        <td>${textoSeguro(r.motivo) || "—"}</td>
      </tr>`
      )
      .join("");
  }
  contadorAuditoria.textContent = `${lista.length} de ${registrosAuditoria.length} ${registrosAuditoria.length === 1 ? "registro" : "registros"}`;
}

function normalizar(texto) {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const ROTULO_ACAO = { edicao: "Edição", exclusao: "Exclusão" };

buscaAuditoria.addEventListener("input", () => {
  const termo = normalizar(buscaAuditoria.value.trim());
  if (!termo) {
    renderizarAuditoria(registrosAuditoria);
    return;
  }
  const filtrados = registrosAuditoria.filter((r) => {
    const valores = [...Object.values(r), ROTULO_ACAO[r.tipo_acao]];
    return valores.some((v) => normalizar(v).includes(termo));
  });
  renderizarAuditoria(filtrados);
});

async function carregarAuditoria() {
  try {
    const res = await fetch("/api/historico-alteracoes");
    registrosAuditoria = await res.json();
    renderizarAuditoria(registrosAuditoria);
  } catch (err) {
    corpoAuditoria.innerHTML = `<tr><td colspan="7" class="empty">Erro ao carregar os dados.</td></tr>`;
  }
}

carregarAuditoria();
