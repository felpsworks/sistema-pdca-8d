import sqlite3
from datetime import date, timedelta

from flask import Flask, jsonify, render_template, request

from db import get_connection, init_db

app = Flask(__name__)

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
        conn.execute(
            "INSERT INTO etapas_8d (reclamacao_id, etapa, ordem, prazo) VALUES (?, ?, ?, ?)",
            (reclamacao_id, nome, ordem, calcular_prazo(data_abertura, dias)),
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


@app.route("/")
def home():
    return render_template("nova_reclamacao.html", active="nova")


@app.route("/nova-reclamacao")
def nova_reclamacao():
    return render_template("nova_reclamacao.html", active="nova")


@app.route("/historico")
def historico():
    return render_template("historico.html", active="historico")


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
        SELECT e.id, e.reclamacao_id, e.etapa, e.ordem, e.prazo, e.realizacao,
               r.id_mrhb, r.numero_notificacao, r.data_abertura, r.cliente,
               r.descricao_defeito, r.tipo_reclamacao
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
    realizacao = str(dados.get("realizacao", "")).strip()

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
