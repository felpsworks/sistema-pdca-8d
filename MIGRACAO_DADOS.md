# Migração dos dados do Excel para o Sistema PDCA / 8D

Este sistema foi feito para **substituir** o controle atual em planilha
(`GERENCIADOR_PDCA_2026.xlsm`). Para não perder o histórico já registrado até
hoje, o projeto já vem com 3 scripts prontos que importam os dados reais da
planilha para o banco do sistema (SQLite).

## Quando rodar

Uma vez, logo depois de instalar o sistema (ver `README.md`) e antes de
começar a usá-lo no dia a dia. Pode ser rodado de novo mais tarde sem
problema — os scripts foram feitos para nunca duplicar ou apagar dados (ver
"Por que é seguro rodar mais de uma vez", abaixo).

## Pré-requisitos

- Sistema já instalado (`pip install -r requirements.txt`), na pasta do projeto.
- **O arquivo Excel precisa estar fechado** — o Excel trava o arquivo para
  leitura enquanto está aberto, e os scripts não conseguem ler um arquivo
  travado.

## Passo a passo

Rodar os 3 comandos abaixo, **nessa ordem exata** (cada um depende do
anterior), substituindo pelo caminho real do arquivo Excel:

```bash
python seed_pecas.py "C:\caminho\para\GERENCIADOR_PDCA_2026.xlsm"
python seed_reclamacoes.py "C:\caminho\para\GERENCIADOR_PDCA_2026.xlsm"
python seed_etapas.py "C:\caminho\para\GERENCIADOR_PDCA_2026.xlsm"
```

| Script | O que importa | De onde |
|---|---|---|
| `seed_pecas.py` | Lista de peças (PN, Cliente, PN do Cliente, Responsável) | aba `LISTA PN` |
| `seed_reclamacoes.py` | Histórico completo de reclamações, preservando o ID MRHB de cada uma | aba `GERENCIADOR` |
| `seed_etapas.py` | Prazos e datas de realização de cada etapa do 8D | aba `ETAPAS 8D` |

Cada script imprime no final quantos registros foram importados/atualizados.

## Por que é seguro rodar mais de uma vez

- **`seed_reclamacoes.py`** só **adiciona** reclamações cujo ID MRHB ainda não
  existe no sistema. Nunca sobrescreve nem apaga uma reclamação já
  cadastrada.
- **`seed_etapas.py`** só preenche as etapas de reclamações **que ainda não
  têm nenhum progresso registrado no sistema**. Se uma reclamação já tem
  qualquer etapa marcada como concluída (feito direto pela página "Etapas
  8D" do sistema), ela é ignorada — o script nunca sobrescreve progresso
  real com dados antigos da planilha.
- **`seed_pecas.py`** atualiza a lista de peças com o que estiver na
  planilha (cliente, responsável, etc.) — esse é o único dos três que
  sobrescreve dados existentes. Depois que a área **Administrador** do
  sistema passar a ser usada para gerenciar peças, não é mais necessário
  rodar este script.

## Depois da migração

A partir daí, o cadastro de novas reclamações e o preenchimento das etapas
8D deve ser feito **só pelo sistema web** — a planilha Excel pode ser
arquivada. O sistema continua a numeração de ID MRHB de onde a planilha
parou, então não há conflito nem duplicidade.
