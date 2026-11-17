import type {
    AttentionRules,
    AttentionSectionMean,
} from '../../attention.types';
import type { DatedLiteRow } from '../../dated-lite-row';
import type { ManagerQualityFacts } from '../../quality-facts.types';
import type { DigestRecommendationCode } from '../period-digest.codes';
import type { DigestShift } from '../period-digest.thresholds';
import type {
    DigestAnchor,
    DigestManagerStandings,
    DigestMetrics,
    DigestPeriodKind,
    DigestRecommendation,
} from '../period-digest.types';

/**
 * МОДУЛЬ РЕКОМЕНДАЦИИ: детектор поверх правил «Внимания» и фактов качества
 * менеджера, метрика-якорь с базой и нормой для цели, формулировка по
 * шаблону и действие на неделю. Один модуль — один файл; порядок модулей —
 * порядок приоритета (modules/index.ts).
 */

/** Всё, что модулю известно о менеджере за период. */
export interface DigestModuleContext {
    readonly kind: DigestPeriodKind;
    /** Звонки слоя качества менеджера за период. */
    readonly rows: readonly DatedLiteRow[];
    /** Метрики периода; у разделов — положение в отделе. */
    readonly metrics: DigestMetrics;
    readonly quality: ManagerQualityFacts;
    /** Пороги «Внимания» портала; минимум n раздела — минимум якоря. */
    readonly rules: AttentionRules;
    /** Средние разделов отдела (или структуры) для правил «Внимания». */
    readonly benchmarks: readonly AttentionSectionMean[];
    readonly standings: DigestManagerStandings;
    /** Метрики прошлого периода того же вида; нет — null. */
    readonly previous: DigestMetrics | null;
    /** Минимум наблюдений под якорем: 3 за неделю, 5 за месяц. */
    readonly minN: number;
    readonly shift: DigestShift;
}

/** Модуль сработал: что мерить, с чего начали и чем подкрепить. */
export interface DigestDetection {
    readonly anchor: DigestAnchor;
    readonly baseline: { readonly value: number; readonly n: number };
    /**
     * Норма для цели: порог «слабого» с запасом, норма методики, середина
     * отдела или прошлый период; нет — null (цель — два порога сдвига).
     */
    readonly norm: number | null;
    /** Сравнение словами для шаблона («ниже середины отдела»); нет — null. */
    readonly comparison: string | null;
    readonly evidence: DigestRecommendation['evidence'];
}

export interface DigestModule {
    readonly code: DigestRecommendationCode;
    /** Сработал — данные для рекомендации; молчит — null. */
    detect(context: DigestModuleContext): DigestDetection | null;
    /** Формулировка: глагол действия, числа — только из фактов периода. */
    template(
        detection: DigestDetection,
        target: number,
        context: DigestModuleContext,
    ): string;
    /** Действие на неделю к цели месячной рекомендации. */
    weekAction(anchor: DigestAnchor): string;
}
