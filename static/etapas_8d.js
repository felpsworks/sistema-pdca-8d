const corpoEtapas = document.getElementById("tabela-etapas-corpo");
const cabecalhoEtapas = document.getElementById("tabela-etapas-cabecalho");
const contadorEtapas = document.getElementById("contador-etapas");

const COLUNAS_FIXAS = [
  { campo: "id_mrhb", rotulo: "ID MRHB", tipo: "texto", filtravel: true },
  { campo: "cliente", rotulo: "Cliente", tipo: "texto", filtravel: true },
  { campo: "pn_mrhb", rotulo: "PN MRHB", tipo: "texto", filtravel: true },
  { campo: "descricao_defeito", rotulo: "Descrição do Defeito", tipo: "texto", filtravel: true },
  { campo: "data_abertura", rotulo: "Data Abertura", tipo: "data", filtravel: true },
  { campo: "progresso", rotulo: "Progresso", tipo: "texto", filtravel: true },
  { campo: "status", rotulo: "Status", tipo: "texto", filtravel: true },
];
const CAMPOS_POR_NOME = Object.fromEntries(COLUNAS_FIXAS.map((c) => [c.campo, c]));
const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const ROTULO_STATUS = { ok: "✅ OK", atencao: "⚠️ Atenção", critico: "🔴 Crítico" };

let linhasBrutas = [];
let reclamacoes = [];

// Filtros por coluna: guarda os valores DESMARCADOS (excluídos), igual ao Gerenciador.
const filtrosColuna = {};

function formatarData(iso) {
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  return dia ? `${dia}/${mes}/${ano}` : iso;
}

function textoSeguro(valor) {
  const span = document.createElement("span");
  span.textContent = valor ?? "";
  return span.innerHTML;
}

