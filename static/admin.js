const alertBox = document.getElementById("admin-alert");

function mostrarAlerta(mensagem, tipo) {
  alertBox.textContent = mensagem;
  alertBox.className = `alert ${tipo}`;
  alertBox.hidden = false;
  alertBox.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function chamarApi(url, opcoes) {
  const res = await fetch(url, opcoes);
  let resposta = {};
  try {
    resposta = await res.json();
  } catch (err) {
    resposta = {};
  }
  if (!res.ok) {
    throw new Error(resposta.erro || "Não foi possível completar a operação.");
  }
  return resposta;
}

// Exclusão com confirmação em 2 cliques (em vez de confirm() nativo): o
// primeiro clique muda o botão para "Confirmar?" por alguns segundos; um
// segundo clique nesse intervalo efetiva a ação.
function botaoExcluirComConfirmacao(aoConfirmar) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "btn-excluir";
  botao.textContent = "Excluir";

  let timeoutId = null;

  function resetar() {
    clearTimeout(timeoutId);
    timeoutId = null;
    botao.textContent = "Excluir";
    botao.classList.remove("btn-excluir-confirmando");
  }

  botao.addEventListener("click", () => {
    if (timeoutId) {
      resetar();
      aoConfirmar();
      return;
    }
    botao.textContent = "Confirmar?";
    botao.classList.add("btn-excluir-confirmando");
    timeoutId = setTimeout(resetar, 5000);
  });

  return botao;
}

function criarItemLista(id, texto, aoExcluir) {
  const li = document.createElement("li");
  li.className = "admin-lista-item";
  li.dataset.id = id;

  const span = document.createElement("span");
  span.textContent = texto;

  const botao = botaoExcluirComConfirmacao(() => aoExcluir(li, id));

  li.append(span, botao);
  return li;
}

function removerVazioSeExistir(lista) {
  const vazio = lista.querySelector(".admin-lista-vazio");
  if (vazio) vazio.remove();
}

function garantirVazioSeNecessario(lista, mensagem) {
  if (!lista.querySelector(".admin-lista-item")) {
    const li = document.createElement("li");
    li.className = "admin-lista-vazio";
    li.textContent = mensagem;
    lista.appendChild(li);
  }
}

// Troca os botões "Excluir" já renderizados pelo servidor (que não têm o
// listener de 2 cliques) por versões equivalentes com o mesmo comportamento.
function ativarBotaoExistente(botaoAntigo, aoExcluir) {
  const li = botaoAntigo.closest(".admin-lista-item") || botaoAntigo.closest("tr");
  const id = botaoAntigo.dataset.excluirCliente || botaoAntigo.dataset.excluirOpcao || botaoAntigo.dataset.excluirPeca;
  const botaoNovo = botaoExcluirComConfirmacao(() => aoExcluir(li, id));
  botaoAntigo.replaceWith(botaoNovo);
}

// --- Clientes ---------------------------------------------------------
const listaClientes = document.querySelector("[data-lista-clientes]");
const formClientes = document.querySelector("[data-form-clientes]");
const selectClienteNovaPeca = document.getElementById("nova_peca_cliente");

function excluirCliente(li, id) {
  const nome = li.querySelector("span").textContent;
  chamarApi(`/api/admin/clientes/${id}`, { method: "DELETE" })
    .then(() => {
      li.remove();
      garantirVazioSeNecessario(listaClientes, "Nenhum cliente cadastrado.");
      const opcao = Array.from(selectClienteNovaPeca.options).find((o) => o.textContent === nome);
      if (opcao) opcao.remove();
    })
    .catch((err) => mostrarAlerta(err.message, "error"));
}

listaClientes.querySelectorAll("[data-excluir-cliente]").forEach((botao) => ativarBotaoExistente(botao, excluirCliente));

