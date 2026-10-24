# Análise dos modelos do Estúdio (forms_modelo)

> Gerado por `npm run analyze:lote` em 2026-10-24 17:20. Não editar à mão.

## Resumo

- **129 templates** em `forms_modelo/` (o índice lista 130; sem JSON: Formalização e alterações contratuais [LUME]).
- **129 analisados sem erro**, 0 com erro.
- **12 vazios** (rascunho "Titulo novo assunto", 0 campos) ficam fora das contas abaixo: base = **117 templates**.
- Totais: 553 etapas, 4336 campos, 3830 expressões, **1641 pontos de parametrização** (1003 bloqueiam).
- Medianas por template: 4 etapas, 27 campos, 18 expressões, **11 pontos** (média 14).
- Cobertura: dos 4336 campos, 1062 dependem de alguma pergunta; **75.5% já vêm prontos do modelo** (mediana por template: 78.7%).
- Resíduos de outra cidade em regra de validação: **6 templates** ("Cascavel" ×6, "João Pessoa" ×1).
- Setores herdados de outra prefeitura/ambiente no trâmite ou na entrada: **28 templates**. Documento final com modelo de outra configuração: **8**.

### Pontos por tipo (todos os templates)

| setor | etapas | opcoes | documento | dataset | texto | taxa | card | saida | residuo |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 117 | 117 | 324 | 643 | 9 | 81 | 60 | 216 | 67 | 7 |

### Por módulo (`config.tenance`)

| módulo | templates | etapas (mediana) | campos (total / mediana) | expressões (total / mediana) | pontos (total / mediana) | cobertura dos campos |
|---|---:|---:|---:|---:|---:|---:|
| Geral | 75 | 4 | 2227 / 23 | 1684 / 17 | 803 / 10 | 78.8% |
| Obras | 17 | 5 | 954 / 37 | 1115 / 27 | 316 / 15 | 78.7% |
| Meio Ambiente | 8 | 7.5 | 496 / 70 | 400 / 45.5 | 168 / 23 | 78.2% |
| Finanças | 7 | 5 | 208 / 22 | 198 / 14 | 96 / 13 | 72.1% |
| Administração ou RH | 6 | 4 | 289 / 23 | 296 / 8.5 | 194 / 11.5 | 39.1% |
| SDER | 1 | 6 | 56 / 56 | 47 / 47 | 20 / 20 | 71.4% |
| Previdência | 1 | 4 | 31 / 31 | 27 / 27 | 6 / 6 | 93.5% |
| Saúde e Vigilância Sanitária | 1 | 10 | 57 / 57 | 54 / 54 | 27 / 27 | 61.4% |
| Administração | 1 | 6 | 18 / 18 | 9 / 9 | 11 / 11 | 72.2% |

## Por template

Pontos por tipo: setor / opções / documento / dataset / texto / taxa / card / saída / resíduo. Cobertura = campos sem nenhuma pergunta ÷ campos.

