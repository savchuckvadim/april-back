import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    RU_WORK_CALENDAR_TTL_SECONDS,
    RuWorkCalendarService,
} from '../ru-work-calendar.service';

const XML_2026 = readFileSync(
    join(__dirname, 'fixtures', 'xmlcalendar-2026.json'),
    'utf8',
);

const makeService = (
    responder: (url: string) => Promise<{ ok: boolean; text: string }>,
) => {
    const store = new Map<string, string>();
    const set = jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
    });
    const redis = {
        getClient: () => ({
            get: (key: string) => Promise.resolve(store.get(key) ?? null),
            set,
        }),
    };
    const service = new RuWorkCalendarService(redis as never);
    const fetcher = jest.fn(async (url: string) => {
        const answer = await responder(url);
        return {
            ok: answer.ok,
            text: () => Promise.resolve(answer.text),
        } as Response;
    });
    service.useFetch(fetcher);
    return { service, fetcher, set };
};

describe('RuWorkCalendarService', () => {
    it('живой источник → кэш на месяц; второй вызов в сеть не ходит', async () => {
        const { service, fetcher, set } = makeService(() =>
            Promise.resolve({ ok: true, text: XML_2026 }),
        );
        const first = await service.year(2026);
        expect(first.source).toBe('live');
        expect(first.holidays).toContain('2026-01-09');
        expect(set).toHaveBeenCalledWith(
            'ru-work-calendar:2026',
            expect.any(String),
            'EX',
            RU_WORK_CALENDAR_TTL_SECONDS.live,
        );
        const calls = fetcher.mock.calls.length;
        await service.year(2026);
        expect(fetcher.mock.calls.length).toBe(calls);
    });

    it('оба источника молчат — запасной список ТК РФ на час, без исключения', async () => {
        const { service, set } = makeService(() =>
            Promise.reject(new Error('timeout')),
        );
        const calendar = await service.year(2026);
        expect(calendar.source).toBe('fallback');
        expect(calendar.holidays).toContain('2026-11-04');
        expect(set).toHaveBeenCalledWith(
            'ru-work-calendar:2026',
            expect.any(String),
            'EX',
            RU_WORK_CALENDAR_TTL_SECONDS.fallback,
        );
    });

    it('years: порядок как в запросе, сбой одного года не роняет другой', async () => {
        const { service } = makeService(url =>
            url.includes('2026')
                ? Promise.resolve({ ok: true, text: XML_2026 })
                : Promise.resolve({ ok: false, text: '' }),
        );
        const [y2025, y2026] = await service.years([2025, 2026]);
        expect(y2025.year).toBe(2025);
        expect(y2025.source).toBe('fallback');
        expect(y2026.source).toBe('live');
    });
});
