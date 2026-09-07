import { ForbiddenException } from '@nestjs/common';
import { AiAnalyticsController } from '../ai-analytics.controller';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { RequesterAccess } from '../domain/access/perimeter.util';
import { AiAgendaDto } from '../dto/ai-agenda.dto';
import { AiPulseDto } from '../dto/ai-pulse.dto';
import { AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE } from '../constants/ai-analytics.const';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

const metric = { value: 0.6, n: 40, confidence: { level: 'ok' as const } };

const pulse: AiPulseDto = {
    periodDate: '2026-09-04',
    window: { from: '2026-08-31', to: '2026-09-04', workdays: [] },
    nextStepDateRate: metric,
    xmr: null,
    analyzedCalls: 40,
    shortCallsSharePct: 0,
    byManager: [
        { managerId: '10', analyzed: 20, nextStepDateRate: metric },
        { managerId: '20', analyzed: 20, nextStepDateRate: metric },
    ],
    alerts: [
        {
            managerId: '10',
            transcriptionId: 'a',
            kind: 'promise',
            quote: '',
            callStartedAt: '2026-09-01T07:00:00.000Z',
            handled: false,
        },
        {
            managerId: '20',
            transcriptionId: 'b',
            kind: 'urgent',
            quote: '',
            callStartedAt: '2026-09-02T07:00:00.000Z',
            handled: true,
        },
    ],
};

const agenda: AiAgendaDto = {
    weekKey: '2026-W36',
    items: [
        {
            transcriptionId: 'a',
            managerId: '10',
            callType: 'call',
            kind: 'risk',
            reason: 'r',
            quote: 'q',
            charOffset: null,
            link: null,
            score: 50,
        },
        {
            transcriptionId: 'b',
            managerId: '20',
            callType: 'call',
            kind: 'section',
            reason: 'r',
            quote: 'q',
            charOffset: null,
            link: null,
            score: 50,
        },
    ],
    disagreements: [{ managerId: '20', object: 'call:b', reason: null }],
};

function makeController(
    access: RequesterAccess,
    cached: unknown = null,
    selfViewEnabled = false,
) {
    // resolve подменён; resolveViewer — настоящий: правило self_view проверяется.
    const accessService = new RequesterAccessService(
        {} as never,
        {} as never,
        settingsLoaderWith({ selfViewEnabled }),
    );
    jest.spyOn(accessService, 'resolve').mockResolvedValue(access);

    const compute = jest.fn();
    const cache = {
        remember: jest
            .fn()
            .mockImplementation(
                async (
                    _key: string,
                    _ttl: number,
                    fn: () => Promise<unknown>,
                ) =>
                    cached !== null
                        ? { value: cached, fromCache: true }
                        : { value: await fn(), fromCache: false },
            ),
        resetByPattern: jest.fn().mockResolvedValue(4),
    };
    const settingsUseCase = { execute: compute };
    const pulseUseCase = {
        resolveEndDate: jest.fn().mockResolvedValue('2026-09-04'),
        execute: jest.fn().mockResolvedValue(pulse),
    };
    const agendaUseCase = {
        resolveWeek: jest.fn().mockResolvedValue({
            weekKey: '2026-W36',
            timeZone: 'Europe/Moscow',
        }),
        execute: jest.fn().mockResolvedValue(agenda),
    };
    const pushUseCase = { execute: jest.fn() };
    const feedbackUseCase = {
        add: jest.fn().mockResolvedValue({ id: '9001' }),
        list: jest
            .fn()
            .mockResolvedValue({ items: [], disagreementSharePct: null }),
    };
    const controller = new AiAnalyticsController(
        accessService,
        cache as never,
        settingsUseCase as never,
        pulseUseCase as never,
        agendaUseCase as never,
        feedbackUseCase as never,
        pushUseCase as never,
    );
    return {
        controller,
        cache,
        compute,
        pulseUseCase,
        agendaUseCase,
        feedbackUseCase,
        pushUseCase,
    };
}

const base = { domain: 'april.bitrix24.ru', requesterUserId: '447' };
const leader: RequesterAccess = { role: 'op', visibleManagerIds: null };
const manager: RequesterAccess = { role: 'manager', visibleManagerIds: ['20'] };

