/**
 * Лёгкая строка звонка для AI-аналитики ОП (пульс, повестка РОПа, утренний
 * дайджест): транскрипция БЕЗ текста + только нужные поля user_result
 * глубокого разбора. Отсутствующие в разборе значения — null / [].
 *
 * Имена полей user_result — из AgentCallAnalysisDto (apps/event-sales,
 * agent-gate): sections[].asWas / alternatives, objections[].quote /
 * handled / outcome, nextStep {set, date}, riskFlags, coachingPriority,
 * weightedScore, versions.
 */

/** Раздел разговора (GREETING, NEEDS, …) с фразой «как было» и вариантами. */
export interface AnalyticsLiteSection {
    section: string;
    /** Актуальность раздела для типа звонка (0 — раздел не применим). */
    relevance: number;
    score: number | null;
    /** Фраза менеджера как была (цитата для повестки/дайджеста). */
    asWas: string | null;
    /** Альтернативные формулировки от разбора. */
    alternatives: string[];
}

/** Возражение клиента: категория, цитата, отработано ли, исход. */
export interface AnalyticsLiteObjection {
    category: string | null;
    quote: string | null;
    handled: boolean | null;
    /** continued / converted / disengaged (строкой — справочник агента). */
    outcome: string | null;
}

/** Следующий шаг: назначен ли и на какую дату (YYYY-MM-DD). */
export interface AnalyticsLiteNextStep {
    set: boolean;
    date: string | null;
}

export interface AnalyticsCallLiteRow {
    transcriptionId: string;
    /** Bitrix-id менеджера (null — звонок обработан до сохранения менеджера). */
    managerId: string | null;
    callStartedAt: Date | null;
    durationSec: number | null;
    /** Тип звонка: разбор агента → классификатор; null — не определён. */
    callType: string | null;
    /** Есть ли глубокий разбор (agent-analysis) — по нему считаются метрики. */
    analysisPresent: boolean;
    /**
     * Оценка звонка в единой шкале 0–100: weightedScore разбора
     * (Σ score×relevance / Σ relevance × 10 — метрика трендов,
     * S = mean(weightedScore/10)); у старых разборов без weightedScore —
     * итоговая score 1–10, приведённая к 0–100. null — разбора нет.
     */
    score: number | null;
    nextStep: AnalyticsLiteNextStep | null;
    riskFlags: string[];
    coachingPriority: string | null;
    sections: AnalyticsLiteSection[];
    objections: AnalyticsLiteObjection[];
    /** Версии разбора (prompt/rubric/registry/attribution/classifier). */
    versions: Record<string, string> | null;
}

/** Результат лёгкой выборки: строки после фильтров + статистика для meta. */
export interface AnalyticsLiteDataset {
    rows: AnalyticsCallLiteRow[];
    totalCalls: number;
    skippedNoManager: number;
}
