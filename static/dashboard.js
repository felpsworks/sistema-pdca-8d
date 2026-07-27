const SVGNS = "http://www.w3.org/2000/svg";

// Paleta categórica validada (skill de dataviz) — ordem fixa, nunca reordenada
// por filtro. Formal/Informal reaproveitam o vermelho/amarelo já usados nos
// badges do Gerenciador; os demais tipos recebem as cores restantes na ordem.
const COR_AZUL = "#2a78d6";
const COR_VERDE = "#008300";
const COR_MAGENTA = "#e87ba4";
const COR_AMARELO = "#eda100";
const COR_AQUA = "#1baf7a";
const COR_LARANJA = "#eb6834";
const COR_VIOLETA = "#4a3aa7";
const COR_VERMELHO = "#e34948";

const COR_STATUS_FECHADO = "#0ca30c";
const COR_STATUS_ATRASADO = "#d03b3b";
const COR_STATUS_NO_PRAZO = COR_AZUL;

const CORES_TIPO_RECLAMACAO = {
  Formal: COR_VERMELHO,
  Informal: COR_AMARELO,
  Informativo: COR_AZUL,
  Alerta: COR_LARANJA,
  Disputa: COR_VIOLETA,
  Logística: COR_AQUA,
};
const COR_TIPO_PADRAO = "#898781"; // categoria não prevista (lista pode crescer via Administrador)

function el(tag, attrs = {}, filhos = []) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  filhos.forEach((f) => node.appendChild(f));
  return node;
}

function texto(x, y, conteudo, attrs = {}) {
  // "fill" vai como style inline (não como atributo de apresentação): a regra
  // CSS ".dash-svg text" tem mais especificidade que um atributo fill="" solto
  // e sempre vencia, deixando texto branco (dentro de barra colorida) cinza
  // e ilegível. style inline sempre ganha da folha de estilo, garantindo a cor certa.
  const { fill, ...outros } = attrs;
  const node = el("text", { x, y, ...outros });
  if (fill) node.style.fill = fill;
  node.textContent = conteudo; // nunca innerHTML — rótulos vêm dos dados
  return node;
}

// Caminho de barra horizontal com ponta arredondada só do lado que NÃO
// encosta na base (esquerda = base fixa, direita = ponta arredondada).
function pathBarraHorizontal(x, y, w, h, r) {
  const raio = Math.min(r, w > 0 ? w : 0, h / 2);
  if (w <= 0) return `M${x},${y} h0 v${h} h0 Z`;
  if (raio <= 0) return `M${x},${y} h${w} v${h} h${-w} Z`;
  return [
    `M${x},${y}`,
    `H${x + w - raio}`,
    `Q${x + w},${y} ${x + w},${y + raio}`,
    `V${y + h - raio}`,
    `Q${x + w},${y + h} ${x + w - raio},${y + h}`,
    `H${x}`,
    `Z`,
  ].join(" ");
}

// --- Tooltip compartilhado -------------------------------------------------
const tooltip = document.getElementById("dash-tooltip");

function mostrarTooltip(evento, tituloTexto, linhas) {
  tooltip.innerHTML = "";
  const titulo = document.createElement("strong");
  titulo.textContent = tituloTexto;
  tooltip.appendChild(titulo);
  linhas.forEach((linha) => {
    const p = document.createElement("div");
    p.textContent = linha;
    tooltip.appendChild(p);
  });
  tooltip.hidden = false;
  posicionarTooltip(evento);
}

