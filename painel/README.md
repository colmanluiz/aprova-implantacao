# Painel do implantador

Contrato de dados para `painel/data.json` (gerado por `scripts/painel-data.ts`, a escrever na tarefa C2):

```json
{
  "cidade": "Vale Verde",
  "gerado_em": "2026-10-24T15:00:00Z",
  "metricas": {
    "processos_total": 96,
    "por_etapa": { "nao_iniciado": 90, "coletando": 3, "aguardando_prefeitura": 2, "validado": 0, "pronto_para_homologacao": 1 },
    "horas_reuniao_evitadas": 1,
    "perguntas_feitas": 37,
    "respondidas_por_mensagem": 20,
    "respondidas_por_anexo": 5,
    "pendencias_abertas": 12,
    "cenarios_rodados": 15,
    "cenarios_passando": 15
  },
  "secretarias": [
    { "nome": "Planejamento Urbano",
      "processos": [
        { "id": "p001", "processo": "Alvará de Construção", "complexidade": "complexo", "etapa": "pronto_para_homologacao",
          "pendencias": 12, "perguntas_feitas": 37, "mensagens": 9, "cenarios": "15/15", "atualizado_em": "..." }
      ] }
  ]
}
```

Fonte: `fixtures/seed/processos.json` (12 secretarias, 96 processos) sobreposto por `data/<cidade>/<slug>/estado.json`, `ficha.json`, `relatorio.json` e `metricas.json` quando existirem. O slug do processo é `slugify(processo)` de `src/core/patcher.ts`; o alvará de exemplo está em `data/vale-verde/alvara/`, então mapeie `alvara` → `p001`.
