/** Тип ais-записи глубокого разбора (совпадает с agent-gate). */
export const AGENT_ANALYSIS_TYPE = 'agent-analysis';

/** Гранулярный чеклист хвоста (зеркало полей менеджера). */
export interface WeeklyHvostSteps {
    offer?: boolean | null;
    complect?: boolean | null;
    price?: boolean | null;
    decisionDate?: boolean | null;
    dateAgreed?: boolean | null;
}

/** Гранулярный чеклист 5К (зеркало полей менеджера). */
export interface WeeklyFiveKItems {
    clientWhat?: boolean | null;
    clientReady?: boolean | null;
    clientPrice?: boolean | null;
    companyWho?: boolean | null;
    companyHow?: boolean | null;
    companyRight?: boolean | null;
    colleagues?: boolean | null;
    competitor?: boolean | null;
    criteria?: boolean | null;
}

/** Строка листа «Звонки»: паспорт звонка + полные тексты разбора. */
export interface CallReportWeeklyRow {
    callDate: Date | null;
    managerId: number | null;
    durationMin: number | null;
    /** Точная длительность — для фильтра «звонки от 5 минут». */
    durationSec: number | null;
    entityType: string | null;
    entityId: number | null;
    activityId: string | null;
    /** ID элемента смарта «AI-анализ звонков» — ссылка на карточку. */
    smartItemId: number | null;
    /** Компания и контакт звонка (для кликабельных ссылок). */
    companyId: number | null;
    contactId: number | null;
    /** Дошёл ли звонок до глубокого разбора (иначе — только транскрипт). */
    analyzed: boolean;
    callType: string | null;
    productive: boolean | null;
    score: number | null;
    weightedScore: number | null;
    scriptCompliance: number | null;
    coachingPriority: string | null;
    interlocutorRole: string | null;
    specialist: string | null;
    sentiment: string | null;
    talkRatioPct: number | null;
    questionsCount: number | null;
    nextStepSet: boolean | null;
    nextStep: string | null;
    nextStepDate: string | null;
    hvostDone: boolean | null;
    fiveKDone: boolean | null;
    /** Гранулярные чеклисты AI (те же вопросы, что у менеджера). */
    hvostSteps: WeeklyHvostSteps | null;
    fiveKItems: WeeklyFiveKItems | null;
    summary: string | null;
    scoreExplanation: string | null;
    needs: string | null;
    productsOffered: string | null;
    objections: string | null;
    refusalCategory: string | null;
    riskFlags: string | null;
    recommendations: string | null;
    employeeRecommendations: string | null;
    speechAnalysis: string | null;
    hvostAnalysis: string | null;
    fiveKAnalysis: string | null;
    reportComparison: string | null;
    transcript: string | null;
}

/** Строка листа «Разделы»: один этап разговора одного звонка. */
export interface CallReportWeeklySectionRow {
    callDate: Date | null;
    managerId: number | null;
    activityId: string | null;
    callType: string | null;
    section: string;
    relevance: number | null;
    score: number | null;
    analysis: string | null;
    advice: string | null;
}

/**
 * Строка листа «Транскрипции»: ОДИН фрагмент расшифровки.
 *
 * Ячейка Excel вмещает 32767 символов, а трёхчасовой разговор — это
 * сотни тысяч. Поэтому текст режется на части по ~30k, и длинный звонок
 * занимает несколько строк подряд (part 1..N) — ничего не теряется.
 */
export interface CallReportWeeklyTranscriptRow {
    callDate: Date | null;
    managerId: number | null;
    activityId: string | null;
    smartItemId: number | null;
    entityType: string | null;
    entityId: number | null;
    callType: string | null;
    durationMin: number | null;
    /** Номер фрагмента и всего фрагментов у этого звонка. */
    part: number;
    partsTotal: number;
    text: string;
}

/** Строка листа «Презентации»: хвост и 5К по каждому пункту чеклиста. */
export interface CallReportWeeklyPresentationRow {
    callDate: Date | null;
    managerId: number | null;
    activityId: string | null;
    smartItemId: number | null;
    entityType: string | null;
    entityId: number | null;
    callType: string | null;
    durationMin: number | null;
    hvostDone: boolean | null;
    fiveKDone: boolean | null;
    hvostSteps: WeeklyHvostSteps | null;
    fiveKItems: WeeklyFiveKItems | null;
    hvostAnalysis: string | null;
    fiveKAnalysis: string | null;
    reportComparison: string | null;
    nextStepSet: boolean | null;
    nextStep: string | null;
    nextStepDate: string | null;
    score: number | null;
}

/** Собранные данные отчёта за период по одному порталу. */
export interface CallReportWeeklyDataset {
    domain: string;
    from: Date;
    to: Date;
    /** entityTypeId смарта «AI-анализ звонков» — для ссылок на карточки. */
    smartEntityTypeId: number | null;
    rows: CallReportWeeklyRow[];
    sections: CallReportWeeklySectionRow[];
    transcripts: CallReportWeeklyTranscriptRow[];
    presentations: CallReportWeeklyPresentationRow[];
}

/** Результат построения и доставки отчёта (для ручки и логов). */
export interface CallReportWeeklyResult {
    domain: string;
    from: string;
    to: string;
    calls: number;
    /** ID файла на Диске Битрикса; null — файл не загрузился. */
    fileId: number | null;
    /** Публичная ссылка на файл, если Битрикс её отдал. */
    fileUrl: string | null;
    /** Кому ушёл отчёт. */
    notifiedUserIds: number[];
    /** Каким способом ушёл: chat/task/notify; null — никому не отправляли. */
    delivery: string | null;
}
