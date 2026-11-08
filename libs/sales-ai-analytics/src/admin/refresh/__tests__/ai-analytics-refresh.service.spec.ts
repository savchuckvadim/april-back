import { BadRequestException } from '@nestjs/common';
import type { PortalAppSettingsService } from '@lib/portal-lib/store/app-settings';
import { JobNames, QueueNames, type QueueDispatcherService } from '@lib/queue';
import { AiAnalyticsRefreshService } from '../ai-analytics-refresh.service';
import { newScenario } from '../refresh.plan';
import type { AiRefreshStore } from '../refresh.store';
import type { AiRefreshScenario } from '../refresh.types';

const NOW = new Date('2026-11-08T15:00:00.000Z');

const make = (stored: Record<string, AiRefreshScenario | null> = {}) => {
    const written: AiRefreshScenario[] = [];
    const store = {
        read: jest.fn((domain: string) =>
            Promise.resolve(stored[domain] ?? null),
        ),
        write: jest.fn((scenario: AiRefreshScenario) => {
            written.push(scenario);
            return Promise.resolve();
        }),
    };
    const dispatch = jest.fn().mockResolvedValue({ id: 'job' });
    const appSettings = {
        listByAppCode: jest
            .fn()
            .mockResolvedValue([
                { domain: 'gsr.bitrix24.ru' },
                { domain: 'garant.bitrix24.ru' },
                { domain: 'gsr.bitrix24.ru' },
            ]),
        resolve: jest.fn((domain: string) =>
            Promise.resolve({
                aiAnalyticsEnabled: domain === 'gsr.bitrix24.ru',
            }),
        ),
    };
    const service = new AiAnalyticsRefreshService(
        store as unknown as AiRefreshStore,
        { dispatch } as unknown as QueueDispatcherService,
        appSettings as unknown as PortalAppSettingsService,
    );
    return { service, dispatch, written };
};

const running = (updatedAt: Date): AiRefreshScenario => ({
    ...newScenario(
        {
            id: 'old',
            domain: 'gsr.bitrix24.ru',
            monthKey: '2026-10',
            withReanalysis: true,
            requestedBy: null,
        },
        updatedAt,
    ),
});

describe('AiAnalyticsRefreshService — запуск «обновить всё»', () => {
    it('по умолчанию — последний закрытый месяц; сценарий в Redis, первый тик в своей очереди сразу', async () => {
        const { service, dispatch, written } = make();
        const result = await service.start(
            { domain: 'gsr.bitrix24.ru', withReanalysis: true },
            NOW,
        );
        expect(result.started).toBe(true);
        expect(result.scenario.monthKey).toBe('2026-10');
        expect(written).toHaveLength(1);
        expect(dispatch).toHaveBeenCalledWith(
            QueueNames.AI_ANALYTICS_ADMIN,
            JobNames.SALES_AI_ANALYTICS_REFRESH_TICK,
            {
                domain: 'gsr.bitrix24.ru',
                scenarioId: result.scenario.id,
                seq: 0,
            },
            `ai-refresh:gsr.bitrix24.ru:${result.scenario.id}:0`,
            expect.objectContaining({ delay: 0, attempts: 1 }),
        );
    });

    it('идущий сценарий не дублируется; брошенный (тиков нет 15+ минут) — можно заново', async () => {
        const fresh = make({ 'gsr.bitrix24.ru': running(NOW) });
        const again = await fresh.service.start(
            { domain: 'gsr.bitrix24.ru', withReanalysis: false },
            NOW,
        );
        expect(again).toMatchObject({
            started: false,
            scenario: { id: 'old' },
        });
        expect(fresh.dispatch).not.toHaveBeenCalled();

        const stale = make({
            'gsr.bitrix24.ru': running(new Date(NOW.getTime() - 3_600_000)),
        });
        expect(
            (
                await stale.service.start(
                    { domain: 'gsr.bitrix24.ru', withReanalysis: false },
                    NOW,
                )
            ).started,
        ).toBe(true);
    });

    it('открытый или кривой месяц — 400', async () => {
        const { service } = make();
        await expect(
            service.start(
                {
                    domain: 'gsr.bitrix24.ru',
                    monthKey: '2026-11',
                    withReanalysis: false,
                },
                NOW,
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.start(
                {
                    domain: 'gsr.bitrix24.ru',
                    monthKey: '2026-13',
                    withReanalysis: false,
                },
                NOW,
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('все порталы — только с включённой AI-аналитикой, без дублей', async () => {
        const { service } = make();
        const results = await service.startAll({ withReanalysis: true }, NOW);
        expect(results.map(item => item.scenario.domain)).toEqual([
            'gsr.bitrix24.ru',
        ]);
        expect((await service.portals()).map(item => item.domain)).toEqual([
            'gsr.bitrix24.ru',
        ]);
    });
});
