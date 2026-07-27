const form = document.getElementById("form-reclamacao");
const pnInput = document.getElementById("pn_mrhb");
const pnConfirmacao = document.getElementById("pn_confirmacao");
const pnConfirmacaoIcone = document.getElementById("pn_confirmacao_icone");
const pnConfirmacaoTitulo = document.getElementById("pn_confirmacao_titulo");
const pnConfirmacaoDetalhe = document.getElementById("pn_confirmacao_detalhe");
const clienteInput = document.getElementById("cliente");
const pnClienteInput = document.getElementById("pn_cliente");
const responsavelInput = document.getElementById("responsavel_cliente");
const alertBox = document.getElementById("alert");

function mostrarConfirmacaoPn(estado, titulo, detalhe) {
  pnConfirmacao.hidden = false;
  pnConfirmacao.className = `pn-confirmacao ${estado}`;
  pnConfirmacaoIcone.textContent = estado === "ok" ? "✓" : "!";
  pnConfirmacaoTitulo.textContent = titulo;
  pnConfirmacaoDetalhe.textContent = detalhe || "";
}

function esconderConfirmacaoPn() {
  pnConfirmacao.hidden = true;
}

// Revelação progressiva por seção: "Classificação" só aparece depois que
// "Descrição do Defeito" (última pergunta de "Identificação") é preenchida;
// "Detalhes da Medição" só aparece depois de "Tipo de Reclamação" (última
// pergunta de "Classificação"). Reduz a sensação de formulário longo.
function revelarSecao(classe) {
  document.querySelectorAll(`.${classe}`).forEach((el) => { el.hidden = false; });
}

function esconderSecoesReveladas() {
  document.querySelectorAll(".form-secao-2, .form-secao-3").forEach((el) => { el.hidden = true; });
}

const CAMPO_QUE_REVELA_SECAO = {
  descricao_defeito: "form-secao-2",
  tipo_reclamacao: "form-secao-3",
};

// Reforço para quem sai do campo sem apertar Enter (clique/Tab): o avanço por
// Enter já revela a próxima seção via focarProximoCampo, isso cobre o resto.
document.getElementById("descricao_defeito").addEventListener("blur", (ev) => {
  if (ev.target.value.trim()) revelarSecao("form-secao-2");
});

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
    esconderConfirmacaoPn();
    return;
  }
  try {
    const res = await fetch(`/api/pecas/${encodeURIComponent(pn)}`);
    const dados = await res.json();
    if (dados.encontrado) {
      clienteInput.value = dados.cliente || "";
      pnClienteInput.value = dados.pn_cliente || "";
      responsavelInput.value = dados.responsavel || "";
      mostrarConfirmacaoPn("ok", dados.cliente, dados.responsavel ? `Responsável: ${dados.responsavel}` : "");
    } else {
      mostrarConfirmacaoPn("miss", "PN não encontrado", "Cadastre a peça na área Administrador antes de continuar.");
    }
  } catch (err) {
    mostrarConfirmacaoPn("miss", "Erro de conexão", "Não foi possível consultar a lista de peças.");
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
    esconderConfirmacaoPn();
    esconderSecoesReveladas();
    destacarTipoReclamacao(tipoReclamacaoSelect);
    atualizarAvisoSemNotificacao();
  } catch (err) {
    mostrarAlerta("Erro de conexão com o servidor.", "error");
  }
});

document.getElementById("btn-limpar").addEventListener("click", () => {
  form.reset();
  document.getElementById("data_abertura").valueAsDate = new Date();
  esconderConfirmacaoPn();
  esconderSecoesReveladas();
  alertBox.hidden = true;
  destacarTipoReclamacao(tipoReclamacaoSelect);
  atualizarAvisoSemNotificacao();
});

// Destaque por cor do Tipo de Reclamação: Formal = vermelho, Informal = amarelo.
// A mesma cor sobe para uma borda no topo do formulário inteiro, dando uma
// noção de severidade do caso à primeira vista, sem precisar rolar até o campo.
const tipoReclamacaoSelect = document.getElementById("tipo_reclamacao");

function destacarTipoReclamacao(select) {
  select.classList.remove("tipo-reclamacao-formal", "tipo-reclamacao-informal");
  form.classList.remove("severidade-formal", "severidade-informal");
  if (select.value === "Formal") {
    select.classList.add("tipo-reclamacao-formal");
    form.classList.add("severidade-formal");
  } else if (select.value === "Informal") {
    select.classList.add("tipo-reclamacao-informal");
    form.classList.add("severidade-informal");
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
  if (CAMPO_QUE_REVELA_SECAO[nomeAtual]) revelarSecao(CAMPO_QUE_REVELA_SECAO[nomeAtual]);

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
