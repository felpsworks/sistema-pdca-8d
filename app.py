import sqlite3
from collections import Counter, defaultdict
from datetime import date, timedelta
from functools import wraps

from flask import Flask, jsonify, redirect, render_template, request, session, url_for

from db import OPCOES_PADRAO, get_connection, init_db

app = Flask(__name__)
# Chave usada só para assinar o cookie de sessão do login administrador.
# Para uma implantação real, mover para uma variável de ambiente.
app.secret_key = "pdca-8d-dev-secret-troque-em-producao"

ADMIN_SENHA = "admin123"

# Categorias de listas gerenciáveis pela área Administrador, na ordem em que
# aparecem no painel. O rótulo é só para exibição.
OPCOES_CATEGORIAS = [
    ("tipo_pdca", "Tipo PDCA"),
    ("area_responsavel_8d", "Área Responsável 8D"),
    ("tipo_problema", "Tipo Problema"),
    ("tipo_reclamacao", "Tipo de Reclamação"),
    ("mq_in", "MQ IN"),
    ("mq_us", "MQ US"),
]

TIPO_PDCA_PARA_LETRA = {
    "Reclamação Externa": "E",
    "Reclamação Interna": "I",
    "SESMT": "S",
}

# Etapas do 8D e o prazo (em dias corridos a partir da Data de Abertura),
# na mesma ordem e com os mesmos prazos da aba ETAPAS 8D do Excel original.
ETAPAS_8D = [
    ("Contenção", 1),
    ("Causa Raiz", 2),
    ("Ação Corretiva", 16),
    ("Poka Yoke", 16),
    ("LPA", 17),
    ("Validação", 35),
    ("Trab. Padronizado", 36),
    ("FMEA", 37),
    ("Plano de Controle", 38),
    ("Lições Aprendidas", 43),
    ("8D Fechado", 44),
]

# Etapas que nem toda reclamação precisa (ficam desabilitadas por padrão em
# reclamações novas; o responsável habilita quando o caso realmente exigir).
ETAPAS_FLEXIVEIS = {"Poka Yoke", "LPA", "Trab. Padronizado", "FMEA", "Plano de Controle"}

# Regra de negócio do Dashboard: só Formal e Informal exigem 8D completo — os
# demais tipos (Informativo, Alerta, Disputa, Logística) não entram nas métricas
# de 8D (passíveis / fechados / atrasados / gargalo por etapa).
TIPOS_PASSIVEIS_8D = {"Formal", "Informal"}
ETAPA_FECHAMENTO_8D = "8D Fechado"

CAMPOS_OBRIGATORIOS = [
    ("numero_notificacao", "Nº da Notificação"),
    ("data_abertura", "Data"),
    ("pn_mrhb", "PN MRHB"),
    ("descricao_defeito", "Descrição do Defeito"),
    ("tipo_pdca", "Tipo PDCA"),
    ("cliente", "Cliente"),
    ("area_responsavel_8d", "Área Responsável 8D"),
    ("tipo_problema", "Tipo Problema"),
    ("tipo_reclamacao", "Tipo de Reclamação"),
    ("mq_in", "MQ IN"),
    ("mq_us", "MQ US"),
    ("qtd_reclamada", "Qtd. Reclamada"),
]

# Colunas editáveis da reclamação (id e id_mrhb são tratados à parte).
# estratificacao_defeito não faz mais parte do formulário e fica de fora daqui
# de propósito, para não ser sobrescrita com vazio nas reclamações antigas.
CAMPOS_RECLAMACAO = [
    "numero_notificacao",
    "data_abertura",
    "pn_mrhb",
    "pn_cliente",
    "descricao_defeito",
    "tipo_pdca",
    "cliente",
    "area_responsavel_8d",
    "responsavel_cliente",
    "tipo_problema",
    "tipo_reclamacao",
    "mq_in",
    "mq_us",
    "qtd_reclamada",
]

