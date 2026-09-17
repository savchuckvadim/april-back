import { normalizeInn, uniq } from '@lib/portal-lib/pbx-duplicate';
import {
    IInnAuditEvent,
    IInnCandidate,
    IInnConflict,
    IInnCurrent,
    IInnObservation,
    IInnRequisiteCard,
    IInnSnapshot,
    INN_AUDIT_ACTIONS,
    INN_CONFLICT_KINDS,
    INN_CONFLICT_LEVELS,
    INN_ORIGINS,
    INN_SOURCE_KINDS,
    InnOrigin,
} from '../type/inn.type';
import { foldInnAudit } from './inn-audit.codec';
import { candidateValues, mergeInnObservations } from './inn-candidate.util';
import { InnFieldMap } from './inn-fields';
import { innList, InnRow, innText } from './inn-row.util';
import { innSnapshotVersion } from './inn-version.util';

/**
 * СБОРКА СНИМКА — ЧИСТАЯ ФУНКЦИЯ.
 *
 * Ей на вход отдают уже прочитанное состояние, на выходе — ровно то, что
 * увидит менеджер во вкладке «ИНН». Поэтому все правила (кто ведущий, какие
 * конфликты показывать, что считать «непроверенной догадкой») проверяются
 * тестами без Битрикса.
 */

export interface IInnComposeInput {
    dealId: number;
    domain: string;
    deal: InnRow;
    closed: boolean;
    companyId: number;
    observations: readonly IInnObservation[];
    requisites: readonly IInnRequisiteCard[];
    requisitesReadable: boolean;
    linkedRequisiteId: number;
    audit: readonly IInnAuditEvent[];
    otherCompanies: ReadonlyMap<string, number[]>;
    fields: InnFieldMap;
}

export function composeInnSnapshot(input: IInnComposeInput): IInnSnapshot {
    const innName = input.fields.inn('deal');
    const poolName = input.fields.pool('deal');
    const current = innName ? innText(input.deal[innName]) : '';
    const pool = poolName ? innList(input.deal[poolName]) : [];

    const { hidden, lastByInn } = foldInnAudit(input.audit);
    /*
     * Пул сделки уже разобран наблюдениями (`observeInnGraph` читает
     * `op_inn_pool`), поэтому значение, источник которого сегодня не виден
     * (компанию отцепили, заявку удалили), не теряется: оно остаётся
     * кандидатом с подписью «из накопленных вариантов сделки».
     */
    const manual = manualObservations(input.audit);
    const candidates = mergeInnObservations(
        [...input.observations, ...manual],
        {
            pool,
            current,
            hidden,
        },
    );

    const linkedRequisite = input.requisites.find(
        card => card.id === input.linkedRequisiteId,
    );

    return {
        dealId: input.dealId,
        domain: input.domain,
        readOnly: input.closed,
        version: innSnapshotVersion({
            current,
            pool,
            hidden,
            candidates: candidateValues(candidates),
            companyId: input.companyId,
            requisiteId: input.linkedRequisiteId,
        }),
        current: describeCurrent(
            current,
            candidates,
            lastByInn,
            linkedRequisite,
        ),
        candidates,
        requisites: [...input.requisites],
        conflicts: collectConflicts(
            input,
            current,
            candidates,
            linkedRequisite,
        ),
        availability: input.fields.availability(input.requisitesReadable),
        warnings: [],
    };
}

/** Значения, добавленные человеком, — из записей таймлайна. */
function manualObservations(
    audit: readonly IInnAuditEvent[],
): IInnObservation[] {
    const byInn = new Map<string, IInnObservation>();
    for (const event of audit) {
        if (event.action !== INN_AUDIT_ACTIONS.choose) continue;
        byInn.set(event.inn, {
            inn: event.inn,
            kind: INN_SOURCE_KINDS.manual,
            ...(event.userName ? { userName: event.userName } : {}),
            ...(event.at ? { at: event.at } : {}),
        });
    }
    return [...byInn.values()];
}

