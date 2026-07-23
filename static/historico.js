const corpo = document.getElementById("tabela-corpo");
const cabecalho = document.getElementById("tabela-cabecalho");
const contador = document.getElementById("contador");

const COLUNAS = [
  { campo: "id_mrhb", rotulo: "ID MRHB", tipo: "texto" },
  { campo: "numero_notificacao", rotulo: "Nº Notif.", tipo: "texto" },
  { campo: "data_abertura", rotulo: "Data", tipo: "data" },
  { campo: "cliente", rotulo: "Cliente", tipo: "texto" },
  { campo: "responsavel_cliente", rotulo: "Responsável Cliente", tipo: "texto" },
  { campo: "pn_mrhb", rotulo: "PN MRHB", tipo: "texto" },
  { campo: "pn_cliente", rotulo: "PN Cliente", tipo: "texto" },
  { campo: "descricao_defeito", rotulo: "Descrição do Defeito", tipo: "texto" },
  { campo: "tipo_pdca", rotulo: "Tipo PDCA", tipo: "texto" },
  { campo: "area_responsavel_8d", rotulo: "Área 8D", tipo: "texto" },
  { campo: "tipo_reclamacao", rotulo: "Tipo Reclamação", tipo: "texto" },
  { campo: "qtd_reclamada", rotulo: "Qtd.", tipo: "texto" },
];
const CAMPOS_POR_NOME = Object.fromEntries(COLUNAS.map((c) => [c.campo, c]));
const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const CHAVE_ORDEM = "pdca_historico_ordem_colunas";

function carregarOrdemColunas() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_ORDEM) || "null");
    if (Array.isArray(salvo) && salvo.every((c) => CAMPOS_POR_NOME[c])) {
      const faltando = COLUNAS.map((c) => c.campo).filter((c) => !salvo.includes(c));
      return [...salvo, ...faltando];
    }
  } catch (err) {
    /* ignora e usa a ordem padrão */
  }
  return COLUNAS.map((c) => c.campo);
}

function salvarOrdemColunas() {
  localStorage.setItem(CHAVE_ORDEM, JSON.stringify(ordemColunas));
}

let ordemColunas = carregarOrdemColunas();
let registros = [];

// Filtros por coluna: guarda os valores DESMARCADOS (excluídos) de cada coluna,
// igual ao AutoFiltro do Excel — sem filtro = tudo marcado = nada excluído.
const filtrosColuna = {};

function formatarData(iso) {
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  return dia ? `${dia}/${mes}/${ano}` : iso;
}

// Destaque por cor do Tipo de Reclamação: Formal = vermelho, Informal = amarelo
function celulaTipoReclamacao(tipo) {
  const texto = tipo ?? "";
  const rotulo = document.createElement("span");
  rotulo.textContent = texto;

  if (texto === "Formal") {
    rotulo.className = "badge-tipo formal";
  } else if (texto === "Informal") {
    rotulo.className = "badge-tipo informal";
  }
  return rotulo.outerHTML;
}

function valorCelula(registro, campo) {
  if (campo === "data_abertura") return formatarData(registro.data_abertura);
  if (campo === "tipo_reclamacao") return celulaTipoReclamacao(registro.tipo_reclamacao);
  const span = document.createElement("span");
  span.textContent = registro[campo] ?? "";
  return span.innerHTML;
}

// Agrupa a coluna Data por Mês/Ano (chave ordenável "AAAA-MM"); demais colunas usam o valor bruto
function chaveERotulo(registro, coluna) {
  if (coluna.tipo === "data") {
    const iso = registro.data_abertura;
    if (!iso) return { chave: "", rotulo: "(vazio)" };
    const [ano, mes] = iso.split("-");
    return { chave: `${ano}-${mes}`, rotulo: `${MESES_ABREV[parseInt(mes, 10) - 1]}/${ano}` };
  }
  const valor = registro[coluna.campo];
  const texto = valor === null || valor === undefined || valor === "" ? "" : String(valor);
  return { chave: texto, rotulo: texto === "" ? "(vazio)" : texto };
}

function valoresUnicosDaColuna(campo) {
  const coluna = CAMPOS_POR_NOME[campo];
  const mapa = new Map();
  registros.forEach((r) => {
    const { chave, rotulo } = chaveERotulo(r, coluna);
    if (!mapa.has(chave)) mapa.set(chave, rotulo);
  });
  return Array.from(mapa.entries())
    .map(([chave, rotulo]) => ({ chave, rotulo }))
    .sort((a, b) => (a.chave > b.chave ? 1 : a.chave < b.chave ? -1 : 0));
}

function aplicarFiltros() {
  const camposAtivos = Object.keys(filtrosColuna).filter((c) => filtrosColuna[c].size > 0);
  if (camposAtivos.length === 0) return registros;

  return registros.filter((r) =>
    camposAtivos.every((campo) => {
      const { chave } = chaveERotulo(r, CAMPOS_POR_NOME[campo]);
      return !filtrosColuna[campo].has(chave);
    })
  );
}

