import {
    readYandexSttTolerance,
    transcribeJobTimeoutMs,
    YANDEX_SLOT_WAIT_DEFAULT_MS,
    yandexPollBudgetMs,
    yandexTranscribeBudgetMs,
} from '../lib/yandex-stt-budget.util';

/**
 * Таймаут задания TRANSCRIBE против ожидания Яндекса (19.11.2026): Bull
 * по таймауту запускал вторую попытку параллельно первой — и та платила
 * за звонок второй раз.
 */
const reader =
    (values: Record<string, string> = {}) =>
    (key: string): string | undefined =>
        values[key];

describe('yandex-stt-budget.util', () => {
    it('по умолчанию опрос — 700 × 3 с, и таймаут задания больше опроса и ожидания слота вместе', () => {
        const tolerance = readYandexSttTolerance(reader());
        expect(tolerance).toEqual({
            pollDelayMs: 3000,
            pollMaxAttempts: 700,
            transientRetries: 5,
            retryBaseMs: 2000,
        });
        const poll = yandexPollBudgetMs(tolerance);
        expect(poll).toBeGreaterThan(700 * 3000);

        const timeout = transcribeJobTimeoutMs(reader(), 45 * 60_000);
        expect(timeout).toBeGreaterThan(poll + YANDEX_SLOT_WAIT_DEFAULT_MS);
        // Прежние 45 минут были МЕНЬШЕ ожидания Яндекса.
        expect(timeout).toBeGreaterThan(45 * 60_000);
    });

    it('настройки опроса и слота из env двигают таймаут', () => {
        const env = reader({
            YANDEX_STT_POLL_DELAY_MS: '5000',
            YANDEX_STT_POLL_MAX_ATTEMPTS: '1000',
            TRANSCRIPTION_YANDEX_SLOT_WAIT_MS: String(60 * 60_000),
        });
        expect(transcribeJobTimeoutMs(env, 0)).toBeGreaterThan(
            1000 * 5000 + 60 * 60_000,
        );
    });

    it('заданный больший таймаут сохраняется', () => {
        const configured = 5 * 3_600_000;
        expect(transcribeJobTimeoutMs(reader(), configured)).toBe(configured);
        expect(yandexTranscribeBudgetMs(reader())).toBeLessThan(configured);
    });

    it('мусор в env — значения по умолчанию', () => {
        expect(
            readYandexSttTolerance(
                reader({
                    YANDEX_STT_POLL_DELAY_MS: 'abc',
                    YANDEX_STT_POLL_MAX_ATTEMPTS: '-5',
                }),
            ),
        ).toMatchObject({ pollDelayMs: 3000, pollMaxAttempts: 700 });
    });
});