CAMPOS_ROTULOS = {
    "id_mrhb": "ID MRHB",
    "numero_notificacao": "Nº Notificação",
    "data_abertura": "Data",
    "pn_mrhb": "PN MRHB",
    "pn_cliente": "PN Cliente",
    "descricao_defeito": "Descrição do Defeito",
    "tipo_pdca": "Tipo PDCA",
    "cliente": "Cliente",
    "area_responsavel_8d": "Área Responsável 8D",
    "responsavel_cliente": "Responsável Cliente",
    "tipo_problema": "Tipo Problema",
    "tipo_reclamacao": "Tipo de Reclamação",
    "mq_in": "MQ IN",
    "mq_us": "MQ US",
    "qtd_reclamada": "Qtd. Reclamada",
}


def calcular_prazo(data_abertura: str, dias: int) -> str:
    ano, mes, dia = (int(x) for x in data_abertura.split("-"))
    return (date(ano, mes, dia) + timedelta(days=dias)).isoformat()


def criar_etapas_8d(conn, reclamacao_id, data_abertura):
    for ordem, (nome, dias) in enumerate(ETAPAS_8D, start=1):
        aplicavel = 0 if nome in ETAPAS_FLEXIVEIS else 1
        conn.execute(
            "INSERT INTO etapas_8d (reclamacao_id, etapa, ordem, prazo, aplicavel) VALUES (?, ?, ?, ?, ?)",
            (reclamacao_id, nome, ordem, calcular_prazo(data_abertura, dias), aplicavel),
        )


def recalcular_prazos_8d(conn, reclamacao_id, data_abertura):
    for nome, dias in ETAPAS_8D:
        conn.execute(
            "UPDATE etapas_8d SET prazo = ? WHERE reclamacao_id = ? AND etapa = ?",
            (calcular_prazo(data_abertura, dias), reclamacao_id, nome),
        )


