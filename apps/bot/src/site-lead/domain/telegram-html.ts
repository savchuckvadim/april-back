import { escapeHtml } from '@lib/support';

/** Знак обрезки длинного поля. */
const ELLIPSIS = '…';

/**
 * Экранирует текст для parse_mode HTML и обрезает так, чтобы результат не
 * превысил `budget` и не разрезал ни сущность («&amp;» целиком или никак),
 * ни символ из двух половин (эмодзи): разрезанное Telegram не разберёт и
 * отклонит всё сообщение.
 */
export function clipEscaped(text: string, budget: number): string {
    let result = '';
    for (const char of text) {
        const piece = escapeHtml(char);
        if (result.length + piece.length > budget - ELLIPSIS.length) {
            return `${result}${ELLIPSIS}`;
        }
        result += piece;
    }
    return result;
}

/**
 * Режет длинный текст на экранированные куски не длиннее `budget`, по
 * границам строк, где это возможно. Строку длиннее бюджета режет по
 * символам — тоже не разрывая сущностей и эмодзи.
 */
export function splitEscaped(text: string, budget: number): string[] {
    const parts: string[] = [];
    let current = '';
    const flush = () => {
        if (current) parts.push(current);
        current = '';
    };

    for (const line of text.split('\n')) {
        const escaped = escapeHtml(line);
        const joined = current ? `${current}\n${escaped}` : escaped;
        if (joined.length <= budget) {
            current = joined;
            continue;
        }
        flush();
        if (escaped.length <= budget) {
            current = escaped;
            continue;
        }
        for (const char of line) {
            const piece = escapeHtml(char);
            if (current.length + piece.length > budget) flush();
            current += piece;
        }
    }
    flush();
    return parts.length > 0 ? parts : [''];
}
