/**
 * Факты фокуса и действий пакета AI-резюме (версия 2 «на кого смотреть
 * и что делать»): до трёх карточек «Внимания» с менеджером, сигналом и
 * ссылкой на разбор, неотработанные сигналы риска пульса и звонки
 * повестки планёрки. Чистые функции «источник → факт или ничего».
 *
 * Карточки считаются тем же `buildAttentionItems`, что и вкладка
 * «Внимание», над строками кэша обзора в периметре — числа резюме
 * сходятся с вкладкой. В фокус идёт старшая карточка каждого менеджера:
 * три пункта — три разных человека. Ссылка карточки — ссылка на разбор
 * риск-звонка из кэша пульса (у обзора ссылок нет).
 */
import type { AiBriefFact } from '@lib/sales-ai-analytics';
import {
    AI_BRIEF_FACT_CODES,
    type AiBriefFactCode,
} from '../constants/ai-brief.const';
import {
    buildAttentionItems,
    topSignalByManager,
} from '../domain/presenter/attention.presenter';
import type { AiAttentionItemDto } from '../dto/ai-attention.dto';
import type { AiPulseDto } from '../dto/ai-pulse.dto';
import { inScope, rowsInScope } from './evidence-pack.overview';
import { briefFact, type BriefPackSources } from './evidence-pack.types';

/** Коды фактов фокуса по рангу карточки. */
const FOCUS_CODES: readonly AiBriefFactCode[] = [
    AI_BRIEF_FACT_CODES.focus1,
    AI_BRIEF_FACT_CODES.focus2,
    AI_BRIEF_FACT_CODES.focus3,
];

/** Карточки считаются один раз на набор источников (три факта фокуса). */
const itemsCache = new WeakMap<BriefPackSources, AiAttentionItemDto[]>();

function attentionItems(
    sources: BriefPackSources,
    managerIds: readonly string[],
): AiAttentionItemDto[] {
    if (!sources.overview) return [];
    const cached = itemsCache.get(sources);
    if (cached) return cached;
    // Map хранит порядок вставки — старшие карточки идут по рангу.
    const items = [
        ...topSignalByManager(
            buildAttentionItems(rowsInScope(sources.overview, managerIds)),
        ).values(),
    ];
    itemsCache.set(sources, items);

    return items;
}

/** Ссылка на разбор первого риск-звонка карточки из кэша пульса. */
function pulseLinkFor(
    item: AiAttentionItemDto,
    pulse: AiPulseDto | null,
): string | null {
    const ids = item.link.transcriptionIds ?? [];
    if (pulse === null || ids.length === 0) return null;
    const alert = pulse.alerts.find(
        candidate =>
            candidate.link !== null && ids.includes(candidate.transcriptionId),
    );

    return alert?.link ?? null;
}

/**
 * Факт фокуса по рангу карточки: фраза — заголовок карточки «Внимания»
 * как есть (он написан словами и сам называет сигнал), менеджер, тип
 * звонка, ссылка на разбор и код сигнала. Значение факта — первое
 * основание карточки (число из заголовка), сравнения нет.
 */
export function focusFact(
    sources: BriefPackSources,
    managerIds: readonly string[],
    index: number,
): AiBriefFact | null {
    const item = attentionItems(sources, managerIds)[index];
    const code = FOCUS_CODES[index];
    if (item === undefined || code === undefined) return null;
    const basis = item.basis[0];

    return briefFact(code, basis?.value ?? null, {
        text: item.headline,
        managerId: item.managerId,
        ...(item.link.callType === undefined
            ? {}
            : { callType: item.link.callType }),
        link: pulseLinkFor(item, sources.pulse),
        signal: item.signal,
        ...(basis === undefined ? {} : { n: basis.n }),
        comparable: false,
    });
}

/** Сборщик факта фокуса заданного ранга для таблицы состава пакета. */
export const focusFactAt =
    (index: number) =>
    (
        sources: BriefPackSources,
        managerIds: readonly string[],
    ): AiBriefFact | null =>
        focusFact(sources, managerIds, index);

/**
 * `alerts_unhandled` — сигналы риска пульса без отметки «отработан»
 * (feedback alert_handled); ссылка — на разбор первого из них. Без кэша
 * пульса факта нет: отметки живут только там.
 */
export function alertsUnhandledFact(
    sources: BriefPackSources,
    managerIds: readonly string[],
): AiBriefFact | null {
    const { pulse } = sources;
    if (pulse === null) return null;
    const unhandled = pulse.alerts.filter(
        alert =>
            alert.managerId !== null &&
            inScope(alert.managerId, managerIds) &&
            alert.handled !== true,
    );

    return briefFact(AI_BRIEF_FACT_CODES.alertsUnhandled, unhandled.length, {
        n: unhandled.length,
        link: unhandled.find(alert => alert.link !== null)?.link ?? null,
    });
}

/**
 * `agenda` — звонки повестки планёрки текущей недели в периметре; ссылка
 * — на разбор первого звонка. Звонки без менеджера считаются только тому,
 * кто видит весь портал (правило периметра витрины): иначе в резюме
 * попала бы ссылка на чужой звонок.
 */
export function agendaFact(
    sources: BriefPackSources,
    managerIds: readonly string[],
): AiBriefFact | null {
    const { agenda } = sources;
    if (agenda === null) return null;
    const seesAll = managerIds.length === 0;
    const items = agenda.items.filter(item =>
        item.managerId === null ? seesAll : inScope(item.managerId, managerIds),
    );

    return briefFact(AI_BRIEF_FACT_CODES.agenda, items.length, {
        n: items.length,
        link: items.find(item => item.link !== null)?.link ?? null,
    });
}
