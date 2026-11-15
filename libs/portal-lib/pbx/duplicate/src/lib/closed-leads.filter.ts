import { DuplicateEntityType, DuplicateRawHit } from '../type/duplicate.type';

/**
 * Закрытые лиды в поиске дублей (настройка портала «Закрывать лиды по
 * итогу работы», lead_closing_enabled, 15.11.2026): лид в финале — успех
 * («Сконвертирован») или брак — не дубль живой работы.
 */

/** Лид в финале по STATUS_SEMANTIC_ID (S/F); не лид или семантики нет — undefined. */
export const closedLeadOf = (
    entityType: DuplicateEntityType,
    row: Record<string, unknown>,
): boolean | undefined => {
    if (entityType !== DuplicateEntityType.LEAD) return undefined;
    const raw = row.STATUS_SEMANTIC_ID;
    const semantic = typeof raw === 'string' ? raw : '';
    return semantic ? semantic === 'S' || semantic === 'F' : undefined;
};

/** Попадания без закрытых лидов (флаг выключен — как есть). */
export const dropClosedLeads = (
    hits: DuplicateRawHit[],
    exclude: boolean,
): DuplicateRawHit[] =>
    exclude
        ? hits.filter(
              hit =>
                  !(
                      hit.entityType === DuplicateEntityType.LEAD &&
                      hit.closedLead
                  ),
          )
        : hits;