function renderizar() {
  const lista = aplicarFiltros();

  if (lista.length === 0) {
    corpo.innerHTML = `<tr><td colspan="${ordemColunas.length + 1}" class="empty">Nenhuma reclamação encontrada.</td></tr>`;
  } else {
    corpo.innerHTML = lista
      .map((r) => {
        const celulas = ordemColunas
          .map((campo) => `<td${campo === "id_mrhb" ? ' class="id-mrhb"' : ""}>${valorCelula(r, campo)}</td>`)
          .join("");
        return `<tr>${celulas}<td class="acoes-celula"><button type="button" class="btn-editar" data-editar="${r.id}">Editar</button><button type="button" class="btn-excluir" data-excluir="${r.id}">Excluir</button></td></tr>`;
      })
      .join("");
  }
  contador.textContent = `${lista.length} de ${registros.length} ${registros.length === 1 ? "reclamação" : "reclamações"}`;
}

// ---------- Cabeçalho: arrastar para reordenar + botão de filtro ----------
function renderizarCabecalho() {
  const linha = document.createElement("tr");

  ordemColunas.forEach((campo) => {
    const coluna = CAMPOS_POR_NOME[campo];
    const th = document.createElement("th");
    th.className = "col-arrastavel";
    th.draggable = true;
    th.dataset.campo = campo;

    const filtroAtivo = filtrosColuna[campo] && filtrosColuna[campo].size > 0;
    const rotuloSeguro = document.createElement("span");
    rotuloSeguro.textContent = coluna.rotulo;
    th.innerHTML = `<div class="th-conteudo"><span>${rotuloSeguro.innerHTML}</span><button type="button" class="btn-filtro-coluna${filtroAtivo ? " ativo" : ""}" data-campo-filtro="${campo}" title="Filtrar">▾</button></div>`;

    linha.appendChild(th);
  });

  const thAcoes = document.createElement("th");
  thAcoes.textContent = "Ações";
  linha.appendChild(thAcoes);

  cabecalho.innerHTML = "";
  cabecalho.appendChild(linha);

  cabecalho.querySelectorAll(".btn-filtro-coluna").forEach((botao) => {
    botao.addEventListener("click", (ev) => {
      ev.stopPropagation();
      alternarPopover(botao.dataset.campoFiltro, botao);
    });
  });

  let campoArrastado = null;
  cabecalho.querySelectorAll("th.col-arrastavel").forEach((th) => {
    th.addEventListener("dragstart", () => {
      campoArrastado = th.dataset.campo;
      th.classList.add("arrastando");
    });
    th.addEventListener("dragend", () => {
      th.classList.remove("arrastando");
      cabecalho.querySelectorAll(".sobre-alvo").forEach((el) => el.classList.remove("sobre-alvo"));
    });
    th.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      if (th.dataset.campo !== campoArrastado) th.classList.add("sobre-alvo");
    });
    th.addEventListener("dragleave", () => th.classList.remove("sobre-alvo"));
    th.addEventListener("drop", (ev) => {
      ev.preventDefault();
      th.classList.remove("sobre-alvo");
      const alvo = th.dataset.campo;
      if (!campoArrastado || campoArrastado === alvo) return;
      const origemIdx = ordemColunas.indexOf(campoArrastado);
      const destinoIdx = ordemColunas.indexOf(alvo);
      ordemColunas.splice(origemIdx, 1);
      ordemColunas.splice(destinoIdx, 0, campoArrastado);
      salvarOrdemColunas();
      renderizarCabecalho();
      renderizar();
    });
  });
}

// ---------- Popover de filtro (estilo Excel) ----------
const popover = document.getElementById("filtro-popover");
const popoverBusca = document.getElementById("filtro-popover-busca-input");
const popoverTodos = document.getElementById("filtro-popover-todos");
const popoverLista = document.getElementById("filtro-popover-lista");
const popoverLimpar = document.getElementById("filtro-popover-limpar");
const popoverOk = document.getElementById("filtro-popover-ok");

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

popoverBusca.addEventListener("input", renderizarListaPopover);

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
  renderizar();
});

popoverLimpar.addEventListener("click", () => {
  delete filtrosColuna[colunaAtivaPopover];
  fecharPopover();
  renderizarCabecalho();
  renderizar();
});

document.addEventListener("click", (ev) => {
  if (popover.hidden) return;
  if (popover.contains(ev.target)) return;
  fecharPopover();
});

document.getElementById("btn-limpar-filtros").addEventListener("click", () => {
  Object.keys(filtrosColuna).forEach((campo) => delete filtrosColuna[campo]);
  renderizarCabecalho();
  renderizar();
});

async function carregar() {
  try {
    const res = await fetch("/api/reclamacoes");
    registros = await res.json();
    renderizarCabecalho();
    renderizar();
  } catch (err) {
    corpo.innerHTML = `<tr><td colspan="12" class="empty">Erro ao carregar os dados.</td></tr>`;
  }
}

carregar();

