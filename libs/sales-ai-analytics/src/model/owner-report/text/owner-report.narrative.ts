import {
    findAlienNumber,
    findCausal,
    findForbidden,
    wordCount,
} from '../../brief-factcheck';
import { extractNumbers, numberKeys } from '../../brief-numbers';
import type {
    OwnerReportLeakText,
    OwnerReportManagerText,
    OwnerReportText,
} from './owner-report.text.types';

/**
 * Модель поверх шаблона: резюме для собственника, абзацы утечек и выводы по
 * сотрудникам. Контракт — строгая JSON-схема; приём — факт-чек по правилам
 * AI-резюме обзора: каждое число ответа обязано быть в шаблонном тексте,
 * без стоп-слов и каузальных оборотов, не длиннее лимита. Что не прошло —
 * остаётся шаблоном, отчёт выходит всегда.
 */

export const OWNER_REPORT_NARRATIVE_SCHEMA_NAME = 'owner_report_narrative';
export const OWNER_REPORT_NARRATIVE_VERSION = 'owner-narrative-v1-2026-11-06';

export const NARRATIVE_LIMITS = {
    summaryParagraphs: { min: 3, max: 7 },
    paragraphWords: 70,
    bulletWords: 30,
    conclusionWords: 60,
} as const;

export const OWNER_REPORT_NARRATIVE_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        summary: {
            type: 'array',
            items: { type: 'string' },
            minItems: NARRATIVE_LIMITS.summaryParagraphs.min,
            maxItems: NARRATIVE_LIMITS.summaryParagraphs.max,
        },
        leaks: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    code: { type: 'string' },
                    text: { type: 'string' },
                },
                required: ['code', 'text'],
                additionalProperties: false,
            },
        },
        managers: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    managerId: { type: 'string' },
                    strengths: { type: 'array', items: { type: 'string' } },
                    risks: { type: 'array', items: { type: 'string' } },
                    conclusion: { type: 'string' },
                },
                required: ['managerId', 'strengths', 'risks', 'conclusion'],
                additionalProperties: false,
            },
        },
    },
    required: ['summary', 'leaks', 'managers'],
    additionalProperties: false,
};

export const OWNER_REPORT_NARRATIVE_SYSTEM_PROMPT = `Ты пишешь управленческий отчёт собственнику компании по работе отдела продаж за период. Ниже — факты периода, посчитанные кодом, и черновик текста по шаблону. Твоя задача — переписать три части живым языком собственника, не меняя смысла фактов:
1) summary — от 3 до 7 абзацев, каждый до 70 слов: где застревают деньги, самая дорогая утечка, вход в воронку, динамика внутри периода, зависимость от людей, качество базы, что работает. Первым — главное для денег.
2) leaks — абзац на каждую утечку из списка (код как в списке): масштаб, цена вопроса, что это — процесс или навык, и что сделать.
3) managers — по каждому сотруднику из списка (managerId как в списке): до трёх сильных сторон, до трёх рисков по одной фразе, вывод для собственника до 60 слов.

Правила без исключений:
- используй только числа из фактов и черновика, ровно в том виде: ни одного нового числа, ни пересчётов, ни округлений в другую сторону;
- не объясняй причины: без «из-за», «потому что», «привело», «повлияло», «благодаря», «поэтому» — только что видно в разговорах;
- без слов «значимо», «статистически», «достоверно», «гарантирует», «критически»;
- без английских слов и кодов в тексте; имена сотрудников — как в фактах;
- язык собственника: деньги, клиенты, воронка; без терминов разметки и жаргона;
- если данных по части нет — верни пустой массив, не придумывай.`;

const line = (label: string, value: string): string => `${label}: ${value}`;

