import { clientTitleOrNull } from '../../../shared/client-title';

type BxRow = Record<string, unknown>;

const text = (raw: unknown): string | null => {
    if (typeof raw === 'string') {
        const value = raw.trim();
        return value || null;
    }
    if (typeof raw === 'number') return String(raw);
    return null;
};

/**
 * Название НОВОЙ основной сделки ОП — по клиенту, а не по событию.
 *
 * Раньше сделка получала название события ХО (`name` хука): при ХО по
 * списку все сделки назывались одинаково — названием списка, и в воронке
 * их было не различить (garant, чат внедрения 07–08.10.2026; решение
 * Станишевской, Карнауховой, Карелина и владельца 13.10.2026). Название ХО
 * остаётся у ХО-сделки «ОП Холодные» и у задачи обзвона.
 *
 * Порядок: компания клиента → название компании из лида → название лида.
 * Номер вместо названия (ИНН в «Название компании» лида) пропускается —
 * см. {@link clientTitleOrNull}.
 * Существующей сделке название не меняется вовсе.
 */
export const baseDealTitle = (input: {
    company: BxRow | null;
    lead: BxRow | null;
    leadId: number;
}): string =>
    clientTitleOrNull(input.company?.TITLE) ??
    clientTitleOrNull(input.lead?.COMPANY_TITLE) ??
    text(input.lead?.TITLE) ??
    `Лид ${input.leadId}`;