function hojeISO() {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

function agruparPorReclamacao(linhas) {
  const mapa = new Map();
  linhas.forEach((l) => {
    if (!mapa.has(l.reclamacao_id)) {
      mapa.set(l.reclamacao_id, {
        reclamacao_id: l.reclamacao_id,
        id_mrhb: l.id_mrhb,
        cliente: l.cliente,
        pn_mrhb: l.pn_mrhb,
        descricao_defeito: l.descricao_defeito,
        data_abertura: l.data_abertura,
        etapas: [],
      });
    }
    mapa.get(l.reclamacao_id).etapas.push(l);
  });

  const lista = Array.from(mapa.values());
  lista.forEach((r) => {
    r.etapas.sort((a, b) => a.ordem - b.ordem);
    const etapasNecessarias = r.etapas.filter((e) => e.aplicavel);
    const total = etapasNecessarias.length;
    const feitas = etapasNecessarias.filter((e) => e.realizacao).length;
    const percentual = total ? feitas / total : 0;
    r.status = percentual >= 0.8 ? "ok" : percentual >= 0.5 ? "atencao" : "critico";
    r.progresso = `${feitas}/${total}`;
    r._percentual = percentual;
  });
  lista.sort((a, b) => (a.data_abertura < b.data_abertura ? 1 : -1));
  return lista;
}

// Agrupa a coluna Data por Mês/Ano; Status usa o rótulo com emoji; demais colunas usam o valor bruto.
function chaveERotulo(registro, coluna) {
  if (coluna.tipo === "data") {
    const iso = registro.data_abertura;
    if (!iso) return { chave: "", rotulo: "(vazio)" };
    const [ano, mes] = iso.split("-");
    return { chave: `${ano}-${mes}`, rotulo: `${MESES_ABREV[parseInt(mes, 10) - 1]}/${ano}` };
  }
  if (coluna.campo === "status") {
    return { chave: registro.status, rotulo: ROTULO_STATUS[registro.status] };
  }
  const valor = registro[coluna.campo];
  const texto = valor === null || valor === undefined || valor === "" ? "" : String(valor);
  return { chave: texto, rotulo: texto === "" ? "(vazio)" : texto };
}

function valoresUnicosDaColuna(campo) {
  const coluna = CAMPOS_POR_NOME[campo];
  const mapa = new Map();
  reclamacoes.forEach((r) => {
    const { chave, rotulo } = chaveERotulo(r, coluna);
    if (!mapa.has(chave)) mapa.set(chave, rotulo);
  });
  return Array.from(mapa.entries())
    .map(([chave, rotulo]) => ({ chave, rotulo }))
    .sort((a, b) => (a.chave > b.chave ? 1 : a.chave < b.chave ? -1 : 0));
}

function aplicarFiltros() {
  const camposAtivos = Object.keys(filtrosColuna).filter((c) => filtrosColuna[c].size > 0);
  if (camposAtivos.length === 0) return reclamacoes;
  return reclamacoes.filter((r) =>
    camposAtivos.every((campo) => {
      const { chave } = chaveERotulo(r, CAMPOS_POR_NOME[campo]);
      return !filtrosColuna[campo].has(chave);
    })
  );
}

function celulaFixa(r, coluna) {
  switch (coluna.campo) {
    case "id_mrhb":
      return `<td class="id-mrhb">${textoSeguro(r.id_mrhb)}</td>`;
    case "cliente":
      return `<td>${textoSeguro(r.cliente)}</td>`;
    case "pn_mrhb":
      return `<td>${textoSeguro(r.pn_mrhb)}</td>`;
    case "descricao_defeito":
      return `<td class="descricao-truncada" title="${textoSeguro(r.descricao_defeito)}">${textoSeguro(r.descricao_defeito)}</td>`;
    case "data_abertura":
      return `<td>${formatarData(r.data_abertura)}</td>`;
    case "progresso":
      return `<td>
        <div class="progresso-coluna">
          <div class="progresso-barra"><div class="progresso-barra-preenchida ${r.status}" style="width:${Math.round(r._percentual * 100)}%"></div></div>
          <span class="progresso-texto">${r.progresso}</span>
        </div>
      </td>`;
    case "status":
      return `<td><span class="badge-status ${r.status}">${ROTULO_STATUS[r.status]}</span></td>`;
    default:
      return "<td></td>";
  }
}

function renderizarEtapas() {
  const lista = aplicarFiltros();

  if (lista.length === 0) {
    corpoEtapas.innerHTML = `<tr><td colspan="7" class="empty">Nenhuma reclamação encontrada.</td></tr>`;
  } else {
    corpoEtapas.innerHTML = lista
      .map((r) => {
        const celulasFixas = COLUNAS_FIXAS.map((coluna) => celulaFixa(r, coluna)).join("");
        return `<tr class="linha-clicavel" data-abrir-reclamacao="${r.reclamacao_id}">${celulasFixas}</tr>`;
      })
      .join("");
  }
  contadorEtapas.textContent = `${lista.length} de ${reclamacoes.length} ${reclamacoes.length === 1 ? "reclamação" : "reclamações"}`;
}

// ---------- Cabeçalho ----------
function renderizarCabecalho() {
  const linha = document.createElement("tr");

  COLUNAS_FIXAS.forEach((coluna) => {
    const th = document.createElement("th");
    const rotuloSeguro = document.createElement("span");
    rotuloSeguro.textContent = coluna.rotulo;

    if (coluna.filtravel) {
      const filtroAtivo = filtrosColuna[coluna.campo] && filtrosColuna[coluna.campo].size > 0;
      th.innerHTML = `<div class="th-conteudo"><span>${rotuloSeguro.innerHTML}</span><button type="button" class="btn-filtro-coluna${filtroAtivo ? " ativo" : ""}" data-campo-filtro="${coluna.campo}" title="Filtrar">▾</button></div>`;
    } else {
      th.innerHTML = rotuloSeguro.innerHTML;
    }
    linha.appendChild(th);
  });

  cabecalhoEtapas.innerHTML = "";
  cabecalhoEtapas.appendChild(linha);

  cabecalhoEtapas.querySelectorAll(".btn-filtro-coluna").forEach((botao) => {
    botao.addEventListener("click", (ev) => {
      ev.stopPropagation();
      alternarPopover(botao.dataset.campoFiltro, botao);
    });
  });
}

// ---------- Popover de filtro (estilo Excel, igual ao Gerenciador) ----------
const popover = document.getElementById("filtro-popover-etapas");
const popoverBusca = document.getElementById("filtro-popover-etapas-busca-input");
const popoverTodos = document.getElementById("filtro-popover-etapas-todos");
const popoverLista = document.getElementById("filtro-popover-etapas-lista");
const popoverLimpar = document.getElementById("filtro-popover-etapas-limpar");
const popoverOk = document.getElementById("filtro-popover-etapas-ok");

let colunaAtivaPopover = null;
let selecaoTemporaria = new Set();

function opcoesVisiveisPopover() {
  const termo = popoverBusca.value.trim().toLowerCase();
  const todas = valoresUnicosDaColuna(colunaAtivaPopover);
  return termo ? todas.filter((o) => o.rotulo.toLowerCase().includes(termo)) : todas;
}

function renderizarListaPopover() {
  const visiveis = opcoesVisiveisPopover();

  if (visiveis.length === 0) {
    popoverLista.innerHTML = `<div class="filtro-popover-vazio">Nenhum valor encontrado</div>`;
  } else {
    popoverLista.innerHTML = visiveis
      .map((o) => {
        const rotuloSeguro = document.createElement("span");
        rotuloSeguro.textContent = o.rotulo;
        const marcado = selecaoTemporaria.has(o.chave);
        return `<label class="filtro-popover-item"><input type="checkbox" data-chave="${encodeURIComponent(o.chave)}" ${marcado ? "checked" : ""} /><span>${rotuloSeguro.innerHTML}</span></label>`;
      })
      .join("");
  }

  const marcados = visiveis.filter((o) => selecaoTemporaria.has(o.chave)).length;
  popoverTodos.checked = visiveis.length > 0 && marcados === visiveis.length;
  popoverTodos.indeterminate = marcados > 0 && marcados < visiveis.length;
}

function abrirPopoverFiltro(campo, botao) {
  colunaAtivaPopover = campo;
  const excluidos = filtrosColuna[campo] || new Set();
  const todasOpcoes = valoresUnicosDaColuna(campo);
  selecaoTemporaria = new Set(todasOpcoes.filter((o) => !excluidos.has(o.chave)).map((o) => o.chave));

  popoverBusca.value = "";
  renderizarListaPopover();

  const rect = botao.getBoundingClientRect();
  popover.style.top = `${window.scrollY + rect.bottom + 4}px`;
  popover.style.left = `${window.scrollX + rect.left}px`;
  popover.hidden = false;
  popoverBusca.focus();
}

function fecharPopover() {
  popover.hidden = true;
  colunaAtivaPopover = null;
}

function alternarPopover(campo, botao) {
  if (!popover.hidden && colunaAtivaPopover === campo) {
    fecharPopover();
    return;
  }
  abrirPopoverFiltro(campo, botao);
}

popoverBusca.addEventListener("input", () => {
  // Igual ao AutoFiltro do Excel: digitar na busca já marca só os valores
  // encontrados (limpar a busca volta a refletir o filtro já aplicado).
  const termo = popoverBusca.value.trim().toLowerCase();
  const todasOpcoes = valoresUnicosDaColuna(colunaAtivaPopover);
  if (termo) {
    selecaoTemporaria = new Set(
      todasOpcoes.filter((o) => o.rotulo.toLowerCase().includes(termo)).map((o) => o.chave)
    );
  } else {
    const excluidos = filtrosColuna[colunaAtivaPopover] || new Set();
    selecaoTemporaria = new Set(todasOpcoes.filter((o) => !excluidos.has(o.chave)).map((o) => o.chave));
  }
  renderizarListaPopover();
});

popoverLista.addEventListener("change", (ev) => {
  const input = ev.target.closest('input[type="checkbox"]');
  if (!input) return;
  const chave = decodeURIComponent(input.dataset.chave);
  if (input.checked) selecaoTemporaria.add(chave);
  else selecaoTemporaria.delete(chave);
  renderizarListaPopover();
});

popoverTodos.addEventListener("change", () => {
  const visiveis = opcoesVisiveisPopover();
  if (popoverTodos.checked) {
    visiveis.forEach((o) => selecaoTemporaria.add(o.chave));
  } else {
    visiveis.forEach((o) => selecaoTemporaria.delete(o.chave));
  }
  renderizarListaPopover();
});

popoverOk.addEventListener("click", () => {
  const todasOpcoes = valoresUnicosDaColuna(colunaAtivaPopover);
  filtrosColuna[colunaAtivaPopover] = new Set(
    todasOpcoes.filter((o) => !selecaoTemporaria.has(o.chave)).map((o) => o.chave)
  );
  fecharPopover();
  renderizarCabecalho();
  renderizarEtapas();
});

popoverLimpar.addEventListener("click", () => {
  delete filtrosColuna[colunaAtivaPopover];
  fecharPopover();
  renderizarCabecalho();
  renderizarEtapas();
});

document.addEventListener("click", (ev) => {
  if (popover.hidden) return;
  if (popover.contains(ev.target)) return;
  fecharPopover();
});

document.getElementById("btn-limpar-filtros-etapas").addEventListener("click", () => {
  Object.keys(filtrosColuna).forEach((campo) => delete filtrosColuna[campo]);
  renderizarCabecalho();
  renderizarEtapas();
});

// ---------- Modal de detalhe (11 etapas) ----------
const modalEtapas = document.getElementById("modal-etapas");
const modalEtapasTitulo = document.getElementById("modal-etapas-titulo");
const modalEtapasSubtitulo = document.getElementById("modal-etapas-subtitulo");
const tabelaDetalheCorpo = document.getElementById("tabela-etapas-detalhe-corpo");
let reclamacaoAbertaId = null;

const ETAPAS_FLEXIVEIS = new Set(["Poka Yoke", "LPA", "Trab. Padronizado", "FMEA", "Plano de Controle"]);

function renderizarDetalhe(reclamacao) {
  const hoje = hojeISO();
  tabelaDetalheCorpo.innerHTML = reclamacao.etapas
    .map((e) => {
      const flexivel = ETAPAS_FLEXIVEIS.has(e.etapa);
      const atrasada = !!e.aplicavel && !e.realizacao && e.prazo && e.prazo < hoje;
      const legendaClasse = atrasada ? "etapa-prazo-legenda etapa-atrasada" : "etapa-prazo-legenda";
      const legendaTexto = e.aplicavel
        ? `Prazo: ${formatarData(e.prazo)}${atrasada ? " ⚠️" : ""}`
        : "Não necessária para este caso";
      const toggle = flexivel
        ? `<label class="etapa-toggle"><input type="checkbox" data-aplicavel-id="${e.id}" ${e.aplicavel ? "checked" : ""} /> Necessária</label>`
        : "";

      return `
      <div class="etapa-linha">
        <div class="etapa-nome-coluna">
          <div>${e.etapa}</div>
          ${toggle}
        </div>
        <div class="etapa-campo-coluna">
          <input type="date" value="${e.realizacao ?? ""}" data-etapa-id="${e.id}" ${e.aplicavel ? "" : "disabled"} />
          <div class="${legendaClasse}">${legendaTexto}</div>
        </div>
      </div>`;
    })
    .join("");
}

function abrirModalEtapas(reclamacaoId) {
  const reclamacao = reclamacoes.find((r) => String(r.reclamacao_id) === String(reclamacaoId));
  if (!reclamacao) return;

  reclamacaoAbertaId = reclamacaoId;
  modalEtapasTitulo.textContent = reclamacao.id_mrhb;
  const subtitulo = document.createElement("span");
  subtitulo.textContent = `${reclamacao.cliente} · ${reclamacao.descricao_defeito}`;
  modalEtapasSubtitulo.innerHTML = subtitulo.innerHTML;

  renderizarDetalhe(reclamacao);
  modalEtapas.hidden = false;
}

function fecharModalEtapas() {
  modalEtapas.hidden = true;
  reclamacaoAbertaId = null;
}

corpoEtapas.addEventListener("click", (ev) => {
  const linha = ev.target.closest("[data-abrir-reclamacao]");
  if (linha) abrirModalEtapas(linha.dataset.abrirReclamacao);
});

document.getElementById("modal-etapas-fechar").addEventListener("click", fecharModalEtapas);
modalEtapas.addEventListener("click", (ev) => {
  if (ev.target === modalEtapas) fecharModalEtapas();
});

tabelaDetalheCorpo.addEventListener("change", async (ev) => {
  const checkboxAplicavel = ev.target.closest("input[data-aplicavel-id]");
  if (checkboxAplicavel) {
    const etapaId = checkboxAplicavel.dataset.aplicavelId;
    const novoValor = checkboxAplicavel.checked;
    try {
      const res = await fetch(`/api/etapas-8d/${etapaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aplicavel: novoValor }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");

      const linhaBruta = linhasBrutas.find((l) => String(l.id) === String(etapaId));
      if (linhaBruta) linhaBruta.aplicavel = novoValor ? 1 : 0;
      reclamacoes = agruparPorReclamacao(linhasBrutas);
      renderizarEtapas();

      const reclamacaoAberta = reclamacoes.find((r) => String(r.reclamacao_id) === String(reclamacaoAbertaId));
      if (reclamacaoAberta) renderizarDetalhe(reclamacaoAberta);
    } catch (err) {
      checkboxAplicavel.checked = !novoValor;
    }
    return;
  }

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

    const reclamacaoAberta = reclamacoes.find((r) => String(r.reclamacao_id) === String(reclamacaoAbertaId));
    if (reclamacaoAberta) renderizarDetalhe(reclamacaoAberta);
  } catch (err) {
    input.value = valorAnterior;
  }
});

// ---------- Carregamento ----------
async function carregarEtapas() {
  try {
    const res = await fetch("/api/etapas-8d");
    linhasBrutas = await res.json();
    reclamacoes = agruparPorReclamacao(linhasBrutas);
    renderizarCabecalho();
    renderizarEtapas();
  } catch (err) {
    corpoEtapas.innerHTML = `<tr><td colspan="7" class="empty">Erro ao carregar os dados.</td></tr>`;
  }
}

carregarEtapas();
