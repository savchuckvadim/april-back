import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE } from '../constants/ai-analytics.const';
import { AI_PLAN_FACT_ROUTE } from '../constants/ai-plan-fact.const';
import type { RequesterAccess } from '../domain/access/perimeter.util';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { AiAnalyticsPlanFactController } from '../plan-fact/ai-analytics-plan-fact.controller';
import { AiAnalyticsPlanFactModule } from '../plan-fact/ai-analytics-plan-fact.module';
import { PlanFactUseCase } from '../plan-fact/plan-fact.use-case';
import type { AiPlanFactRequestDto } from '../dto/ai-plan-fact.dto';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

/**
 * Контроллер реконсиляции план-факт (Фаза 3, П2): периметр читающих
 * ручек (`resolveViewer`) и отсутствие собственной логики — контроллер
 * только разрешает доступ и передаёт запрос сценарию.
 */
const DOMAIN = 'a.bitrix24.ru';
const leader: RequesterAccess = { role: 'op', visibleManagerIds: ['11'] };
const manager: RequesterAccess = {
    role: 'manager',
    visibleManagerIds: ['11'],
};

const request = (): AiPlanFactRequestDto =>
    ({
        domain: DOMAIN,
        requesterUserId: '447',
        monthKey: '2026-09',
    }) as AiPlanFactRequestDto;

function makeController(access: RequesterAccess, selfViewEnabled = false) {
    // resolve подменён; resolveViewer — настоящий: правило self_view живое.
    const accessService = new RequesterAccessService(
        {} as never,
        {} as never,
        settingsLoaderWith({ selfViewEnabled }),
    );
    jest.spyOn(accessService, 'resolve').mockResolvedValue(access);
    const execute = jest.fn().mockResolvedValue({
        status: 'ready',
        requestKey: 'key',
        data: { period: {}, rows: [], team: [], reasons: [], reasonTexts: [] },
    });
    const controller = new AiAnalyticsPlanFactController(accessService, {
        execute,
    } as never);

    return { controller, execute };
}

describe('AiAnalyticsPlanFactController: POST /ai-analytics/plan-fact', () => {
    it('руководителю отдаётся конверт сценария с его периметром', async () => {
        const { controller, execute } = makeController(leader);
        const result = await controller.getPlanFact(request());
        expect(result.status).toBe('ready');
        expect(execute).toHaveBeenCalledWith(request(), leader);
    });

    it('менеджеру при ai_analytics_self_view_enabled = false — 403', async () => {
        const { controller, execute } = makeController(manager, false);
        await expect(controller.getPlanFact(request())).rejects.toThrow(
            new ForbiddenException(AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE),
        );
        expect(execute).not.toHaveBeenCalled();
    });

    it('менеджеру при включённом self_view ручка доступна по своему периметру', async () => {
        const { controller, execute } = makeController(manager, true);
        await expect(controller.getPlanFact(request())).resolves.toMatchObject({
            status: 'ready',
        });
        expect(execute).toHaveBeenCalledWith(request(), manager);
    });
});

describe('Срез plan-fact: модуль и роут', () => {
    it('роут ручки — plan-fact внутри префикса ai-analytics', () => {
        expect(AI_PLAN_FACT_ROUTE).toBe('plan-fact');
        expect(Reflect.getMetadata('path', AiAnalyticsPlanFactController)).toBe(
            'ai-analytics',
        );
    });

    it('модуль объявляет ровно один контроллер и один провайдер', () => {
        expect(
            Reflect.getMetadata('controllers', AiAnalyticsPlanFactModule),
        ).toEqual([AiAnalyticsPlanFactController]);
        expect(
            Reflect.getMetadata('providers', AiAnalyticsPlanFactModule),
        ).toEqual([PlanFactUseCase]);
    });

    it('срез не тянет PBXModule: провайдеры — только из ядра без Битрикса', () => {
        const imports = (
            Reflect.getMetadata('imports', AiAnalyticsPlanFactModule) as Array<{
                name?: string;
            }>
        ).map(item => item.name);
        expect(imports).toEqual(['AiAnalyticsCoreModule']);
    });
});
