// Shared mutable state — single source of truth across all modules
export const _PREFERS_NO_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const SECTIONS_META = {
  dashboard:     { eyebrow: "// MÓDULO FINANCEIRO",       title: "PAINEL DE CONTROLE"       },
  despesas:      { eyebrow: "// GESTÃO FINANCEIRA",       title: "DESPESAS"                 },
  receitas:      { eyebrow: "// GESTÃO FINANCEIRA",       title: "RECEITAS"                 },
  moradores:     { eyebrow: "// GESTÃO DE PESSOAS",       title: "MORADORES"                },
  inadimplencia: { eyebrow: "// CONTROLE FINANCEIRO",     title: "INADIMPLÊNCIA"            },
  ia:            { eyebrow: "// INTELIGÊNCIA ARTIFICIAL", title: "CONDO//AI"                },
  avisos:        { eyebrow: "// COMUNICADOS",             title: "QUADRO DE AVISOS"         },
  reclamacoes:   { eyebrow: "// GESTÃO CONDOMINIAL",      title: "RECLAMAÇÕES"              },
  espacos:       { eyebrow: "// GESTÃO CONDOMINIAL",      title: "ESPAÇOS & RESERVAS"       },
  votacoes:      { eyebrow: "// GESTÃO CONDOMINIAL",      title: "VOTAÇÕES"                 },
  documentos:    { eyebrow: "// GESTÃO CONDOMINIAL",      title: "DOCUMENTOS"               },
  manutencoes:   { eyebrow: "// GESTÃO CONDOMINIAL",      title: "MANUTENÇÕES"              },
  mensagens:     { eyebrow: "// COMUNICAÇÃO",             title: "MENSAGENS"                },
  gestao:        { eyebrow: "// ADMINISTRAÇÃO",           title: "GESTÃO DE CONDOMÍNIOS"    },
};

export const state = {
  CONDOMINIO_ID:              null,
  secaoAtiva:                 "dashboard",
  _clockInterval:             null,
  _uptimeInterval:            null,
  editandoDesp:               null,
  editandoRec:                null,
  editandoMor:                null,
  editandoEsp:                null,
  _dadosIA:                   null,
  _iaHistorico:               [],
  _iaIniciada:                false,
  _avisoEditandoId:           null,
  _condoEditandoId:           null,
  _vincularCondoId:           null,
  _conversaAtivaMoradorId:    null,
  _conversaAtivaMoradorNome:  null,
  _adminChatPolling:          null,
};
