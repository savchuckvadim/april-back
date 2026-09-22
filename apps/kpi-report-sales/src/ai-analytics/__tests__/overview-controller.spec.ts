import { ForbiddenException } from '@nestjs/common';
import { AiAnalyticsOverviewController } from '../ai-analytics-overview.controller';
import { buildOverviewKey } from '../cache/cache-key.util';
import { RequesterAccess } from '../domain/access/perimeter.util';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { AttentionUseCase } from '../domain/use-cases/attention.use-case';
import { ByTypeUseCase } from '../domain/use-cases/by-type.use-case';
import { OverviewLookupUseCase } from '../domain/use-cases/overview-lookup.use-case';
import { AiOverviewCacheEntry } from '../dto/ai-overview.dto';
import {
    OVERVIEW_DOMAIN,
    OVERVIEW_FROM,
    OVERVIEW_TO,
    overviewFixture,
    twoManagersRows,
} from './fixtures/overview.fixture';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';
import { AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE } from '../constants/ai-analytics.const';
import type { SmartLinkLoader } from '../domain/loaders/smart-link.loader';

/** Ссылки на разборы карточек «Внимания» здесь не проверяются — пустая карта. */
function smartLinksStub(): SmartLinkLoader {
    return {
        resolveLinks: jest
            .fn()
            .mockResolvedValue(new Map<string, string | null>()),
    } as unknown as SmartLinkLoader;
}

const KEY = buildOverviewKey(
    OVERVIEW_DOMAIN,
    OVERVIEW_FROM,
    OVERVIEW_TO,
    '10_20',
    false,
);
const base = {
    domain: OVERVIEW_DOMAIN,
    requesterUserId: '447',
    from: OVERVIEW_FROM,
    to: OVERVIEW_TO,
};
const leader: RequesterAccess = { role: 'op', visibleManagerIds: null };
const manager: RequesterAccess = { role: 'manager', visibleManagerIds: ['20'] };

interface Harness {
    access: RequesterAccess;
    cached?: AiOverviewCacheEntry;
    jobState?: string;
    /** ai_analytics_self_view_enabled портала (по умолчанию выключена). */
    selfViewEnabled?: boolean;
}

function makeController({
    access,
    cached,
    jobState,
    selfViewEnabled = false,
}: Harness) {
    // resolve подменён; resolveViewer — настоящий: правило self_view проверяется.
    const accessService = new RequesterAccessService(
        {} as never,
        {} as never,
        settingsLoaderWith({ selfViewEnabled }),
    );
    jest.spyOn(accessService, 'resolve').mockResolvedValue(access);

    const cache = {
        getJson: jest.fn().mockResolvedValue(cached ?? null),
    };
    const queue = {
        dispatch: jest.fn().mockResolvedValue({ id: KEY }),
        getJob: jest
            .fn()
            .mockResolvedValue(
                jobState
                    ? { getState: jest.fn().mockResolvedValue(jobState) }
                    : null,
            ),
    };
    const managers = { resolve: jest.fn().mockResolvedValue([10, 20]) };
    const lookup = new OverviewLookupUseCase(
        managers as never,
        cache as never,
        queue as never,
    );
    const settingsSave = { execute: jest.fn() };
    const controller = new AiAnalyticsOverviewController(
        accessService,
        lookup,
        new AttentionUseCase(lookup, smartLinksStub()),
        new ByTypeUseCase(lookup),
        settingsSave as never,
    );
    return { controller, cache, queue, managers, settingsSave };
}

const ready = (): AiOverviewCacheEntry => ({
    status: 'ready',
    data: overviewFixture(twoManagersRows(), [10, 20]),
});

