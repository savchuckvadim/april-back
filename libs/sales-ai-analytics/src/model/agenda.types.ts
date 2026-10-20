import type { AnalysisSection } from './sections.util';

/**
 * Типы повестки планёрки РОПа. Логика подбора — `agenda.ts`; типы
 * вынесены отдельно, чтобы файл подбора не рос за 300 строк.
 */

export type AgendaSection = AnalysisSection;

/** Возражение клиента из разбора: категория, цитата, отработано ли, исход. */
export interface AgendaObjection {
    category: string | null;
    quote: string | null;
    handled: boolean | null;
    outcome: string | null;
}

/** Доказательство риск-флага: код и дословная цитата. */
export interface AgendaRiskEvidence {
    flag: string;
    quote: string | null;
}

/** Следующий шаг разбора: назначен ли и на какую дату. */
export interface AgendaNextStep {
    set: boolean;
    date: string | null;
}

/** Строка звонка для повестки РОПа (text нужен только для charOffset). */
export interface AgendaCallRow {
    transcriptionId: string;
    managerId: string | null;
    callType: string | null;
    callStartedAt: Date;
    /** Оценка звонка в шкале 0–100 (weightedScore разбора); null — нет. */
    score: number | null;
    sections: AgendaSection[];
    objections: AgendaObjection[];
    riskFlags: string[];
    /**
     * Доказательства флагов; поле необязательное — старые строки без него
     * риск-пунктов не дают (флаг без цитаты — не сигнал).
     */
    riskEvidence?: AgendaRiskEvidence[];
    /** Следующий шаг разбора; нет поля — «без даты» не определяется. */
    nextStep?: AgendaNextStep | null;
    text: string | null;
}

/**
 * Почему звонок попал в повестку — в порядке приоритета (решение
 * владельца 19.10.2026): слабая презентация → слабая доработка → низкая
 * оценка → риск с цитатой; затем прежние запасные причины — спорное
 * возражение у звонка другого типа и худший раздел.
 */
export const AGENDA_REASON_KINDS = [
    'weak_presentation',
    'weak_followup',
    'low_score',
    'risk',
    'objection',
    'section',
] as const;
export type AgendaReasonKind = (typeof AGENDA_REASON_KINDS)[number];

export interface AgendaItem {
    transcriptionId: string;
    managerId: string | null;
    callType: string | null;
    kind: AgendaReasonKind;
    reason: string;
    quote: string;
    charOffset: number | null;
    score: number | null;
}

export interface AgendaOptions {
    /** Сколько звонков в повестке (по умолчанию 3). */
    limit?: number;
    /** Раздел слабый при оценке не выше (реестр weak_section_score_max). */
    weakSectionScoreMax?: number;
    /** Звонок слабый при общей оценке 1–10 не выше (low_score_call_max). */
    lowScoreCallMax?: number;
}
