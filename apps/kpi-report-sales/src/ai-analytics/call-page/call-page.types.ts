/**
 * Разбор звонка в объёме страницы звонка: то, что читается из записи
 * `ais.user_result` (нагрузка разбора, см. AgentCallAnalysisDto в
 * event-sales). Типы свои: приложение не импортирует DTO другого приложения,
 * а нагрузка — произвольный JSON, поля читаются терпимо к пропускам.
 */
import type { TranscriptAnchor } from '@lib/call-lib/call-report/transcript-anchor';

export interface CallPageSectionView {
    section: string;
    relevance: number;
    score: number | null;
    analysis: string | null;
    advice: string | null;
    asWas: string | null;
    weaknesses: string | null;
    alternatives: string[];
    /** Цитата-доказательство оценки (focus-v3.4); null — нет или прежний разбор. */
    quote: string | null;
    /** Секунда цитаты, проверенная приёмом разбора; null — места нет. */
    startSec: number | null;
}

/** Потребность клиента с местом в разговоре (focus-v3.4). */
export interface CallPageNeedItemView {
    need: string;
    quote: string | null;
    startSec: number | null;
}

/** Место пункта «хвоста» или блока 5К, раскрытого в разговоре (focus-v3.4). */
export interface CallPageChecklistPlaceView {
    /** Ключ пункта: как в hvostSteps / fiveKItems. */
    key: string;
    quote: string;
    startSec: number | null;
}

export interface CallPageObjectionView {
    objection: string;
    handling: string | null;
    handled: boolean | null;
    category: string | null;
    quote: string | null;
    outcome: string | null;
    reaction: string | null;
    startSec: number | null;
    endSec: number | null;
}

export interface CallPageRiskEvidenceView {
    flag: string;
    quote: string;
    speaker: string | null;
    startSec: number | null;
    endSec: number | null;
}

export interface CallPageCheckpointView {
    title: string;
    status: string;
    mandatory: boolean;
    quote: string | null;
    startSec: number | null;
    endSec: number | null;
}

export interface CallPageMethodologyView {
    title: string;
    checkpoints: CallPageCheckpointView[];
    checkpointsDone: number | null;
    checkpointsTotal: number | null;
    spiralsFull: number | null;
    spiralsMinFull: number | null;
}

export interface CallPageIssueView {
    code: string;
    quote: string | null;
    note: string | null;
    /** Время цитаты в звонке; null — старый разбор или меток не было. */
    startSec: number | null;
    endSec: number | null;
}

export interface CallPagePriceView {
    amount: number;
    periodMonths: number | null;
    product: string | null;
    kind: string | null;
    quote: string | null;
    /** Когда цена прозвучала; null — старый разбор или меток не было. */
    startSec: number | null;
}

export interface CallPageNextStepView {
    set: boolean;
    description: string | null;
    date: string | null;
    time: string | null;
    goal: string | null;
    kind: string | null;
    /** Когда договорились о шаге; null — старый разбор или меток не было. */
    startSec: number | null;
}

export interface CallPageUpsellView {
    attempted: boolean;
    kind: string | null;
    what: string | null;
}

export interface CallPageDealProgressView {
    score: number;
    before: string | null;
    after: string | null;
    why: string | null;
    whyNotHigher: string | null;
}

export interface CallPageDialogTurnView {
    role: string;
    text: string;
}

export interface CallPageAnalysisView {
    callType: string | null;
    callTypeRefined: string | null;
    callTypeReason: string | null;
    summary: string | null;
    score: number | null;
    weightedScore: number | null;
    scriptCompliance: number | null;
    scoreExplanation: string | null;
    coachingPriority: string | null;
    recommendations: string[];
    employeeRecommendations: string | null;
    sentiment: string | null;
    interlocutorRole: string | null;
    specialist: string | null;
    outcome: string | null;
    needsFound: boolean | null;
    needs: string[];
    /** Потребности с местом в разговоре; прежний разбор — пусто. */
    needItems: CallPageNeedItemView[];
    /** Когда началось выяснение потребностей; null — нет или не размечено. */
    needsStartSec: number | null;
    presentationDone: boolean | null;
    /** Когда началась презентация; null — нет или не размечено. */
    presentationStartSec: number | null;
    productsOffered: string[];
    priceDiscussed: boolean | null;
    competitors: string[];
    riskFlags: string[];
    refusalCategory: string | null;
    refusalReason: string | null;
    talkRatioPct: number | null;
    questionsCount: number | null;
    hvostDone: boolean | null;
    hvostAnalysis: string | null;
    fiveKDone: boolean | null;
    fiveKAnalysis: string | null;
    /** Места пунктов «хвоста» и 5К; прежний разбор — пусто. */
    hvostEvidence: CallPageChecklistPlaceView[];
    fiveKEvidence: CallPageChecklistPlaceView[];
    reportComparison: string | null;
    speechAnalysis: string | null;
    nextStep: CallPageNextStepView | null;
    upsell: CallPageUpsellView | null;
    dealProgress: CallPageDealProgressView | null;
    sections: CallPageSectionView[];
    objections: CallPageObjectionView[];
    riskEvidence: CallPageRiskEvidenceView[];
    issues: CallPageIssueView[];
    prices: CallPagePriceView[];
    methodology: CallPageMethodologyView | null;
    dialog: CallPageDialogTurnView[];
    /** Части разбора, которые не собрались; пусто — разбор полный. */
    incompleteParts: string[];
}

/** Реплика расшифровки на странице. */
export interface CallPageSegmentView {
    index: number;
    /** Секунды от начала записи; null — у расшифровки нет таймкодов. */
    startSec: number | null;
    endSec: number | null;
    /** manager / client; null — кто говорит, неизвестно. */
    speaker: 'manager' | 'client' | null;
    text: string;
}

/**
 * Привязка места разбора к расшифровке: цитата и (если есть) время. Поиск
 * места — общий с приёмом разбора (@lib/call-lib/call-report/transcript-anchor).
 */
export type CallPageAnchor = TranscriptAnchor;
