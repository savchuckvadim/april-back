import {
    crmCardUrl,
    timelineBold,
    timelineLink,
    timelineText,
} from '@lib/bitrix/consts/timeline.consts';
import {
    DuplicateCandidate,
    DuplicateEntityType,
    DuplicateMatchReason,
    DuplicateSearchResult,
    DuplicateSignalKind,
    SEARCH_VIA,
} from '@lib/portal-lib/pbx-duplicate';

/** В комментарий попадают максимум N кандидатов — остальное строкой «и ещё…». */
const MAX_CANDIDATES_IN_COMMENT = 7;

/** Сегмент URL карточки по типу сущности. */
const URL_SEGMENT: Record<DuplicateEntityType, string> = {
    [DuplicateEntityType.LEAD]: 'lead',
    [DuplicateEntityType.CONTACT]: 'contact',
    [DuplicateEntityType.COMPANY]: 'company',
    [DuplicateEntityType.DEAL]: 'deal',
};

/** Русское название типа сущности для комментария. */
const TYPE_TITLE: Record<DuplicateEntityType, string> = {
    [DuplicateEntityType.LEAD]: 'Лид',
    [DuplicateEntityType.CONTACT]: 'Контакт',
    [DuplicateEntityType.COMPANY]: 'Компания',
    [DuplicateEntityType.DEAL]: 'Сделка',
};

const KIND_TITLE: Record<DuplicateSignalKind, string> = {
    [DuplicateSignalKind.PHONE]: 'телефон',
    [DuplicateSignalKind.EMAIL]: 'email',
    [DuplicateSignalKind.INN]: 'ИНН',
    [DuplicateSignalKind.TITLE]: 'название',
};

/** Ссылка на карточку сущности портала. */
export function entityCardUrl(
    domain: string,
    entityType: DuplicateEntityType,
    id: number,
): string {
    return crmCardUrl(domain, URL_SEGMENT[entityType], id);
}

/**
 * Итог проверки дублей для timeline-комментария.
 *
 * ОФОРМЛЕНИЕ — HTML, НЕ BB-КОД: `[URL=…]` в таймлайне карточки доезжает
 * сырым текстом (см. `@lib/bitrix/consts/timeline.consts`). Кандидат —
 * строка с типом, кликабельным названием и баллом, под ней причина
 * совпадения: голый url в тексте выглядит мусорно.
 *
 * ПЕРЕНОСЫ — обычные `\n`. К batch-проводу комментарий готовит вызывающий
 * (`toTimelineComment`): экранирование — свойство транспорта, а не текста,
 * и делать его дважды нельзя.
 *
 * Чистая функция без обращений к Bitrix — легко тестируется.
 */
export function formatDuplicateTimelineComment(
    domain: string,
    result: DuplicateSearchResult,
    levelTitle: string,
): string {
    const lines: string[] = [];
    const total = result.candidates.length;

    lines.push(timelineBold(`🔍 Проверка на дубли — ${levelTitle}`));
    if (total === 0) {
        lines.push('Дубликаты не найдены.');
        lines.push('');
        lines.push(`Сигналы поиска: ${timelineText(describeSignals(result))}`);
        return lines.join('\n');
    }

    lines.push(`Найдено кандидатов: ${timelineBold(String(total))}`);
    lines.push('');

    const shown = result.candidates.slice(0, MAX_CANDIDATES_IN_COMMENT);
    shown.forEach((candidate, index) => {
        const url = entityCardUrl(domain, candidate.entityType, candidate.id);
        const title = candidate.title ?? `#${candidate.id}`;
        lines.push(
            `${index + 1}. ${TYPE_TITLE[candidate.entityType]} ` +
                `${timelineLink(url, title)} — ${candidate.score} баллов`,
        );
        const reasons = describeReasons(candidate);
        if (reasons) lines.push(`     ↳ ${timelineText(reasons)}`);
    });
    if (total > shown.length) {
        lines.push('');
        lines.push(
            `… и ещё ${total - shown.length} — весь список во фрейме «Звонки».`,
        );
    }

    lines.push('');
    lines.push(`Сигналы поиска: ${timelineText(describeSignals(result))}`);
    if (result.warnings.length) {
        lines.push(`Примечания: ${timelineText(result.warnings.join('; '))}`);
    }

    return lines.join('\n');
}

/** «телефон 8005553535 (findbycomm), ИНН 4826… (реквизиты)». */
function describeReasons(candidate: DuplicateCandidate): string {
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const reason of candidate.reasons) {
        const part = describeReason(reason);
        if (seen.has(part)) continue;
        seen.add(part);
        parts.push(part);
    }
    return parts.join(', ');
}

function describeReason(reason: DuplicateMatchReason): string {
    const kind = KIND_TITLE[reason.kind] ?? String(reason.kind);
    return `${kind} ${reason.value} (${viaTitle(reason.via)})`;
}

/** Человекочитаемый механизм находки. */
function viaTitle(via: string): string {
    if (via === SEARCH_VIA.FINDBYCOMM) return 'телефон/email базы';
    if (via === SEARCH_VIA.RQ_INN) return 'реквизиты';
    if (via === SEARCH_VIA.TITLE || via === SEARCH_VIA.COMPANY_TITLE) {
        return 'подстрока в названии';
    }
    if (via.startsWith('UF_')) return `поле ${via}`;
    return via;
}

function describeSignals(result: DuplicateSearchResult): string {
    const parts: string[] = [];
    const { phones, emails, inns, titles } = result.signals;
    if (phones.length) parts.push(`телефоны — ${phones.length}`);
    if (emails.length) parts.push(`email — ${emails.length}`);
    if (inns.length) parts.push(`ИНН — ${inns.length}`);
    if (titles.length) parts.push(`названия — ${titles.length}`);
    return parts.join(', ') || 'нет';
}
