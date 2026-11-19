import { spendMonthRange, spendTotals } from '../lib/transcription-spend.util';
import {
    moscowDayKey,
    parseSubmissionHash,
    spendMonthDays,
    submissionKeys,
    sumSubmissions,
    withSubmissions,
    type YandexSubmissionDay,
} from '../lib/yandex-submission-stats.util';

/** Счётчик отправок в Яндекс для страницы расхода — чистые правила. */
const day = (entries: Record<string, [number, number]>): YandexSubmissionDay =>
    new Map(
        Object.entries(entries).map(([domain, [submissions, seconds]]) => [
            domain,
            { submissions, seconds },
        ]),
    );

describe('yandex-submission-stats.util', () => {
    it('день — по Москве', () => {
        expect(moscowDayKey(new Date('2026-11-19T20:59:00Z'))).toBe(
            '2026-11-19',
        );
        expect(moscowDayKey(new Date('2026-11-19T21:00:00Z'))).toBe(
            '2026-11-20',
        );
    });

    it('дни месяца по Москве — все, по порядку', () => {
        const days = spendMonthDays(
            spendMonthRange('2026-11', new Date('2026-11-19T12:00:00Z')),
        );
        expect(days).toHaveLength(30);
        expect(days[0]).toBe('2026-11-01');
        expect(days[29]).toBe('2026-11-30');
    });

    it('хэш дня Redis → портал → отправки и секунды', () => {
        expect(
            parseSubmissionHash({
                'gsr.bitrix24.ru|n': '3',
                'gsr.bitrix24.ru|sec': '2100',
                'garant.bitrix24.ru|n': '1',
            }),
        ).toEqual(
            new Map([
                ['gsr.bitrix24.ru', { submissions: 3, seconds: 2100 }],
                ['garant.bitrix24.ru', { submissions: 1, seconds: 0 }],
            ]),
        );
    });

    it('сумма: портал без отправок в учтённый день — 0; ни одного учтённого дня — null', () => {
        const byDay = new Map([
            ['2026-11-19', day({ 'gsr.bitrix24.ru': [3, 2100] })],
            ['2026-11-20', day({ 'garant.bitrix24.ru': [1, 700] })],
        ]);
        const days = ['2026-11-18', '2026-11-19', '2026-11-20'];
        expect(sumSubmissions(byDay, days, 'gsr.bitrix24.ru')).toEqual({
            submissions: 3,
            seconds: 2100,
        });
        expect(sumSubmissions(byDay, days)).toEqual({
            submissions: 4,
            seconds: 2800,
        });
        expect(
            sumSubmissions(byDay, ['2026-11-20'], 'gsr.bitrix24.ru'),
        ).toEqual({ submissions: 0, seconds: 0 });
        expect(sumSubmissions(byDay, ['2026-11-18'], 'gsr.bitrix24.ru')).toBe(
            null,
        );
    });

    it('итог с отправками: минуты из секунд, без счётчика — null', () => {
        const byDay = new Map([
            ['2026-11-19', day({ 'gsr.bitrix24.ru': [3, 2100] })],
        ]);
        expect(
            withSubmissions(
                spendTotals([]),
                byDay,
                ['2026-11-19'],
                'gsr.bitrix24.ru',
            ),
        ).toMatchObject({ yandexSubmissions: 3, yandexSubmittedMinutes: 35 });
        expect(
            withSubmissions(spendTotals([]), byDay, ['2026-11-01']),
        ).toMatchObject({
            yandexSubmissions: null,
            yandexSubmittedMinutes: null,
        });
    });

    it('ключи с отправками: порталы за дни или дни портала', () => {
        const byDay = new Map([
            ['2026-11-19', day({ 'gsr.bitrix24.ru': [3, 2100] })],
            ['2026-11-20', day({ 'garant.bitrix24.ru': [1, 700] })],
        ]);
        const days = ['2026-11-19', '2026-11-20'];
        expect(submissionKeys(byDay, days).sort()).toEqual([
            'garant.bitrix24.ru',
            'gsr.bitrix24.ru',
        ]);
        expect(submissionKeys(byDay, days, 'garant.bitrix24.ru')).toEqual([
            '2026-11-20',
        ]);
    });
});