def registrar_alteracao(conn, reclamacao_id, id_mrhb, tipo_acao, campo=None, valor_anterior=None, valor_novo=None, motivo=None):
    conn.execute(
        """
        INSERT INTO historico_alteracoes
            (reclamacao_id, id_mrhb, tipo_acao, campo, valor_anterior, valor_novo, motivo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (reclamacao_id, id_mrhb, tipo_acao, campo, valor_anterior, valor_novo, motivo),
    )


def gerar_id_mrhb(conn, data_abertura: str, tipo_pdca: str) -> str:
    """Mesma lógica da macro Cadastrar_Reclamacao do Excel original:
    ID = Tipo-<mês><'0'><sequência><ano>, sequência = nº de reclamações já
    abertas no mesmo mês/ano, +1. Se esse ID já existir (o histórico
    importado do Excel tem lacunas na numeração), avança a sequência até
    achar um ID livre.
    """
    ano, mes, _dia = data_abertura.split("-")
    mes = str(int(mes))  # remove zero a esquerda, igual a macro original
    ano = str(int(ano))
    letra = TIPO_PDCA_PARA_LETRA.get(tipo_pdca, "A")

    seq = conn.execute(
        """
        SELECT COUNT(*) FROM reclamacoes
        WHERE strftime('%Y', data_abertura) = ? AND CAST(strftime('%m', data_abertura) AS INTEGER) = ?
        """,
        (ano, int(mes)),
    ).fetchone()[0] + 1

    while True:
        candidato = f"{letra}-{mes}0{seq}{ano}"
        existe = conn.execute(
            "SELECT 1 FROM reclamacoes WHERE id_mrhb = ?", (candidato,)
        ).fetchone()
        if not existe:
            return candidato
        seq += 1


def carregar_opcoes(conn):
    """Lê as listas gerenciáveis (Tipo PDCA, MQ IN, etc.) do banco, na ordem
    cadastrada, para alimentar os campos do formulário."""
    opcoes = {}
    for categoria, _rotulo in OPCOES_CATEGORIAS:
        linhas = conn.execute(
            "SELECT valor FROM opcoes_lista WHERE categoria = ? ORDER BY ordem, id", (categoria,)
        ).fetchall()
        opcoes[categoria] = [linha["valor"] for linha in linhas]
    return opcoes


def admin_autenticado():
    return session.get("admin_ok") is True


def admin_obrigatorio(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not admin_autenticado():
            return jsonify({"erro": "Sessão de administrador expirada ou inválida. Faça login novamente."}), 401
        return view(*args, **kwargs)
    return wrapper


@app.route("/")
def home():
    return render_template("dashboard.html", active="dashboard")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html", active="dashboard")


@app.route("/api/dashboard/filtros")
def api_dashboard_filtros():
    conn = get_connection()
    responsaveis = [
        r["responsavel"]
        for r in conn.execute(
            "SELECT DISTINCT responsavel FROM pecas WHERE responsavel IS NOT NULL AND TRIM(responsavel) != '' ORDER BY responsavel"
        )
    ]
    clientes_por_responsavel = {}
    for responsavel in responsaveis:
        clientes_por_responsavel[responsavel] = [
            r["cliente"]
            for r in conn.execute(
                "SELECT DISTINCT cliente FROM pecas WHERE responsavel = ? ORDER BY cliente", (responsavel,)
            )
        ]
    todos_clientes = [r["nome"] for r in conn.execute("SELECT nome FROM clientes ORDER BY nome")]
    conn.close()
    return jsonify({
        "responsaveis": responsaveis,
        "clientes_por_responsavel": clientes_por_responsavel,
        "todos_clientes": todos_clientes,
    })


def _montar_filtro_reclamacoes(conn, args):
    clausulas = []
    params = []

    responsavel = (args.get("responsavel") or "").strip()
    cliente = (args.get("cliente") or "").strip()
    data_inicio = (args.get("data_inicio") or "").strip()
    data_fim = (args.get("data_fim") or "").strip()

    if responsavel:
        clientes_do_responsavel = [
            r["cliente"]
            for r in conn.execute("SELECT DISTINCT cliente FROM pecas WHERE responsavel = ?", (responsavel,))
        ]
        if clientes_do_responsavel:
            marcadores = ", ".join("?" for _ in clientes_do_responsavel)
            clausulas.append(f"cliente IN ({marcadores})")
            params.extend(clientes_do_responsavel)
        else:
            clausulas.append("1 = 0")  # responsável sem nenhuma peça/cliente associado

    if cliente:
        clausulas.append("cliente = ?")
        params.append(cliente)
    if data_inicio:
        clausulas.append("data_abertura >= ?")
        params.append(data_inicio)
    if data_fim:
        clausulas.append("data_abertura <= ?")
        params.append(data_fim)

    where_sql = f"WHERE {' AND '.join(clausulas)}" if clausulas else ""
    return where_sql, params


def _computar_dashboard(conn, args):
    """Calcula tudo que o Dashboard precisa a partir do mesmo recorte filtrado
    (responsável/cliente/período): os KPIs e gráficos agregados, e também as
    listas de reclamações por trás de cada KPI (para o drill-down ao clicar
    num card). Um único lugar de verdade — o número do card e a lista do
    modal nunca podem divergir porque vêm do mesmo cálculo."""
    where_sql, params = _montar_filtro_reclamacoes(conn, args)
    reclamacoes = [
        dict(r) for r in conn.execute(f"SELECT * FROM reclamacoes {where_sql} ORDER BY data_abertura", params)
    ]

    etapas_por_reclamacao = defaultdict(list)
    ids = [r["id"] for r in reclamacoes]
    if ids:
        marcadores = ", ".join("?" for _ in ids)
        for e in conn.execute(
            f"SELECT * FROM etapas_8d WHERE reclamacao_id IN ({marcadores}) ORDER BY ordem", ids
        ):
            etapas_por_reclamacao[e["reclamacao_id"]].append(dict(e))

    hoje = date.today().isoformat()

    def etapa_de_fechamento(rec_id):
        return next(
            (e for e in etapas_por_reclamacao.get(rec_id, []) if e["etapa"] == ETAPA_FECHAMENTO_8D), None
        )

    def esta_fechado(rec_id):
        etapa = etapa_de_fechamento(rec_id)
        return bool(etapa and etapa["realizacao"])

    def etapa_atual_em_aberto(rec_id):
        """Primeira etapa aplicável ainda sem realização, na ordem do 8D —
        é onde aquela reclamação está "travada" agora."""
        return next(
            (e for e in etapas_por_reclamacao.get(rec_id, []) if e["aplicavel"] and not e["realizacao"]), None
        )

    # Anota cada reclamação com a etapa atual e se está atrasada, para o
    # drill-down poder mostrar isso sem recalcular nada.
    for r in reclamacoes:
        etapa_atual = etapa_atual_em_aberto(r["id"])
        r["etapa_atual"] = etapa_atual["etapa"] if etapa_atual else None
        r["prazo_etapa_atual"] = etapa_atual["prazo"] if etapa_atual else None
        r["etapa_atrasada"] = bool(etapa_atual and etapa_atual["prazo"] and etapa_atual["prazo"] < hoje)

    total = len(reclamacoes)
    passiveis = [r for r in reclamacoes if r["tipo_reclamacao"] in TIPOS_PASSIVEIS_8D]
    fechados = [r for r in passiveis if esta_fechado(r["id"])]
    abertos = [r for r in passiveis if not esta_fechado(r["id"])]
    atrasados = [r for r in abertos if r["etapa_atrasada"]]

    meses_distintos = len({r["data_abertura"][:7] for r in reclamacoes if r["data_abertura"]})
    media_por_mes = round(total / meses_distintos, 1) if meses_distintos else 0

    contagem_mes = Counter(r["data_abertura"][:7] for r in reclamacoes if r["data_abertura"])
    por_mes = [{"mes": m, "total": contagem_mes[m]} for m in sorted(contagem_mes)]

    contagem_tipo = Counter(r["tipo_reclamacao"] for r in reclamacoes if r["tipo_reclamacao"])
    por_tipo_reclamacao = [{"tipo": t, "total": v} for t, v in contagem_tipo.items()]

    contagem_cliente = Counter(r["cliente"] for r in reclamacoes if r["cliente"])
    mais_comuns = contagem_cliente.most_common(8)
    restante = sum(contagem_cliente.values()) - sum(v for _, v in mais_comuns)
    por_cliente = [{"cliente": c, "total": v} for c, v in mais_comuns]
    if restante > 0:
        por_cliente.append({"cliente": "Outros", "total": restante})

    contagem_etapa = defaultdict(lambda: {"no_prazo": 0, "atrasado": 0})
    for r in abertos:
        if not r["etapa_atual"]:
            continue
        contagem_etapa[r["etapa_atual"]]["atrasado" if r["etapa_atrasada"] else "no_prazo"] += 1
    por_etapa = [
        {"etapa": nome, "no_prazo": contagem_etapa[nome]["no_prazo"], "atrasado": contagem_etapa[nome]["atrasado"]}
        for nome, _dias in ETAPAS_8D
        if contagem_etapa[nome]["no_prazo"] or contagem_etapa[nome]["atrasado"]
    ]

    return {
        "kpis": {
            "total_reclamacoes": total,
            "passiveis_8d": len(passiveis),
            "fechados_8d": len(fechados),
            "aguardando_finalizacao": len(passiveis) - len(fechados),
            "atrasados_8d": len(atrasados),
            "media_por_mes": media_por_mes,
        },
        "status_8d": {
            "fechado": len(fechados),
            "atrasado": len(atrasados),
            "no_prazo": len(abertos) - len(atrasados),
        },
        "por_mes": por_mes,
        "por_tipo_reclamacao": por_tipo_reclamacao,
        "por_cliente": por_cliente,
        "por_etapa": por_etapa,
        "listas": {
            "total": reclamacoes,
            "passiveis": passiveis,
            "fechados": fechados,
            "aguardando": abertos,
            "atrasados": atrasados,
        },
    }


@app.route("/api/dashboard")
def api_dashboard():
    conn = get_connection()
    dados = _computar_dashboard(conn, request.args)
    conn.close()
    return jsonify({k: v for k, v in dados.items() if k != "listas"})


# Colunas devolvidas em cada linha do drill-down dos cards do Dashboard —
# a lista completa de campos da reclamação não interessa aqui, só o que
# aparece na tabela do modal.
CAMPOS_DETALHE_DASHBOARD = [
    "id", "id_mrhb", "numero_notificacao", "data_abertura", "cliente", "pn_mrhb",
    "descricao_defeito", "tipo_reclamacao", "etapa_atual", "prazo_etapa_atual", "etapa_atrasada",
]


@app.route("/api/dashboard/detalhe")
def api_dashboard_detalhe():
    kpi = request.args.get("kpi", "total")
    conn = get_connection()
    dados = _computar_dashboard(conn, request.args)
    conn.close()

    lista = dados["listas"].get(kpi)
    if lista is None:
        return jsonify({"erro": f"KPI desconhecido: {kpi}"}), 404

    reclamacoes = [{campo: r.get(campo) for campo in CAMPOS_DETALHE_DASHBOARD} for r in lista]
    return jsonify({"kpi": kpi, "total": len(reclamacoes), "reclamacoes": reclamacoes})


@app.route("/nova-reclamacao")
def nova_reclamacao():
    conn = get_connection()
    opcoes = carregar_opcoes(conn)
    conn.close()
    return render_template("nova_reclamacao.html", active="nova", opcoes=opcoes)


@app.route("/historico")
def historico():
    conn = get_connection()
    opcoes = carregar_opcoes(conn)
    conn.close()
    return render_template("historico.html", active="historico", opcoes=opcoes)


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    erro = None
    if request.method == "POST":
        if request.form.get("senha", "") == ADMIN_SENHA:
            session["admin_ok"] = True
            return redirect(url_for("admin_painel"))
        erro = "Senha incorreta."
    return render_template("admin_login.html", erro=erro)


@app.route("/admin/logout")
def admin_logout():
    session.pop("admin_ok", None)
    return redirect(url_for("admin_login"))


@app.route("/admin")
def admin_painel():
    if not admin_autenticado():
        return redirect(url_for("admin_login"))
    conn = get_connection()
    clientes = conn.execute("SELECT * FROM clientes ORDER BY nome").fetchall()
    opcoes = {}
    for categoria, rotulo in OPCOES_CATEGORIAS:
        linhas = conn.execute(
            "SELECT id, valor FROM opcoes_lista WHERE categoria = ? ORDER BY ordem, id", (categoria,)
        ).fetchall()
        opcoes[categoria] = {"rotulo": rotulo, "itens": [dict(l) for l in linhas]}
    conn.close()
    return render_template(
        "admin.html",
        active="admin",
        clientes=[dict(c) for c in clientes],
        opcoes=opcoes,
    )


@app.route("/api/admin/pecas", methods=["GET"])
@admin_obrigatorio
def api_admin_listar_pecas():
    conn = get_connection()
    linhas = conn.execute("SELECT * FROM pecas ORDER BY pn_mrhb").fetchall()
    conn.close()
    return jsonify([dict(l) for l in linhas])


@app.route("/api/admin/pecas", methods=["POST"])
@admin_obrigatorio
def api_admin_criar_peca():
    dados = request.get_json(force=True) or {}
    pn_mrhb = str(dados.get("pn_mrhb", "")).strip()
    cliente = str(dados.get("cliente", "")).strip()
    if not pn_mrhb or not cliente:
        return jsonify({"erro": "PN MRHB e Cliente são obrigatórios."}), 400

    conn = get_connection()
    try:
        existe = conn.execute("SELECT 1 FROM pecas WHERE pn_mrhb = ?", (pn_mrhb,)).fetchone()
        if existe:
            return jsonify({"erro": f"O PN '{pn_mrhb}' já está cadastrado."}), 400
        conn.execute(
            "INSERT INTO pecas (pn_mrhb, cliente, pn_cliente, responsavel) VALUES (?, ?, ?, ?)",
            (pn_mrhb, cliente, str(dados.get("pn_cliente", "")).strip(), str(dados.get("responsavel", "")).strip()),
        )
        conn.commit()
    finally:
        conn.close()
    return jsonify({"ok": True}), 201


@app.route("/api/admin/pecas/<pn_mrhb>", methods=["PUT"])
@admin_obrigatorio
def api_admin_editar_peca(pn_mrhb):
    dados = request.get_json(force=True) or {}
    novo_pn_mrhb = str(dados.get("pn_mrhb", "")).strip()
    cliente = str(dados.get("cliente", "")).strip()
    if not novo_pn_mrhb or not cliente:
        return jsonify({"erro": "PN MRHB e Cliente são obrigatórios."}), 400

    conn = get_connection()
    try:
        existente = conn.execute("SELECT 1 FROM pecas WHERE pn_mrhb = ?", (pn_mrhb.strip(),)).fetchone()
        if existente is None:
            return jsonify({"erro": "Peça não encontrada."}), 404

        if novo_pn_mrhb != pn_mrhb.strip():
            colisao = conn.execute("SELECT 1 FROM pecas WHERE pn_mrhb = ?", (novo_pn_mrhb,)).fetchone()
            if colisao:
                return jsonify({"erro": f"Já existe uma peça com o PN '{novo_pn_mrhb}'."}), 400

        conn.execute(
            "UPDATE pecas SET pn_mrhb = ?, cliente = ?, pn_cliente = ?, responsavel = ? WHERE pn_mrhb = ?",
            (
                novo_pn_mrhb,
                cliente,
                str(dados.get("pn_cliente", "")).strip(),
                str(dados.get("responsavel", "")).strip(),
                pn_mrhb.strip(),
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return jsonify({"ok": True})


@app.route("/api/admin/pecas/<pn_mrhb>", methods=["DELETE"])
@admin_obrigatorio
def api_admin_excluir_peca(pn_mrhb):
    conn = get_connection()
    conn.execute("DELETE FROM pecas WHERE pn_mrhb = ?", (pn_mrhb.strip(),))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/admin/clientes", methods=["POST"])
@admin_obrigatorio
def api_admin_criar_cliente():
    dados = request.get_json(force=True) or {}
    nome = str(dados.get("nome", "")).strip().upper()
    if not nome:
        return jsonify({"erro": "Informe o nome do cliente."}), 400

    conn = get_connection()
    try:
        cursor = conn.execute("INSERT INTO clientes (nome) VALUES (?)", (nome,))
        conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"erro": f"O cliente '{nome}' já existe."}), 400
    finally:
        conn.close()
    return jsonify({"ok": True, "id": cursor.lastrowid, "nome": nome}), 201


@app.route("/api/admin/clientes/<int:cliente_id>", methods=["DELETE"])
@admin_obrigatorio
def api_admin_excluir_cliente(cliente_id):
    conn = get_connection()
    conn.execute("DELETE FROM clientes WHERE id = ?", (cliente_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/admin/opcoes/<categoria>", methods=["POST"])
@admin_obrigatorio
def api_admin_criar_opcao(categoria):
    if categoria not in OPCOES_PADRAO:
        return jsonify({"erro": "Categoria de lista desconhecida."}), 404

    dados = request.get_json(force=True) or {}
    valor = str(dados.get("valor", "")).strip()
    if not valor:
        return jsonify({"erro": "Informe o valor da opção."}), 400

    conn = get_connection()
    try:
        maior_ordem = conn.execute(
            "SELECT COALESCE(MAX(ordem), -1) FROM opcoes_lista WHERE categoria = ?", (categoria,)
        ).fetchone()[0]
        cursor = conn.execute(
            "INSERT INTO opcoes_lista (categoria, valor, ordem) VALUES (?, ?, ?)",
            (categoria, valor, maior_ordem + 1),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"erro": f"A opção '{valor}' já existe nessa lista."}), 400
    finally:
        conn.close()
    return jsonify({"ok": True, "id": cursor.lastrowid, "valor": valor}), 201


@app.route("/api/admin/opcoes/<int:opcao_id>", methods=["DELETE"])
@admin_obrigatorio
def api_admin_excluir_opcao(opcao_id):
    conn = get_connection()
    conn.execute("DELETE FROM opcoes_lista WHERE id = ?", (opcao_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/pecas/<pn_mrhb>")
def api_buscar_peca(pn_mrhb):
    conn = get_connection()
    peca = conn.execute(
        "SELECT * FROM pecas WHERE pn_mrhb = ?", (pn_mrhb.strip(),)
    ).fetchone()
    conn.close()
    if peca is None:
        return jsonify({"encontrado": False}), 404
    return jsonify({"encontrado": True, **dict(peca)})


@app.route("/api/reclamacoes", methods=["GET"])
def api_listar_reclamacoes():
    conn = get_connection()
    linhas = conn.execute(
        "SELECT * FROM reclamacoes ORDER BY data_abertura DESC, id DESC"
    ).fetchall()
    conn.close()
    return jsonify([dict(l) for l in linhas])


@app.route("/api/reclamacoes", methods=["POST"])
def api_criar_reclamacao():
    dados = request.get_json(force=True) or {}

    faltando = [
        rotulo
        for campo, rotulo in CAMPOS_OBRIGATORIOS
        if not str(dados.get(campo, "")).strip()
    ]
    if faltando:
        return jsonify({"erro": f"Preencha os campos obrigatórios: {', '.join(faltando)}"}), 400

    conn = get_connection()
    try:
        id_mrhb = gerar_id_mrhb(conn, dados["data_abertura"], dados["tipo_pdca"])
        valores = [str(dados.get(campo, "")).strip() for campo in CAMPOS_RECLAMACAO]

        cursor = conn.execute(
            f"""
            INSERT INTO reclamacoes (id_mrhb, {', '.join(CAMPOS_RECLAMACAO)})
            VALUES (?, {', '.join('?' for _ in CAMPOS_RECLAMACAO)})
            """,
            [id_mrhb, *valores],
        )
        criar_etapas_8d(conn, cursor.lastrowid, dados["data_abertura"])
        conn.commit()
    finally:
        conn.close()

    return jsonify({"ok": True, "id_mrhb": id_mrhb}), 201


@app.route("/api/reclamacoes/<int:reclamacao_id>", methods=["PUT"])
def api_editar_reclamacao(reclamacao_id):
    dados = request.get_json(force=True) or {}

    id_mrhb = str(dados.get("id_mrhb", "")).strip()
    if not id_mrhb:
        return jsonify({"erro": "ID MRHB não pode ficar vazio."}), 400

    faltando = [
        rotulo
        for campo, rotulo in CAMPOS_OBRIGATORIOS
        if not str(dados.get(campo, "")).strip()
    ]
    if faltando:
        return jsonify({"erro": f"Preencha os campos obrigatórios: {', '.join(faltando)}"}), 400

    conn = get_connection()
    try:
        existente = conn.execute(
            "SELECT * FROM reclamacoes WHERE id = ?", (reclamacao_id,)
        ).fetchone()
        if existente is None:
            return jsonify({"erro": "Reclamação não encontrada."}), 404

        valores = [str(dados.get(campo, "")).strip() for campo in CAMPOS_RECLAMACAO]
        atribuicoes = ", ".join(f"{campo} = ?" for campo in CAMPOS_RECLAMACAO)

        try:
            conn.execute(
                f"UPDATE reclamacoes SET id_mrhb = ?, {atribuicoes} WHERE id = ?",
                [id_mrhb, *valores, reclamacao_id],
            )

            novos_valores = dict(zip(CAMPOS_RECLAMACAO, valores))
            novos_valores["id_mrhb"] = id_mrhb
            for campo in ["id_mrhb", *CAMPOS_RECLAMACAO]:
                valor_anterior = str(existente[campo] or "")
                valor_novo = novos_valores[campo]
                if valor_anterior != valor_novo:
                    registrar_alteracao(
                        conn,
                        reclamacao_id,
                        id_mrhb,
                        "edicao",
                        campo=CAMPOS_ROTULOS.get(campo, campo),
                        valor_anterior=valor_anterior,
                        valor_novo=valor_novo,
                    )

            if str(existente["data_abertura"]) != novos_valores["data_abertura"]:
                recalcular_prazos_8d(conn, reclamacao_id, novos_valores["data_abertura"])

            conn.commit()
        except sqlite3.IntegrityError:
            return jsonify({"erro": f"O ID MRHB '{id_mrhb}' já está em uso por outra reclamação."}), 400
    finally:
        conn.close()

    return jsonify({"ok": True, "id_mrhb": id_mrhb})


@app.route("/api/reclamacoes/<int:reclamacao_id>", methods=["DELETE"])
def api_excluir_reclamacao(reclamacao_id):
    dados = request.get_json(force=True) or {}
    motivo = str(dados.get("motivo", "")).strip()
    if not motivo:
        return jsonify({"erro": "Informe o motivo da exclusão."}), 400

    conn = get_connection()
    try:
        registro = conn.execute(
            "SELECT * FROM reclamacoes WHERE id = ?", (reclamacao_id,)
        ).fetchone()
        if registro is None:
            return jsonify({"erro": "Reclamação não encontrada."}), 404

        resumo = (
            f"Cliente: {registro['cliente']} · PN MRHB: {registro['pn_mrhb']} · "
            f"Data: {registro['data_abertura']} · Descrição: {registro['descricao_defeito']}"
        )
        registrar_alteracao(
            conn,
            reclamacao_id,
            registro["id_mrhb"],
            "exclusao",
            valor_anterior=resumo,
            motivo=motivo,
        )
        conn.execute("DELETE FROM reclamacoes WHERE id = ?", (reclamacao_id,))
        conn.commit()
    finally:
        conn.close()

    return jsonify({"ok": True})


@app.route("/api/historico-alteracoes")
def api_historico_alteracoes():
    conn = get_connection()
    linhas = conn.execute(
        "SELECT * FROM historico_alteracoes ORDER BY data_hora DESC, id DESC"
    ).fetchall()
    conn.close()
    return jsonify([dict(l) for l in linhas])


@app.route("/historico-alteracoes")
def historico_alteracoes():
    return render_template("historico_alteracoes.html", active="auditoria")


@app.route("/api/etapas-8d")
def api_listar_etapas_8d():
    conn = get_connection()
    linhas = conn.execute(
        """
        SELECT e.id, e.reclamacao_id, e.etapa, e.ordem, e.prazo, e.realizacao, e.aplicavel,
               r.id_mrhb, r.numero_notificacao, r.data_abertura, r.cliente,
               r.pn_mrhb, r.descricao_defeito, r.tipo_reclamacao
        FROM etapas_8d e
        JOIN reclamacoes r ON r.id = e.reclamacao_id
        ORDER BY r.data_abertura DESC, r.id DESC, e.ordem ASC
        """
    ).fetchall()
    conn.close()
    return jsonify([dict(l) for l in linhas])


@app.route("/api/etapas-8d/<int:etapa_id>", methods=["PUT"])
def api_atualizar_etapa_8d(etapa_id):
    dados = request.get_json(force=True) or {}

    conn = get_connection()
    try:
        etapa = conn.execute(
            """
            SELECT e.*, r.id_mrhb FROM etapas_8d e
            JOIN reclamacoes r ON r.id = e.reclamacao_id
            WHERE e.id = ?
            """,
            (etapa_id,),
        ).fetchone()
        if etapa is None:
            return jsonify({"erro": "Etapa não encontrada."}), 404

        alterou = False

        if "realizacao" in dados:
            realizacao = str(dados.get("realizacao", "")).strip()
            valor_anterior = etapa["realizacao"] or ""
            if valor_anterior != realizacao:
                conn.execute(
                    "UPDATE etapas_8d SET realizacao = ? WHERE id = ?",
                    (realizacao or None, etapa_id),
                )
                registrar_alteracao(
                    conn,
                    etapa["reclamacao_id"],
                    etapa["id_mrhb"],
                    "edicao",
                    campo=f"Etapa 8D: {etapa['etapa']}",
                    valor_anterior=valor_anterior,
                    valor_novo=realizacao,
                )
                alterou = True

        if "aplicavel" in dados:
            aplicavel_novo = 1 if dados.get("aplicavel") else 0
            if etapa["aplicavel"] != aplicavel_novo:
                conn.execute(
                    "UPDATE etapas_8d SET aplicavel = ? WHERE id = ?",
                    (aplicavel_novo, etapa_id),
                )
                registrar_alteracao(
                    conn,
                    etapa["reclamacao_id"],
                    etapa["id_mrhb"],
                    "edicao",
                    campo=f"Etapa 8D: {etapa['etapa']} (necessária)",
                    valor_anterior="Sim" if etapa["aplicavel"] else "Não",
                    valor_novo="Sim" if aplicavel_novo else "Não",
                )
                alterou = True

        if alterou:
            conn.commit()
    finally:
        conn.close()

    return jsonify({"ok": True})


@app.route("/etapas-8d")
def etapas_8d_page():
    return render_template("etapas_8d.html", active="etapas")


if __name__ == "__main__":
    init_db()
    # host="0.0.0.0" para ficar acessível por outros computadores na intranet
    # (não só pela própria máquina). Antes de expor de vez na rede da empresa,
    # o TI deve avaliar rodar com debug=False e atrás de um servidor WSGI de
    # produção (ex.: waitress, gunicorn) em vez do servidor de desenvolvimento
    # do Flask.
    app.run(host="0.0.0.0", debug=True, port=5000)
