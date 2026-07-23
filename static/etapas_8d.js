const corpoEtapas = document.getElementById("tabela-etapas-corpo");
const contadorEtapas = document.getElementById("contador-etapas");
const buscaEtapas = document.getElementById("busca-etapas");

let linhasBrutas = [];
let reclamacoes = [];

function formatarData(iso) {
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  return dia ? `${dia}/${mes}/${ano}` : iso;
}

function normalizar(texto) {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function hojeISO() {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

function calcularStatus(reclamacao) {
  const total = reclamacao.etapas.length;
  const feitas = reclamacao.etapas.filter((e) => e.realizacao).length;
  const percentual = total ? feitas / total : 0;
  let status = "critico";
  if (percentual >= 0.8) status = "ok";
  else if (percentual >= 0.5) status = "atencao";
  return { total, feitas, percentual, status };
}

const ROTULO_STATUS = { ok: "✅ OK", atencao: "⚠️ Atenção", critico: "🔴 Crítico" };

function agruparPorReclamacao(linhas) {
  const mapa = new Map();
  linhas.forEach((l) => {
    if (!mapa.has(l.reclamacao_id)) {
      mapa.set(l.reclamacao_id, {
        reclamacao_id: l.reclamacao_id,
        id_mrhb: l.id_mrhb,
        cliente: l.cliente,
        descricao_defeito: l.descricao_defeito,
        data_abertura: l.data_abertura,
        etapas: [],
      });
    }
    mapa.get(l.reclamacao_id).etapas.push(l);
  });
  const lista = Array.from(mapa.values());
  lista.forEach((r) => r.etapas.sort((a, b) => a.ordem - b.ordem));
  lista.sort((a, b) => (a.data_abertura < b.data_abertura ? 1 : -1));
  return lista;
}

function textoSeguro(valor) {
  const span = document.createElement("span");
  span.textContent = valor ?? "";
  return span.innerHTML;
}

function celulasEtapas(reclamacao) {
  const hoje = hojeISO();
  return reclamacao.etapas
    .map((e) => {
      const atrasada = !e.realizacao && e.prazo && e.prazo < hoje;
      const classes = ["grupo-inicio", atrasada ? "etapa-atrasada" : ""].filter(Boolean).join(" ");
      return `
      <td class="${classes}">${formatarData(e.prazo)}${atrasada ? " ⚠️" : ""}</td>
      <td><input type="date" value="${e.realizacao ?? ""}" data-etapa-id="${e.id}" /></td>`;
    })
    .join("");
}

function renderizarEtapas() {
  const termo = normalizar(buscaEtapas.value.trim());
  const lista = termo
    ? reclamacoes.filter((r) =>
        [r.id_mrhb, r.cliente, r.descricao_defeito].some((v) => normalizar(v).includes(termo))
      )
    : reclamacoes;

  if (lista.length === 0) {
    corpoEtapas.innerHTML = `<tr><td colspan="28" class="empty">Nenhuma reclamação encontrada.</td></tr>`;
  } else {
    corpoEtapas.innerHTML = lista
      .map((r) => {
        const { total, feitas, percentual, status } = calcularStatus(r);
        return `
        <tr>
          <td class="id-mrhb">${r.id_mrhb ?? ""}</td>
          <td>${textoSeguro(r.cliente)}</td>
          <td class="descricao-truncada" title="${textoSeguro(r.descricao_defeito)}">${textoSeguro(r.descricao_defeito)}</td>
          <td>${formatarData(r.data_abertura)}</td>
          <td>
            <div class="progresso-coluna">
              <div class="progresso-barra"><div class="progresso-barra-preenchida ${status}" style="width:${Math.round(percentual * 100)}%"></div></div>
              <span class="progresso-texto">${feitas}/${total}</span>
            </div>
          </td>
          <td><span class="badge-status ${status}">${ROTULO_STATUS[status]}</span></td>
          ${celulasEtapas(r)}
        </tr>`;
      })
      .join("");
  }
  contadorEtapas.textContent = `${lista.length} de ${reclamacoes.length} ${reclamacoes.length === 1 ? "reclamação" : "reclamações"}`;
}

buscaEtapas.addEventListener("input", renderizarEtapas);

async function carregarEtapas() {
  try {
    const res = await fetch("/api/etapas-8d");
    linhasBrutas = await res.json();
    reclamacoes = agruparPorReclamacao(linhasBrutas);
    renderizarEtapas();
  } catch (err) {
    corpoEtapas.innerHTML = `<tr><td colspan="28" class="empty">Erro ao carregar os dados.</td></tr>`;
  }
}

carregarEtapas();

corpoEtapas.addEventListener("change", async (ev) => {
  const input = ev.target.closest("input[data-etapa-id]");
  if (!input) return;

  const etapaId = input.dataset.etapaId;
  const valorAnterior = input.defaultValue;
  try {
    const res = await fetch(`/api/etapas-8d/${etapaId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ realizacao: input.value }),
    });
    if (!res.ok) throw new Error("Falha ao salvar");

    const linhaBruta = linhasBrutas.find((l) => String(l.id) === String(etapaId));
    if (linhaBruta) linhaBruta.realizacao = input.value || null;
    reclamacoes = agruparPorReclamacao(linhasBrutas);
    renderizarEtapas();
  } catch (err) {
    input.value = valorAnterior;
  }
});
