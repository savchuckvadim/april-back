import {
    CallReportLinkStatusCode,
    CallReportSectionCode,
} from '../config/call-report-smart.config';

/**
 * Контракт входа писателя смарта «AI-анализ звонков» — вынесен из writer'а
 * по лимиту файла; имена прежние, реэкспорт из writer'а и барели call-lib.
 */

/** Разбор одного раздела разговора для записи в смарт. */
export interface CallReportSectionInput {
    section: CallReportSectionCode;
    relevance: number;
    score?: number;
    analysis?: string;
    advice?: string;
}

/** Привязка к элементу списка отчётности. */
export interface CallReportListItemLink {
    itemId: string;
    status: CallReportLinkStatusCode;
}

/** Поле, не поместившееся в строку элемента (уходит в таймлайн). */
export interface CallReportSmartDroppedField {
    /** UF-ключ поля (camelCase). */
    key: string;
    /** Полное значение. */
    value: string;
}

/** Данные для записи элемента смарта «AI-анализ звонков». */
export interface CallReportSmartItemInput {
    activityId: string;
    /** Звонок по лиду (entityType='lead'): нативная связь parentId1. */
    leadId?: number;
    companyId?: number;
    contactId?: number;
    callId?: string;
    callStartedAt?: Date | string;
    durationSec?: number;
    /** Направление звонка (из активности) — участвует в названии элемента. */
    callDirection?: 'incoming' | 'outgoing';
    managerId?: number;
    /** Код типа звонка (xmlId enum-значения из конфига). */
    callType?: string;
    productive?: boolean;
    interlocutorRole?: string;
    /** Специальность собеседника (бухгалтер/юрист/кадровик/…). */
    specialist?: string;
    sentiment?: string;
    nextStepSet?: boolean;
    nextStep?: string;
    nextStepDate?: string;
    priceDiscussed?: boolean;
    competitorMentioned?: boolean;
    competitors?: string[];
    objectionCategories?: string[];
    riskFlags?: string[];
    refusalCategory?: string;
    talkRatioPct?: number;
    questionsCount?: number;
    weightedScore?: number;
    scriptCompliance?: number;
    coachingPriority?: string;
    transcriptionId?: string;
    /**
     * Диалог уже постится в таймлайн вызывающей стороной (intake с
     * размеченным dialog) — writer тогда НЕ дублирует транскрипт в
     * таймлайн при выбросе TRANSCRIPT_N из полей.
     */
    transcriptInTimeline?: boolean;
    /** Полный транскрипт — будет разложен кусками по TRANSCRIPT_N. */
    transcript?: string;
    summary?: string;
    resumeGigachat?: string;
    recomendationGigachat?: string;
    needsFound?: boolean;
    needs?: string;
    presentationDone?: boolean;
    /** «Хвост» пройден после демонстрации (только презентация/решение). */
    hvostDone?: boolean;
    /** 5К закрыто: клиент/компания/коллеги/конкурент/критерии. */
    fiveKDone?: boolean;
    /** Разбор хвоста от AI — в поле пишется ужатым (<700 байт). */
    hvostAnalysis?: string;
    /** Разбор 5К от AI — в поле пишется ужатым. */
    fiveKAnalysis?: string;
    /** Отчёт менеджера по хвосту из сделки-презентации (пишет сверка). */
    hvostManager?: string;
    /** Отчёт менеджера по 5К из сделки-презентации (пишет сверка). */
    fiveKManager?: string;
    /** Сверка AI ↔ менеджер: есть ли расхождение, пункты, объяснение. */
    auditMismatch?: boolean;
    auditPoints?: string;
    auditSummary?: string;
    /**
     * ПРИЧИНА ОТКАЗА, четыре слоя (решение владельца 08.09.2026):
     * что услышал AI в разговоре (пишет разбор), что зафиксировал менеджер
     * в полях карточки и записях отчётности, флаг «не зафиксирована» и
     * объяснение сверки. Поля менеджера система НЕ переписывает — только
     * фиксирует расхождение.
     */
    refusalReasonAi?: string;
    refusalReasonManager?: string;
    refusalMismatch?: boolean;
    refusalReasonNote?: string;
    /**
     * Гранулярный «Хвост» — зеркало анкеты менеджера (op_xvost_*): пять
     * блоков по теме. Состав переписан 01.09.2026: было три галочки и две
     * даты, стало пять смысловых блоков, и пункты обязаны совпадать с
     * анкетой — иначе сверка «менеджер против AI» идёт по разным шкалам.
     */
    hvostSteps?: {
        desire?: boolean | null;
        offered?: boolean | null;
        priceReaction?: boolean | null;
        decisionProcess?: boolean | null;
        decisionWay?: boolean | null;
    };
    /**
     * Гранулярные «5К» — зеркало анкеты менеджера (op_5k_*): пять блоков по
     * теме вместо прежних девяти вопросов.
     */
    fiveKItems?: {
        client?: boolean | null;
        company?: boolean | null;
        colleagues?: boolean | null;
        competitor?: boolean | null;
        criteria?: boolean | null;
    };
    /**
     * Проверка по регламенту (Фаза 3 rag-driven-analysis-plan.md):
     * считает штуки, а не «в целом хорошо» — сколько нарушений, сколько
     * пропущено пунктов скрипта, сколько неверных утверждений о продукте.
     */
    complianceDone?: boolean;
    complianceSeverity?: string;
    complianceViolations?: number;
    scriptMissed?: number;
    productFactErrors?: number;
    complianceSummary?: string;
    productsOffered?: string;
    objections?: string;
    objectionsHandling?: string;
    recommendations?: string;
    score?: number;
    scoreExplanation?: string;
    speechAnalysis?: string;
    employeeRecommendations?: string;
    sections?: CallReportSectionInput[];
    /**
     * Связи с воронками (id сделок).
     *
     * `mainDealId` — сделка воронки «ОП Основная», подтверждённая через
     * PortalModel (CallReportDealFamilyService). Она же идёт в НАТИВНУЮ
     * связь элемента `parentId{DEAL}`: решение владельца 08.09.2026 —
     * родителем элемента разбора может быть только сделка основной
     * воронки. Владелец звонка (дочерняя презентация, сделка чужой
     * воронки) в родители больше не подставляется, и если основной сделки
     * не нашлось — элемент остаётся БЕЗ связи со сделкой.
     */
    mainDealId?: number;
    presentationDealId?: number;
    xoDealId?: number;
    /** Привязка к элементам списков отчётности. */
    kpiItem?: CallReportListItemLink;
    historyItem?: CallReportListItemLink;
    relatedReports?: string;
    agentName?: string;
    agentVersion?: string;
}
