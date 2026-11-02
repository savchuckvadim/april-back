/**
 * UF-поля ТМЦ-сделки, которыми отчёт связывает её с работой отдела продаж.
 * Имена фиксированы установкой pbx (одни на всех порталах); пишет их
 * `TmcDealService` при плане «Презентация», читает подстраховка
 * согласования заявок — по ним она узнаёт, что презентация по заявке
 * уже запланирована.
 */
export const TMC_DEAL_LINK_FIELD = {
    /** Основная сделка ОП, к которой привязана ТМЦ-сделка. */
    toBaseSales: 'UF_CRM_TO_BASE_SALES',
    /** Pres-сделка, созданная по согласованной заявке. */
    toPresentationSales: 'UF_CRM_TO_PRESENTATION_SALES',
    /** Менеджер ОП, которому назначена презентация. */
    managerOp: 'UF_CRM_MANAGER_OP',
    /** Кто проведёт презентацию (легаси дублировало managerOp). */
    lastPresDoneResponsible: 'UF_CRM_LAST_PRES_DONE_RESPONSIBLE',
} as const;
