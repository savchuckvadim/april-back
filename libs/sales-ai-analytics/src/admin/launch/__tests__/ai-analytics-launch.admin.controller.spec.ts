import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import {
    GUARDS_METADATA,
    METHOD_METADATA,
    PATH_METADATA,
} from '@nestjs/common/constants';
import { JwtAuthGuard, Role, RolesGuard } from '@lib/auth';
import { ROLES_KEY } from '@lib/auth/config/auth.constants';
import { AI_ANALYTICS_ADMIN_PATH } from '../../controllers/admin-controller.const';
import { AiAnalyticsLaunchAdminController } from '../ai-analytics-launch.admin.controller';
import { AI_ANALYTICS_LAUNCH_ROUTES } from '../launch.const';
import { DOMAIN } from './launch-status.fixture';

/** Контроллер панели запуска: пути, гарды, передача только заданных полей. */
describe('AiAnalyticsLaunchAdminController', () => {
    const handlerOf = (method: string): object =>
        Object.getOwnPropertyDescriptor(
            AiAnalyticsLaunchAdminController.prototype,
            method,
        )?.value as object;

    it('под admin/ai-analytics, гарды JWT + роли, только SUPER_USER', () => {
        expect(
            Reflect.getMetadata(
                PATH_METADATA,
                AiAnalyticsLaunchAdminController,
            ),
        ).toBe(AI_ANALYTICS_ADMIN_PATH);
        expect(
            Reflect.getMetadata(
                GUARDS_METADATA,
                AiAnalyticsLaunchAdminController,
            ),
        ).toEqual([JwtAuthGuard, RolesGuard]);
        expect(
            Reflect.getMetadata(ROLES_KEY, AiAnalyticsLaunchAdminController),
        ).toEqual([Role.SUPER_USER]);
    });

    it('роуты: POST cache/reset, POST stage-flags, GET launch-status', () => {
        const routes: [string, string, number][] = [
            [
                'resetCache',
                AI_ANALYTICS_LAUNCH_ROUTES.cacheReset,
                RequestMethod.POST,
            ],
            [
                'setStageFlags',
                AI_ANALYTICS_LAUNCH_ROUTES.stageFlags,
                RequestMethod.POST,
            ],
            ['status', AI_ANALYTICS_LAUNCH_ROUTES.status, RequestMethod.GET],
        ];
        for (const [method, path, verb] of routes) {
            expect(Reflect.getMetadata(PATH_METADATA, handlerOf(method))).toBe(
                path,
            );
            expect(
                Reflect.getMetadata(METHOD_METADATA, handlerOf(method)),
            ).toBe(verb);
        }
    });

    it('передаёт в сервисы домен, scope по умолчанию all и только заданные флаги', async () => {
        const cache = { reset: jest.fn().mockResolvedValue({}) };
        const stageFlags = { apply: jest.fn().mockResolvedValue({}) };
        const launchStatus = { status: jest.fn().mockResolvedValue({}) };
        const controller = new AiAnalyticsLaunchAdminController(
            cache as never,
            stageFlags as never,
            launchStatus as never,
        );

        await controller.resetCache({ domain: DOMAIN });
        expect(cache.reset).toHaveBeenCalledWith(DOMAIN, 'all');
        await controller.resetCache({ domain: DOMAIN, scope: 'agenda' });
        expect(cache.reset).toHaveBeenLastCalledWith(DOMAIN, 'agenda');

        await controller.setStageFlags({ domain: DOMAIN, forecast: true });
        expect(stageFlags.apply).toHaveBeenCalledWith({
            domain: DOMAIN,
            forecast: true,
        });

        await controller.status({ domain: DOMAIN });
        expect(launchStatus.status).toHaveBeenCalledWith(DOMAIN);
    });
});