describe('AiAnalyticsController', () => {
    it('settings/get: ready из кэша, use-case не считается', async () => {
        const settings = { enabled: true };
        const { controller, compute, cache } = makeController(leader, settings);
        const response = await controller.getSettings(base);
        expect(response).toEqual({
            status: 'ready',
            requestKey: 'sales-ai-analytics:v1:april.bitrix24.ru:settings',
            data: settings,
        });
        expect(compute).not.toHaveBeenCalled();
        expect(cache.remember).toHaveBeenCalledWith(
            expect.any(String),
            300,
            expect.any(Function),
        );
    });

    it('pulse: промах → use-case, кэш 1 ч, ключ по endDate; руководитель видит всех', async () => {
        const { controller, cache, pulseUseCase } = makeController(leader);
        const response = await controller.getPulse(base);
        expect(response.status).toBe('ready');
        expect(response.requestKey).toBe(
            'sales-ai-analytics:v1:april.bitrix24.ru:pulse:2026-09-04',
        );
        expect(response.data?.byManager).toHaveLength(2);
        expect(response.data?.alerts).toHaveLength(2);
        expect(pulseUseCase.execute).toHaveBeenCalledWith('april.bitrix24.ru');
        expect(cache.remember).toHaveBeenCalledWith(
            expect.any(String),
            3600,
            expect.any(Function),
        );
    });

    it('pulse/agenda/feedback-list: менеджер без headOf при выключенной self_view → 403; settings/get доступна', async () => {
        const { controller, pulseUseCase, agendaUseCase, feedbackUseCase } =
            makeController(manager, pulse);
        const own = { ...base, requesterUserId: '20' };
        await expect(controller.getPulse(own)).rejects.toThrow(
            AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE,
        );
        await expect(controller.getAgenda(own)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(
            controller.listFeedback({
                ...own,
                from: '2026-09-01',
                to: '2026-09-30',
                managerId: '20',
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(pulseUseCase.execute).not.toHaveBeenCalled();
        expect(agendaUseCase.execute).not.toHaveBeenCalled();
        expect(feedbackUseCase.list).not.toHaveBeenCalled();
        expect((await controller.getSettings(own)).status).toBe('ready');
    });

    it('pulse/agenda: менеджер без headOf при self_view_enabled получает только свои строки', async () => {
        const { controller } = makeController(manager, pulse, true);
        const own = await controller.getPulse({
            ...base,
            requesterUserId: '20',
        });
        expect(own.data?.byManager.map(row => row.managerId)).toEqual(['20']);
        expect(own.data?.alerts.map(alert => alert.transcriptionId)).toEqual([
            'b',
        ]);
        expect(own.data?.nextStepDateRate).toEqual(metric);

        const { controller: agendaController } = makeController(
            manager,
            agenda,
            true,
        );
        const ownAgenda = await agendaController.getAgenda({
            ...base,
            requesterUserId: '20',
        });
        expect(ownAgenda.requestKey).toBe(
            'sales-ai-analytics:v1:april.bitrix24.ru:agenda:2026-W36',
        );
        expect(ownAgenda.data?.items.map(item => item.transcriptionId)).toEqual(
            ['b'],
        );
        expect(ownAgenda.data?.disagreements).toHaveLength(1);
    });

    it('cache/reset менеджеру → 403, руководителю op — сброс по паттерну', async () => {
        const { controller } = makeController(manager);
        await expect(
            controller.resetCache({ ...base, scope: 'pulse' }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        const { controller: opController, cache } = makeController(leader);
        expect(
            await opController.resetCache({ ...base, scope: 'pulse' }),
        ).toEqual({
            deletedCount: 4,
            pattern: 'sales-ai-analytics:v1:april.bitrix24.ru:pulse:*',
        });
        expect(cache.resetByPattern).toHaveBeenCalledWith(
            'sales-ai-analytics:v1:april.bitrix24.ru:pulse:*',
        );
    });

    it('cache/reset: scope overview|attention|kpi-month|plans — паттерн своей секции', async () => {
        const { controller, cache } = makeController(leader);
        for (const scope of [
            'overview',
            'attention',
            'kpi-month',
            'plans',
        ] as const) {
            expect(await controller.resetCache({ ...base, scope })).toEqual({
                deletedCount: 4,
                pattern: `sales-ai-analytics:v1:april.bitrix24.ru:${scope}:*`,
            });
        }
        expect(cache.resetByPattern).toHaveBeenCalledTimes(4);
    });

    it('cache/reset руководителю группы → 403 (нужен cup|op)', async () => {
        const { controller } = makeController({
            role: 'group',
            visibleManagerIds: ['1'],
        });
        await expect(controller.resetCache(base)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });

    it('feedback/list по всем — только руководителю; менеджер с managerId проходит в use-case', async () => {
        const list = { ...base, from: '2026-09-01', to: '2026-09-30' };
        const { controller } = makeController(manager, null, true);
        await expect(controller.listFeedback(list)).rejects.toBeInstanceOf(
            ForbiddenException,
        );

        const { controller: managerController, feedbackUseCase } =
            makeController(manager, null, true);
        const response = await managerController.listFeedback({
            ...list,
            managerId: '20',
        });
        expect(response.status).toBe('ready');
        expect(feedbackUseCase.list).toHaveBeenCalledWith(
            { ...list, managerId: '20' },
            manager,
        );

        const { controller: opController, feedbackUseCase: opFeedback } =
            makeController(leader);
        await opController.listFeedback(list);
        expect(opFeedback.list).toHaveBeenCalledWith(list, leader);
    });

    it("feedback: запись через use-case с access requester'а", async () => {
        const { controller, feedbackUseCase } = makeController(manager);
        const dto = { ...base, kind: 'disagree' as const, object: 'call:1' };
        const response = await controller.addFeedback(dto);
        expect(response).toEqual({
            status: 'ready',
            requestKey: 'april.bitrix24.ru:feedback:disagree:call:1',
            data: { id: '9001' },
        });
        expect(feedbackUseCase.add).toHaveBeenCalledWith(dto, manager);
    });

    it('push digest_all: руководитель запускает «себе» — recipients уходят в use-case', async () => {
        const { controller, pushUseCase } = makeController(leader);
        const result = {
            kind: 'digest_all' as const,
            date: '2026-09-07',
            status: 'sent' as const,
            reason: null,
            delivered: [447],
        };
        pushUseCase.execute.mockResolvedValue(result);
        const response = await controller.push({
            ...base,
            kind: 'digest_all',
            date: '2026-09-07',
            recipients: [447],
        });
        expect(pushUseCase.execute).toHaveBeenCalledWith({
            domain: base.domain,
            kind: 'digest_all',
            date: '2026-09-07',
            recipients: [447],
        });
        expect(response.requestKey).toBe(
            'ai-analytics:push:digest_all:april.bitrix24.ru:2026-09-07',
        );
        expect(response.data).toEqual(result);
    });

    it('push: менеджеру → 403, use-case не вызывается', async () => {
        const { controller, pushUseCase } = makeController(manager);
        await expect(
            controller.push({ ...base, kind: 'agenda' }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(pushUseCase.execute).not.toHaveBeenCalled();
    });

    it('push: руководителю группы — синхронно через AiAnalyticsPushUseCase, requestKey = jobId', async () => {
        const { controller, pushUseCase } = makeController({
            role: 'group',
            visibleManagerIds: ['1'],
        });
        const result = {
            kind: 'digest' as const,
            date: '2026-09-07',
            status: 'sent' as const,
            reason: null,
            delivered: [447],
        };
        pushUseCase.execute.mockResolvedValue(result);
        const response = await controller.push({
            ...base,
            kind: 'digest',
            recipients: [447],
        });
        expect(pushUseCase.execute).toHaveBeenCalledWith({
            domain: base.domain,
            kind: 'digest',
            date: undefined,
            recipients: [447],
        });
        expect(response).toEqual({
            status: 'ready',
            requestKey: 'ai-analytics:push:digest:april.bitrix24.ru:2026-09-07',
            data: result,
        });
    });
});
