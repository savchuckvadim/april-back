import { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';

/**
 * Строка о закрытой аналитической сделке для заметки в задачах.
 *
 * Заметку читает менеджер клиента, поэтому воронка — её названием на
 * портале, а не кодом: раньше в задаче стояло «sales_xo #96225 …»
 * (garant 06.11.2026).
 */
export const closedSatelliteLabel = (
    category: Pick<IPCategory, 'title' | 'name'> | undefined,
    dealId: number,
    dealTitle: string,
): string => {
    const funnel =
        category?.title?.trim() || category?.name?.trim() || 'Сделка';
    return `${funnel} #${dealId} «${dealTitle}»`;
};
