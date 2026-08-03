import { CallRevisionScheduler } from '../cron/call-revision.scheduler';

const makeDeps = (options: {
    enabled?: string;
    domains?: { domain: string }[];
    lockTaken?: boolean;
    windowHours?: string;
    maxEntities?: string;
    disabledDomains?: string[];
    reviseError?: string[];
}) => {
    const config = {
        get: jest.fn((key: string) => {
            if (key === 'CALL_REPORT_REVISOR_ENABLED') return options.enabled;
            if (key === 'CALL_REPORT_REVISOR_WINDOW_HOURS')
                return options.windowHours;
            if (key === 'CALL_REPORT_REVISOR_MAX_ENTITIES')
                return options.maxEntities;
            return undefined;
        }),
    };
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
                enabled: options.disabledDomains?.includes(domain)
                    ? false
                    : null,
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
        config as never,
        redisService as never,
        roster as never,
        settingsService as never,
        revisionService as never,
    );
    return { scheduler, revisionService, redisClient };
};

describe('CallRevisionScheduler (ночной ревизор)', () => {
    afterEach(() => jest.clearAllMocks());

    it('по умолчанию выключен: без CALL_REPORT_REVISOR_ENABLED=1 тик молчит', async () => {
        const { scheduler, revisionService } = makeDeps({
            domains: [{ domain: 'a.bitrix24.ru' }],
        });
        await scheduler.tick();
        expect(revisionService.runForDomain).not.toHaveBeenCalled();
    });

    it('занятый Redis-лок пропускает тик', async () => {
        const { scheduler, revisionService } = makeDeps({
            enabled: '1',
            domains: [{ domain: 'a.bitrix24.ru' }],
            lockTaken: true,
        });
        await scheduler.tick();
        expect(revisionService.runForDomain).not.toHaveBeenCalled();
    });

    it('окно и лимит из env уезжают в ревизию каждого домена', async () => {
        const { scheduler, revisionService } = makeDeps({
            enabled: '1',
            domains: [{ domain: 'a.bitrix24.ru' }],
            windowHours: '48',
            maxEntities: '5',
        });
        await scheduler.tick();
        const call = revisionService.runForDomain.mock.calls[0] as unknown as [
            string,
            Date,
            Date,
            number,
        ];
        expect(call[0]).toBe('a.bitrix24.ru');
        expect(call[3]).toBe(5);
        expect((call[2].getTime() - call[1].getTime()) / 3_600_000).toBeCloseTo(
            48,
        );
    });

    it('портал с enabled=false пропускается, ошибка домена не роняет обход', async () => {
        const { scheduler, revisionService, redisClient } = makeDeps({
            enabled: '1',
            domains: [
                { domain: 'off.bitrix24.ru' },
                { domain: 'fail.bitrix24.ru' },
                { domain: 'ok.bitrix24.ru' },
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