// ---------- Edição ----------
const CAMPOS_EDITAVEIS = [
  "id_mrhb",
  "numero_notificacao",
  "data_abertura",
  "pn_mrhb",
  "pn_cliente",
  "cliente",
  "responsavel_cliente",
  "descricao_defeito",
  "tipo_pdca",
  "area_responsavel_8d",
  "tipo_problema",
  "tipo_reclamacao",
  "mq_in",
  "mq_us",
  "qtd_reclamada",
];

const modal = document.getElementById("modal-editar");
const formEditar = document.getElementById("form-editar");
const modalAlert = document.getElementById("modal-alert");
const editTipoReclamacaoSelect = document.getElementById("edit_tipo_reclamacao");

function destacarTipoReclamacaoEdicao() {
  editTipoReclamacaoSelect.classList.remove("tipo-reclamacao-formal", "tipo-reclamacao-informal");
  if (editTipoReclamacaoSelect.value === "Formal") {
    editTipoReclamacaoSelect.classList.add("tipo-reclamacao-formal");
  } else if (editTipoReclamacaoSelect.value === "Informal") {
    editTipoReclamacaoSelect.classList.add("tipo-reclamacao-informal");
  }
}

editTipoReclamacaoSelect.addEventListener("change", destacarTipoReclamacaoEdicao);

function definirValorCampo(nomeCampo, valor) {
  const el = document.getElementById(`edit_${nomeCampo}`);
  if (el) {
    el.value = valor ?? "";
    return;
  }
  // Grupos de caixinhas (radio): tipo_pdca, area_responsavel_8d, tipo_problema
  formEditar.querySelectorAll(`input[type="radio"][name="${nomeCampo}"]`).forEach((radio) => {
    radio.checked = radio.value === valor;
  });
}

function abrirModalEdicao(id) {
  const registro = registros.find((r) => String(r.id) === String(id));
  if (!registro) return;

  document.getElementById("edit_registro_id").value = registro.id;
  CAMPOS_EDITAVEIS.forEach((campo) => definirValorCampo(campo, registro[campo]));
  destacarTipoReclamacaoEdicao();

  modalAlert.hidden = true;
  modal.hidden = false;
}

function fecharModal() {
  modal.hidden = true;
  formEditar.reset();
}

corpo.addEventListener("click", (ev) => {
  const botaoEditar = ev.target.closest("[data-editar]");
  if (botaoEditar) abrirModalEdicao(botaoEditar.dataset.editar);

  const botaoExcluir = ev.target.closest("[data-excluir]");
  if (botaoExcluir) abrirModalExclusao(botaoExcluir.dataset.excluir);
});

document.getElementById("modal-fechar").addEventListener("click", fecharModal);
document.getElementById("modal-cancelar").addEventListener("click", fecharModal);
modal.addEventListener("click", (ev) => {
  if (ev.target === modal) fecharModal();
});

formEditar.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const id = document.getElementById("edit_registro_id").value;
  const dados = Object.fromEntries(new FormData(formEditar).entries());

  try {
    const res = await fetch(`/api/reclamacoes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    const resposta = await res.json();

    if (!res.ok) {
      modalAlert.textContent = resposta.erro || "Não foi possível salvar as alterações.";
      modalAlert.className = "alert error";
      modalAlert.hidden = false;
      return;
    }

    fecharModal();
    await carregar();
  } catch (err) {
    modalAlert.textContent = "Erro de conexão com o servidor.";
    modalAlert.className = "alert error";
    modalAlert.hidden = false;
  }
});

// ---------- Exclusão ----------
const modalExcluir = document.getElementById("modal-excluir");
const formExcluir = document.getElementById("form-excluir");
const excluirAlert = document.getElementById("excluir-alert");
const excluirIdMrhb = document.getElementById("excluir-id-mrhb");
const excluirMotivo = document.getElementById("excluir-motivo");
let registroIdParaExcluir = null;

function abrirModalExclusao(id) {
  const registro = registros.find((r) => String(r.id) === String(id));
  if (!registro) return;

  registroIdParaExcluir = id;
  excluirIdMrhb.textContent = registro.id_mrhb;
  excluirMotivo.value = "";
  excluirAlert.hidden = true;
  modalExcluir.hidden = false;
  excluirMotivo.focus();
}

function fecharModalExclusao() {
  modalExcluir.hidden = true;
  registroIdParaExcluir = null;
  formExcluir.reset();
}

document.getElementById("excluir-modal-fechar").addEventListener("click", fecharModalExclusao);
document.getElementById("excluir-cancelar").addEventListener("click", fecharModalExclusao);
modalExcluir.addEventListener("click", (ev) => {
  if (ev.target === modalExcluir) fecharModalExclusao();
});

formExcluir.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const motivo = excluirMotivo.value.trim();
  if (!motivo) return;

  try {
    const res = await fetch(`/api/reclamacoes/${registroIdParaExcluir}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo }),
    });
    const resposta = await res.json();

    if (!res.ok) {
      excluirAlert.textContent = resposta.erro || "Não foi possível excluir a reclamação.";
      excluirAlert.hidden = false;
      return;
    }

    fecharModalExclusao();
    await carregar();
  } catch (err) {
    excluirAlert.textContent = "Erro de conexão com o servidor.";
    excluirAlert.hidden = false;
  }
});