function describeCurrent(
    current: string,
    candidates: readonly IInnCandidate[],
    lastByInn: ReadonlyMap<string, IInnAuditEvent>,
    linkedRequisite: IInnRequisiteCard | undefined,
): IInnCurrent | null {
    if (!current) return null;
    const event = lastByInn.get(current);
    let origin: InnOrigin = INN_ORIGINS.unknown;
    if (linkedRequisite && linkedRequisite.inn === current) {
        origin = INN_ORIGINS.requisite;
    } else if (event?.action === INN_AUDIT_ACTIONS.choose) {
        origin = INN_ORIGINS.manual;
    } else if (event?.action === INN_AUDIT_ACTIONS.auto) {
        origin = INN_ORIGINS.auto;
    }

    return {
        inn: current,
        digits: current.length,
        origin,
        ...(event?.userName ? { userName: event.userName } : {}),
        ...(event?.at ? { at: event.at } : {}),
        ...(linkedRequisite && linkedRequisite.inn === current
            ? { requisiteId: linkedRequisite.id }
            : {}),
        /*
         * «Непроверенная догадка» (раздел 5 постановки): значение стоит,
         * записи о выборе нет, а вариантов было больше одного — ровно так
         * работал ночной догон 17.09. Фронт показывает «проставлено
         * автоматически, подтвердите».
         */
        unverified: origin === INN_ORIGINS.unknown && candidates.length > 1,
    };
}

function collectConflicts(
    input: IInnComposeInput,
    current: string,
    candidates: readonly IInnCandidate[],
    linkedRequisite: IInnRequisiteCard | undefined,
): IInnConflict[] {
    const conflicts: IInnConflict[] = [];

    if (!input.fields.inn('deal') || !input.fields.pool('deal')) {
        conflicts.push({
            kind: INN_CONFLICT_KINDS.fields_missing,
            level: INN_CONFLICT_LEVELS.error,
            message:
                'Поля «ИНН» и «ИНН варианты» не установлены на портале — ' +
                'запустите установщик полей, иначе выбор сохранить некуда.',
        });
    }

    if (!input.requisitesReadable) {
        conflicts.push({
            kind: INN_CONFLICT_KINDS.requisites_denied,
            level: INN_CONFLICT_LEVELS.warning,
            message:
                'Реквизиты клиента недоступны: у интеграции нет прав на ' +
                'справочник реквизитов. Показаны только поля карточек.',
        });
    }

    if (!current && candidates.length) {
        conflicts.push({
            kind: INN_CONFLICT_KINDS.not_chosen,
            level: INN_CONFLICT_LEVELS.error,
            message: 'ИНН договора не выбран — выберите плательщика.',
        });
    }

    if (
        linkedRequisite &&
        current &&
        linkedRequisite.inn &&
        linkedRequisite.inn !== current
    ) {
        conflicts.push({
            kind: INN_CONFLICT_KINDS.requisite_mismatch,
            level: INN_CONFLICT_LEVELS.error,
            message:
                `ИНН договора (${current}) не совпадает с ИНН привязанного ` +
                `реквизита (${linkedRequisite.inn}) — документы уедут с разными ИНН.`,
            inn: current,
            entityIds: [linkedRequisite.id],
        });
    }

    if (
        linkedRequisite &&
        linkedRequisite.ownerType === 'company' &&
        input.companyId &&
        linkedRequisite.ownerId !== input.companyId
    ) {
        conflicts.push({
            kind: INN_CONFLICT_KINDS.requisite_foreign,
            level: INN_CONFLICT_LEVELS.error,
            message:
                'К сделке привязан реквизит другой компании ' +
                `(№${linkedRequisite.ownerId}) — проверьте клиента сделки.`,
            entityIds: [linkedRequisite.ownerId],
        });
    }

    if (
        current &&
        input.requisitesReadable &&
        !input.requisites.some(
            card => normalizeInn(card.inn) === normalizeInn(current),
        )
    ) {
        conflicts.push({
            kind: INN_CONFLICT_KINDS.inn_without_requisite,
            level: INN_CONFLICT_LEVELS.warning,
            message:
                'По этому ИНН у клиента нет реквизита — печатная форма будет ' +
                'неполной. Создайте реквизит: 10 знаков — юрлицо, 12 — ИП.',
            inn: current,
        });
    }

    for (const [inn, companies] of input.otherCompanies) {
        if (!candidates.some(candidate => candidate.inn === inn)) continue;
        conflicts.push({
            kind: INN_CONFLICT_KINDS.inn_other_company,
            level: INN_CONFLICT_LEVELS.warning,
            message:
                `ИНН ${inn} есть в реквизитах другой компании портала ` +
                `(${uniq(companies)
                    .map(id => `№${id}`)
                    .join(', ')}) — проверьте в модуле дублей.`,
            inn,
            entityIds: uniq(companies),
        });
    }

    return conflicts;
}
