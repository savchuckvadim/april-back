import type { RopPeriodKind } from '@lib/rop-reports';
import type {
    DigestAnchorMetric,
    DigestCompareScope,
    DigestLifecycle,
    DigestMovement,
    DigestPosition,
    DigestReadiness,
    DigestRecommendationCode,
    DigestStatus,
    DigestStepState,
    DigestTextSource,
} from './period-digest.codes';

/**
 * КАРТОЧКА ПЕРИОДА менеджера — контракт итогов периода по менеджерам
 * (этап 7.4, постановка ai/tasks/ai-polyansky-method/2026-11-01-periodic-
 * manager-digests.md). Одна карточка = менеджер × период: метрики
 * периода, сравнение с прошлым периодом и годом назад, рекомендации с
 * метриками-якорями и их жизненный цикл, блок «для РОПа».
 *
 * Только типы; коды — period-digest.codes.ts, расчёты — соседние файлы,
 * тексты для людей — period-digest.texts.ts.
 */

/** Виды периодов первой поставки: неделя и месяц. */
export type DigestPeriodKind = Extract<RopPeriodKind, 'week' | 'month'>;

/** Период карточки: дни портала 'YYYY-MM-DD', последний включительно. */
export interface DigestPeriod {
    readonly kind: DigestPeriodKind;
    /** Ключ: '2026-W46', '2026-10'. */
    readonly key: string;
    readonly from: string;
    readonly to: string;
}

/** Число с объёмом за ним; value null — данных нет вовсе (n = 0). */
export interface DigestValue {
    readonly value: number | null;
    readonly n: number;
}

/** Метрика-якорь рекомендации: что мерить и на каких звонках. */
export interface DigestAnchor {
    readonly metric: DigestAnchorMetric;
    /** Код раздела рубрики — только у `section_mean`. */
    readonly section?: string;
    /** Коды типов звонков; нет — все звонки слоя качества. */
    readonly callTypes?: readonly string[];
}

/** Одна оценка рекомендации: значение якоря в периоде. */
export interface DigestPoint {
    readonly periodKey: string;
    /** null — данных меньше минимума. */
    readonly value: number | null;
    readonly n: number;
    readonly status: DigestStatus;
    /** Цель достигнута в этом периоде. */
    readonly achieved: boolean;
}

export interface DigestRecommendation {
    readonly code: DigestRecommendationCode;
    readonly text: string;
    readonly source: DigestTextSource;
    readonly anchor: DigestAnchor;
    /** Значение якоря в периоде выдачи. */
    readonly baseline: {
        readonly periodKey: string;
        readonly value: number;
        readonly n: number;
    };
    readonly target: number;
    /** Выдача и оценки по порядку (первая точка — выдача, статус `new`). */
    readonly history: readonly DigestPoint[];
    /** Статус последней точки. */
    readonly status: DigestStatus;
    /** Сколько раз оценена после выдачи (0–3). */
    readonly evaluations: number;
    readonly lifecycle: DigestLifecycle;
    /** «Закрепить» с пометкой «держать»: цель достигнута только на третьей оценке. */
    readonly hold: boolean;
    readonly evidence: {
        readonly transcriptionIds: readonly string[];
        readonly quote: string | null;
    };
}

/** Положение в отделе словами и с кем сравнивали. */
export interface DigestStanding {
    readonly position: DigestPosition;
    readonly scope: DigestCompareScope;
}

/** Средняя оценка раздела (1–10) и положение в отделе (null — сравнения нет). */
export interface DigestSectionStat {
    readonly section: string;
    readonly mean: number;
    readonly n: number;
    readonly standing: DigestStanding | null;
}

/** Разобранных звонков одного типа. */
export interface DigestTypeCount {
    readonly callType: string;
    readonly n: number;
}

