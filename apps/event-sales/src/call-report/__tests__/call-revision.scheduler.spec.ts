import { CallRevisionScheduler } from '../cron/call-revision.scheduler';

const makeDeps = (options: {
    domains?: { domain: string; portalId: number }[];
    lockTaken?: boolean;
    /** revisorEnabled по доменам (дефолт false — как в настройках). */
    revisorOn?: string[];
    disabledDomains?: string[];
    reviseError?: string[];
}) => {
    const redisClient = {
        set: jest.fn().mockResolvedValue(options.lockTaken ? null : 'OK'),
        del: jest.fn().mockResolvedValue(1),
    };
    const redisService = { getClient: () => redisClient };
    const roster = {
        resolve: jest.fn().mockResolvedValue(options.domains ?? []),
    };
    const settingsService = {
        resolve: jest.fn((domain: string) =>
            Promise.resolve({
                enabled: !options.disabledDomains?.includes(domain),
                revisorEnabled: options.revisorOn?.includes(domain) ?? false,
            }),
        ),
    };
    const revisionService = {
        runForDomain: jest.fn((domain: string) =>
            options.reviseError?.includes(domain)
                ? Promise.reject(new Error(`fail ${domain}`))
                : Promise.resolve({
                      domain,
                      entitiesTotal: 1,
                      entitiesRevised: 1,
                      entitiesFailed: 0,
                  }),
        ),
    };
    const scheduler = new CallRevisionScheduler(
        redisService as never,
        roster as never,
        settingsService as never,
        revisionService as never,
    );
    return { scheduler, revisionService, redisClient };
};

describe('CallRevisionScheduler (ночной ревизор, тумблер в БД)', () => {
    afterEach(() => jest.clearAllMocks());

    it('ревизор по умолчанию выключен: без revisorEnabled портал пропускается', async () => {
        const { scheduler, revisionService } = makeDeps({
            domains: [{ domain: 'a.bitrix24.ru', portalId: 1 }],
        });
        await scheduler.tick();
        expect(revisionService.runForDomain).not.toHaveBeenCalled();
    });

    it('revisorEnabled=true в настройках портала включает ревизию', async () => {
        const { scheduler, revisionService } = makeDeps({
            domains: [{ domain: 'a.bitrix24.ru', portalId: 1 }],
            revisorOn: ['a.bitrix24.ru'],
        });
        await scheduler.tick();
        expect(revisionService.runForDomain).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            expect.any(Date),
            expect.any(Date),
            20,
        );
    });

    it('занятый Redis-лок пропускает тик', async () => {
        const { scheduler, revisionService } = makeDeps({
            domains: [{ domain: 'a.bitrix24.ru', portalId: 1 }],
            revisorOn: ['a.bitrix24.ru'],
            lockTaken: true,
        });
        await scheduler.tick();
        expect(revisionService.runForDomain).not.toHaveBeenCalled();
    });

    it('выключенный портал пропускается, ошибка домена не роняет обход', async () => {
        const { scheduler, revisionService, redisClient } = makeDeps({
            domains: [
                { domain: 'off.bitrix24.ru', portalId: 1 },
                { domain: 'fail.bitrix24.ru', portalId: 2 },
                { domain: 'ok.bitrix24.ru', portalId: 3 },
            ],
            revisorOn: [
                'off.bitrix24.ru',
                'fail.bitrix24.ru',
                'ok.bitrix24.ru',
            ],
            disabledDomains: ['off.bitrix24.ru'],
            reviseError: ['fail.bitrix24.ru'],
        });
        await scheduler.tick();
        expect(revisionService.runForDomain).toHaveBeenCalledTimes(2);
        expect(revisionService.runForDomain).toHaveBeenCalledWith(
            'ok.bitrix24.ru',
            expect.any(Date),
            expect.any(Date),
            20,
        );
        expect(redisClient.del).toHaveBeenCalled();
    });
});