/** Факты и черновик для модели — те же строки, по которым идёт факт-чек. */
export function buildNarrativeUserContent(text: OwnerReportText): string {
    const blocks: string[] = [
        `ПЕРИОД: ${text.periodLabel}`,
        'ШАПКА:\n' +
            text.tiles
                .map(
                    tile =>
                        `- ${tile.value} — ${tile.label}${tile.compare ? ` (${tile.compare})` : ''}`,
                )
                .join('\n'),
        'ЧЕРНОВИК РЕЗЮМЕ:\n' + text.summary.map(p => `- ${p}`).join('\n'),
        'ИСХОДЫ РАЗГОВОРОВ:\n' +
            text.overview.outcomes
                .map(row => `- ${row.label}: ${row.calls} (${row.pct})`)
                .join('\n'),
        'ПО ТИПАМ РАЗГОВОРОВ:\n' +
            text.overview.typeGroups
                .map(
                    row =>
                        `- ${row.label}: ${row.calls}; шаг вперёд ${row.advanced}; перезвон с датой ${row.callbackDated}; отложено ${row.postponed}; отказ ${row.refused}; без контакта ${row.noContact}`,
                )
                .join('\n'),
        'ПО НЕДЕЛЯМ:\n' +
            text.overview.weeks
                .map(
                    row =>
                        `- ${row.label}: ${row.calls}; холодные → продвижение ${row.coldAdvanced}; с решающим → продвижение ${row.contactedAdvanced}${row.note ? `; ${row.note}` : ''}`,
                )
                .join('\n'),
        'УТЕЧКИ (код — черновик):\n' +
            text.leaks
                .map(
                    leak =>
                        `- ${leak.code} — ${leak.text} Что сделать: ${leak.action}`,
                )
                .join('\n'),
        'УПРАВЛЯЕМОСТЬ:\n' +
            text.management.rows
                .map(row => `- ${row.title}: ${row.verdict} — ${row.detail}`)
                .join('\n') +
            `\n- Вердикт: ${text.management.verdict}. ${text.management.verdictText}`,
        'ВОЗРАЖЕНИЯ:\n' +
            `- ${text.objections.intro}\n` +
            text.objections.rows
                .map(
                    row =>
                        `- ${row.label}: ${row.calls}; отработано ${row.handled}; продвинуты после ${row.advancedAfter}`,
                )
                .join('\n') +
            (text.objections.coldTop ? `\n- ${text.objections.coldTop}` : ''),
        'СБОИ:\n' +
            `- ${text.issues.intro}\n` +
            text.issues.rows
                .map(row => `- ${row.label}: ${row.calls}`)
                .join('\n'),
        'МЕТРИКИ КОНТРОЛЯ:\n' +
            text.controlMetrics
                .map(
                    metric =>
                        `- ${metric.title}: ${metric.value}${metric.lastWeek ? `; последняя полная неделя ${metric.lastWeek}` : ''}`,
                )
                .join('\n'),
        'СОТРУДНИКИ (managerId — имя):\n' +
            text.managers.map(managerBlock).join('\n'),
    ];
    return blocks.join('\n\n');
}

function managerBlock(manager: OwnerReportManagerText): string {
    const cells = Object.entries(manager.cells)
        .map(([column, value]) => line(column, value))
        .join('; ');
    return [
        `- ${manager.managerId} — ${manager.name}: ${manager.headline}`,
        `  показатели: ${cells}`,
        `  черновик — сильные стороны: ${manager.strengths.join('; ') || 'нет'}; риски: ${manager.risks.join('; ') || 'нет'}; вывод: ${manager.conclusion}`,
    ].join('\n');
}

/** Все числа шаблонного текста — единственные, которые вправе назвать модель. */
export function allowedNumberKeys(text: OwnerReportText): Set<string> {
    const keys = new Set<string>();
    const add = (value: number) => {
        for (const key of numberKeys(value)) keys.add(key);
    };
    const addText = (value: string) => {
        for (const number of extractNumbers(value)) add(number);
    };
    const addCount = (value: number) => add(value);

    for (const tile of text.tiles) {
        addText(tile.value);
        addText(tile.label);
        if (tile.compare) addText(tile.compare);
    }
    text.summary.forEach(addText);
    for (const row of text.overview.outcomes) {
        addCount(row.calls);
        addText(row.pct);
    }
    for (const row of text.overview.typeGroups) {
        [
            row.calls,
            row.callbackDated,
            row.postponed,
            row.refused,
            row.noContact,
        ].forEach(addCount);
        addText(row.advanced);
    }
    for (const row of text.overview.weeks) {
        [row.calls, row.cold, row.contacted].forEach(addCount);
        addText(row.coldAdvanced);
        addText(row.contactedAdvanced);
    }
    text.overview.notes.forEach(addText);
    for (const leak of text.leaks) {
        [
            leak.title,
            leak.scale,
            leak.money ?? '',
            leak.text,
            leak.action,
        ].forEach(addText);
    }
    for (const row of text.management.rows) addText(row.detail);
    addText(text.management.verdictText);
    addText(text.objections.intro);
    for (const row of text.objections.rows) {
        addCount(row.calls);
        addText(row.handled);
        addText(row.advancedAfter);
    }
    if (text.objections.coldTop) addText(text.objections.coldTop);
    addText(text.issues.intro);
    for (const row of text.issues.rows) addCount(row.calls);
    for (const metric of text.controlMetrics) {
        addText(metric.value);
        if (metric.lastWeek) addText(metric.lastWeek);
    }
    for (const manager of text.managers) {
        Object.values(manager.cells).forEach(addText);
        [...manager.strengths, ...manager.risks, manager.conclusion].forEach(
            addText,
        );
    }
    text.methodology.forEach(addText);
    return keys;
}

export type NarrativeDropReason =
    | 'shape'
    | 'alien-number'
    | 'forbidden'
    | 'causal'
    | 'too-long'
    | 'unknown-code'
    | 'empty';

export interface NarrativeDrop {
    /** Что отброшено: «summary», «leak:код», «manager:id». */
    part: string;
    reason: NarrativeDropReason;
    detail?: string;
}

