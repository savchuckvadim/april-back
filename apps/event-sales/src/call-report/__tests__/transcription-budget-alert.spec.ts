import { Logger } from '@nestjs/common';
import {
    spendMonthLabel,
    yandexBudgetAlertText,
    yandexBudgetReached,
} from '@lib/call-lib';
import { TranscriptionBudgetAlertScheduler } from '../cron/transcription-budget-alert.scheduler';
import {
    TranscriptionBudgetAlertUseCase,
    yandexBudgetAlertKey,
} from '../use-cases/transcription-budget-alert.use-case';

/**
 * 16.11.2026, решение владельца — «только оповещение»: расход на Яндекс
 * дошёл до месячного лимита портала — одно сообщение в телеграм, маршрут
 * распознавания не меняется.
 */
const DOMAIN = 'gsr.bitrix24.ru';
const NOW = new Date('2026-11-16T09:00:00Z');

function setup(options: { budgetRub: number | null; spentRub: number }) {
    const claimed = new Set<string>();
    const redis = {
        set: jest.fn((key: string) => {
            if (claimed.has(key)) return Promise.resolve(null);
            claimed.add(key);
            return Promise.resolve('OK');
        }),
    };
    const portalAiSettings = {
        getByDomain: jest
            .fn()
            .mockResolvedValue(
                options.budgetRub === null
                    ? null
                    : { yandexMonthlyBudgetRub: options.budgetRub },
            ),
    };
    const spend = {
        yandexMonth: jest.fn().mockResolvedValue({
            month: '2026-11',
            totals: {
                rub: options.spentRub,
                yandexCalls: 120,
                yandexMinutes: 2600,
            },
        }),
    };
    const useCase = new TranscriptionBudgetAlertUseCase(
        portalAiSettings as never,
        spend as never,
        { getClient: () => redis } as never,
    );
    return { useCase, redis, spend, portalAiSettings };
}

describe('TranscriptionBudgetAlertUseCase — месячный лимит Яндекса', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('лимит не задан — расход даже не считается', async () => {
        const { useCase, spend } = setup({ budgetRub: null, spentRub: 9999 });

        await expect(useCase.check(DOMAIN, NOW)).resolves.toBe('no-budget');
        expect(spend.yandexMonth).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });

    it('расход меньше лимита — тишина', async () => {
        const { useCase, redis } = setup({
            budgetRub: 1500,
            spentRub: 1499.99,
        });

        await expect(useCase.check(DOMAIN, NOW)).resolves.toBe('below');
        expect(redis.set).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });

    it('лимит достигнут — одно сообщение в телеграм; повторная проверка молчит', async () => {
        const { useCase, redis } = setup({ budgetRub: 1500, spentRub: 1560 });

        await expect(useCase.check(DOMAIN, NOW)).resolves.toBe('alerted');
        await expect(useCase.check(DOMAIN, NOW)).resolves.toBe(
            'already-alerted',
        );

        expect(redis.set).toHaveBeenCalledWith(
            'transcription:yandex-budget-alert:gsr.bitrix24.ru:2026-11:1500',
            NOW.toISOString(),
            'EX',
            40 * 24 * 60 * 60,
            'NX',
        );
        expect(warn).toHaveBeenCalledTimes(1);
        const [text, meta] = warn.mock.calls[0] as [string, unknown];
        expect(text).toContain(
            'Яндекс: портал gsr.bitrix24.ru за ноябрь 2026 потратил на распознавание 1560.00 ₽ — месячный лимит 1500 ₽ достигнут',
        );
        expect(text).toContain('Маршрут распознавания не менялся');
        expect(meta).toEqual({ telegram: true, domain: DOMAIN });
    });

    it('подняли лимит — у нового значения своя отметка', () => {
        expect(
            yandexBudgetAlertKey('GSR.bitrix24.ru', '2026-11', 1500),
        ).not.toBe(yandexBudgetAlertKey('GSR.bitrix24.ru', '2026-11', 3000));
        expect(yandexBudgetAlertKey('GSR.bitrix24.ru', '2026-11', 1500)).toBe(
            'transcription:yandex-budget-alert:gsr.bitrix24.ru:2026-11:1500',
        );
    });
});

describe('правила лимита Яндекса', () => {
    it('достигнут — расход не меньше лимита; лимит не задан или нулевой — нет', () => {
        expect(yandexBudgetReached(1500, 1500)).toBe(true);
        expect(yandexBudgetReached(1499.99, 1500)).toBe(false);
        expect(yandexBudgetReached(9999, null)).toBe(false);
        expect(yandexBudgetReached(9999, 0)).toBe(false);
        expect(yandexBudgetReached(9999, undefined)).toBe(false);
    });

    it('месяц словами; текст называет портал, расход, лимит и что делать', () => {
        expect(spendMonthLabel('2026-11')).toBe('ноябрь 2026');
        expect(spendMonthLabel('мусор')).toBe('мусор');
        const text = yandexBudgetAlertText({
            domain: DOMAIN,
            month: '2026-01',
            budgetRub: 700,
            totals: { rub: 724.15, yandexCalls: 40, yandexMinutes: 1206.9 },
        });
        expect(text).toContain('за январь 2026');
        expect(text).toContain('724.15 ₽ — месячный лимит 700 ₽ достигнут');
        expect(text).toContain('(40 звонков, 1206.9 мин)');
        expect(text).toContain('«Кто распознаёт звонки»');
    });
});

describe('TranscriptionBudgetAlertScheduler', () => {
    afterEach(() => jest.restoreAllMocks());

    it('проверяет каждый портал; сбой одного не останавливает остальных', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const check = jest.fn((domain: string) =>
            domain === 'broken.bitrix24.ru'
                ? Promise.reject(new Error('нет базы'))
                : Promise.resolve('below'),
        );
        const scheduler = new TranscriptionBudgetAlertScheduler(
            {
                resolve: jest
                    .fn()
                    .mockResolvedValue([
                        { domain: 'broken.bitrix24.ru' },
                        { domain: DOMAIN },
                    ]),
            } as never,
            { check } as never,
        );

        await scheduler.tick(NOW);

        expect(check).toHaveBeenCalledTimes(2);
        expect(check).toHaveBeenCalledWith(DOMAIN, NOW);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('broken.bitrix24.ru не проверен: нет базы'),
        );
    });
});
