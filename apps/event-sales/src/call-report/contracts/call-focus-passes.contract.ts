import { CALL_ANALYSIS_PART_TITLES } from '../../agent-gate/dto/agent-analysis-request/agent-analysis-parts.const';
import {
    FOCUS_CONTENT_PROMPT,
    FOCUS_CONTENT_SCHEMA,
    FOCUS_FORM_PROMPT,
    FOCUS_FORM_SCHEMA,
    FOCUS_SYNTHESIS_SCHEMA,
} from './call-focus-analysis.contract';
import {
    FOCUS_CLOSING_PROMPT,
    FOCUS_CLOSING_SCHEMA,
    FOCUS_MOVEMENT_PROMPT,
    FOCUS_MOVEMENT_SCHEMA,
} from './call-focus-deal.contract';
import type { CallFocusKey } from './call-focus-sections.contract';

/**
 * Описание фокус-проходов разбора звонка: что за вызов, как он называется в
 * журнале и выжимке для синтеза, какой у него промпт и схема. Вынесено из
 * CallFocusAnalysisService по лимиту файла; число проходов во всех журналах
 * («выжило N/4») берётся из длины этого списка.
 */

/** Описание одного фокус-прохода. */
export interface FocusPass {
    key: CallFocusKey;
    /** Название для журнала: «Фокус «форма разговора»». */
    label: string;
    /** Заголовок выжимки прохода в запросе синтеза. */
    digestLabel: string;
    prompt: string;
    schema: Record<string, unknown>;
}

/** Фокус-проходы в порядке сборки; идут к модели одновременно. */
export const FOCUS_PASSES: readonly FocusPass[] = [
    {
        key: 'form',
        label: CALL_ANALYSIS_PART_TITLES.form,
        digestLabel: 'ФОРМА РАЗГОВОРА',
        prompt: FOCUS_FORM_PROMPT,
        schema: FOCUS_FORM_SCHEMA,
    },
    {
        key: 'content',
        label: CALL_ANALYSIS_PART_TITLES.content,
        digestLabel: 'СОДЕРЖАНИЕ ПРОДАЖИ',
        prompt: FOCUS_CONTENT_PROMPT,
        schema: FOCUS_CONTENT_SCHEMA,
    },
    {
        key: 'movement',
        label: CALL_ANALYSIS_PART_TITLES.movement,
        digestLabel: 'ВОЗРАЖЕНИЯ И ЦЕНА',
        prompt: FOCUS_MOVEMENT_PROMPT,
        schema: FOCUS_MOVEMENT_SCHEMA,
    },
    {
        key: 'closing',
        label: CALL_ANALYSIS_PART_TITLES.closing,
        digestLabel: 'ЗАКРЫТИЕ И СЛЕДУЮЩИЙ ШАГ',
        prompt: FOCUS_CLOSING_PROMPT,
        schema: FOCUS_CLOSING_SCHEMA,
    },
];

/** Синтез итога — в журнале и схеме как отдельный проход. */
export const SYNTHESIS_PASS = {
    key: 'synthesis',
    label: 'синтез',
    title: 'Синтез фокус-разбора',
    schema: FOCUS_SYNTHESIS_SCHEMA,
} as const;

/** Имя схемы вызова прохода: `call_focus_<ключ>` — оно же в журнале шлюза. */
export const focusSchemaName = (key: string): string => `call_focus_${key}`;
