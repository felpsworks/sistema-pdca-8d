const form = document.getElementById("form-reclamacao");
const pnInput = document.getElementById("pn_mrhb");
const pnStatus = document.getElementById("pn_status");
const clienteInput = document.getElementById("cliente");
const pnClienteInput = document.getElementById("pn_cliente");
const responsavelInput = document.getElementById("responsavel_cliente");
const alertBox = document.getElementById("alert");

// Usa data local (não UTC) para não "pular" um dia à noite em fusos negativos
function hojeISO() {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

document.getElementById("data_abertura").value = hojeISO();

async function buscarPeca() {
  const pn = pnInput.value.trim();
  clienteInput.value = "";
  pnClienteInput.value = "";
  responsavelInput.value = "";

  if (!pn) {
    pnStatus.textContent = "";
    return;
  }
  try {
    const res = await fetch(`/api/pecas/${encodeURIComponent(pn)}`);
    const dados = await res.json();
    if (dados.encontrado) {
      clienteInput.value = dados.cliente || "";
      pnClienteInput.value = dados.pn_cliente || "";
      responsavelInput.value = dados.responsavel || "";
      pnStatus.textContent = `Cliente: ${dados.cliente}${dados.responsavel ? " · Responsável: " + dados.responsavel : ""}`;
      pnStatus.className = "hint ok";
    } else {
      pnStatus.textContent = "PN não encontrado na Lista PN — cadastre a peça antes de continuar.";
      pnStatus.className = "hint miss";
    }
  } catch (err) {
    pnStatus.textContent = "Não foi possível consultar a lista de peças.";
    pnStatus.className = "hint miss";
  }
}

pnInput.addEventListener("change", buscarPeca);

// Atalho "SEM NOTIFICAÇÃO" com aviso para lembrar de corrigir depois
const numeroNotificacaoInput = document.getElementById("numero_notificacao");
const btnSemNotificacao = document.getElementById("btn-sem-notificacao");
const avisoSemNotificacao = document.getElementById("aviso_sem_notificacao");

function atualizarAvisoSemNotificacao() {
  avisoSemNotificacao.hidden = numeroNotificacaoInput.value.trim().toUpperCase() !== "SEM NOTIFICAÇÃO";
}

btnSemNotificacao.addEventListener("click", () => {
  numeroNotificacaoInput.value = "SEM NOTIFICAÇÃO";
  atualizarAvisoSemNotificacao();
  numeroNotificacaoInput.focus();
});

numeroNotificacaoInput.addEventListener("input", atualizarAvisoSemNotificacao);

function mostrarAlerta(mensagem, tipo) {
  alertBox.textContent = mensagem;
  alertBox.className = `alert ${tipo}`;
  alertBox.hidden = false;
  alertBox.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const dados = Object.fromEntries(new FormData(form).entries());

  try {
    const res = await fetch("/api/reclamacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    const resposta = await res.json();

    if (!res.ok) {
      mostrarAlerta(resposta.erro || "Não foi possível cadastrar a reclamação.", "error");
      return;
    }

    mostrarAlerta(`Reclamação cadastrada com sucesso! ID MRHB: ${resposta.id_mrhb}`, "success");
    form.reset();
    document.getElementById("data_abertura").value = hojeISO();
    pnStatus.textContent = "";
    destacarTipoReclamacao(tipoReclamacaoSelect);
    atualizarAvisoSemNotificacao();
  } catch (err) {
    mostrarAlerta("Erro de conexão com o servidor.", "error");
  }
});

document.getElementById("btn-limpar").addEventListener("click", () => {
  form.reset();
  document.getElementById("data_abertura").valueAsDate = new Date();
  pnStatus.textContent = "";
  alertBox.hidden = true;
  destacarTipoReclamacao(tipoReclamacaoSelect);
  atualizarAvisoSemNotificacao();
});

// Destaque por cor do Tipo de Reclamação: Formal = vermelho, Informal = amarelo
const tipoReclamacaoSelect = document.getElementById("tipo_reclamacao");

function destacarTipoReclamacao(select) {
  select.classList.remove("tipo-reclamacao-formal", "tipo-reclamacao-informal");
  if (select.value === "Formal") {
    select.classList.add("tipo-reclamacao-formal");
  } else if (select.value === "Informal") {
    select.classList.add("tipo-reclamacao-informal");
  }
}

tipoReclamacaoSelect.addEventListener("change", () => destacarTipoReclamacao(tipoReclamacaoSelect));

// Avanço automático entre campos (pn_cliente/cliente/responsavel_cliente ficam
// de fora: são preenchidos sozinhos a partir do PN MRHB e não aparecem no formulário)
const ORDEM_CAMPOS = [
  "numero_notificacao",
  "data_abertura",
  "pn_mrhb",
  "descricao_defeito",
  "tipo_pdca",
  "area_responsavel_8d",
  "tipo_problema",
  "tipo_reclamacao",
  "mq_in",
  "mq_us",
  "qtd_reclamada",
];

function elementoDoCampo(nome) {
  return document.getElementById(nome) || form.querySelector(`[name="${nome}"]`);
}

function focarProximoCampo(nomeAtual) {
  const indice = ORDEM_CAMPOS.indexOf(nomeAtual);
  const proximoNome = ORDEM_CAMPOS[indice + 1];
  if (proximoNome) {
    const proximo = elementoDoCampo(proximoNome);
    if (proximo) proximo.focus();
  } else {
    form.requestSubmit();
  }
}

ORDEM_CAMPOS.forEach((nome) => {
  const campo = document.getElementById(nome);

  if (campo) {
    if (campo.tagName === "SELECT") {
      campo.addEventListener("change", () => focarProximoCampo(nome));
    } else if (campo.tagName === "TEXTAREA") {
      campo.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          focarProximoCampo(nome);
        }
      });
    } else {
      campo.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          focarProximoCampo(nome);
        }
      });
    }
    return;
  }

  // Grupo de caixinhas (radio): avança ao escolher uma opção
  form.querySelectorAll(`input[type="radio"][name="${nome}"]`).forEach((radio) => {
    radio.addEventListener("change", () => focarProximoCampo(nome));
  });
});