describe('AiAnalyticsOverviewController', () => {
    it('overview: hit → ready, ключ = период + ростер + confirmedOnly, джоба не ставится', async () => {
        const { controller, queue, cache } = makeController({
            access: leader,
            cached: ready(),
        });
        const response = await controller.getOverview(base);
        expect(response.status).toBe('ready');
        expect(response.requestKey).toBe(KEY);
        expect(response.data?.managers.map(row => row.managerId)).toEqual([
            '10',
            '20',
        ]);
        expect(response.data?.meta.fromCache).toBe(true);
        expect(cache.getJson).toHaveBeenCalledWith(KEY);
        expect(queue.dispatch).not.toHaveBeenCalled();
    });

    it('overview: miss → queued, jobId = ключ, опции priority 1 / attempts 1 / timeout 120 с', async () => {
        const { controller, queue } = makeController({ access: leader });
        const response = await controller.getOverview({
            ...base,
            socketId: 'sock',
        });
        expect(response).toEqual({
            status: 'queued',
            requestKey: KEY,
            jobId: KEY,
        });
        expect(queue.dispatch).toHaveBeenCalledWith(
            'sales-kpi-report',
            'sales-ai-analytics-overview',
            {
                domain: OVERVIEW_DOMAIN,
                from: OVERVIEW_FROM,
                to: OVERVIEW_TO,
                managerIds: [10, 20],
                confirmedOnly: false,
                forceRefresh: false,
                requestKey: KEY,
                socketId: 'sock',
                requesterUserId: '447',
            },
            KEY,
            expect.objectContaining({
                priority: 1,
                attempts: 1,
                timeout: 120_000,
            }),
        );
    });

    it('overview: повтор при идущей джобе → processing без второго dispatch', async () => {
        const { controller, queue } = makeController({
            access: leader,
            jobState: 'active',
        });
        const response = await controller.getOverview(base);
        expect(response).toEqual({
            status: 'processing',
            requestKey: KEY,
            jobId: KEY,
        });
        expect(queue.getJob).toHaveBeenCalledWith('sales-kpi-report', KEY);
        expect(queue.dispatch).not.toHaveBeenCalled();
    });

    it('overview: forceRefresh не читает кэш и ставит джобу с forceRefresh', async () => {
        const { controller, queue, cache } = makeController({
            access: leader,
            cached: ready(),
        });
        const response = await controller.getOverview({
            ...base,
            forceRefresh: true,
        });
        expect(response.status).toBe('queued');
        expect(cache.getJson).not.toHaveBeenCalled();
        expect(queue.dispatch).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            expect.objectContaining({ forceRefresh: true }),
            KEY,
            expect.any(Object),
        );
    });

    it('overview: error-конверт из кэша отдаётся как error', async () => {
        const { controller, queue } = makeController({
            access: leader,
            cached: { status: 'error', message: 'Портал не найден' },
        });
        expect(await controller.getOverview(base)).toEqual({
            status: 'error',
            requestKey: KEY,
            message: 'Портал не найден',
        });
        expect(queue.dispatch).not.toHaveBeenCalled();
    });

    it('overview: менеджер без headOf видит только свои строки; managerIds нормализуются в ключ', async () => {
        const { controller, managers } = makeController({
            access: manager,
            selfViewEnabled: true,
            cached: ready(),
        });
        const response = await controller.getOverview({
            ...base,
            requesterUserId: '20',
            managerIds: [20, 10],
        });
        expect(managers.resolve).toHaveBeenCalledWith(
            OVERVIEW_DOMAIN,
            [20, 10],
        );
        expect(response.requestKey).toBe(KEY);
        expect(response.data?.managers.map(row => row.managerId)).toEqual([
            '20',
        ]);
        expect(
            response.data?.objections.byManager.every(
                row => row.managerId === '20',
            ),
        ).toBe(true);
        expect(
            response.data?.departmentTotals.flatMap(group => group.managerIds),
        ).toEqual(['20']);
        // Итоги по домену остаются: сравнение с командой — не персональные данные.
        expect(response.data?.totals.length).toBeGreaterThan(0);
    });

    it('attention: ready → карточки только периметра; miss → конверт обзора', async () => {
        const { controller } = makeController({
            access: manager,
            selfViewEnabled: true,
            cached: ready(),
        });
        const own = await controller.getAttention({
            ...base,
            requesterUserId: '20',
        });
        expect(own.status).toBe('ready');
        expect(own.data?.managersConsidered).toBe(1);
        expect(own.data?.items.every(item => item.managerId === '20')).toBe(
            true,
        );

        const { controller: cold, queue } = makeController({ access: leader });
        expect(await controller.getAttention(base)).toBeDefined();
        expect(await cold.getAttention(base)).toEqual({
            status: 'queued',
            requestKey: KEY,
            jobId: KEY,
        });
        expect(queue.dispatch).toHaveBeenCalledTimes(1);
    });

    it('by-type: ready → срез в периметре, тот же requestKey', async () => {
        const { controller } = makeController({
            access: manager,
            selfViewEnabled: true,
            cached: ready(),
        });
        const response = await controller.getByType({
            ...base,
            requesterUserId: '20',
            callType: 'presentation',
            layout: 'long',
        });
        expect(response.status).toBe('ready');
        expect(response.requestKey).toBe(KEY);
        expect(response.data?.layout).toBe('long');
        expect(response.data?.long?.every(row => row.managerId === '20')).toBe(
            true,
        );
    });

    it('overview/attention/by-type: менеджер без headOf при выключенной self_view → 403, кэш не читается', async () => {
        const { controller, cache } = makeController({
            access: manager,
            cached: ready(),
        });
        const own = { ...base, requesterUserId: '20' };
        await expect(controller.getOverview(own)).rejects.toThrow(
            AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE,
        );
        await expect(controller.getAttention(own)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(
            controller.getByType({ ...own, callType: 'presentation' }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(cache.getJson).not.toHaveBeenCalled();
    });

    it('settings/save: менеджеру и руководителю группы → 403, cup|op — через use-case', async () => {
        const dto = { ...base, levels: [] };
        const { controller, settingsSave } = makeController({
            access: manager,
        });
        await expect(controller.saveSettings(dto)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect(settingsSave.execute).not.toHaveBeenCalled();

        const { controller: groupLead } = makeController({
            access: { role: 'group', visibleManagerIds: ['1'] },
        });
        await expect(groupLead.saveSettings(dto)).rejects.toBeInstanceOf(
            ForbiddenException,
        );

        const { controller: op, settingsSave: opSave } = makeController({
            access: leader,
        });
        const result = {
            id: '77',
            levels: [],
            savedAt: '2026-09-07T09:00:00.000Z',
            resetCount: 2,
        };
        opSave.execute.mockResolvedValue(result);
        expect(await op.saveSettings(dto)).toEqual({
            status: 'ready',
            requestKey: `${OVERVIEW_DOMAIN}:settings-save:77`,
            data: result,
        });
        expect(opSave.execute).toHaveBeenCalledWith(dto, leader);
    });
});
