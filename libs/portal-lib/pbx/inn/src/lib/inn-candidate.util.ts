import { uniq } from '@lib/portal-lib/pbx-duplicate';
import {
    IInnCandidate,
    IInnCandidateSource,
    IInnObservation,
    INN_SOURCE_KINDS,
    INN_STRENGTHS,
    InnSourceKind,
    InnStrength,
} from '../type/inn.type';

/**
 * Сборка кандидатов из наблюдений — чистая функция без Битрикса, поэтому
 * правила «что сильное, что слабое» проверяются тестом, а не на бою.
 */

/** Сила по источнику. Слабое — ТОЛЬКО название. */
const STRENGTH_BY_KIND: Record<InnSourceKind, InnStrength> = {
    [INN_SOURCE_KINDS.company_requisite]: INN_STRENGTHS.strong,
    [INN_SOURCE_KINDS.contact_requisite]: INN_STRENGTHS.strong,
    [INN_SOURCE_KINDS.manual]: INN_STRENGTHS.strong,
    [INN_SOURCE_KINDS.deal_field]: INN_STRENGTHS.normal,
    [INN_SOURCE_KINDS.deal_pool]: INN_STRENGTHS.normal,
    [INN_SOURCE_KINDS.company_field]: INN_STRENGTHS.normal,
    [INN_SOURCE_KINDS.lead_field]: INN_STRENGTHS.normal,
    [INN_SOURCE_KINDS.title]: INN_STRENGTHS.weak,
};

/** Порядок доверия: первый подходящий источник даёт главную подпись. */
const KIND_ORDER: readonly InnSourceKind[] = [
    INN_SOURCE_KINDS.company_requisite,
    INN_SOURCE_KINDS.contact_requisite,
    INN_SOURCE_KINDS.manual,
    INN_SOURCE_KINDS.deal_field,
    INN_SOURCE_KINDS.company_field,
    INN_SOURCE_KINDS.lead_field,
    INN_SOURCE_KINDS.deal_pool,
    INN_SOURCE_KINDS.title,
];

const STRENGTH_ORDER: readonly InnStrength[] = [
    INN_STRENGTHS.strong,
    INN_STRENGTHS.normal,
    INN_STRENGTHS.weak,
];

/** Человеческая подпись источника — её показывает фронт под радиокнопкой. */
export function describeInnSource(observation: IInnObservation): string {
    const title = observation.entityTitle?.trim();
    const id = observation.entityId;
    switch (observation.kind) {
        case INN_SOURCE_KINDS.company_requisite:
            return title
                ? `из реквизита компании «${title}»`
                : 'из реквизита компании';
        case INN_SOURCE_KINDS.contact_requisite:
            return title
                ? `из реквизита контакта «${title}»`
                : 'из реквизита контакта';
        case INN_SOURCE_KINDS.manual:
            return [
                'добавил',
                observation.userName ?? 'сотрудник',
                formatRuDate(observation.at),
            ]
                .filter(Boolean)
                .join(' ');
        case INN_SOURCE_KINDS.deal_field:
            return 'текущий ИНН договора';
        case INN_SOURCE_KINDS.company_field:
            return title
                ? `из карточки компании «${title}»`
                : 'из карточки компании';
        case INN_SOURCE_KINDS.lead_field:
            return id ? `из заявки (лид №${id})` : 'из заявки';
        case INN_SOURCE_KINDS.deal_pool:
            return 'из накопленных вариантов сделки';
        case INN_SOURCE_KINDS.title:
            return 'из названия — проверьте';
    }
}

/** `2026-09-17T10:00:00+03:00` → `17.09.2026`; пусто → пустая строка. */
function formatRuDate(iso: string | undefined): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/** Сильнейшая из двух сил. */
function strongest(left: InnStrength, right: InnStrength): InnStrength {
    return STRENGTH_ORDER.indexOf(left) <= STRENGTH_ORDER.indexOf(right)
        ? left
        : right;
}

export interface IMergeCandidatesOptions {
    /** Значения, уже лежащие в `op_inn_pool` сделки. */
    pool: readonly string[];
    /** Текущий `op_inn` сделки. */
    current: string;
    /** Скрытые человеком значения. */
    hidden: readonly string[];
}

/**
 * Наблюдения → кандидаты. Порядок: текущий, затем сильные, затем слабые;
 * внутри группы — порядок появления (пул раньше названий).
 */
export function mergeInnObservations(
    observations: readonly IInnObservation[],
    options: IMergeCandidatesOptions,
): IInnCandidate[] {
    const pool = new Set(options.pool);
    const hidden = new Set(options.hidden);
    const byInn = new Map<string, IInnCandidate>();

    for (const observation of observations) {
        const inn = observation.inn;
        if (!inn) continue;
        const source: IInnCandidateSource = {
            kind: observation.kind,
            label: describeInnSource(observation),
            ...(observation.entityId ? { entityId: observation.entityId } : {}),
        };
        const existing = byInn.get(inn);
        if (existing) {
            if (!existing.sources.some(item => sameSource(item, source))) {
                existing.sources.push(source);
            }
            existing.strength = strongest(
                existing.strength,
                STRENGTH_BY_KIND[observation.kind],
            );
            continue;
        }
        byInn.set(inn, {
            inn,
            digits: inn.length,
            strength: STRENGTH_BY_KIND[observation.kind],
            label: source.label,
            sources: [source],
            inPool: pool.has(inn),
            isCurrent: options.current === inn,
            hidden: hidden.has(inn),
        });
    }

    for (const candidate of byInn.values()) {
        candidate.sources.sort(
            (left, right) =>
                KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind),
        );
        candidate.label = candidate.sources[0]?.label ?? candidate.label;
    }

    return [...byInn.values()].sort((left, right) => {
        if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
        if (left.hidden !== right.hidden) return left.hidden ? 1 : -1;
        return (
            STRENGTH_ORDER.indexOf(left.strength) -
            STRENGTH_ORDER.indexOf(right.strength)
        );
    });
}

function sameSource(
    left: IInnCandidateSource,
    right: IInnCandidateSource,
): boolean {
    return left.kind === right.kind && left.entityId === right.entityId;
}

/**
 * Что автоматика имеет право поставить в пустой `op_inn`.
 *
 * ТОЛЬКО когда кандидат ровно один и он не «слабый». Ночной догон ставил
 * «первый валидный из многих» — так и появились четыре тысячи догадок,
 * которые теперь не отличить от выбора человека (раздел 5 постановки).
 */
export function pickAutoInn(
    candidates: readonly IInnCandidate[],
): string | null {
    const usable = candidates.filter(
        candidate =>
            !candidate.hidden && candidate.strength !== INN_STRENGTHS.weak,
    );
    if (usable.length !== 1) return null;
    return usable[0].inn;
}

/** Значения кандидатов в порядке показа (для пула и для хеша версии). */
export function candidateValues(
    candidates: readonly IInnCandidate[],
): string[] {
    return uniq(candidates.map(candidate => candidate.inn));
}
