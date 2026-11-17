import type { RedisService } from '@lib/core/redis/redis.service';
import { CallAnalysisRepairScheduler } from '../cron/call-analysis-repair.scheduler';
import type { CallReportDomainRosterService } from '../cron/call-report-domain-roster.service';
import type {
    CallAnalysisRepairResult,
    CallAnalysisRepairUseCase,
} from '../use-cases/call-analysis-repair.use-case';
import type { CallPageLinksRepairUseCase } from '../use-cases/call-page-links-repair.use-case';
import type { CallPageLinksRepairResult } from '../use-cases/call-page-links-repair.util';

/**
 * Ежечасный проход догона: под тем же замком идёт разовая починка ссылок на
 * страницу разбора; её сбой догон не останавливает.
 */
const GSR = 'gsr.bitrix24.ru';
const GARANT = 'april-garant.bitrix24.ru';

const repaired = (
    domain: string,
    over: Partial<CallAnalysisRepairResult> = {},
): CallAnalysisRepairResult => ({
    domain,
    skipped: null,
    repaired: 0,
    stillPartial: 0,
    requeued: 0,
    gaveUp: 0,
    expired: 0,
    ...over,
});

const links = (
    domain: string,
    over: Partial<CallPageLinksRepairResult> = {},
): CallPageLinksRepairResult => ({
    domain,
    checked: 0,
    rewritten: 0,
    gaveUp: 0,
    finished: false,
    ...over,
});

function harness(options: {
    locked?: boolean;
    repair?: (domain: string) => Promise<CallAnalysisRepairResult>;
    linksRepair?: (domain: string) => Promise<CallPageLinksRepairResult>;
}) {
    const redis = {
        set: jest.fn(() =>
            Promise.resolve(options.locked === false ? null : 'OK'),
        ),
        del: jest.fn(() => Promise.resolve(1)),
    };
    const repairDomain = jest.fn<Promise<CallAnalysisRepairResult>, [string]>(
        options.repair ?? (domain => Promise.resolve(repaired(domain))),
    );
    const linksRepairDomain = jest.fn<
        Promise<CallPageLinksRepairResult>,
        [string]
    >(options.linksRepair ?? (domain => Promise.resolve(links(domain))));
    const scheduler = new CallAnalysisRepairScheduler(
        { getClient: () => redis } as unknown as RedisService,
        {
            resolve: () =>
                Promise.resolve([{ domain: GSR }, { domain: GARANT }]),
        } as unknown as CallReportDomainRosterService,
        { repairDomain } as unknown as CallAnalysisRepairUseCase,
        {
            repairDomain: linksRepairDomain,
        } as unknown as CallPageLinksRepairUseCase,
    );
    const warn = jest
        .spyOn(scheduler['logger'], 'warn')
        .mockImplementation(() => undefined);
    jest.spyOn(scheduler['logger'], 'error').mockImplementation(
        () => undefined,
    );
    jest.spyOn(scheduler['logger'], 'log').mockImplementation(() => undefined);
    return { scheduler, redis, repairDomain, linksRepairDomain, warn };
}

/** Тексты, ушедшие в Telegram: вызовы журнала с пометкой `telegram: true`. */
const telegramTexts = (warn: { mock: { calls: unknown[][] } }): string[] =>
    warn.mock.calls
        .filter(
            ([, meta]) =>
                typeof meta === 'object' &&
                meta !== null &&
                (meta as { telegram?: boolean }).telegram === true,
        )
        .map(([message]) => String(message));

describe('CallAnalysisRepairScheduler.tick', () => {
    it('починка ссылок идёт по каждому порталу, итог — одной сводкой вместе с догоном', async () => {
        const { scheduler, linksRepairDomain, warn, redis } = harness({
            repair: domain =>
                Promise.resolve(
                    repaired(domain, { repaired: domain === GSR ? 2 : 0 }),
                ),
            linksRepair: domain =>
                Promise.resolve(
                    links(domain, { rewritten: domain === GARANT ? 7 : 0 }),
                ),
        });

        await scheduler.tick();

        expect(linksRepairDomain.mock.calls).toEqual([[GSR], [GARANT]]);
        expect(telegramTexts(warn)).toEqual([
            'Догон разборов:\n' +
                `${GSR}: дособрано разборов 2\n` +
                `${GARANT}: исправлено ссылок на страницу разбора в ленте — 7`,
        ]);
        expect(redis.del).toHaveBeenCalledTimes(1);
    });

    it('портал, где догон разборов пропущен, починку ссылок всё равно проходит', async () => {
        const { scheduler, linksRepairDomain } = harness({
            repair: domain =>
                Promise.resolve(
                    repaired(domain, { skipped: 'поставщик на паузе' }),
                ),
        });

        await scheduler.tick();

        expect(linksRepairDomain).toHaveBeenCalledTimes(2);
    });

    it('сбой починки ссылок не останавливает проход и не уходит тревогой', async () => {
        const { scheduler, linksRepairDomain, warn } = harness({
            linksRepair: domain =>
                domain === GSR
                    ? Promise.reject(new Error('Redis недоступен'))
                    : Promise.resolve(links(domain, { rewritten: 1 })),
        });

        await scheduler.tick();

        expect(linksRepairDomain).toHaveBeenCalledTimes(2);
        expect(telegramTexts(warn)).toEqual([
            `Догон разборов:\n${GARANT}: исправлено ссылок на страницу разбора в ленте — 1`,
        ]);
    });

    it('замок занят — ни догона, ни починки ссылок', async () => {
        const { scheduler, repairDomain, linksRepairDomain } = harness({
            locked: false,
        });

        await scheduler.tick();

        expect(repairDomain).not.toHaveBeenCalled();
        expect(linksRepairDomain).not.toHaveBeenCalled();
    });

    it('сообщать нечего — в Telegram ничего не уходит', async () => {
        const { scheduler, warn } = harness({});

        await scheduler.tick();

        expect(telegramTexts(warn)).toEqual([]);
    });
});
