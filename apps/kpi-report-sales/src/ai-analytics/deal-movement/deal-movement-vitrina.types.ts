/**
 * Внутренние типы витрины «Движение сделок»: выборка периода (ночные
 * снимки и звонки с продвижением) — сериализуема, лежит в кэше.
 */
import type { DealMovementSnapshotView } from '@lib/sales-ai-analytics';

/** Разобранный звонок периода с оценкой продвижения сделки. */
export interface DealMovementCallPoint {
    transcriptionId: string;
    /** Менеджер звонка (Bitrix-id строкой); null — неизвестен. */
    managerId: string | null;
    /** Момент звонка, ISO 8601. */
    at: string;
    /** Оценка звонка 1–10; null — оценки нет. */
    score: number | null;
    /** Продвижение сделки по звонку 1–5. */
    progress: number;
}

/** Выборка периода обзора: общая на портал и период. */
export interface DealMovementPeriodSource {
    /** Начало и конец периода 'YYYY-MM-DD'. */
    from: string;
    to: string;
    /** «Сегодня» по поясу портала на момент сборки. */
    today: string;
    /** Момент сборки, ISO 8601: от него — «12 дней ещё не прошли». */
    builtAt: string;
    /**
     * Ночные снимки от начала периода до конца + хвост проверки (не
     * дальше сегодня), по дням.
     */
    nights: DealMovementSnapshotView[];
    /** Звонки периода с продвижением 1–5 (с оценкой и без). */
    calls: DealMovementCallPoint[];
}