| nome | sigla | módulo | etapas | campos | expr. | setor | opcoes | documento | dataset | texto | taxa | card | saida | residuo | total | cobertura | resíduos e alertas |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Solicitação de Compras e/ou Serviços | NEW | Administração | 6 | 18 | 9 | 1 | 3 | 1 | · | 1 | · | 4 | · | · | 11 | 72% | setor: `contabilidade_demoad` |
| Compra Direta - Dispensa e Inexigibilidade de Licitação | LIC | Administração ou RH | 3 | 29 | 6 | 1 | 5 | 3 | · | · | · | · | · | · | 10 | 72% |  |
| Compras e Licitação | LIC | Administração ou RH | 11 | 153 | 260 | 1 | 1 | 130 | · | · | · | · | · | · | 133 | 14% | desativado |
| Decreto | LIC | Administração ou RH | 2 | 10 | 0 | 1 | · | 1 | · | · | · | · | · | · | 3 | 90% |  |
| Parcelamento de Débitos | INT | Administração ou RH | 5 | 17 | 11 | 1 | 1 | 6 | · | 1 | 1 | 2 | · | · | 13 | 53% |  |
| Portaria | LIC | Administração ou RH | 2 | 8 | 0 | 1 | · | 1 | · | · | · | · | · | · | 3 | 88% |  |
| Processo Admissional | PAD | Administração ou RH | 8 | 72 | 19 | 1 | 3 | 23 | · | 1 | · | 2 | 1 | · | 32 | 63% |  |
| Cancelamento de Débitos | RCD | Finanças | 5 | 18 | 12 | 1 | 2 | 4 | · | 2 | 1 | 2 | · | · | 13 | 56% |  |
| Cancelamento de Débitos por Prescrição | RCP | Finanças | 6 | 22 | 14 | 1 | 2 | 6 | · | 2 | 1 | 2 | · | · | 15 | 55% |  |
| Certidão Negativa de Débitos (CND) | RCP | Finanças | 4 | 19 | 13 | 1 | 1 | 5 | · | 2 | 1 | 2 | · | · | 13 | 58% |  |
| Emissão de Guia de ITBI | ITB | Finanças | 6 | 77 | 115 | 1 | 3 | 9 | · | 1 | 1 | 5 | 1 | · | 22 | 83% |  |
| Isenção de Tributos | RIT | Finanças | 5 | 17 | 14 | 1 | 2 | 4 | · | 1 | 1 | 2 | · | · | 12 | 59% |  |
| Restituição de Tributos/Valores e Revisão de Lançamento | CDF | Finanças | 6 | 27 | 15 | 1 | 2 | 3 | · | 1 | 1 | 3 | · | · | 12 | 78% |  |
| Revisão de Lançamento de IPTU | CDF | Finanças | 5 | 28 | 15 | 1 | 1 | 4 | · | 1 | · | 1 | · | · | 9 | 79% |  |
| Abono / Justificativa de Falta | FAB | Geral | 3 | 19 | 10 | 1 | 1 | 2 | · | · | · | · | · | · | 5 | 84% | setor: `dgp_santaritadopassaquatrosp` |
| Agente / Ata de reunião | ATA | Geral | 2 | 5 | 0 | 1 | · | · | · | · | · | · | · | · | 2 | 100% |  |
| Alvará de Funcionamento de Empresa | NEW | Geral | 4 | 77 | 43 | 1 | 3 | 8 | · | · | · | 3 | 1 | · | 17 | 86% |  |
| Alvará para Realização de Eventos | LEV | Geral | 5 | 49 | 24 | 1 | 4 | 3 | · | 1 | 1 | 1 | 1 | · | 13 | 84% |  |
| Alvará Sanitário | AST | Geral | 10 | 50 | 29 | 1 | 3 | 9 | · | 1 | 1 | 2 | 1 | · | 19 | 74% |  |
| Atendimento - Prontuário Paciente (UPA) | UPA | Geral | 3 | 48 | 13 | 1 | 6 | · | · | · | · | 3 | 1 | · | 12 | 88% | setor: `sesa_demoad` |
| Cadastro de Guia de Turismo para Eventos Particulares no Munícipio | CGT | Geral | 7 | 22 | 10 | 1 | 4 | 3 | · | 1 | 1 | 1 | 1 | · | 13 | 64% |  |
| Cadastro Infantil | CIF | Geral | 4 | 28 | 27 | 1 | 3 | 3 | · | 1 | · | 1 | 1 | · | 11 | 75% | setor: `translagorecebimento_lagoasantamg`; saída de outra configuração |
| Cartão de estacionamento para Idosos | EST | Geral | 4 | 29 | 25 | 1 | 2 | 4 | · | 1 | 1 | 1 | 1 | · | 12 | 76% |  |
| Cartão de estacionamento para Pessoas com Deficiência | EST | Geral | 4 | 30 | 26 | 1 | 2 | 6 | · | 1 | 1 | 1 | 1 | · | 14 | 70% | setor: `translagorecebimento_lagoasantamg` |
| Castração de Animais | CCA | Geral | 4 | 14 | 10 | 1 | · | 2 | · | 1 | · | 1 | · | · | 6 | 79% | setor: `meioambientecastracao_carmodoparanaibamg` |
| Certidão de Transporte – Táxi e Escolar | TAX | Geral | 6 | 47 | 34 | 1 | 3 | 6 | · | 1 | 1 | 3 | 1 | · | 17 | 79% |  |
| Certidão de Uso e Ocupação do Solo | CER | Geral | 6 | 40 | 33 | 1 | 5 | 5 | · | 1 | 1 | 3 | 1 | 1 | 19 | 70% | "Cascavel" |
| Certidão Negativa de Cirurgia | CNC | Geral | 5 | 23 | 19 | 1 | · | 4 | · | 1 | · | · | · | · | 7 | 78% |  |
| Circular | CIR | Geral | 2 | 8 | 0 | 1 | · | 1 | · | · | · | · | · | · | 3 | 88% | setor: `setorentrada_exploread`; desativado |
| Coleta de Lixo Especial / Orgânico | COL | Geral | 3 | 22 | 15 | 1 | 2 | 2 | · | 1 | · | 1 | · | · | 8 | 77% |  |
| Comunicação de Buracos em Vias | BUR | Geral | 4 | 20 | 14 | 1 | · | 1 | · | 1 | 1 | 2 | 1 | · | 8 | 90% |  |
| Comunicação Interna | CIP | Geral | 1 | 6 | 0 | 1 | · | 1 | · | · | · | · | · | · | 3 | 83% | setor: `setorentrada_exploread` |
| Consulta de Viabilidade para Abertura de Empresa | NEW | Geral | 3 | 134 | 121 | 1 | 21 | 6 | 3 | · | · | 1 | 1 | · | 34 | 76% |  |
| Cópia de prontuário médico | CPM | Geral | 5 | 23 | 19 | 1 | · | 4 | · | 1 | · | · | · | · | 7 | 78% |  |
| Denúncia Anônima | NEW | Geral | 1 | 22 | 26 | 1 | 2 | 1 | 1 | · | · | · | · | · | 6 | 82% | setor: `ouvidoirasetorialsecretariaassistencia_umuaramapr`, `72ouvidoria_umuaramapr`, `ouvidoriasetorialsdopuept_umuaramapr`, `ouvidoriasetorialpostura_umuaramapr`, `ouvidoriasetorialmeioambiente_umuaramapr`, `ouvidoriasetorialfundacaocultural_umuaramapr`, `ouvidoriasetorialservicospublicos_umuaramapr`, `ouvidoriasetorialrodoviarios_umuaramapr`, `ouvidoriasetorialdivisaocadastroimobiliario_umuaramapr`, `ouvidoriasetorialdivisaotransito_umuaramapr`, `ouvidoriasetorialengenhariatransito_umuaramapr`, `ouvidoriasetorialsecretariaeducacao_umuaramapr`, `ouvidoriasetorialesportelazer_umuaramapr`; desativado |
| Denúncia de riscos | BUR | Geral | 4 | 27 | 21 | 1 | 1 | 3 | · | 1 | · | 1 | · | · | 8 | 81% |  |
| Diretriz Urbanística | DIR | Geral | 8 | 62 | 60 | 1 | 8 | 9 | 1 | 1 | 1 | 5 | 1 | · | 28 | 71% |  |
| Emissão de documentos escolares | EDE | Geral | 7 | 29 | 23 | 1 | 5 | 4 | · | 1 | · | 2 | 1 | · | 15 | 66% | setor: `sorocaba_implantacaoad` |
| Envio de Atestado Médico | NEW | Geral | 3 | 24 | 11 | 1 | 2 | 3 | 1 | · | · | 1 | · | · | 9 | 75% |  |
| FORMULÁRIO PADRÃO / PROJETO AMBIENTE MODELO | NEW | Geral | 13 | 136 | 162 | 1 | 10 | 10 | · | 1 | 1 | 3 | 1 | 2 | 30 | 83% | "João Pessoa"; "Cascavel" |
| Inscrição para Transporte Escolar Gratuito | ITE | Geral | 6 | 28 | 17 | 1 | 2 | 4 | · | 1 | · | 1 | 1 | · | 11 | 75% | setor: `sorocaba_implantacaoad` |
| Instalação de sinalização de trânsito | SIN | Geral | 4 | 29 | 26 | 1 | 1 | 2 | · | 1 | · | 3 | · | · | 9 | 86% |  |
| LAI - Lei de Acesso a Informação | NEW | Geral | 1 | 6 | 0 | 1 | · | 1 | · | · | · | · | · | · | 3 | 83% |  |
| Licença para Fechamento de Rua | SIN | Geral | 5 | 33 | 25 | 1 | 1 | 2 | · | 1 | 1 | 2 | 1 | · | 10 | 88% |  |
| Limpeza de Lotes Públicos | LLP | Geral | 4 | 20 | 14 | 1 | · | 1 | · | 1 | 1 | 2 | 1 | · | 8 | 90% |  |
| Lume - Atestado Médico | LUM | Geral | 1 | 9 | 5 | 1 | · | 1 | · | · | · | · | 1 | · | 4 | 89% | saída de outra configuração |
| Lume - Autorização para Corte, Poda ou Derrubada de Árvores | SIS | Geral | 5 | 39 | 28 | 1 | 4 | 5 | · | 1 | · | 2 | 1 | · | 15 | 74% | setor: `visaariquemes_implantacaoad`; saída de outra configuração |
| Lume - Cartão CNPJ | LUM | Geral | 1 | 18 | 24 | 1 | · | 2 | · | · | · | · | 1 | · | 5 | 89% | saída de outra configuração |
| Lume - Certidão Negativa | NEW | Geral | 1 | 3 | 0 | 1 | · | 1 | · | · | · | · | · | · | 3 | 67% |  |
| Lume - Comprovante de identidade (RG e CNH) | LUM | Geral | 1 | 9 | 7 | 1 | · | 2 | · | · | · | · | · | · | 4 | 78% |  |
| Lume - Contrato Social | NEW | Geral | 1 | 3 | 0 | 1 | · | 1 | · | · | · | · | · | · | 3 | 67% |  |
| Lume - Espelho Cadastral | NEW | Geral | 1 | 15 | 12 | 1 | · | 1 | · | · | · | · | · | · | 3 | 93% |  |
| Lume - Matrícula | LUM | Geral | 2 | 14 | 18 | 1 | · | 1 | · | · | · | · | · | · | 3 | 93% |  |
| Lume - Matrícula Indaial | LUM | Geral | 1 | 14 | 18 | 1 | · | 1 | · | · | · | · | · | · | 3 | 93% |  |
| Lume - Matrícula Itu | LUM | Geral | 1 | 14 | 18 | 1 | · | 1 | · | · | · | · | · | · | 3 | 93% |  |
| Manutenção de Iluminação Pública | MIP | Geral | 4 | 20 | 16 | 1 | · | 1 | · | 1 | 1 | 2 | 1 | · | 8 | 90% | setor: `obras_carmodoparanaibamg` |
| Memorando | MEM | Geral | 2 | 8 | 0 | 1 | · | 1 | · | · | · | · | · | · | 3 | 88% | setor: `setorentrada_exploread`; desativado |
| Obras Públicas | OBP | Geral | 10 | 61 | 43 | 1 | 4 | 9 | · | 1 | 1 | 2 | 1 | · | 20 | 77% |  |
| Ofício | OFC | Geral | 1 | 5 | 0 | 1 | · | 1 | · | · | · | · | 1 | · | 4 | 80% | setor: `setorentrada_exploread` |
| Ouvidoria Nominal | NEW | Geral | 1 | 19 | 18 | 1 | 1 | 1 | · | · | · | · | · | · | 4 | 89% |  |
| Ouvidoria Sigilosa | NEW | Geral | 1 | 18 | 17 | 1 | 1 | 1 | · | · | · | · | · | · | 4 | 89% |  |
| Poda de Canteiros Centrais | POD | Geral | 4 | 21 | 14 | 1 | · | 2 | · | 1 | 1 | 3 | 1 | · | 10 | 86% | setor: `obras_carmodoparanaibamg` |
| Podas de árvores que ofereçam risco à segurança | APR | Geral | 6 | 52 | 42 | 1 | 2 | 7 | · | 1 | 1 | 1 | · | · | 14 | 81% |  |
| Procedimentos de Fiscalização Ambiental | FIS | Geral | 1 | 5 | 0 | 1 | 1 | · | · | · | · | · | · | · | 3 | 80% |  |
| Protocolo Cidadão | ADM | Geral | 3 | 16 | 11 | 1 | 1 | 2 | · | 1 | 1 | 3 | 1 | · | 11 | 75% |  |
| Protocolo Geral / Administração | ADM | Geral | 3 | 18 | 10 | 1 | 2 | 3 | · | 1 | 1 | 3 | 1 | · | 13 | 67% |  |
| Protocolo Geral / Cultura, Esporte e Lazer | PGC | Geral | 6 | 43 | 42 | 1 | 3 | 4 | · | 1 | 1 | · | · | · | 11 | 81% | setor: `sorocaba_implantacaoad` |
| Protocolo Geral / Educação | EDC | Geral | 3 | 15 | 10 | 1 | 1 | 3 | · | · | 1 | 2 | 1 | · | 10 | 73% |  |
| Protocolo Geral / Finanças | FIN | Geral | 5 | 42 | 32 | 1 | 4 | 6 | · | · | 1 | 2 | 1 | · | 16 | 76% |  |
| Protocolo Geral / Meio Ambiente | MEI | Geral | 5 | 43 | 32 | 1 | 4 | 7 | · | · | 1 | 2 | 1 | · | 17 | 74% | setor: `sorocaba_implantacaoad` |
| Protocolo Geral / Obras e Infraestrutura | REQ | Geral | 5 | 45 | 34 | 1 | 4 | 8 | · | · | 1 | 3 | 1 | · | 19 | 73% | setor: `sorocaba_implantacaoad` |
| Protocolo Geral / Planejamento e Desenvolvimento Urbano | PGP | Geral | 6 | 49 | 37 | 1 | 5 | 9 | · | 1 | 1 | 3 | 1 | · | 22 | 69% |  |
| Protocolo Geral / Recursos Humanos | ADM | Geral | 3 | 16 | 10 | 1 | 1 | 2 | · | 1 | 1 | 3 | 1 | · | 11 | 75% |  |
| Recepção - Prontuário Paciente (UPA) | UPA | Geral | 1 | 25 | 13 | 1 | 3 | · | · | · | · | 3 | 1 | · | 9 | 88% | setor: `sesa_demoad` |
| Recurso sobre Intimação/ Notificação/ Auto de Infração | REC | Geral | 6 | 30 | 36 | 1 | 3 | 1 | · | · | 1 | 3 | 1 | · | 11 | 87% |  |
| Remoção de obstáculos em vias públicas | BUR | Geral | 4 | 23 | 16 | 1 | · | 3 | · | 1 | · | 1 | · | · | 7 | 83% |  |
| Solicitação de ambulância para evento | SAE | Geral | 6 | 28 | 11 | 1 | 3 | 4 | · | 1 | 1 | · | · | · | 11 | 71% |  |
| Solicitação de Auxílio Financeiro Estudantil | AFE | Geral | 7 | 34 | 19 | 1 | 5 | 5 | · | 1 | · | 2 | 1 | · | 16 | 68% | setor: `sorocaba_implantacaoad` |
| Solicitação de Cadastro em Programas Sociais | CIF | Geral | 6 | 104 | 70 | 1 | 15 | 9 | · | 1 | · | 1 | 1 | · | 29 | 76% | setor: `translagorecebimento_lagoasantamg`; saída de outra configuração |
| Solicitação de Férias | FER | Geral | 3 | 28 | 15 | 1 | 2 | 2 | · | · | · | 3 | 1 | · | 10 | 86% | setor: `csimplantacao_implantacaoad` |
| Solicitação de Itens para Merenda Escolar | SME | Geral | 4 | 16 | 2 | 1 | 1 | 2 | · | · | · | 1 | · | · | 6 | 81% |  |
| Solicitação de Licença | RHL | Geral | 3 | 27 | 25 | 1 | 5 | 3 | · | · | · | 2 | 1 | · | 13 | 70% | setor: `dgp_santaritadopassaquatrosp` |
| Solicitação de Medicamentos | SME | Geral | 4 | 19 | 10 | 1 | · | 3 | · | 1 | · | 2 | 1 | · | 9 | 79% | setor: `sorocaba_implantacaoad` |
| Solicitação de Subsídios ou Incentivos Culturais | SSI | Geral | 4 | 15 | 11 | 1 | 1 | 3 | · | 1 | 1 | 1 | 1 | · | 10 | 67% |  |
| Solicitação de transporte para eventos | SDT | Geral | 3 | 26 | 15 | 1 | 3 | 1 | · | 2 | 1 | 1 | 1 | · | 11 | 81% |  |
| Solicitação de Vaga em Creche | SVC | Geral | 6 | 33 | 28 | 1 | 3 | 3 | · | 1 | · | 2 | 1 | · | 12 | 79% |  |
| Solicitações de Compras | MCL | Geral | 5 | 19 | 4 | 1 | 1 | 3 | · | · | · | 7 | 1 | · | 14 | 79% | desativado |
| Solicitações de Liquidação e Pagamento - Empenhos Estimativos e Globais | OFC | Geral | 2 | 10 | 0 | 1 | 1 | 1 | · | · | · | · | · | · | 4 | 80% | setor: `setorentrada_exploread` |
| Titulo novo assunto | NEW | Geral | 0 | 0 | 0 | 1 | · | · | · | · | · | · | · | · | 1 | — | vazio; desativado |
| Titulo novo assunto | NEW | Geral | 0 | 0 | 0 | 1 | · | · | · | · | · | · | · | · | 1 | — | vazio; desativado |
| Titulo novo assunto | NEW | Geral | 0 | 0 | 0 | 1 | · | · | · | · | · | · | · | · | 1 | — | vazio; desativado |
| Titulo novo assunto | NEW | Geral | 0 | 0 | 0 | 1 | · | · | · | · | · | · | · | · | 1 | — | vazio; desativado |
| Titulo novo assunto | NEW | Geral | 0 | 0 | 0 | 1 | · | · | · | · | · | · | · | · | 1 | — | vazio; desativado |
| Titulo novo assunto | NEW | Geral | 0 | 0 | 0 | 1 | · | · | · | · | · | · | · | · | 1 | — | vazio; desativado |
| Titulo novo assunto | NEW | Geral | 0 | 0 | 0 | 1 | · | · | · | · | · | · | · | · | 1 | — | vazio; desativado |
| Titulo novo assunto | NEW | Geral | 0 | 0 | 0 | 1 | · | · | · | · | · | · | · | · | 1 | — | vazio; desativado |
| Titulo novo assunto | NEW | Geral | 0 | 0 | 0 | 1 | · | · | · | · | · | · | · | · | 1 | — | vazio; desativado |
| Titulo novo assunto | NEW | Geral | 0 | 0 | 0 | 1 | · | · | · | · | · | · | · | · | 1 | — | vazio; desativado |
| Titulo novo assunto | NEW | Geral | 0 | 0 | 0 | 1 | · | · | · | · | · | · | · | · | 1 | — | vazio; desativado |
| Titulo novo assunto | NEW | Geral | 0 | 0 | 0 | 1 | · | · | · | · | · | · | · | · | 1 | — | vazio; desativado |
| Vistoria de instalações hidrossanitárias | VFF | Geral | 7 | 46 | 54 | 1 | 4 | 7 | · | 1 | · | 3 | 1 | · | 18 | 74% |  |
| Autorização de extração (supressão) arbórea | AEA | Meio Ambiente | 10 | 118 | 120 | 1 | 8 | 23 | 1 | 1 | 1 | 2 | 1 | · | 39 | 72% |  |
| Denúncia Nominal | DEN | Meio Ambiente | 5 | 31 | 21 | 1 | 2 | 1 | · | 2 | 1 | 3 | 1 | · | 12 | 84% |  |
| Denúncia Sigilosa | DES | Meio Ambiente | 4 | 26 | 15 | 1 | 2 | 1 | · | 2 | 1 | 3 | 1 | · | 12 | 81% |  |
| Doação de Mudas | DOM | Meio Ambiente | 5 | 33 | 38 | 1 | 4 | 3 | · | 1 | · | · | · | · | 10 | 76% |  |
| Licença Ambiental de Instalação (LAI) | LAI | Meio Ambiente | 10 | 73 | 47 | 1 | 1 | 11 | · | 2 | 1 | 7 | 1 | · | 25 | 81% | saída de outra configuração |
| Licença Ambiental de Operação (LAO) | LAO | Meio Ambiente | 8 | 75 | 53 | 1 | 3 | 10 | · | 1 | 1 | 6 | 1 | · | 24 | 81% | saída de outra configuração |
| Licença Ambiental Prévia (LAP) | LAP | Meio Ambiente | 9 | 69 | 44 | 1 | 1 | 10 | · | 1 | 1 | 6 | 1 | · | 22 | 83% | saída de outra configuração |
| Podas de Árvores com Risco à Segurança | CRT | Meio Ambiente | 7 | 71 | 62 | 1 | 7 | 9 | · | 1 | 1 | 3 | 1 | · | 24 | 76% |  |
| Alvará de Construção | ALV | Obras | 11 | 134 | 160 | 1 | 13 | 11 | 1 | 1 | 1 | 5 | 1 | 1 | 36 | 81% | "Cascavel" |
| Alvará de Licença para Localização e Funcionamento | ALF | Obras | 6 | 38 | 24 | 1 | 1 | 7 | · | 1 | 1 | 3 | 1 | · | 16 | 76% |  |
| Alvará de Obras - Com LUME | ALV | Obras | 8 | 114 | 139 | 1 | 9 | 10 | 1 | · | 1 | 5 | 1 | · | 29 | 83% | setor: `seplau_demoad` |
| Aprovação de Loteamento | LOT | Obras | 8 | 79 | 60 | 1 | 5 | 11 | · | 1 | 1 | 3 | 1 | · | 24 | 78% |  |
| Aprovação de Projeto | ALV | Obras | 11 | 113 | 141 | 1 | 11 | 11 | · | 1 | 1 | 4 | 1 | 1 | 32 | 79% | "Cascavel" |
| Auxílio Funeral | AUF | Obras | 2 | 12 | 5 | 1 | · | 3 | · | 1 | 1 | 3 | 1 | · | 11 | 67% |  |
| Consulta Prévia | CPR | Obras | 7 | 66 | 52 | 1 | 9 | 7 | · | 1 | 1 | 3 | 1 | 1 | 25 | 73% | "Cascavel" |
| Desmembramento / Remembramento / Retificação | DESM | Obras | 10 | 65 | 55 | 1 | 5 | 10 | · | 1 | 1 | 2 | 1 | · | 22 | 75% |  |
| Envio de Notas Fiscais | ENF | Obras | 5 | 21 | 11 | 1 | · | 4 | · | 1 | · | · | · | · | 7 | 76% |  |
| Habite-se | HAB | Obras | 16 | 163 | 327 | 1 | 16 | 15 | · | 1 | 1 | 4 | 1 | 1 | 41 | 80% | "Cascavel" |
| Lume - aplicada em campos | LAP | Obras | 1 | 15 | 19 | 1 | 1 | 2 | · | · | 2 | 7 | · | · | 14 | 80% |  |
| Lume - Comprovante de Residência | LAP | Obras | 1 | 12 | 17 | 1 | · | 1 | · | · | 2 | 8 | · | · | 13 | 92% |  |
| Ofício externo | OFE | Obras | 2 | 8 | 0 | 1 | · | 1 | · | · | · | · | · | · | 3 | 88% |  |
| Protocolo Geral / Saúde | PGS | Obras | 5 | 37 | 39 | 1 | 7 | 3 | · | 1 | 1 | 1 | · | · | 15 | 70% |  |
| Protocolo Geral / Segurança Pública e Defesa Civil | PGS | Obras | 4 | 16 | 14 | 1 | 1 | 2 | · | 1 | 1 | 3 | 1 | · | 11 | 75% |  |
| Recurso em Processos de Licitação | RPL | Obras | 4 | 31 | 25 | 1 | 2 | 3 | · | 1 | · | · | · | · | 8 | 81% |  |
| Solicitação de Alteração Contratual | SAC | Obras | 4 | 30 | 27 | 1 | 2 | 3 | · | 1 | · | 1 | · | · | 9 | 80% |  |
| Certidão de Tempo de Contribuição (CTC) | CTC | Previdência | 4 | 31 | 27 | 1 | · | 1 | · | 1 | · | 1 | 1 | · | 6 | 94% |  |
| Pedido de Estudo de Viabilidade Sanitária | EVS | Saúde e Vigilância Sanitária | 10 | 57 | 54 | 1 | 6 | 15 | · | 1 | 1 | 1 | 1 | · | 27 | 61% | setor: `rhvenancio_implantacaoad` |
| Baixa de Empresa | BEP | SDER | 6 | 56 | 47 | 1 | 3 | 12 | · | 1 | 1 | · | 1 | · | 20 | 71% |  |