/** Факты методики периода; null у карточки — методика не включена. */
export interface DigestMethodologyMetrics {
    /** Чек-пункты по типам: выполнено из применимых. */
    readonly checkpoints: readonly {
        readonly callType: string;
        readonly done: number;
        readonly total: number;
    }[];
    readonly spiralsFullMean: DigestValue;
    /** Норма методики по самому свежему разбору; null — спирали не считались. */
    readonly spiralsMinFull: number | null;
    /** Презентаций, где полных спиралей не меньше нормы. */
    readonly fullSpiralCalls: number;
    /** Продвижение сделки 1–5 в среднем. */
    readonly dealProgressMean: DigestValue;
}

/** Метрики менеджера за период. */
export interface DigestMetrics {
    /** Записанных звонков (все строки, и короткие, и без разбора). */
    readonly recorded: number;
    /** Разобранных звонков слоя качества: разбор есть, не короче порога типа. */
    readonly analyzed: number;
    readonly byType: readonly DigestTypeCount[];
    readonly nextStepSet: DigestValue;
    readonly nextStepDated: DigestValue;
    readonly workdays: number;
    /** Рабочих дней без записанных звонков. */
    readonly silentWorkdays: number;
    /** Средняя оценка 1–10. */
    readonly score: DigestValue;
    readonly sections: readonly DigestSectionStat[];
    readonly worstSection: string | null;
    readonly bestSection: string | null;
    readonly objectionUnhandled: DigestValue;
    readonly followupStepNoDate: DigestValue;
    readonly lowScoreShare: DigestValue;
    readonly methodology: DigestMethodologyMetrics | null;
    /** Начало серии версий разбора (самой поздней в периоде); null — версий нет. */
    readonly seriesStart: string | null;
    /** В периоде разборы разных серий версий. */
    readonly seriesMixed: boolean;
}

/** Изменение одной метрики к другому периоду (в её единицах). */
export interface DigestDelta {
    readonly before: DigestValue;
    readonly after: DigestValue;
    /** after − before; null — сравнивать нечего. */
    readonly delta: number | null;
    /** Вверх / вниз — по величине (не «лучше / хуже»), с порогом сдвига. */
    readonly movement: DigestMovement;
}

/** Сравнение с прошлым периодом или тем же периодом год назад. */
export interface DigestCompare {
    readonly periodKey: string;
    readonly analyzed: DigestDelta;
    readonly score: DigestDelta;
    readonly nextStepDated: DigestDelta;
    readonly silentWorkdays: DigestDelta;
    /** Изменения разделов, у которых данные есть в обоих периодах. */
    readonly sections: readonly (DigestDelta & { readonly section: string })[];
    /** Периоды считались разными сериями версий разбора. */
    readonly versionsDiffer: boolean;
}

/** Звонок «послушать» для РОПа (подбор — этап 4). */
export interface DigestListenCall {
    readonly transcriptionId: string;
    readonly callType: string | null;
    readonly score: number | null;
    readonly reason: string;
    readonly quote: string;
    readonly link: string | null;
}

/** Шаг недели к активной месячной рекомендации (этап 4). */
export interface DigestWeeklyStep {
    readonly code: DigestRecommendationCode;
    readonly weekValue: DigestValue;
    readonly target: number;
    readonly state: DigestStepState;
    readonly text: string;
}

/** Карточка периода менеджера — нагрузка снапшота в `ais`. */
export interface ManagerDigestCard {
    readonly schemaVersion: 1;
    readonly period: DigestPeriod;
    readonly managerId: string;
    readonly managerName: string;
    readonly departmentId: number | null;
    readonly departmentName: string | null;
    readonly readiness: DigestReadiness;
    readonly metrics: DigestMetrics;
    readonly previous: DigestCompare | null;
    /** Тот же период год назад — только месяц и только при данных. */
    readonly yearAgo: DigestCompare | null;
    readonly recommendations: readonly DigestRecommendation[];
    /** Только у недели: шаги к месячным рекомендациям. */
    readonly weeklySteps?: readonly DigestWeeklyStep[];
    readonly forRop: {
        readonly discuss: readonly string[];
        readonly listen: readonly DigestListenCall[];
    };
    // Резерв: блок «сделки менеджера» (этап 7.3) появится отдельным полем.
}