formClientes.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const input = formClientes.querySelector("input");
  const nome = input.value.trim().toUpperCase();
  if (!nome) return;

  chamarApi("/api/admin/clientes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome }),
  })
    .then((resposta) => {
      removerVazioSeExistir(listaClientes);
      listaClientes.appendChild(criarItemLista(resposta.id, resposta.nome, excluirCliente));

      const opcao = document.createElement("option");
      opcao.textContent = resposta.nome;
      selectClienteNovaPeca.appendChild(opcao);

      input.value = "";
      input.focus();
    })
    .catch((err) => mostrarAlerta(err.message, "error"));
});

// --- Opções do formulário (Tipo PDCA, MQ IN, etc.) ---------------------
document.querySelectorAll("[data-form-opcao]").forEach((form) => {
  const categoria = form.dataset.formOpcao;
  const lista = document.querySelector(`[data-lista-opcao="${categoria}"]`);

  function excluirOpcao(li, id) {
    chamarApi(`/api/admin/opcoes/${id}`, { method: "DELETE" })
      .then(() => {
        li.remove();
        garantirVazioSeNecessario(lista, "Nenhuma opção cadastrada.");
      })
      .catch((err) => mostrarAlerta(err.message, "error"));
  }

  lista.querySelectorAll("[data-excluir-opcao]").forEach((botao) => ativarBotaoExistente(botao, excluirOpcao));

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const input = form.querySelector("input");
    const valor = input.value.trim();
    if (!valor) return;

    chamarApi(`/api/admin/opcoes/${categoria}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valor }),
    })
      .then((resposta) => {
        removerVazioSeExistir(lista);
        lista.appendChild(criarItemLista(resposta.id, resposta.valor, excluirOpcao));
        input.value = "";
        input.focus();
      })
      .catch((err) => mostrarAlerta(err.message, "error"));
  });
});

// --- Peças (PN) — tabela com filtro por coluna (estilo Excel) e edição ---
const formNovaPeca = document.getElementById("form-nova-peca");
const tabelaPecasCorpo = document.getElementById("tabela-pecas-corpo");
const pecasCabecalho = document.getElementById("pecas-cabecalho");
const contadorPecas = document.getElementById("contador-pecas");

const COLUNAS_PECAS = [
  { campo: "pn_mrhb", rotulo: "PN MRHB" },
  { campo: "cliente", rotulo: "Cliente" },
  { campo: "pn_cliente", rotulo: "PN Cliente" },
  { campo: "responsavel", rotulo: "Responsável" },
];
const CAMPOS_PECAS_POR_NOME = Object.fromEntries(COLUNAS_PECAS.map((c) => [c.campo, c]));

let pecasRegistros = [];
// Igual ao AutoFiltro do Excel: guarda os valores DESMARCADOS de cada coluna;
// sem filtro = tudo marcado = nada excluído.
const filtrosColunaPecas = {};

function valorOuVazio(registro, campo) {
  const valor = registro[campo];
  return valor === null || valor === undefined || valor === "" ? "" : String(valor);
}

function valoresUnicosColunaPeca(campo) {
  const mapa = new Map();
  pecasRegistros.forEach((r) => {
    const texto = valorOuVazio(r, campo);
    if (!mapa.has(texto)) mapa.set(texto, texto === "" ? "(vazio)" : texto);
  });
  return Array.from(mapa.entries())
    .map(([chave, rotulo]) => ({ chave, rotulo }))
    .sort((a, b) => (a.chave > b.chave ? 1 : a.chave < b.chave ? -1 : 0));
}

function aplicarFiltrosPecas() {
  const camposAtivos = Object.keys(filtrosColunaPecas).filter((c) => filtrosColunaPecas[c].size > 0);
  if (camposAtivos.length === 0) return pecasRegistros;
  return pecasRegistros.filter((r) => camposAtivos.every((campo) => !filtrosColunaPecas[campo].has(valorOuVazio(r, campo))));
}

function renderizarPecas() {
  const lista = aplicarFiltrosPecas();

  if (lista.length === 0) {
    tabelaPecasCorpo.innerHTML = `<tr><td colspan="${COLUNAS_PECAS.length + 1}" class="empty">Nenhuma peça encontrada.</td></tr>`;
  } else {
    tabelaPecasCorpo.innerHTML = "";
    lista.forEach((registro) => {
      const tr = document.createElement("tr");
      tr.dataset.pn = registro.pn_mrhb;

      COLUNAS_PECAS.forEach(({ campo }) => {
        const td = document.createElement("td");
        td.textContent = valorOuVazio(registro, campo);
        tr.appendChild(td);
      });

      const tdAcoes = document.createElement("td");
      tdAcoes.className = "acoes-celula";
      const botaoEditar = document.createElement("button");
      botaoEditar.type = "button";
      botaoEditar.className = "btn-editar";
      botaoEditar.textContent = "Editar";
      botaoEditar.addEventListener("click", () => abrirModalEdicaoPeca(registro));
      tdAcoes.appendChild(botaoEditar);
      tdAcoes.appendChild(botaoExcluirComConfirmacao(() => excluirPeca(tr, registro.pn_mrhb)));
      tr.appendChild(tdAcoes);

      tabelaPecasCorpo.appendChild(tr);
    });
  }

  contadorPecas.textContent = `${lista.length} de ${pecasRegistros.length} ${pecasRegistros.length === 1 ? "peça" : "peças"}`;
}

function renderizarCabecalhoPecas() {
  const linha = document.createElement("tr");
  COLUNAS_PECAS.forEach(({ campo, rotulo }) => {
    const th = document.createElement("th");
    const filtroAtivo = filtrosColunaPecas[campo] && filtrosColunaPecas[campo].size > 0;
    const rotuloSeguro = document.createElement("span");
    rotuloSeguro.textContent = rotulo;
    th.innerHTML = `<div class="th-conteudo"><span>${rotuloSeguro.innerHTML}</span><button type="button" class="btn-filtro-coluna${filtroAtivo ? " ativo" : ""}" data-campo-filtro="${campo}" title="Filtrar">▾</button></div>`;
    linha.appendChild(th);
  });
  const thAcoes = document.createElement("th");
  thAcoes.textContent = "Ações";
  linha.appendChild(thAcoes);

  pecasCabecalho.innerHTML = "";
  pecasCabecalho.appendChild(linha);

  pecasCabecalho.querySelectorAll(".btn-filtro-coluna").forEach((botao) => {
    botao.addEventListener("click", (ev) => {
      ev.stopPropagation();
      alternarPopoverPecas(botao.dataset.campoFiltro, botao);
    });
  });
}

// ---------- Popover de filtro (estilo Excel), mesmo padrão do Gerenciador ----------
const popoverPecas = document.getElementById("filtro-popover-pecas");
const popoverPecasBusca = document.getElementById("filtro-popover-pecas-busca-input");
const popoverPecasTodos = document.getElementById("filtro-popover-pecas-todos");
const popoverPecasLista = document.getElementById("filtro-popover-pecas-lista");
const popoverPecasLimpar = document.getElementById("filtro-popover-pecas-limpar");
const popoverPecasOk = document.getElementById("filtro-popover-pecas-ok");

let colunaAtivaPopoverPecas = null;
let selecaoTemporariaPecas = new Set();

function opcoesVisiveisPopoverPecas() {
  const termo = popoverPecasBusca.value.trim().toLowerCase();
  const todas = valoresUnicosColunaPeca(colunaAtivaPopoverPecas);
  return termo ? todas.filter((o) => o.rotulo.toLowerCase().includes(termo)) : todas;
}

function renderizarListaPopoverPecas() {
  const visiveis = opcoesVisiveisPopoverPecas();

  if (visiveis.length === 0) {
    popoverPecasLista.innerHTML = `<div class="filtro-popover-vazio">Nenhum valor encontrado</div>`;
  } else {
    popoverPecasLista.innerHTML = visiveis
      .map((o) => {
        const rotuloSeguro = document.createElement("span");
        rotuloSeguro.textContent = o.rotulo;
        const marcado = selecaoTemporariaPecas.has(o.chave);
        return `<label class="filtro-popover-item"><input type="checkbox" data-chave="${encodeURIComponent(o.chave)}" ${marcado ? "checked" : ""} /><span>${rotuloSeguro.innerHTML}</span></label>`;
      })
      .join("");
  }

  const marcados = visiveis.filter((o) => selecaoTemporariaPecas.has(o.chave)).length;
  popoverPecasTodos.checked = visiveis.length > 0 && marcados === visiveis.length;
  popoverPecasTodos.indeterminate = marcados > 0 && marcados < visiveis.length;
}

function abrirPopoverFiltroPecas(campo, botao) {
  colunaAtivaPopoverPecas = campo;
  const excluidos = filtrosColunaPecas[campo] || new Set();
  const todasOpcoes = valoresUnicosColunaPeca(campo);
  selecaoTemporariaPecas = new Set(todasOpcoes.filter((o) => !excluidos.has(o.chave)).map((o) => o.chave));

  popoverPecasBusca.value = "";
  renderizarListaPopoverPecas();

  const rect = botao.getBoundingClientRect();
  popoverPecas.style.top = `${window.scrollY + rect.bottom + 4}px`;
  popoverPecas.style.left = `${window.scrollX + rect.left}px`;
  popoverPecas.hidden = false;
  popoverPecasBusca.focus();
}

function fecharPopoverPecas() {
  popoverPecas.hidden = true;
  colunaAtivaPopoverPecas = null;
}

function alternarPopoverPecas(campo, botao) {
  if (!popoverPecas.hidden && colunaAtivaPopoverPecas === campo) {
    fecharPopoverPecas();
    return;
  }
  abrirPopoverFiltroPecas(campo, botao);
}

popoverPecasBusca.addEventListener("input", () => {
  // Igual ao AutoFiltro do Excel: digitar na busca já marca só os valores
  // encontrados (limpar a busca volta a refletir o filtro já aplicado).
  const termo = popoverPecasBusca.value.trim().toLowerCase();
  const todasOpcoes = valoresUnicosColunaPeca(colunaAtivaPopoverPecas);
  if (termo) {
    selecaoTemporariaPecas = new Set(
      todasOpcoes.filter((o) => o.rotulo.toLowerCase().includes(termo)).map((o) => o.chave)
    );
  } else {
    const excluidos = filtrosColunaPecas[colunaAtivaPopoverPecas] || new Set();
    selecaoTemporariaPecas = new Set(todasOpcoes.filter((o) => !excluidos.has(o.chave)).map((o) => o.chave));
  }
  renderizarListaPopoverPecas();
});

popoverPecasLista.addEventListener("change", (ev) => {
  const input = ev.target.closest('input[type="checkbox"]');
  if (!input) return;
  const chave = decodeURIComponent(input.dataset.chave);
  if (input.checked) selecaoTemporariaPecas.add(chave);
  else selecaoTemporariaPecas.delete(chave);
  renderizarListaPopoverPecas();
});

popoverPecasTodos.addEventListener("change", () => {
  const visiveis = opcoesVisiveisPopoverPecas();
  if (popoverPecasTodos.checked) visiveis.forEach((o) => selecaoTemporariaPecas.add(o.chave));
  else visiveis.forEach((o) => selecaoTemporariaPecas.delete(o.chave));
  renderizarListaPopoverPecas();
});

popoverPecasOk.addEventListener("click", () => {
  const todasOpcoes = valoresUnicosColunaPeca(colunaAtivaPopoverPecas);
  filtrosColunaPecas[colunaAtivaPopoverPecas] = new Set(
    todasOpcoes.filter((o) => !selecaoTemporariaPecas.has(o.chave)).map((o) => o.chave)
  );
  fecharPopoverPecas();
  renderizarCabecalhoPecas();
  renderizarPecas();
});

popoverPecasLimpar.addEventListener("click", () => {
  delete filtrosColunaPecas[colunaAtivaPopoverPecas];
  fecharPopoverPecas();
  renderizarCabecalhoPecas();
  renderizarPecas();
});

document.addEventListener("click", (ev) => {
  if (popoverPecas.hidden) return;
  if (popoverPecas.contains(ev.target)) return;
  fecharPopoverPecas();
});

document.getElementById("btn-limpar-filtros-pecas").addEventListener("click", () => {
  Object.keys(filtrosColunaPecas).forEach((campo) => delete filtrosColunaPecas[campo]);
  renderizarCabecalhoPecas();
  renderizarPecas();
});

// ---------- Carregar / excluir / adicionar ----------
async function carregarPecas() {
  try {
    pecasRegistros = await chamarApi("/api/admin/pecas");
    renderizarCabecalhoPecas();
    renderizarPecas();
  } catch (err) {
    tabelaPecasCorpo.innerHTML = `<tr><td colspan="${COLUNAS_PECAS.length + 1}" class="empty">Erro ao carregar as peças.</td></tr>`;
  }
}

function excluirPeca(tr, pnMrhb) {
  chamarApi(`/api/admin/pecas/${encodeURIComponent(pnMrhb)}`, { method: "DELETE" })
    .then(() => {
      pecasRegistros = pecasRegistros.filter((r) => r.pn_mrhb !== pnMrhb);
      renderizarCabecalhoPecas();
      renderizarPecas();
    })
    .catch((err) => mostrarAlerta(err.message, "error"));
}

formNovaPeca.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const dados = {
    pn_mrhb: document.getElementById("nova_peca_pn").value.trim(),
    cliente: document.getElementById("nova_peca_cliente").value,
    pn_cliente: document.getElementById("nova_peca_pn_cliente").value.trim(),
    responsavel: document.getElementById("nova_peca_responsavel").value.trim(),
  };

  chamarApi("/api/admin/pecas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  })
    .then(() => {
      formNovaPeca.reset();
      mostrarAlerta(`Peça ${dados.pn_mrhb} cadastrada com sucesso.`, "success");
      return carregarPecas();
    })
    .catch((err) => mostrarAlerta(err.message, "error"));
});

// ---------- Edição ----------
const modalPeca = document.getElementById("modal-editar-peca");
const formEditarPeca = document.getElementById("form-editar-peca");
const modalPecaAlert = document.getElementById("modal-peca-alert");

function abrirModalEdicaoPeca(registro) {
  document.getElementById("edit_peca_pn_original").value = registro.pn_mrhb;
  document.getElementById("edit_peca_pn").value = registro.pn_mrhb;
  document.getElementById("edit_peca_cliente").value = registro.cliente || "";
  document.getElementById("edit_peca_pn_cliente").value = registro.pn_cliente || "";
  document.getElementById("edit_peca_responsavel").value = registro.responsavel || "";
  modalPecaAlert.hidden = true;
  modalPeca.hidden = false;
}

function fecharModalPeca() {
  modalPeca.hidden = true;
  formEditarPeca.reset();
}

document.getElementById("modal-peca-fechar").addEventListener("click", fecharModalPeca);
document.getElementById("modal-peca-cancelar").addEventListener("click", fecharModalPeca);
modalPeca.addEventListener("click", (ev) => {
  if (ev.target === modalPeca) fecharModalPeca();
});

formEditarPeca.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const pnOriginal = document.getElementById("edit_peca_pn_original").value;
  const dados = {
    pn_mrhb: document.getElementById("edit_peca_pn").value.trim(),
    cliente: document.getElementById("edit_peca_cliente").value,
    pn_cliente: document.getElementById("edit_peca_pn_cliente").value.trim(),
    responsavel: document.getElementById("edit_peca_responsavel").value.trim(),
  };

  chamarApi(`/api/admin/pecas/${encodeURIComponent(pnOriginal)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  })
    .then(() => {
      fecharModalPeca();
      return carregarPecas();
    })
    .catch((err) => {
      modalPecaAlert.textContent = err.message;
      modalPecaAlert.className = "alert error";
      modalPecaAlert.hidden = false;
    });
});

carregarPecas();