export interface ApplyNarrativeResult {
    text: OwnerReportText;
    dropped: NarrativeDrop[];
    /** Принятых частей: резюме, утечки, сотрудники. */
    accepted: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(item => typeof item === 'string');

/** Причина, по которой фраза модели не проходит; null — проходит. */
export function checkPhrase(
    phrase: string,
    allowed: ReadonlySet<string>,
    maxWords: number,
): { reason: NarrativeDropReason; detail?: string } | null {
    if (phrase.trim().length === 0) return { reason: 'empty' };
    if (wordCount(phrase) > maxWords) return { reason: 'too-long' };
    const forbidden = findForbidden(phrase);
    if (forbidden) return { reason: 'forbidden', detail: forbidden };
    const causal = findCausal(phrase);
    if (causal) return { reason: 'causal', detail: causal };
    const alien = findAlienNumber(phrase, allowed);
    if (alien) return { reason: 'alien-number', detail: alien };
    return null;
}

/** Ответ модели поверх шаблона: принятые части помечаются источником «model». */
export function applyNarrative(
    text: OwnerReportText,
    payload: unknown,
): ApplyNarrativeResult {
    const dropped: NarrativeDrop[] = [];
    if (!isRecord(payload)) {
        return {
            text,
            dropped: [{ part: 'payload', reason: 'shape' }],
            accepted: 0,
        };
    }
    const allowed = allowedNumberKeys(text);
    let accepted = 0;

    let summary = text.summary;
    let summarySource = text.summarySource;
    const modelSummary = payload.summary;
    if (
        isStringArray(modelSummary) &&
        modelSummary.length >= NARRATIVE_LIMITS.summaryParagraphs.min &&
        modelSummary.length <= NARRATIVE_LIMITS.summaryParagraphs.max
    ) {
        const failed = modelSummary
            .map(p => checkPhrase(p, allowed, NARRATIVE_LIMITS.paragraphWords))
            .find(result => result !== null);
        if (failed) dropped.push({ part: 'summary', ...failed });
        else {
            summary = modelSummary;
            summarySource = 'model';
            accepted += 1;
        }
    } else if (modelSummary !== undefined) {
        dropped.push({ part: 'summary', reason: 'shape' });
    }

    const leaks = applyLeaks(text.leaks, payload.leaks, allowed, dropped);
    accepted += leaks.accepted;
    const managers = applyManagers(
        text.managers,
        payload.managers,
        allowed,
        dropped,
    );
    accepted += managers.accepted;

    return {
        text: {
            ...text,
            summary,
            summarySource,
            leaks: leaks.items,
            managers: managers.items,
        },
        dropped,
        accepted,
    };
}

function applyLeaks(
    items: readonly OwnerReportLeakText[],
    payload: unknown,
    allowed: ReadonlySet<string>,
    dropped: NarrativeDrop[],
): { items: OwnerReportLeakText[]; accepted: number } {
    const result = items.map(item => ({ ...item }));
    let accepted = 0;
    if (!Array.isArray(payload)) return { items: result, accepted };
    for (const entry of payload) {
        if (
            !isRecord(entry) ||
            typeof entry.code !== 'string' ||
            typeof entry.text !== 'string'
        ) {
            dropped.push({ part: 'leak', reason: 'shape' });
            continue;
        }
        const target = result.find(item => item.code === entry.code);
        if (!target) {
            dropped.push({
                part: `leak:${entry.code}`,
                reason: 'unknown-code',
            });
            continue;
        }
        const failed = checkPhrase(
            entry.text,
            allowed,
            NARRATIVE_LIMITS.paragraphWords,
        );
        if (failed) {
            dropped.push({ part: `leak:${entry.code}`, ...failed });
            continue;
        }
        target.text = entry.text;
        target.source = 'model';
        accepted += 1;
    }
    return { items: result, accepted };
}

function applyManagers(
    items: readonly OwnerReportManagerText[],
    payload: unknown,
    allowed: ReadonlySet<string>,
    dropped: NarrativeDrop[],
): { items: OwnerReportManagerText[]; accepted: number } {
    const result = items.map(item => ({ ...item }));
    let accepted = 0;
    if (!Array.isArray(payload)) return { items: result, accepted };
    for (const entry of payload) {
        if (
            !isRecord(entry) ||
            typeof entry.managerId !== 'string' ||
            !isStringArray(entry.strengths) ||
            !isStringArray(entry.risks) ||
            typeof entry.conclusion !== 'string'
        ) {
            dropped.push({ part: 'manager', reason: 'shape' });
            continue;
        }
        const target = result.find(item => item.managerId === entry.managerId);
        if (!target) {
            dropped.push({
                part: `manager:${entry.managerId}`,
                reason: 'unknown-code',
            });
            continue;
        }
        const failed =
            [...entry.strengths, ...entry.risks]
                .map(p => checkPhrase(p, allowed, NARRATIVE_LIMITS.bulletWords))
                .find(check => check !== null) ??
            checkPhrase(
                entry.conclusion,
                allowed,
                NARRATIVE_LIMITS.conclusionWords,
            );
        if (failed) {
            dropped.push({ part: `manager:${entry.managerId}`, ...failed });
            continue;
        }
        target.strengths = entry.strengths.slice(0, 3);
        target.risks = entry.risks.slice(0, 3);
        target.conclusion = entry.conclusion;
        target.source = 'model';
        accepted += 1;
    }
    return { items: result, accepted };
}
