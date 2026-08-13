import { BATCH_LINE_BREAK_SYMBOL } from '@lib/bitrix/consts/batch.consts';
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
    return `https://${domain}/crm/${URL_SEGMENT[entityType]}/details/${id}/`;
}

/**
 * Итог проверки дублей для timeline-комментария.
 *
 * ПЕРЕНОС СТРОК: комментарий уходит batch-командой, а там обычный `\n`
 * съедается — Битрикс склеивает весь текст в одну строку. Разделитель —
 * `BATCH_LINE_BREAK_SYMBOL` (`%0A`), иначе комментарий нечитаем.
 *
 * Оформление: BB-разметка Битрикса. Кандидат — заголовок с типом, именем
 * и баллом, под ним причина совпадения; название кандидата само является
 * ссылкой ([URL=…]…[/URL]) — голый url в тексте выглядит мусорно.
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

    lines.push(`[B]🔍 Проверка на дубли — ${levelTitle}[/B]`);
    if (total === 0) {
        lines.push('Дубликаты не найдены.');
        lines.push('');
        lines.push(`[I]Сигналы поиска: ${describeSignals(result)}[/I]`);
        return lines.join(BATCH_LINE_BREAK_SYMBOL);
    }

    lines.push(`Найдено кандидатов: [B]${total}[/B]`);
    lines.push('');

    const shown = result.candidates.slice(0, MAX_CANDIDATES_IN_COMMENT);
    shown.forEach((candidate, index) => {
        const url = entityCardUrl(domain, candidate.entityType, candidate.id);
        const title = candidate.title ?? `#${candidate.id}`;
        lines.push(
            `${index + 1}. ${TYPE_TITLE[candidate.entityType]} ` +
                `[URL=${url}][B]${title}[/B][/URL] — ${candidate.score} баллов`,
        );
        const reasons = describeReasons(candidate);
        if (reasons) lines.push(`     ↳ ${reasons}`);
    });
    if (total > shown.length) {
        lines.push('');
        lines.push(
            `[I]… и ещё ${total - shown.length} — весь список во фрейме «Звонки».[/I]`,
        );
    }

    lines.push('');
    lines.push(`[I]Сигналы поиска: ${describeSignals(result)}[/I]`);
    if (result.warnings.length) {
        lines.push(`[I]Примечания: ${result.warnings.join('; ')}[/I]`);
    }

    return lines.join(BATCH_LINE_BREAK_SYMBOL);
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
