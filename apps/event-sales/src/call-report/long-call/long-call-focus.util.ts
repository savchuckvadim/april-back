import type { LongCallConsumer } from './long-call-consumers.const';
import type { LongCallInput } from './long-call-input.service.types';

/**
 * Подключение длинного пути к разбору звонка (этап 4г): чем заменить
 * полную расшифровку в запросах и как учесть расход подготовки. Чистые
 * функции; сервис разбора только вызывает их, поэтому при `null` (длинный
 * путь не применяется) запросы остаются теми же, что были.
 */

/**
 * User-часть запроса потребителя: обёртка (тип звонка, паспорт) вокруг его
 * текста длинного пути; длинного пути нет — вокруг полной расшифровки.
 */
export function longUserContent(
    input: LongCallInput | null,
    transcript: string,
    wrap: (text: string) => string,
): (consumer: LongCallConsumer) => string {
    return consumer => wrap(input?.texts[consumer] ?? transcript);
}

/**
 * Токены вызова вместе с расходом подготовки (конспекты частей и сводка).
 * Длинного пути нет — число вызова как есть; неизвестное слагаемое в сумму
 * не входит, все неизвестны — null.
 */
export function longTokens(
    tokens: number | null,
    input: LongCallInput | null,
): number | null {
    if (input === null) return tokens;
    const known = [
        tokens,
        ...input.completions.map(completion => completion.usage.totalTokens),
    ].filter((value): value is number => value !== null);

    return known.length > 0
        ? known.reduce((total, value) => total + value, 0)
        : null;
}
