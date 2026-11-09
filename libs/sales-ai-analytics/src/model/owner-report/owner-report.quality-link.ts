import type { QualityLinkSnapshot } from '../../contracts/snapshot.phase4.types';
import { logit } from '../quality-curve';

/**
 * Связь «качество показа → счёт/КП» для отчёта собственнику — из последнего
 * снапшота `ai-analytics-quality-link`. Решение владельца 09.11.2026: вместо
 * «связь не задана» показывать предварительную оценку с широким диапазоном
 * и пометкой «по N показам, уточняется ежемесячно»; подтверждённой она
 * становится, когда гейт пройден нужное число месяцев подряд (`published`).
 */

export const OWNER_REPORT_QUALITY_LINK_STATUSES = [
    /** Оценки нет: выборка мала или модель не сошлась. */
    'none',
    /** Оценка есть, гейт не пройден — предварительная. */
    'preliminary',
    /** Гейт пройден — по данным портала. */
    'confirmed',
] as const;
export type OwnerReportQualityLinkStatus =
    (typeof OWNER_REPORT_QUALITY_LINK_STATUSES)[number];

/** На сколько баллов качества выше опорного считаем «что даёт рост». */
export const OWNER_REPORT_QUALITY_LINK_STEP_POINTS = 2;

/** Вероятность счёта/КП при качестве на шаг выше опорного: центр и 90 %-й диапазон. */
export interface OwnerReportQualityLinkRange {
    p: number;
    low: number;
    high: number;
}

export interface OwnerReportQualityLink {
    status: OwnerReportQualityLinkStatus;
    /** Месяц снапшота связи (YYYY-MM). */
    monthKey: string;
    /** Показов с известным исходом в выборке, исходов «счёт/КП», менеджеров. */
    presentations: number;
    events: number;
    managers: number;
    /** Опорное качество (1–10) и вероятность счёта/КП при нём; null — оценки нет. */
    sRef: number | null;
    pRef: number | null;
    /** При качестве на `OWNER_REPORT_QUALITY_LINK_STEP_POINTS` балла выше опорного; null — оценки нет. */
    plusStep: OwnerReportQualityLinkRange | null;
    /** Сколько показов и месяцев ещё нужно до устойчивой оценки; null — неизвестно. */
    presentationsLeft: number | null;
    monthsLeft: number | null;
}

const logistic = (x: number): number => 1 / (1 + Math.exp(-x));

interface QualityLinkEstimate {
    sRef: number;
    pRef: number;
    plusStep: OwnerReportQualityLinkRange;
}

/**
 * Оценка из снапшота: опорная точка `p̂(S_ref)` и вероятность на шаг выше по
 * логит-коэффициенту pooled с его 90 %-м интервалом. Нет коэффициента или
 * опорной точки (или p̂ на границе) — оценки нет.
 */
function estimateOf(snapshot: QualityLinkSnapshot): QualityLinkEstimate | null {
    const { pooled, sRef, pRef } = snapshot;
    if (pooled === null || sRef === null || pRef === null) return null;
    if (!(pRef > 0 && pRef < 1)) return null;
    const base = logit(pRef);
    const step = OWNER_REPORT_QUALITY_LINK_STEP_POINTS;
    const [a, b] = pooled.ci90;
    return {
        sRef,
        pRef,
        plusStep: {
            p: logistic(base + pooled.value * step),
            low: logistic(base + Math.min(a, b) * step),
            high: logistic(base + Math.max(a, b) * step),
        },
    };
}

/** Факты связи для отчёта; null — снапшота связи у портала ещё нет. */
export function buildOwnerReportQualityLink(
    snapshot: QualityLinkSnapshot | null | undefined,
): OwnerReportQualityLink | null {
    if (!snapshot) return null;
    const estimate = estimateOf(snapshot);
    return {
        status:
            estimate === null
                ? 'none'
                : snapshot.status === 'published'
                  ? 'confirmed'
                  : 'preliminary',
        monthKey: snapshot.monthKey,
        presentations: snapshot.sample.n,
        events: snapshot.sample.events,
        managers: snapshot.sample.managers,
        sRef: estimate?.sRef ?? null,
        pRef: estimate?.pRef ?? null,
        plusStep: estimate?.plusStep ?? null,
        presentationsLeft: snapshot.countdown?.presentationsLeft ?? null,
        monthsLeft: snapshot.countdown?.monthsLeft ?? null,
    };
}
