import 'reflect-metadata';
import { ForbiddenException, RequestMethod } from '@nestjs/common';
import {
    HTTP_CODE_METADATA,
    METHOD_METADATA,
    PATH_METADATA,
} from '@nestjs/common/constants';
import { AiAnalyticsPlanController } from '../ai-analytics-plan.controller';
import {
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE,
} from '../constants/ai-analytics.const';
import { AI_DAILY_PLAN_ROUTE } from '../constants/ai-plan.const';
import type { RequesterAccess } from '../domain/access/perimeter.util';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import type {
    AiDailyPlanDto,
    AiDailyPlanResponseDto,
} from '../dto/ai-daily-plan.dto';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

/**
 * Контроллер плана дня (план Фазы 2, поток 17): ручка синхронная, поэтому
 * проверяется ровно то, за что отвечает контроллер, — маршрут, код 200,
 * периметр requester'а (включая правило self_view) и передача периметра
 * в сценарий. Числа плана проверяет `daily-plan.use-case.spec.ts`.
 */
const DOMAIN = 'a.bitrix24.ru';
const DAY = '2026-09-08';

const leader: RequesterAccess = { role: 'op', visibleManagerIds: null };
const manager: RequesterAccess = { role: 'manager', visibleManagerIds: ['11'] };

const plan = (): AiDailyPlanDto => ({
    managerId: '11',
    date: DAY,
    target: { sales: 6, source: 'plan', warnings: [] },
    doneSales: 2,
    pipelineExpected: null,
    requiredVolume: 190,
    daysLeft: 17,
    items: [],
    explanation: { steps: [], text: '' },
    reason: null,
});

const response = (): AiDailyPlanResponseDto => ({
    status: 'ready',
    requestKey: `sales-ai-analytics:v1:${DOMAIN}:plan:${DAY}:11`,
    data: plan(),
});

function makeController(options: {
    access: RequesterAccess;
    selfViewEnabled?: boolean;
}) {
    // resolve подменён; resolveViewer — настоящий: правило self_view
    // проверяется по-настоящему, как в спеке контроллера обзора.
    const accessService = new RequesterAccessService(
        {} as never,
        {} as never,
        settingsLoaderWith({
            selfViewEnabled: options.selfViewEnabled ?? false,
        }),
    );
    jest.spyOn(accessService, 'resolve').mockResolvedValue(options.access);
    const execute = jest.fn().mockResolvedValue(response());
    const controller = new AiAnalyticsPlanController(accessService, {
        execute,
    } as never);

    return { controller, execute };
}

const request = {
    domain: DOMAIN,
    requesterUserId: '447',
    managerId: '11',
    date: DAY,
};

describe('AiAnalyticsPlanController', () => {
    it('маршрут POST ai-analytics/plan/daily с кодом 200', () => {
        expect(
            Reflect.getMetadata(PATH_METADATA, AiAnalyticsPlanController),
        ).toBe(AI_ANALYTICS_ROUTE_PREFIX);
        // Дескриптор, а не ссылка на метод: правило unbound-method
        // запрещает отрывать метод от экземпляра даже в тесте.
        const handler = Object.getOwnPropertyDescriptor(
            AiAnalyticsPlanController.prototype,
            'getDailyPlan',
        )?.value as object;
        expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
            AI_DAILY_PLAN_ROUTE,
        );
        expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
            RequestMethod.POST,
        );
        expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    });

    it('руководителю отдаёт конверт сценария и передаёт его периметр', async () => {
        const { controller, execute } = makeController({ access: leader });

        const result = await controller.getDailyPlan(request);

        expect(result).toEqual(response());
        expect(execute).toHaveBeenCalledWith(request, leader);
    });

    it('менеджер при ai_analytics_self_view_enabled = false получает 403', async () => {
        const { controller, execute } = makeController({ access: manager });

        await expect(controller.getDailyPlan(request)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(controller.getDailyPlan(request)).rejects.toThrow(
            AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE,
        );
        expect(execute).not.toHaveBeenCalled();
    });

    it('менеджер при включённой настройке получает план со своим периметром', async () => {
        const { controller, execute } = makeController({
            access: manager,
            selfViewEnabled: true,
        });

        const result = await controller.getDailyPlan(request);

        expect(result.status).toBe('ready');
        expect(execute).toHaveBeenCalledWith(request, manager);
    });
});
