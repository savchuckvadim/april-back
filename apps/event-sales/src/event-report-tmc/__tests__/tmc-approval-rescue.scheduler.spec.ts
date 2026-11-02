import { RedisService } from '@lib/core/redis/redis.service';
import { PortalAppSettingsService } from '@lib/portal-lib/store/app-settings';
import {
    parseStageCodes,
    TmcApprovalRescueScheduler,
} from '../services/tmc-approval-rescue.scheduler';
import {
    TmcApprovalRescueRunResult,
    TmcApprovalRescueService,
} from '../services/tmc-approval-rescue.service';

/**
 * Планировщик: обходит только порталы с включённой подстраховкой, под
 * Redis-локом, настройки читает на домен, падение одного домена не
 * роняет остальные.
 */
const emptyRun: TmcApprovalRescueRunResult = {
    candidates: 0,
    dispatched: 0,
    dryRun: 0,
    skipped: {},
    warnings: [],
};

const makeScheduler = ({
    lock = 'OK' as string | null,
    resolved = {} as Record<string, Record<string, unknown>>,
    failDomain = '',
} = {}) => {
    const redis = {
        set: jest.fn(() => Promise.resolve(lock)),
        del: jest.fn(() => Promise.resolve(1)),
    };
    const runForDomain = jest.fn((domain: string) =>
        domain === failDomain
            ? Promise.reject(new Error('портал недоступен'))
            : Promise.resolve(emptyRun),
    );
    const appSettings = {
        listByAppCode: jest.fn(() =>
            Promise.resolve([
                {
                    domain: 'gsr.bitrix24.ru',
                    settings: { tmc_approval_rescue_enabled: true },
                },
                {
                    domain: 'gsirk.bitrix24.ru',
                    settings: { tmc_approval_rescue_enabled: true },
                },
                {
                    domain: 'garant.bitrix24.ru',
                    settings: { tmc_approval_rescue_enabled: false },
                },
            ]),
        ),
        resolve: jest.fn((domain: string) =>
            Promise.resolve({
                tmcApprovalRescueEnabled: true,
                tmcApprovalRescueDryRun: false,
                tmcApprovalRescueStageCodes: 'rpa_pres_success',
                tmcApprovalRescueLookbackHours: 72,
                tmcApprovalRescueGraceMinutes: 20,
                tmcApprovalRescueMaxPerRun: 20,
                ...resolved[domain],
            }),
        ),
    };
    const scheduler = new TmcApprovalRescueScheduler(
        { getClient: () => redis } as unknown as RedisService,
        { runForDomain } as unknown as TmcApprovalRescueService,
        appSettings as unknown as PortalAppSettingsService,
    );
    return { scheduler, runForDomain, redis, appSettings };
};

describe('TmcApprovalRescueScheduler', () => {
    it('прогон только по включённым порталам, с настройками домена; лок снимается', async () => {
        const { scheduler, runForDomain, redis } = makeScheduler({
            resolved: {
                'gsirk.bitrix24.ru': {
                    tmcApprovalRescueDryRun: true,
                    tmcApprovalRescueStageCodes:
                        'rpa_pres_success, rpa_pres_edu',
                    tmcApprovalRescueLookbackHours: '48',
                    tmcApprovalRescueGraceMinutes: 0,
                    tmcApprovalRescueMaxPerRun: 'мусор',
                },
            },
        });

        await scheduler.tick();

        expect(runForDomain).toHaveBeenCalledTimes(2);
        expect(runForDomain).toHaveBeenCalledWith('gsr.bitrix24.ru', {
            dryRun: false,
            stageCodes: ['rpa_pres_success'],
            lookbackHours: 72,
            graceMinutes: 20,
            maxPerRun: 20,
        });
        // Строка с запятыми → список; число строкой → число; пусто/мусор → дефолт схемы.
        expect(runForDomain).toHaveBeenCalledWith('gsirk.bitrix24.ru', {
            dryRun: true,
            stageCodes: ['rpa_pres_success', 'rpa_pres_edu'],
            lookbackHours: 48,
            graceMinutes: 20,
            maxPerRun: 20,
        });
        expect(redis.del).toHaveBeenCalledTimes(1);
    });

    it('включено на портале, но выключено в актуальных настройках — пропуск домена', async () => {
        const { scheduler, runForDomain } = makeScheduler({
            resolved: {
                'gsr.bitrix24.ru': { tmcApprovalRescueEnabled: false },
            },
        });

        await scheduler.tick();

        expect(runForDomain).toHaveBeenCalledTimes(1);
        expect(runForDomain).toHaveBeenCalledWith(
            'gsirk.bitrix24.ru',
            expect.anything(),
        );
    });

    it('предыдущий тик ещё держит лок — ничего не делаем', async () => {
        const { scheduler, runForDomain, redis } = makeScheduler({
            lock: null,
        });

        await scheduler.tick();

        expect(runForDomain).not.toHaveBeenCalled();
        expect(redis.del).not.toHaveBeenCalled();
    });

    it('падение одного портала не мешает остальным', async () => {
        const { scheduler, runForDomain } = makeScheduler({
            failDomain: 'gsr.bitrix24.ru',
        });

        await expect(scheduler.tick()).resolves.toBeUndefined();
        expect(runForDomain).toHaveBeenCalledTimes(2);
    });
});

describe('parseStageCodes', () => {
    it('список через запятую с пробелами; пусто — стадия «Утверждено»', () => {
        expect(parseStageCodes(' rpa_pres_success ,rpa_pres_edu,, ')).toEqual([
            'rpa_pres_success',
            'rpa_pres_edu',
        ]);
        expect(parseStageCodes('')).toEqual(['rpa_pres_success']);
        expect(parseStageCodes(undefined)).toEqual(['rpa_pres_success']);
    });
});
