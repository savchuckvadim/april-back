import type { StructuredLlmResponse } from '@lib/llm-gateway';
import type { LongCallInputs } from './long-call-input.types';

/**
 * Типы LongCallInputService: опции подготовки и результат. Результат —
 * тексты проходов и сводка для журнала из сборки 4б (LongCallInputs) плюс
 * сведения о самой подготовке и расход модели.
 */

/** Опции подготовки длинного разговора. */
export interface LongCallPrepareOptions {
    /** Модель VibeCode из настроек портала (deepAnalysisModel). */
    model?: string;
    /**
     * Резать, даже если режим выключен (проверка из админки). Порог длины
     * действует и при force.
     */
    force?: boolean;
}

/** Готовый вход проходов длинного разговора. */
export interface LongCallInput extends LongCallInputs {
    /** Знаков в расшифровке (без крайних пробелов). */
    transcriptChars: number;
    /** Размер части, которым резали, знаков. */
    partChars: number;
    /**
     * Ответы модели с расходом — каждый удавшийся запрос (конспекты частей и
     * сводка). Вызывающий добавляет их в общий расход разбора. Ответы,
     * взятые из кэша, сюда не входят: за них не заплачено.
     */
    completions: StructuredLlmResponse[];
}
