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
    /**
     * Маркеры стиля менеджера (поток S3) — см. AnalyticsLiteStyle.
     * Поле необязательное: выборка `loadLite` заполняет его всегда, а
     * старые сериализованные строки (кэш, фикстуры) его не несут —
     * читатель обязан быть готов к `undefined`.
     */
    style?: AnalyticsLiteStyle;
}

/**
 * Маркеры стиля из глубокого разбора (документ
 * `ai/tasks/ai-analytics-manager-style.md`, §7.1, доработка §7.2 п. 2):
 * поля, которые в разборе УЖЕ есть, но в лёгкую проекцию не попадали.
 *
 * Все значения — как их отдал разбор; чего нет или что не того типа →
 * null. Числа `talkRatioPct` и `questionsCount` во внутреннем конвейере —
 * ОЦЕНКА LLM по транскрипту без разметки ролей (кодом они считаются
 * только при размеченном `dialog[]` внешнего агент-контура), поэтому ось
 * «инициатива» на них идёт с пониженным доверием.
 */
export interface AnalyticsLiteStyle {
    /** Доля речи менеджера, % 0–100 (оценка LLM). */
    talkRatioPct: number | null;
    /** Вопросов менеджера за разговор (оценка LLM). */
    questionsCount: number | null;
    /** Выявлены ли потребности (0/1-маркер оси «вопросы против презентации»). */
    needsFound: boolean | null;
    /** Сколько потребностей названо в разборе. */
    needsCount: number | null;
    /** Была ли презентация (зависит от presentationStrictness портала). */
    presentationDone: boolean | null;
    /** Сколько продуктов предложено. */
    productsOfferedCount: number | null;
    /** Обсуждалась ли цена (маркер оси «момент разговора о цене»). */
    priceDiscussed: boolean | null;
    /** Конкурентов упомянуто клиентом. */
    competitorsCount: number | null;
    /** Категория отказа (рыночная/исполнительская); null — отказа нет. */
    refusalCategory: string | null;
    /** С кем говорили: ЛПР, пользователь, секретарь (оффсет роли). */
    interlocutorRole: string | null;
    /** Состоялся ли контакт и есть ли продвижение по сделке. */
    productive: boolean | null;
    /** Следование скрипту, % 0–100 (контекст, только при compliance-review). */
    scriptCompliance: number | null;
    /**
     * Направление звонка (страта оси «повторные касания»). Во внутреннем
     * конвейере поля пока НЕТ (паспорт звонка живёт в Redis) — заполнится
     * после доработки §7.2 п. 4, до неё всегда null.
     */
    callDirection: string | null;
}

/** Результат лёгкой выборки: строки после фильтров + статистика для meta. */
export interface AnalyticsLiteDataset {
    rows: AnalyticsCallLiteRow[];
    totalCalls: number;
    skippedNoManager: number;
}
