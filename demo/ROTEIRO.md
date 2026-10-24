# Roteiro da demo (4 minutos)

## 0:00 — O problema (30 s)
"100 processos, 60 dias, 4 prefeituras por implantador. Dez reuniões por dia. A conta não fecha." Mostrar a conta no slide.

## 0:30 — O que o template já sabe (40 s)
Terminal: `npm run analyze -- fixtures/templates/alvara-construcao.modeload.json`
Apontar: 134 campos, 160 regras, e o analisador reduziu a **37 perguntas em 11 grupos**. Destacar o `'Cascavel'` achado dentro do template: "isso hoje só apareceria na homologação, depois de um cidadão de outra cidade reclamar".

## 1:10 — A conversa (70 s)
Telegram/mock-chat, celular na câmera. Analista manda "oi". Agente se apresenta e faz as 4 primeiras perguntas (setor, zonas, documentos). Analista manda **foto da tabela de zoneamento**. Agente extrai 4 zonas × 8 parâmetros e confirma em uma linha: "Li ZR1, ZR2, ZC1 e ZI. Na ZR2 o recuo frontal é 4 m, confere?". Analista: "não sei a taxa". Agente registra pendência sem inventar.

## 2:20 — O formulário e o diff (40 s)
`npm run apply ...`. Abrir `diff.md`: cada mudança com a origem ("foto da Lei 1.204, p. 2", "Marcos, 10:03"). "O implantador lê isso em dois minutos em vez de fazer uma reunião de uma hora."

## 3:00 — A validação sem clique (45 s)
`npm run validate` no template cru: **12/15**, falha recuo, taxa de ocupação e cidade.
`npm run validate` no formulário de Vale Verde: **15/15**.
"Cada cenário é uma frase que o analista entende. O que falhar por regra de negócio vira pergunta no WhatsApp, não ticket."

## 3:45 — Métricas e fechamento (15 s)
Horas de reunião → 0 nos simples. Rodadas de homologação → 1. 4 projetos → 8 por implantador.

## Backup
Vídeo de 3 min gravado às 15h30 com o mesmo fluxo. Se a API cair, rodar só a parte determinística (analyze, apply, validate), que não depende de LLM.

## Perguntas prováveis da banca
- **"E quando o template não existe?"** O analisador funciona em qualquer Formly JSON; sem template, a ficha vira entrevista aberta guiada pelos tipos de ponto.
- **"Como garante que o agente não inventa regra?"** Toda resposta tem origem e confiança; abaixo de 0,8 não é aplicada; a ficha de exemplo tem 12 pendências explícitas.
- **"Isso entra na operação?"** A saída é o mesmo JSON do configurador. O passo seguinte é um botão "importar ficha" no configurador e trocar o Telegram pelo WhatsApp oficial.
