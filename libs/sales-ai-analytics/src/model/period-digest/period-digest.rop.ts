import { buildAgenda } from '../agenda';
import type { AttentionRules } from '../attention.types';
import { type DatedLiteRow, toAgendaRow } from '../dated-lite-row';
import { sectionTitleOf } from '../dictionary-titles.util';
import { ruCount, ruDecimal } from '../ru-text.util';
import { DIGEST_FORMS } from './modules';
import {
    DIGEST_ANCHOR_METRIC,
    DIGEST_LIFECYCLE,
    DIGEST_MOVEMENT,
    DIGEST_POSITION,
    DIGEST_STATUS,
} from './period-digest.codes';
import { digestLastKnownValue } from './period-digest.status';
import {
    digestAnchorTitle,
    digestStandingTitle,
    formatAnchorValue,
    formatDigestTarget,
} from './period-digest.texts';
import {
    DIGEST_ROP_DISCUSS_MAX,
    DIGEST_ROP_LISTEN_MAX,
} from './period-digest.thresholds';
import type {
    DigestCompare,
    DigestListenCall,
    DigestMetrics,
    DigestRecommendation,
    ManagerDigestCard,
} from './period-digest.types';

/**
 * БЛОК «ДЛЯ РОПА» карточки: «обсудить» — не больше трёх пунктов по
 * приоритету (цель не достигнута за три оценки → стало хуже → раздел ниже
 * середины отдела → средняя оценка снизилась на порог); «послушать» —
 * повестка по звонкам менеджера, не больше трёх. Ссылки на разбор
 * подставляет приложение — здесь только идентификаторы. Чистые функции.
 */

export interface DigestRopInput {
    readonly recommendations: readonly DigestRecommendation[];
    readonly metrics: DigestMetrics;
    /** Сравнение с прошлым периодом; нет — null. */
    readonly previous: DigestCompare | null;
    /** Звонки слоя качества менеджера за период. */
    readonly rows: readonly DatedLiteRow[];
    readonly rules: Pick<
        AttentionRules,
        'weakSectionScoreMax' | 'lowScoreCallMax'
    >;
}

interface DiscussItem {
    readonly text: string;
    /** Раздел пункта — чтобы не повторять его строкой «ниже середины». */
    readonly section: string | null;
}

const sectionOf = (recommendation: DigestRecommendation): string | null =>
    recommendation.anchor.metric === DIGEST_ANCHOR_METRIC.sectionMean
        ? (recommendation.anchor.section ?? null)
        : null;

function escalatedItem(recommendation: DigestRecommendation): DiscussItem {
    const last = digestLastKnownValue(recommendation.history.slice(1));
    const value =
        last === null
            ? 'данных мало'
            : formatAnchorValue(recommendation.anchor, last);
    return {
        text:
            `Цель не достигнута за три оценки: ${digestAnchorTitle(recommendation.anchor)} — ` +
            `${value} при цели ${formatDigestTarget(recommendation.anchor, recommendation.target)}.`,
        section: sectionOf(recommendation),
    };
}

function worseItem(recommendation: DigestRecommendation): DiscussItem | null {
    const history = recommendation.history;
    const after = history[history.length - 1]?.value ?? null;
    const before = digestLastKnownValue(history.slice(0, -1));
    if (after === null || before === null) return null;
    const anchor = recommendation.anchor;
    return {
        text:
            `Стало хуже: ${digestAnchorTitle(anchor)} — ` +
            `${formatAnchorValue(anchor, before)} → ${formatAnchorValue(anchor, after)}.`,
        section: sectionOf(recommendation),
    };
}

function sectionItems(metrics: DigestMetrics): DiscussItem[] {
    return metrics.sections
        .filter(item => item.standing?.position === DIGEST_POSITION.below)
        .sort((a, b) => a.mean - b.mean)
        .map(item => ({
            text:
                `«${sectionTitleOf(item.section)}» — ` +
                `${digestStandingTitle(item.standing)}: ${ruDecimal(item.mean)} из 10 ` +
                `по ${ruCount(item.n, DIGEST_FORMS.callsDative)}.`,
            section: item.section,
        }));
}

function scoreDropItem(previous: DigestCompare | null): DiscussItem[] {
    const score = previous?.score;
    if (
        !score ||
        score.movement !== DIGEST_MOVEMENT.down ||
        score.before.value === null ||
        score.after.value === null
    ) {
        return [];
    }
    return [
        {
            text:
                `Средняя оценка звонков снизилась: ${ruDecimal(score.before.value)} → ` +
                `${ruDecimal(score.after.value)} из 10.`,
            section: null,
        },
    ];
}

/** Пункты «обсудить» по приоритету, без повторов раздела. */
export function digestRopDiscuss(input: DigestRopInput): string[] {
    const escalated = input.recommendations
        .filter(item => item.lifecycle === DIGEST_LIFECYCLE.escalated)
        .map(escalatedItem);
    const worse = input.recommendations
        .filter(
            item =>
                item.status === DIGEST_STATUS.worse &&
                item.lifecycle === DIGEST_LIFECYCLE.active,
        )
        .flatMap(item => worseItem(item) ?? []);
    const named = new Set(
        [...escalated, ...worse].flatMap(item => item.section ?? []),
    );
    const sections = sectionItems(input.metrics).filter(
        item => !named.has(item.section ?? ''),
    );
    return [
        ...escalated,
        ...worse,
        ...sections,
        ...scoreDropItem(input.previous),
    ]
        .slice(0, DIGEST_ROP_DISCUSS_MAX)
        .map(item => item.text);
}

/** Звонки «послушать»: повестка РОПа по звонкам менеджера, ссылки — у приложения. */
export function digestRopListen(input: DigestRopInput): DigestListenCall[] {
    return buildAgenda(input.rows.map(toAgendaRow), {
        limit: DIGEST_ROP_LISTEN_MAX,
        weakSectionScoreMax: input.rules.weakSectionScoreMax,
        lowScoreCallMax: input.rules.lowScoreCallMax,
    }).map(item => ({
        transcriptionId: item.transcriptionId,
        callType: item.callType,
        score: item.score,
        reason: item.reason,
        quote: item.quote,
        link: null,
    }));
}

export const buildDigestRop = (
    input: DigestRopInput,
): ManagerDigestCard['forRop'] => ({
    discuss: digestRopDiscuss(input),
    listen: digestRopListen(input),
});
