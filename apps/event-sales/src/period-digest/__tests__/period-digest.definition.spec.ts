import { ropPeriodByKey, ropPeriodWindow } from '@lib/rop-reports';
import { ETimeZone } from '@lib/shared/lib/date';
import { PeriodDigestDefinition } from '../period-digest.definition';
import { PeriodDigestRunProcessor } from '../queue/period-digest-run.processor';
import type { PeriodDigestOptions } from '../types/period-digest.types';

const DOMAIN = 'garant.bitrix24.ru';

const report = {
    managers: 2,
    readiness: { ok: 1, fewData: 0, noCalls: 1 },
    recommendations: {
        active: 1,
        fresh: 1,
        fixed: 0,
        escalated: 0,
        dropped: 0,
    },
    saved: { created: 2, updated: 0, unchanged: 0 },
};

describe('итоги периода для движка отчётов РОПу', () => {
    const build = () => {
        const settings = {
            enabledDomains: jest.fn().mockResolvedValue([DOMAIN]),
            resolveOptions: jest.fn(),
        };
        const calendar = {
            resolve: jest.fn().mockResolvedValue({
                timezone: ETimeZone.EUROPE_MOSCOW,
            }),
        };
        const cards = { run: jest.fn().mockResolvedValue(report) };
        return {
            cards,
            definition: new PeriodDigestDefinition(
                settings as never,
                calendar as never,
                cards as never,
            ),
        };
    };

    it('прогон — только подсчёт: задач и получателей нет, строки итога по-русски', async () => {
        const { definition, cards } = build();
        const period = ropPeriodByKey('month', '2026-10');
        if (!period) throw new Error('нет периода');
        const heartbeat = jest.fn().mockResolvedValue(undefined);

        const result = await definition.run(
            {
                domain: DOMAIN,
                period: ropPeriodWindow(period, ETimeZone.EUROPE_MOSCOW),
                options: {} as PeriodDigestOptions,
                mode: { countOnly: false, previewUserId: null, force: false },
                now: new Date('2026-11-02T07:00:00Z'),
                heartbeat,
            },
            ['предупреждение'],
        );

        expect(result).toMatchObject({
            domain: DOMAIN,
            kind: 'month',
            periodKey: '2026-10',
            countOnly: true,
            recipients: 0,
            tasksCreated: 0,
            warnings: ['предупреждение'],
        });
        expect(result.summary[0]).toContain('Менеджеров: 2');
        const [input] = cards.run.mock.calls[0] as [
            { heartbeat: () => Promise<void> },
        ];
        await input.heartbeat();
        expect(heartbeat).toHaveBeenCalled();
    });

    it('ключи Redis — общие с админкой, имя и заголовок отчёта', () => {
        const { definition } = build();

        expect(definition.code).toBe('period-digest');
        expect(definition.title).toBe('Итоги периода по менеджерам');
        expect(definition.keys.lastRun(DOMAIN, 'week')).toBe(
            `event-sales:period-digest:last-run:week:${DOMAIN}`,
        );
    });
});

describe('подсчёт итогов периода из админки (очередь)', () => {
    const build = (kind: 'ran' | 'busy') => {
        const ticker = { runNow: jest.fn().mockResolvedValue({ kind }) };
        const definition = {};
        return {
            ticker,
            processor: new PeriodDigestRunProcessor(
                ticker as never,
                definition as never,
            ),
        };
    };
    const job = (data: Record<string, unknown>, attemptsMade = 1) =>
        ({ data, attemptsMade, opts: { attempts: 15 }, name: 'x' }) as never;

    it('запускает период через движок — только подсчёт', async () => {
        const { processor, ticker } = build('ran');

        await processor.handle(
            job({ domain: DOMAIN, kind: 'month', periodKey: '2026-10' }),
        );

        expect(ticker.runNow).toHaveBeenCalledWith(expect.anything(), {
            domain: DOMAIN,
            kind: 'month',
            periodKey: '2026-10',
            countOnly: true,
        });
    });

    it('портал занят другим прогоном — ошибка джоба, очередь повторит', async () => {
        const { processor } = build('busy');

        await expect(
            processor.handle(job({ domain: DOMAIN, kind: 'week' })),
        ).rejects.toThrow('повтор через минуту');
    });
});
