import {
    ATTENTION_DEFAULT_RULES,
    type AttentionRules,
} from '../attention.types';
import type { DatedLiteRow } from '../dated-lite-row';
import type { MinDurationSecByType } from '../pulse-duration';
import { assembleQualityFacts } from '../quality-facts.assembler';
import type { AttentionThresholds } from '../quality-facts.types';
import type { DigestModuleContext } from './modules';
import { DIGEST_PERIOD_KIND } from './period-digest.codes';
import { compareDigestMetrics, yearAgoCompare } from './period-digest.compare';
import { digestQualityRows, digestReadinessOf } from './period-digest.metrics';
import { recommendDigest } from './period-digest.recommend';
import { buildDigestRop } from './period-digest.rop';
import type { DigestPeerView } from './period-digest.standings';
import {
    DIGEST_ANCHOR_MIN_N,
    DIGEST_MAX_ACTIVE,
    DIGEST_MAX_ACTIVE_WEEK,
    DigestShift,
} from './period-digest.thresholds';
import type {
    DigestMetrics,
    DigestPeriod,
    DigestRecommendation,
    ManagerDigestCard,
} from './period-digest.types';
import {
    digestWeeklySteps,
    weekExcludedCodes,
} from './period-digest.weekly-steps';

/**
 * СБОРКА КАРТОЧКИ «менеджер × период»: метрики (посчитаны до сборки — по
 * ним сравнивали отдел), готовность данных, сравнения с прошлым периодом и
 * годом назад, рекомендации, шаги недели к целям месяца и блок «Для РОПа».
 * Чистая функция: данные, пороги и прошлые карточки приносит приложение.
 */

export interface DigestCardSettings {
    /** Пороги «Внимания» портала (attentionThresholdsOf). */
    readonly thresholds: AttentionThresholds;
    readonly minDurationByType: MinDurationSecByType;
    /** Минимум разобранных звонков на карточку с рекомендациями. */
    readonly minCalls: number;
    readonly shift: DigestShift;
}

/** Прошлая карточка того же вида или хотя бы её метрики. */
export interface DigestPreviousCard {
    readonly periodKey: string;
    readonly metrics: DigestMetrics | null;
    readonly recommendations: readonly DigestRecommendation[];
}

export interface DigestCardInput {
    readonly period: DigestPeriod;
    readonly manager: {
        readonly id: string;
        readonly name: string;
        readonly departmentId: number | null;
        readonly departmentName: string | null;
    };
    /** Все записанные звонки менеджера за период. */
    readonly rows: readonly DatedLiteRow[];
    /** buildDigestMetrics по тем же звонкам. */
    readonly metrics: DigestMetrics;
    /** Сравнение с отделом (digestPeerViewsOf); нет — без сравнений. */
    readonly peers: DigestPeerView | null;
    readonly settings: DigestCardSettings;
    readonly previous: DigestPreviousCard | null;
    /** Тот же месяц год назад (у недели не читается). */
    readonly yearAgo: {
        readonly periodKey: string;
        readonly metrics: DigestMetrics | null;
    } | null;
    /** Только неделя: рекомендации последней закрытой месячной карточки; нет её — null. */
    readonly month?: readonly DigestRecommendation[] | null;
}

const NO_STANDINGS = { score: null, nextStepDated: null } as const;

function rulesOf(settings: DigestCardSettings, minN: number): AttentionRules {
    return {
        ...ATTENTION_DEFAULT_RULES,
        ...settings.thresholds,
        weakSectionMinN: minN,
    };
}

export function buildManagerDigestCard(
    input: DigestCardInput,
): ManagerDigestCard {
    const { period, settings } = input;
    const isWeek = period.kind === DIGEST_PERIOD_KIND.week;
    const minN = DIGEST_ANCHOR_MIN_N[period.kind];
    const options = { minN, shift: settings.shift };
    const rows = digestQualityRows(input.rows, settings.minDurationByType);
    const rules = rulesOf(settings, minN);
    const metrics: DigestMetrics = input.peers
        ? { ...input.metrics, sections: input.peers.sections }
        : input.metrics;
    const standings = input.peers?.standings ?? NO_STANDINGS;
    const readiness = digestReadinessOf(metrics, settings.minCalls);
    const previous = input.previous?.metrics
        ? compareDigestMetrics(
              metrics,
              input.previous.metrics,
              input.previous.periodKey,
              options,
          )
        : null;
    const context: DigestModuleContext = {
        kind: period.kind,
        rows,
        metrics,
        quality: assembleQualityFacts(rows, settings.thresholds),
        rules,
        benchmarks: input.peers?.benchmarks ?? [],
        standings,
        previous: input.previous?.metrics ?? null,
        minN,
        shift: settings.shift,
    };
    const month = isWeek ? (input.month ?? null) : null;
    const recommendations = recommendDigest({
        periodKey: period.key,
        readiness,
        context,
        previous: input.previous?.recommendations ?? [],
        maxActive: isWeek ? DIGEST_MAX_ACTIVE_WEEK : DIGEST_MAX_ACTIVE,
        excludedCodes: weekExcludedCodes(month),
    });
    return {
        schemaVersion: 1,
        period,
        managerId: input.manager.id,
        managerName: input.manager.name,
        departmentId: input.manager.departmentId,
        departmentName: input.manager.departmentName,
        readiness,
        metrics,
        standings,
        previous,
        yearAgo: isWeek
            ? null
            : yearAgoCompare(
                  metrics,
                  input.yearAgo?.metrics ?? null,
                  input.yearAgo?.periodKey ?? null,
                  options,
              ),
        recommendations,
        ...(isWeek
            ? {
                  weeklySteps: digestWeeklySteps(month, {
                      rows,
                      minN,
                      shift: settings.shift,
                      lowScoreCallMax: rules.lowScoreCallMax,
                  }),
              }
            : {}),
        forRop: buildDigestRop({
            recommendations,
            metrics,
            previous,
            rows,
            rules,
        }),
    };
}
