import {
    extractInnFromTitle,
    isValidInn,
    normalizeInnList,
} from '@lib/portal-lib/pbx-duplicate';
import {
    IInnObservation,
    IInnRequisiteCard,
    INN_SOURCE_KINDS,
    InnSourceKind,
} from '../type/inn.type';
import { InnFieldMap } from './inn-fields';
import { innId, innList, InnRow, innText } from './inn-row.util';

/**
 * СБОР НАБЛЮДЕНИЙ — ЧИСТЫЕ ФУНКЦИИ.
 *
 * Ходить в Битрикс здесь нечем и незачем: на вход приходят уже прочитанные
 * карточки. Благодаря этому один и тот же сбор используют два разных входа —
 * хук обогащения (он читает лиды сам) и ручка снимка, — и правила «что
 * слабое, что сильное» проверяются юнит-тестом без сети.
 *
 * Валидация значений — только `isValidInn` / `normalizeInnList` /
 * `extractInnFromTitle` из модуля дублей. Второй реализации контрольной
 * суммы в проекте быть не должно.
 */

/** Значения полей строки, прошедшие контрольную сумму. */
function fieldInns(row: InnRow, fields: readonly string[]): string[] {
    const found: string[] = [];
    for (const field of fields) {
        for (const value of innList(row[field])) {
            found.push(...normalizeInnList(value));
        }
    }
    return found;
}

function observations(
    inns: readonly string[],
    kind: InnSourceKind,
    entityId?: number,
    entityTitle?: string,
): IInnObservation[] {
    return inns.filter(isValidInn).map(inn => ({
        inn,
        kind,
        ...(entityId ? { entityId } : {}),
        ...(entityTitle ? { entityTitle } : {}),
    }));
}

export interface IInnGraphRows {
    dealId: number;
    deal: InnRow;
    /** Заявки сделки (`deal_from_lead_id`, `deal_joined_leads`, `LEAD_ID`). */
    leads?: readonly InnRow[];
    company?: InnRow | null;
    /** Карточки реквизитов компании и контактов сделки. */
    requisites?: readonly IInnRequisiteCard[];
}

/**
 * Все наблюдения графа сделки.
 *
 * Название разбирается именно `extractInnFromTitle`: он выбрасывает числа В
 * СКОБКАХ, где у заявок с сайта лежит номер обращения. Контрольной суммы
 * против него мало — десятизначный номер проходит её примерно в одном
 * случае из одиннадцати.
 */
export function observeInnGraph(
    rows: IInnGraphRows,
    fields: InnFieldMap,
): IInnObservation[] {
    const found: IInnObservation[] = [];
    const dealInn = fields.inn('deal');
    const dealPool = fields.pool('deal');
    if (dealInn) {
        found.push(
            ...observations(
                fieldInns(rows.deal, [dealInn]),
                INN_SOURCE_KINDS.deal_field,
                rows.dealId,
            ),
        );
    }
    if (dealPool) {
        found.push(
            ...observations(
                fieldInns(rows.deal, [dealPool]),
                INN_SOURCE_KINDS.deal_pool,
                rows.dealId,
            ),
        );
    }
    found.push(
        ...observations(
            extractInnFromTitle(innText(rows.deal.TITLE)),
            INN_SOURCE_KINDS.title,
            rows.dealId,
            innText(rows.deal.TITLE),
        ),
    );

    for (const lead of rows.leads ?? []) {
        const leadId = innId(lead.ID);
        found.push(
            ...observations(
                fieldInns(lead, fields.both('lead')),
                INN_SOURCE_KINDS.lead_field,
                leadId,
            ),
        );
        found.push(
            ...observations(
                extractInnFromTitle(innText(lead.TITLE)),
                INN_SOURCE_KINDS.title,
                leadId,
                innText(lead.TITLE),
            ),
        );
        /*
         * Часть менеджеров пишет в поле «Компания» лида не название, а ИНН
         * (Ростов, лид 155867: «2310190443»). Это не догадка из текста —
         * человек ввёл ИНН руками, поэтому источник равен полю лида, а не
         * «слабому» названию.
         */
        found.push(
            ...observations(
                normalizeInnList(innText(lead.COMPANY_TITLE)),
                INN_SOURCE_KINDS.lead_field,
                leadId,
            ),
        );
    }

    const company = rows.company;
    if (company) {
        const companyId = innId(company.ID);
        const title = innText(company.TITLE);
        found.push(
            ...observations(
                fieldInns(company, fields.both('company')),
                INN_SOURCE_KINDS.company_field,
                companyId,
                title,
            ),
        );
        found.push(
            ...observations(
                extractInnFromTitle(title),
                INN_SOURCE_KINDS.title,
                companyId,
                title,
            ),
        );
    }

    for (const card of rows.requisites ?? []) {
        if (!card.inn) continue;
        found.push(
            ...observations(
                normalizeInnList(card.inn),
                card.ownerType === 'company'
                    ? INN_SOURCE_KINDS.company_requisite
                    : INN_SOURCE_KINDS.contact_requisite,
                card.id,
                card.ownerTitle || card.companyName,
            ),
        );
    }

    return found;
}

/** `L_12` / `12` / массив — в список id (связь сделка→лид кастомная). */
export function innRefIds(raw: unknown): number[] {
    const values = Array.isArray(raw) ? (raw as unknown[]) : [raw];
    const ids: number[] = [];
    for (const value of values) {
        // `innText` отбрасывает всё, что не строка и не число: объект в
        // поле-связи означал бы другую форму ответа, а не id.
        const match = /(\d+)/.exec(innText(value));
        const id = match ? Number(match[1]) : 0;
        if (Number.isFinite(id) && id > 0) ids.push(id);
    }
    return ids;
}
