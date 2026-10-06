import type { IPortal } from '@lib/portal-lib/portal/interfaces/portal.interface';

/** Портал после дозаполнения и что именно взято из локальной сборки. */
export interface PortalGapFill {
    portal: IPortal;
    /** Секции, взятые из локальной сборки (для лога). */
    filled: string[];
}

/**
 * Достраивает внешний слепок портала данными ЛОКАЛЬНОЙ сборки из нашей БД.
 *
 * Зачем: внешний Laravel-`getportal` отдаёт не все секции — на реальных
 * порталах у него бывает пустой `lead` (а поля лида pbx-install пишет
 * именно в нашу БД). Потребитель в этом случае считает поля
 * «неустановленными» и МОЛЧА пропускает записи: ни ошибки, ни данных.
 *
 * Правило простое и безопасное: секция берётся из локальной сборки,
 * только если внешняя ПУСТА. Внешние данные никогда не перетираются —
 * пока Laravel остаётся источником истины, он же и приоритетный.
 */
export const fillPortalGapsFromInternal = (
    external: IPortal,
    internal?: IPortal,
): PortalGapFill => {
    if (!internal) return { portal: external, filled: [] };

    const filled: string[] = [];
    const portal: IPortal = { ...external };

    portal.lead = mergeEntitySection(
        external.lead,
        internal.lead,
        'lead',
        filled,
    );
    portal.company = mergeEntitySection(
        external.company,
        internal.company,
        'company',
        filled,
    );
    portal.contact = mergeEntitySection(
        external.contact,
        internal.contact,
        'contact',
        filled,
    );
    if (!external.deals?.length && internal.deals?.length) {
        portal.deals = internal.deals;
        filled.push('deals');
    }

    return { portal, filled };
};

/**
 * Достройка ОДНОЙ секции сущности: поля и категории берутся из локальной
 * сборки независимо друг от друга — у внешнего портала встречается и
 * полностью отсутствующая секция, и секция с полями, но без стадий
 * (тогда «стадия не установлена» ломает SLA и движение статусов).
 */
const mergeEntitySection = <
    T extends { bitrixfields?: unknown[]; categories?: unknown[] },
>(
    external: T | undefined,
    internal: T | undefined,
    label: string,
    filled: string[],
): T | undefined => {
    if (!internal) return external;
    if (!external) {
        if (internal.bitrixfields?.length || internal.categories?.length) {
            filled.push(label);
            return internal;
        }
        return external;
    }

    const section = { ...external };
    if (!external.bitrixfields?.length && internal.bitrixfields?.length) {
        section.bitrixfields = internal.bitrixfields;
        filled.push(`${label}.fields`);
    }
    if (!external.categories?.length && internal.categories?.length) {
        section.categories = internal.categories;
        filled.push(`${label}.stages`);
    }
    return section;
};
