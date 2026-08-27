/** Тип ais-записи глубокого разбора (совпадает с agent-gate). */
export const AGENT_ANALYSIS_TYPE = 'agent-analysis';

/** Строка листа «Звонки»: паспорт звонка + полные тексты разбора. */
export interface CallReportWeeklyRow {
    callDate: Date | null;
    managerId: number | null;
    durationMin: number | null;
    entityType: string | null;
    entityId: number | null;
    activityId: string | null;
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

/** Собранные данные отчёта за период по одному порталу. */
export interface CallReportWeeklyDataset {
    domain: string;
    from: Date;
    to: Date;
    rows: CallReportWeeklyRow[];
    sections: CallReportWeeklySectionRow[];
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
    /** Кому ушло уведомление. */
    notifiedUserIds: number[];
}