function posicionarTooltip(evento) {
  const margem = 14;
  let x = evento.clientX + margem;
  let y = evento.clientY + margem;
  if (x + 240 > window.innerWidth) x = evento.clientX - 240 - margem;
  if (y + 80 > window.innerHeight) y = evento.clientY - 80 - margem;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function esconderTooltip() {
  tooltip.hidden = true;
}

function vazio(container, mensagem) {
  container.innerHTML = "";
  const div = document.createElement("div");
  div.className = "dash-chart-vazio";
  div.textContent = mensagem;
  container.appendChild(div);
}

// --- Gráfico: barras horizontais (1 valor por linha) -----------------------
function renderizarBarrasHorizontais(container, itens, { corDe, sufixo = "" }) {
  if (!itens.length) return vazio(container, "Sem dados no período selecionado.");

  const larguraTotal = container.clientWidth || 480;
  const alturaBarra = 20;
  const espacamento = 12;
  const colunaRotulo = 130;
  const margemDireita = 46;
  const alturaTotal = itens.length * (alturaBarra + espacamento) + espacamento;
  const larguraBarraArea = Math.max(larguraTotal - colunaRotulo - margemDireita, 40);
  const maxValor = Math.max(...itens.map((i) => i.valor), 1);

  container.innerHTML = "";
  const svg = el("svg", {
    class: "dash-svg",
    viewBox: `0 0 ${larguraTotal} ${alturaTotal}`,
    width: "100%",
    height: alturaTotal,
    role: "img",
  });

  itens.forEach((item, i) => {
    const y = espacamento + i * (alturaBarra + espacamento);
    const largura = (item.valor / maxValor) * larguraBarraArea;
    const cor = corDe(item);

    svg.appendChild(
      texto(colunaRotulo - 10, y + alturaBarra / 2 + 4, item.rotulo, { "text-anchor": "end" })
    );

    const grupo = el("g", { class: "dash-mark" });
    const barra = el("path", {
      d: pathBarraHorizontal(colunaRotulo, y, largura, alturaBarra, 4),
      fill: cor,
    });
    grupo.appendChild(barra);
    grupo.appendChild(
      texto(colunaRotulo + largura + 8, y + alturaBarra / 2 + 4, `${item.valor}${sufixo}`, {
        class: "dash-valor-rotulo",
      })
    );

    grupo.addEventListener("pointermove", (ev) => mostrarTooltip(ev, item.rotulo, [`${item.valor}${sufixo}`]));
    grupo.addEventListener("pointerleave", esconderTooltip);
    svg.appendChild(grupo);
  });

  container.appendChild(svg);
}

// --- Gráfico: barra única empilhada horizontal (status) --------------------
function renderizarBarraEmpilhada(container, segmentos) {
  const total = segmentos.reduce((soma, s) => soma + s.valor, 0);
  if (!total) return vazio(container, "Sem reclamações Formais/Informais no período selecionado.");

  const largura = container.clientWidth || 480;
  const alturaBarra = 32;
  const gap = 2;
  const y = 34;
  const alturaTotal = y + alturaBarra + 40;

  container.innerHTML = "";
  const svg = el("svg", {
    class: "dash-svg",
    viewBox: `0 0 ${largura} ${alturaTotal}`,
    width: "100%",
    height: alturaTotal,
  });

  let x = 0;
  segmentos.forEach((seg, i) => {
    if (seg.valor <= 0) return;
    const w = (seg.valor / total) * largura;
    const ehUltimoVisivel = segmentos.slice(i + 1).every((s) => s.valor <= 0);
    const wAjustada = Math.max(w - (i > 0 ? gap : 0), 1);

    const grupo = el("g", { class: "dash-mark" });
    const d = ehUltimoVisivel
      ? pathBarraHorizontal(x, y, wAjustada, alturaBarra, 4)
      : `M${x},${y} h${wAjustada} v${alturaBarra} h${-wAjustada} Z`;
    grupo.appendChild(el("path", { d, fill: seg.cor }));

    const pct = Math.round((seg.valor / total) * 100);
    if (w > 46) {
      grupo.appendChild(
        texto(x + wAjustada / 2, y + alturaBarra / 2 + 4, `${seg.valor}`, {
          "text-anchor": "middle",
          fill: "#fff",
          "font-weight": "700",
        })
      );
    }
    grupo.addEventListener("pointermove", (ev) => mostrarTooltip(ev, seg.rotulo, [`${seg.valor} reclamações (${pct}%)`]));
    grupo.addEventListener("pointerleave", esconderTooltip);
    svg.appendChild(grupo);

    x += w;
  });

  // legenda
  let lx = 0;
  const ly = y + alturaBarra + 22;
  segmentos.forEach((seg) => {
    const grupoLegenda = el("g");
    grupoLegenda.appendChild(el("rect", { x: lx, y: ly - 10, width: 10, height: 10, rx: 2, fill: seg.cor }));
    const rotuloTxt = texto(lx + 15, ly, `${seg.rotulo} (${seg.valor})`, {});
    grupoLegenda.appendChild(rotuloTxt);
    svg.appendChild(grupoLegenda);
    lx += 15 + seg.rotulo.length * 6.4 + 40;
  });

  container.appendChild(svg);
}

// --- Gráfico: linha (tendência mensal) --------------------------------------
const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function renderizarLinha(container, pontos) {
  if (!pontos.length) return vazio(container, "Sem dados no período selecionado.");

  const largura = container.clientWidth || 480;
  const altura = 220;
  const margem = { topo: 16, baixo: 30, esquerda: 34, direita: 16 };
  const areaW = largura - margem.esquerda - margem.direita;
  const areaH = altura - margem.topo - margem.baixo;
  const maxValor = Math.max(...pontos.map((p) => p.total), 1);
  const passoX = pontos.length > 1 ? areaW / (pontos.length - 1) : 0;

  const coordX = (i) => margem.esquerda + i * passoX;
  const coordY = (v) => margem.topo + areaH - (v / maxValor) * areaH;

  container.innerHTML = "";
  const svg = el("svg", { class: "dash-svg", viewBox: `0 0 ${largura} ${altura}`, width: "100%", height: altura });

  // gridlines horizontais (0, metade, máximo)
  [0, 0.5, 1].forEach((f) => {
    const y = margem.topo + areaH - f * areaH;
    svg.appendChild(el("line", { x1: margem.esquerda, x2: largura - margem.direita, y1: y, y2: y, class: "dash-eixo" }));
    svg.appendChild(texto(margem.esquerda - 8, y + 3, String(Math.round(maxValor * f)), { "text-anchor": "end" }));
  });

  const linha = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${coordX(i)},${coordY(p.total)}`).join(" ");
  svg.appendChild(el("path", { d: linha, fill: "none", stroke: COR_AZUL, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));

  pontos.forEach((p, i) => {
    const [ano, mes] = p.mes.split("-");
    const rotuloMes = `${MESES_ABREV[parseInt(mes, 10) - 1]}/${ano.slice(2)}`;
    const cx = coordX(i);
    const cy = coordY(p.total);

    const ponto = el("circle", { cx, cy, r: 5, fill: "#fff", stroke: COR_AZUL, "stroke-width": 2, class: "dash-mark" });
    ponto.addEventListener("pointermove", (ev) => mostrarTooltip(ev, rotuloMes, [`${p.total} reclamações`]));
    ponto.addEventListener("pointerleave", esconderTooltip);
    svg.appendChild(ponto);

    if (pontos.length <= 14 || i % Math.ceil(pontos.length / 12) === 0) {
      svg.appendChild(texto(cx, altura - 8, rotuloMes, { "text-anchor": "middle" }));
    }
  });

  container.appendChild(svg);
}

// --- Gráfico: gargalo por etapa (barras empilhadas horizontais) ------------
function renderizarGargaloEtapas(container, itens) {
  if (!itens.length) return vazio(container, "Nenhuma reclamação Formal/Informal em aberto no período selecionado.");

  const larguraTotal = container.clientWidth || 900;
  const alturaBarra = 18;
  const espacamento = 12;
  const colunaRotulo = 150;
  const margemDireita = 50;
  const alturaTotal = itens.length * (alturaBarra + espacamento) + espacamento;
  const larguraBarraArea = Math.max(larguraTotal - colunaRotulo - margemDireita, 40);
  const maxValor = Math.max(...itens.map((i) => i.no_prazo + i.atrasado), 1);
  const gap = 2;

  container.innerHTML = "";
  const svg = el("svg", { class: "dash-svg", viewBox: `0 0 ${larguraTotal} ${alturaTotal}`, width: "100%", height: alturaTotal });

  itens.forEach((item, i) => {
    const y = espacamento + i * (alturaBarra + espacamento);
    const total = item.no_prazo + item.atrasado;
    const wNoPrazo = (item.no_prazo / maxValor) * larguraBarraArea;
    const wAtrasado = (item.atrasado / maxValor) * larguraBarraArea;

    svg.appendChild(texto(colunaRotulo - 10, y + alturaBarra / 2 + 4, item.etapa, { "text-anchor": "end" }));

    let x = colunaRotulo;
    if (item.no_prazo > 0) {
      const grupo = el("g", { class: "dash-mark" });
      const d = item.atrasado > 0
        ? `M${x},${y} h${Math.max(wNoPrazo - gap, 1)} v${alturaBarra} h${-Math.max(wNoPrazo - gap, 1)} Z`
        : pathBarraHorizontal(x, y, wNoPrazo, alturaBarra, 4);
      grupo.appendChild(el("path", { d, fill: COR_STATUS_NO_PRAZO }));
      grupo.addEventListener("pointermove", (ev) => mostrarTooltip(ev, item.etapa, [`${item.no_prazo} no prazo`]));
      grupo.addEventListener("pointerleave", esconderTooltip);
      svg.appendChild(grupo);
    }
    x += wNoPrazo;
    if (item.atrasado > 0) {
      const grupo = el("g", { class: "dash-mark" });
      grupo.appendChild(el("path", { d: pathBarraHorizontal(x, y, wAtrasado, alturaBarra, 4), fill: COR_STATUS_ATRASADO }));
      grupo.addEventListener("pointermove", (ev) => mostrarTooltip(ev, item.etapa, [`${item.atrasado} atrasada(s)`]));
      grupo.addEventListener("pointerleave", esconderTooltip);
      svg.appendChild(grupo);
    }

    svg.appendChild(texto(colunaRotulo + wNoPrazo + wAtrasado + 8, y + alturaBarra / 2 + 4, String(total), { class: "dash-valor-rotulo" }));
  });

  container.appendChild(svg);
}

// --- KPIs --------------------------------------------------------------
// "kpi" é a chave usada em /api/dashboard/detalhe?kpi=... — quando ausente
// (Média por Mês) o card não é clicável, pois não representa uma lista de
// reclamações, e sim uma taxa calculada.
function renderizarKpis(kpis) {
  const container = document.getElementById("dash-kpis");
  container.innerHTML = "";
  const cartoes = [
    { rotulo: "Total de Reclamações", valor: kpis.total_reclamacoes, kpi: "total" },
    { rotulo: "Passíveis de 8D (Formal + Informal)", valor: kpis.passiveis_8d, kpi: "passiveis" },
    { rotulo: "8D Fechados", valor: kpis.fechados_8d, classe: "dash-kpi-ok", kpi: "fechados" },
    { rotulo: "Aguardando Finalização", valor: kpis.aguardando_finalizacao, kpi: "aguardando" },
    { rotulo: "8D Atrasados", valor: kpis.atrasados_8d, classe: "dash-kpi-critico", kpi: "atrasados" },
    { rotulo: "Média por Mês", valor: kpis.media_por_mes },
  ];
  cartoes.forEach((c) => {
    const div = document.createElement("div");
    div.className = `dash-kpi ${c.classe || ""} ${c.kpi ? "dash-kpi-clicavel" : ""}`;
    const rotulo = document.createElement("div");
    rotulo.className = "dash-kpi-rotulo";
    rotulo.textContent = c.rotulo;
    const valor = document.createElement("div");
    valor.className = "dash-kpi-valor";
    valor.textContent = c.valor;
    div.append(rotulo, valor);
    if (c.kpi) {
      div.tabIndex = 0;
      div.setAttribute("role", "button");
      div.addEventListener("click", () => abrirModalDetalhe(c.kpi, c.rotulo));
      div.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abrirModalDetalhe(c.kpi, c.rotulo); }
      });
    }
    container.appendChild(div);
  });
}

// --- Drill-down: modal com as reclamações por trás de um card ------------
const modalDash = document.getElementById("modal-dash-detalhe");
const modalDashTitulo = document.getElementById("modal-dash-titulo");
const modalDashSubtitulo = document.getElementById("modal-dash-subtitulo");
const modalDashCabecalho = document.getElementById("modal-dash-cabecalho");
const modalDashCorpo = document.getElementById("modal-dash-corpo");

function formatarDataBr(iso) {
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  return dia ? `${dia}/${mes}/${ano}` : iso;
}

const COLUNAS_MODAL_DASH = [
  { campo: "id_mrhb", rotulo: "ID MRHB" },
  { campo: "numero_notificacao", rotulo: "Nº Notif." },
  { campo: "data_abertura", rotulo: "Data", formata: formatarDataBr },
  { campo: "cliente", rotulo: "Cliente" },
  { campo: "pn_mrhb", rotulo: "PN MRHB" },
  { campo: "descricao_defeito", rotulo: "Descrição do Defeito" },
  { campo: "tipo_reclamacao", rotulo: "Tipo" },
  { campo: "etapa_atual", rotulo: "Etapa Atual" },
  { campo: "prazo_etapa_atual", rotulo: "Prazo da Etapa", formata: formatarDataBr },
];

async function abrirModalDetalhe(kpi, tituloCard) {
  modalDashTitulo.textContent = tituloCard;
  modalDashSubtitulo.textContent = "Carregando...";
  modalDashCabecalho.innerHTML = "";
  modalDashCorpo.innerHTML = `<tr><td class="loading">Carregando...</td></tr>`;
  modalDash.hidden = false;

  const params = new URLSearchParams();
  params.set("kpi", kpi);
  if (estado.responsavel) params.set("responsavel", estado.responsavel);
  if (estado.cliente) params.set("cliente", estado.cliente);
  const { data_inicio, data_fim } = calcularIntervaloPeriodo(estado.periodo);
  if (data_inicio) params.set("data_inicio", data_inicio);
  if (data_fim) params.set("data_fim", data_fim);

  try {
    const res = await fetch(`/api/dashboard/detalhe?${params.toString()}`);
    const dados = await res.json();
    if (!res.ok) throw new Error(dados.erro || "Não foi possível carregar os dados.");

    modalDashSubtitulo.textContent = `${dados.total} ${dados.total === 1 ? "reclamação" : "reclamações"}`;

    const linhaCabecalho = document.createElement("tr");
    COLUNAS_MODAL_DASH.forEach((c) => {
      const th = document.createElement("th");
      th.textContent = c.rotulo;
      linhaCabecalho.appendChild(th);
    });
    modalDashCabecalho.innerHTML = "";
    modalDashCabecalho.appendChild(linhaCabecalho);

    modalDashCorpo.innerHTML = "";
    if (!dados.reclamacoes.length) {
      modalDashCorpo.innerHTML = `<tr><td colspan="${COLUNAS_MODAL_DASH.length}" class="empty">Nenhuma reclamação neste recorte.</td></tr>`;
      return;
    }
    dados.reclamacoes.forEach((r) => {
      const tr = document.createElement("tr");
      COLUNAS_MODAL_DASH.forEach((c) => {
        const td = document.createElement("td");
        const valorBruto = r[c.campo];
        td.textContent = valorBruto ? (c.formata ? c.formata(valorBruto) : valorBruto) : "—";
        if (c.campo === "etapa_atual" && r.etapa_atrasada) td.className = "etapa-atrasada";
        if (c.campo === "id_mrhb") td.className = "id-mrhb";
        if (c.campo === "descricao_defeito") td.className = "descricao-truncada";
        tr.appendChild(td);
      });
      modalDashCorpo.appendChild(tr);
    });
  } catch (err) {
    modalDashSubtitulo.textContent = "";
    modalDashCorpo.innerHTML = `<tr><td class="empty">${err.message}</td></tr>`;
  }
}

function fecharModalDash() {
  modalDash.hidden = true;
}

document.getElementById("modal-dash-fechar").addEventListener("click", fecharModalDash);
modalDash.addEventListener("click", (ev) => {
  if (ev.target === modalDash) fecharModalDash();
});

// --- Filtros -------------------------------------------------------------
const estado = { responsavel: "", cliente: "", periodo: "todos" };
let clientesPorResponsavel = {};
let todosClientes = [];

function primeiroDiaMesesAtras(n) {
  const hoje = new Date();
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function calcularIntervaloPeriodo(periodo) {
  const hoje = new Date();
  const hojeIso = hoje.toISOString().slice(0, 10);
  if (periodo === "mes") return { data_inicio: primeiroDiaMesesAtras(0), data_fim: hojeIso };
  if (periodo === "3meses") return { data_inicio: primeiroDiaMesesAtras(2), data_fim: hojeIso };
  if (periodo === "6meses") return { data_inicio: primeiroDiaMesesAtras(5), data_fim: hojeIso };
  if (periodo === "ano") return { data_inicio: `${hoje.getFullYear()}-01-01`, data_fim: hojeIso };
  return {};
}

function popularSelectCliente() {
  const select = document.getElementById("dash-filtro-cliente");
  const listaClientes = estado.responsavel ? (clientesPorResponsavel[estado.responsavel] || []) : todosClientes;
  const valorAtual = select.value;
  select.innerHTML = "";
  select.appendChild(new Option("Todos os clientes", ""));
  listaClientes.forEach((c) => select.appendChild(new Option(c, c)));
  if (listaClientes.includes(valorAtual)) select.value = valorAtual;
  else estado.cliente = "";
}

function renderizarChipsResponsavel(responsaveis) {
  const container = document.getElementById("dash-chips-responsavel");
  container.innerHTML = "";

  function criarChip(valor, rotulo) {
    const label = document.createElement("label");
    label.className = "chip";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "dash-responsavel";
    input.value = valor;
    input.checked = estado.responsavel === valor;
    const span = document.createElement("span");
    span.textContent = rotulo;
    label.append(input, span);
    input.addEventListener("change", () => {
      estado.responsavel = valor;
      popularSelectCliente();
      carregarDashboard();
    });
    return label;
  }

  container.appendChild(criarChip("", "Todos"));
  responsaveis.forEach((r) => container.appendChild(criarChip(r, r)));
}

async function carregarFiltros() {
  const res = await fetch("/api/dashboard/filtros");
  const dados = await res.json();
  clientesPorResponsavel = dados.clientes_por_responsavel;
  todosClientes = dados.todos_clientes;
  renderizarChipsResponsavel(dados.responsaveis);
  popularSelectCliente();
}

let ultimosDados = null;

function renderizarTudo(dados) {
  renderizarKpis(dados.kpis);

  renderizarBarraEmpilhada(document.getElementById("dash-chart-status"), [
    { rotulo: "Fechado", valor: dados.status_8d.fechado, cor: COR_STATUS_FECHADO },
    { rotulo: "No Prazo", valor: dados.status_8d.no_prazo, cor: COR_STATUS_NO_PRAZO },
    { rotulo: "Atrasado", valor: dados.status_8d.atrasado, cor: COR_STATUS_ATRASADO },
  ]);

  renderizarLinha(document.getElementById("dash-chart-mes"), dados.por_mes);

  const porTipoOrdenado = [...dados.por_tipo_reclamacao].sort((a, b) => b.total - a.total);
  renderizarBarrasHorizontais(document.getElementById("dash-chart-tipo"), porTipoOrdenado.map((t) => ({ rotulo: t.tipo, valor: t.total })), {
    corDe: (item) => CORES_TIPO_RECLAMACAO[item.rotulo] || COR_TIPO_PADRAO,
  });

  renderizarBarrasHorizontais(document.getElementById("dash-chart-cliente"), dados.por_cliente.map((c) => ({ rotulo: c.cliente, valor: c.total })), {
    corDe: () => COR_AZUL,
  });

  renderizarGargaloEtapas(document.getElementById("dash-chart-etapas"), dados.por_etapa);
}

async function carregarDashboard() {
  const params = new URLSearchParams();
  if (estado.responsavel) params.set("responsavel", estado.responsavel);
  if (estado.cliente) params.set("cliente", estado.cliente);
  const { data_inicio, data_fim } = calcularIntervaloPeriodo(estado.periodo);
  if (data_inicio) params.set("data_inicio", data_inicio);
  if (data_fim) params.set("data_fim", data_fim);

  const res = await fetch(`/api/dashboard?${params.toString()}`);
  ultimosDados = await res.json();
  renderizarTudo(ultimosDados);
}

document.getElementById("dash-filtro-cliente").addEventListener("change", (ev) => {
  estado.cliente = ev.target.value;
  carregarDashboard();
});

document.getElementById("dash-filtro-periodo").addEventListener("change", (ev) => {
  estado.periodo = ev.target.value;
  carregarDashboard();
});

// No resize só redesenha com os dados já carregados (sem refazer a consulta)
let redimensionamentoPendente = null;
window.addEventListener("resize", () => {
  clearTimeout(redimensionamentoPendente);
  redimensionamentoPendente = setTimeout(() => {
    if (ultimosDados) renderizarTudo(ultimosDados);
  }, 150);
});

(async function iniciar() {
  await carregarFiltros();
  await carregarDashboard();
})();