## O que a heurística de resíduo sinaliza

Literais com cara de nome próprio **comparados** com um campo do model (`model.x === 'Lit'`) e que não aparecem nas opções do formulário (nem nas opções montadas por expressão). Só a classe `cidade` vira pergunta `residuo` na ficha (e é trocada automaticamente pelo nome da cidade no pipeline); as outras ficam aqui para julgamento humano.

| classe | literal | campo comparado | template | trecho |
|---|---|---|---|---|
| cidade | "Cascavel" | `cidade_obra` | alvara_de_construcao | `model.cidade_obra == 'Cascavel' \|\| !model.cidade_ob` |
| cidade | "Cascavel" | `cidade_obra` | aprovacao_de_projeto | `model.cidade_obra == 'Cascavel' \|\| !model.cidade_ob` |
| cidade | "Cascavel" | `cidade_obra` | certidao_de_uso_e_ocupacao_do_solo | `model.cidade_obra == 'Cascavel' \|\| !model.cidade_ob` |
| cidade | "Cascavel" | `cidade_obra` | consulta_previa | `model.cidade_obra == 'Cascavel' \|\| !model.cidade_ob` |
| cidade | "João Pessoa" | `cidade_empreendimento` | formulario_padrao_projeto_ambiente_modelo | `model.cidade_empreendimento == 'João Pessoa' \|\| !model.cidade_em` |
| cidade | "Cascavel" | `cidade_obra` | formulario_padrao_projeto_ambiente_modelo | `model.cidade_obra == 'Cascavel' \|\| !model.cidade_ob` |
| cidade | "Cascavel" | `cidade_obra` | habite_se | `model.cidade_obra == 'Cascavel' \|\| !model.cidade_ob` |
| fora_das_opcoes | "Outras áreas" | `tipo_solicitacao` | autorizacao_de_extracao_supressao_arborea | `!model.tipo_solicitacao \|\| model.tipo_solicitacao !== 'Outras áreas'` |
| texto_livre | "Laudo Acústico" | `documentacao` | alvara_de_funcionamento_de_empresa | `model.processoaprova !== 'Sim' \|\| model.documentacao !== 'Laudo Acústico'` |
| texto_livre | "Brasil" | `nacionalidade` | solicitacao_de_cadastro_em_programas_sociais | `model.nacionalidade?.input !== 'Brasil' \|\| !model.nacionali` |

## Erros

Nenhum template quebrou o analisador.

Sem JSON no export (o índice cita, a API devolveu vazio): Formalização e alterações contratuais [LUME] (`688227f09fa9170008eac9ac`).
