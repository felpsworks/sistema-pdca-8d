import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "app.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS pecas (
    pn_mrhb TEXT PRIMARY KEY,
    cliente TEXT,
    pn_cliente TEXT,
    responsavel TEXT
);

CREATE TABLE IF NOT EXISTS reclamacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_mrhb TEXT UNIQUE,
    numero_notificacao TEXT NOT NULL,
    data_abertura TEXT NOT NULL,
    pn_mrhb TEXT NOT NULL,
    pn_cliente TEXT,
    descricao_defeito TEXT NOT NULL,
    tipo_pdca TEXT NOT NULL,
    cliente TEXT NOT NULL,
    area_responsavel_8d TEXT NOT NULL,
    responsavel_cliente TEXT,
    tipo_problema TEXT,
    estratificacao_defeito TEXT,
    tipo_reclamacao TEXT NOT NULL,
    mq_in TEXT,
    mq_us TEXT,
    qtd_reclamada TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS historico_alteracoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reclamacao_id INTEGER,
    id_mrhb TEXT,
    tipo_acao TEXT NOT NULL,
    campo TEXT,
    valor_anterior TEXT,
    valor_novo TEXT,
    motivo TEXT,
    data_hora TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS etapas_8d (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reclamacao_id INTEGER NOT NULL REFERENCES reclamacoes(id) ON DELETE CASCADE,
    etapa TEXT NOT NULL,
    ordem INTEGER NOT NULL,
    prazo TEXT,
    realizacao TEXT,
    aplicavel INTEGER NOT NULL DEFAULT 1,
    UNIQUE(reclamacao_id, etapa)
);

CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS opcoes_lista (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria TEXT NOT NULL,
    valor TEXT NOT NULL,
    ordem INTEGER NOT NULL DEFAULT 0,
    UNIQUE(categoria, valor)
);
"""

# Valores de fábrica das listas hoje fixas no formulário (área Administrador
# permite adicionar/excluir a partir daqui). Só são inseridos se a tabela
# opcoes_lista estiver vazia para aquela categoria, para não duplicar em
# execuções seguintes nem sobrescrever edições do usuário.
OPCOES_PADRAO = {
    "tipo_pdca": ["Reclamação Externa", "Reclamação Interna", "SESMT"],
    "area_responsavel_8d": ["Usinagem", "Injeção", "Us/In"],
    "tipo_problema": ["Visual", "Dimensional", "Logistico"],
    "tipo_reclamacao": ["Formal", "Informal", "Informativo", "Disputa", "Alerta", "Logística"],
    "mq_in": ["#50-1", "#70-1", "#70-2", "#122-2", "#180-1", "#250-1", "N/A"],
    "mq_us": ["N/A"] + [f"#{n}" for n in range(26, 60) if n not in (28, 29, 31, 32, 33, 34)],
}


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_connection()
    conn.executescript(SCHEMA)

    # Migração leve: adiciona colunas novas em bancos já existentes sem apagar dados.
    colunas_etapas = {row["name"] for row in conn.execute("PRAGMA table_info(etapas_8d)")}
    if "aplicavel" not in colunas_etapas:
        conn.execute("ALTER TABLE etapas_8d ADD COLUMN aplicavel INTEGER NOT NULL DEFAULT 1")

    # Semeia as listas de opções (uma vez por categoria) e os clientes já
    # usados na Lista de PN, para a área Administrador começar com o que já
    # estava em uso no formulário.
    for categoria, valores in OPCOES_PADRAO.items():
        ja_tem = conn.execute(
            "SELECT 1 FROM opcoes_lista WHERE categoria = ? LIMIT 1", (categoria,)
        ).fetchone()
        if not ja_tem:
            conn.executemany(
                "INSERT INTO opcoes_lista (categoria, valor, ordem) VALUES (?, ?, ?)",
                [(categoria, valor, ordem) for ordem, valor in enumerate(valores)],
            )

    if not conn.execute("SELECT 1 FROM clientes LIMIT 1").fetchone():
        clientes_existentes = conn.execute(
            "SELECT DISTINCT cliente FROM pecas WHERE cliente IS NOT NULL AND TRIM(cliente) != ''"
        ).fetchall()
        nomes_normalizados = sorted({row["cliente"].strip().upper() for row in clientes_existentes})
        conn.executemany(
            "INSERT OR IGNORE INTO clientes (nome) VALUES (?)",
            [(nome,) for nome in nomes_normalizados],
        )

    conn.commit()
    conn.close()
