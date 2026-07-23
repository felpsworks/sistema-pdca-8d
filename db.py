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
    UNIQUE(reclamacao_id, etapa)
);
"""


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_connection()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()
