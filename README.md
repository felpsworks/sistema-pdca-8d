# Sistema PDCA / 8D

Sistema de gerenciamento de reclamações de clientes e acompanhamento das
etapas do 8D, feito para substituir o antigo controle em planilha Excel
(`GERENCIADOR_PDCA_2026.xlsm`). Web app em Python (Flask) + SQLite.

Este projeto é um **protótipo** funcional, pensado para avaliação do
departamento de TI antes de uma implantação definitiva na empresa.

## Funcionalidades

- **Nova Reclamação** — formulário de cadastro em coluna única, com avanço
  automático entre campos, autopreenchimento de Cliente/Responsável a partir
  do PN MRHB, e geração automática do ID MRHB (mesma lógica de numeração do
  Excel original).
- **Gerenciador** — banco de dados de todas as reclamações, com filtros por
  coluna estilo Excel (inclusive por mês, na coluna Data), colunas
  reordenáveis por arrastar, edição completa de qualquer reclamação e
  exclusão (com confirmação e motivo obrigatório).
- **Etapas 8D** — acompanhamento das 11 etapas do 8D por reclamação (prazo
  calculado automaticamente a partir da Data de Abertura + data de
  realização preenchida manualmente), com indicador de atraso e progresso.
- **Histórico de Alterações** — auditoria de tudo que foi editado ou
  excluído no Gerenciador (campo alterado, valor anterior/novo, motivo da
  exclusão).

## Pré-requisitos

- Python 3.10 ou superior.

## Instalação

```bash
pip install -r requirements.txt
```

## Como rodar

```bash
python app.py
```

O servidor sobe em `http://localhost:5000`. Como o `app.py` já está
configurado para escutar em `0.0.0.0`, outros computadores na mesma rede
também conseguem acessar pelo IP da máquina que está rodando o servidor,
por exemplo `http://192.168.1.50:5000` (veja o IP com `ipconfig`).

> **Antes de disponibilizar na rede da empresa**, o TI deve avaliar:
> - Rodar com `debug=False` e por trás de um servidor WSGI de produção
>   (ex.: `waitress`, `gunicorn`), em vez do servidor de desenvolvimento do
>   Flask usado hoje.
> - Adicionar autenticação — hoje o app não tem login, qualquer pessoa com
>   acesso à rede pode ver, editar e excluir reclamações.
> - Rotina de backup do arquivo `data/app.db`.

## Estrutura do projeto

```
app.py                  Rotas Flask e regras de negócio
db.py                   Conexão SQLite e schema das tabelas
templates/               HTML (Jinja2)
static/                  CSS e JavaScript
seed_pecas.py            Importa a lista de peças (Cliente/Responsável) do Excel
seed_reclamacoes.py      Importa o histórico de reclamações do Excel
seed_etapas.py           Importa prazos/realizações das etapas 8D do Excel
data/app.db              Banco de dados SQLite (gerado ao rodar o app; não versionado)
```

## Importando dados do Excel original (opcional)

Só é necessário rodar uma vez, para trazer o histórico de um arquivo
`GERENCIADOR_PDCA_2026.xlsm` existente. Rodar nesta ordem:

```bash
python seed_pecas.py "C:\caminho\para\GERENCIADOR_PDCA_2026.xlsm"
python seed_reclamacoes.py "C:\caminho\para\GERENCIADOR_PDCA_2026.xlsm"
python seed_etapas.py "C:\caminho\para\GERENCIADOR_PDCA_2026.xlsm"
```

O arquivo Excel precisa estar fechado (o Excel bloqueia o arquivo para
leitura enquanto está aberto). Os scripts podem ser rodados novamente sem
duplicar dados — atualizam os registros já existentes.

## Banco de dados

SQLite, em `data/app.db` (criado automaticamente na primeira execução).
Não é versionado no Git por conter dados reais de clientes — veja
`.gitignore`.
