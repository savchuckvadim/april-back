import { AgentDialogTurnDto } from '../dto/agent-analysis-request.dto';

/** Количественные метрики речи, посчитанные кодом по размеченному диалогу. */
export interface SpeechMetrics {
    /** Доля речи менеджера, % (по словам реплик manager vs client). */
    talkRatioPct: number;
    /** Число вопросов менеджера (по знакам «?» в его репликах). */
    questionsCount: number;
}

/**
 * Считает метрики речи из размеченного по ролям диалога.
 *
 * Принцип «code computes numbers, LLM only explains»: числовые метрики
 * не доверяются LLM — агент размечает роли, а сами числа детерминированно
 * считает бэкенд (LLM систематически ошибается в арифметике на длинных
 * диалогах). Реплики роли other (автоответчик, третий участник) в долю
 * речи не входят.
 *
 * null — диалога нет или в нём нет слов менеджера/клиента (метрики
 * посчитать не из чего; остаются значения агента, если он их прислал).
 */
export function computeSpeechMetrics(
    dialog: AgentDialogTurnDto[] | undefined,
): SpeechMetrics | null {
    if (!dialog?.length) return null;

    let managerWords = 0;
    let clientWords = 0;
    let questionsCount = 0;

    for (const turn of dialog) {
        const words = countWords(turn.text);
        if (turn.role === 'manager') {
            managerWords += words;
            questionsCount += countQuestions(turn.text);
        } else if (turn.role === 'client') {
            clientWords += words;
        }
    }

    const totalWords = managerWords + clientWords;
    if (totalWords === 0) return null;

    return {
        talkRatioPct: Math.round((managerWords / totalWords) * 100),
        questionsCount,
    };
}

function countWords(text: string): number {
    const matches = text.match(/[\p{L}\p{N}]+/gu);
    return matches?.length ?? 0;
}

function countQuestions(text: string): number {
    return (text.match(/\?/g) ?? []).length;
}
