import {
    TemplateCandidate,
    TemplateCriteria,
    TemplateMatch,
    TemplateRankTuple,
} from '../document-template.criteria';
import { listMatches } from './template-lists.util';

/** Разряды кортежа от старшего к младшему. Порядок — часть контракта. */
const TUPLE_ORDER = [
    'portalExact',
    'agentExact',
    'supplyExact',
    'clientExact',
    'isDefault',
    'recency',
] as const satisfies readonly (keyof TemplateRankTuple)[];

const bool = (value: boolean): 0 | 1 => (value ? 1 : 0);

/**
 * Свежесть в миллисекундах.
 *
 * ВНИМАНИЕ: `created_at`/`updated_at` на всех четырёх таблицах nullable, без
 * `@default(now())` и без `@updatedAt`, и сервисы их сегодня НЕ пишут —
 * поэтому разряд почти всегда вырождается в 0. Это осознанно: он даёт
 * выигрыш, как только CRUD начнёт проставлять таймстампы, и не ломает
 * детерминизм до тех пор (ничью разрешает id, см. `compareCandidates`).
 */
const recencyOf = (candidate: TemplateCandidate): number =>
    candidate.updatedAt?.getTime() ?? candidate.createdAt?.getTime() ?? 0;

export function buildRankTuple(
    candidate: TemplateCandidate,
    criteria: TemplateCriteria,
): TemplateRankTuple {
    return {
        portalExact: bool(
            criteria.portalId !== null &&
                candidate.portalId !== null &&
                candidate.portalId === criteria.portalId,
        ),
        agentExact: bool(
            criteria.agentId !== null &&
                candidate.agentId !== null &&
                candidate.agentId === criteria.agentId,
        ),
        supplyExact: bool(
            candidate.supplyTypes !== null &&
                listMatches(candidate.supplyTypes, criteria.supplyType),
        ),
        clientExact: bool(
            candidate.clientTypes !== null &&
                listMatches(candidate.clientTypes, criteria.clientType),
        ),
        isDefault: bool(candidate.isDefault),
        recency: recencyOf(candidate),
    };
}

/**
 * Подходит ли кандидат вообще. Жёсткие отсечки, которые НЕ ранжируются:
 * шаблон, привязанный к другому порталу/поставщику/типу, не должен
 * участвовать в сравнении даже с нулевым разрядом.
 *
 * `contract_type` здесь НЕ проверяется: для договора это жёсткое равенство
 * в SQL (через него резолвер не откатывается), и репозиторий обязан
 * отфильтровать его до вызова ранжировщика.
 */
export function isEligible(
    candidate: TemplateCandidate,
    criteria: TemplateCriteria,
): boolean {
    const portalOk =
        candidate.portalId === null ||
        (criteria.portalId !== null &&
            candidate.portalId === criteria.portalId);

    const agentOk =
        candidate.agentId === null ||
        (criteria.agentId !== null && candidate.agentId === criteria.agentId);

    return (
        portalOk &&
        agentOk &&
        listMatches(candidate.supplyTypes, criteria.supplyType) &&
        listMatches(candidate.clientTypes, criteria.clientType)
    );
}

/**
 * Лексикографическое сравнение. > 0 — первый кандидат сильнее.
 *
 * Последний разряд — id: он делает порядок ТОТАЛЬНЫМ, поэтому победитель
 * всегда детерминирован и «подбрасывания монетки» не бывает. id сравнивается
 * как строка (у счёта это CHAR(36)-uuid), а при равной длине это совпадает
 * с числовым порядком для BigInt-таблиц — чего достаточно, так как id
 * уникален и нужен лишь для устойчивости сортировки.
 */
export function compareCandidates(a: TemplateMatch, b: TemplateMatch): number {
    for (const key of TUPLE_ORDER) {
        const diff = b.tuple[key] - a.tuple[key];
        if (diff !== 0) {
            return diff;
        }
    }
    return a.candidate.id.localeCompare(b.candidate.id);
}

function describe(
    tuple: TemplateRankTuple,
    candidate: TemplateCandidate,
): string {
    const parts = [
        tuple.portalExact ? 'портал' : 'общий (без портала)',
        tuple.agentExact ? 'поставщик' : 'любой поставщик',
    ];
    if (tuple.supplyExact) {
        parts.push(`тип поставки (${candidate.supplyTypes?.join(',')})`);
    }
    if (tuple.clientExact) {
        parts.push(`тип клиента (${candidate.clientTypes?.join(',')})`);
    }
    if (candidate.contractType) {
        parts.push(`тип договора ${candidate.contractType}`);
    }
    if (tuple.isDefault) {
        parts.push('по умолчанию');
    }
    return `Подобран по: ${parts.join(', ')}`;
}

/**
 * Ранжирование кандидатов. Чистая функция: ни DI, ни Prisma, ни Nest —
 * чтобы её можно было покрыть матрицей вариантов без БД.
 *
 * На входе — УЖЕ отфильтрованный жёсткими условиями список
 * (is_active, is_archived, contract_type). Возвращает победителя и всех
 * остальных в порядке убывания силы: вызывающий код использует хвост,
 * чтобы заметить неоднозначность (`ambiguous`) и залогировать её.
 */
export function rankTemplates(
    candidates: readonly TemplateCandidate[],
    criteria: TemplateCriteria,
): {
    winner: TemplateMatch | null;
    ranked: TemplateMatch[];
    ambiguous: boolean;
} {
    const ranked = candidates
        .filter(candidate => isEligible(candidate, criteria))
        .map(candidate => {
            const tuple = buildRankTuple(candidate, criteria);
            return { candidate, tuple, reason: describe(tuple, candidate) };
        })
        .sort(compareCandidates);

    const winner = ranked[0] ?? null;

    // Неоднозначность — это дефект ДАННЫХ, а не повод падать: два шаблона
    // с полностью совпадающим кортежем. Победитель всё равно определён
    // (ничью разрешает id), документ выдаётся, а вызывающий логирует warn.
    const ambiguous =
        ranked.length > 1 &&
        TUPLE_ORDER.every(key => ranked[0].tuple[key] === ranked[1].tuple[key]);

    return { winner, ranked, ambiguous };
}
