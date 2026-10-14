import { ColdOwner } from '../cold-owner.type';

/**
 * Привязки задачи ХО: компания (если есть), основная сделка; у клиента без
 * компании — ещё лид входной сделки, чтобы задача находилась по `L_`.
 *
 * ХО-сделку в задачу НЕ кладём, когда есть основная (garant, 14.10.2026):
 * воронка «ОП Холодные» аналитическая, у менеджеров на неё нет прав —
 * из задачи они попадали в «Недостаточно прав» или переносили ХО-сделку в
 * «ОП Основная» и работали в копии, а настоящая основная висела без задачи.
 * «Звонки» находят ХО-сделку по её ссылке на основную (`to_base_sales`).
 *
 * Основной нет (стадия «Холодные» не сопоставлена) — привязываем ХО-сделку,
 * иначе задача осталась бы без сделки.
 */
export const coldTaskBindings = (
    owner: ColdOwner,
    baseDealId: string | null,
    xoDealId: string,
): string[] => {
    const crms: string[] = [];
    if (owner.kind === 'company') crms.push(`CO_${owner.companyId}`);
    crms.push(`D_${baseDealId ?? xoDealId}`);
    if (owner.kind === 'deal' && owner.leadId) crms.push(`L_${owner.leadId}`);
    return crms;
};
