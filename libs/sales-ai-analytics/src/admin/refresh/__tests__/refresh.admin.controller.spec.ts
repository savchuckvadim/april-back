import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import {
    AI_REFRESH_ROUTES,
    AiAnalyticsRefreshAdminController,
} from '../../controllers/refresh.admin.controller';
import type { AiAnalyticsRefreshService } from '../ai-analytics-refresh.service';

const handlerOf = (method: string): object =>
    Object.getOwnPropertyDescriptor(
        AiAnalyticsRefreshAdminController.prototype,
        method,
    )?.value as object;

describe('AiAnalyticsRefreshAdminController', () => {
    it('роуты: POST refresh, GET refresh, GET refresh/portals, POST refresh/all', () => {
        const routes: [string, string, RequestMethod][] = [
            ['start', AI_REFRESH_ROUTES.start, RequestMethod.POST],
            ['state', AI_REFRESH_ROUTES.state, RequestMethod.GET],
            ['portals', AI_REFRESH_ROUTES.portals, RequestMethod.GET],
            ['startAll', AI_REFRESH_ROUTES.startAll, RequestMethod.POST],
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

    it('месяц не задан — сервис берёт последний закрытый; ответы завёрнуты в объект', async () => {
        const service = {
            start: jest.fn().mockResolvedValue({ started: true }),
            state: jest.fn().mockResolvedValue(null),
            portals: jest.fn().mockResolvedValue([]),
            startAll: jest.fn().mockResolvedValue([]),
        };
        const controller = new AiAnalyticsRefreshAdminController(
            service as unknown as AiAnalyticsRefreshService,
        );
        await controller.start({
            domain: 'gsr.bitrix24.ru',
            withReanalysis: true,
        });
        expect(service.start).toHaveBeenCalledWith({
            domain: 'gsr.bitrix24.ru',
            withReanalysis: true,
        });
        expect(await controller.state({ domain: 'gsr.bitrix24.ru' })).toEqual({
            domain: 'gsr.bitrix24.ru',
            scenario: null,
        });
        expect(await controller.portals()).toEqual({ portals: [] });
        await controller.startAll({
            monthKey: '2026-10',
            withReanalysis: false,
        });
        expect(service.startAll).toHaveBeenCalledWith({
            monthKey: '2026-10',
            withReanalysis: false,
        });
    });
});
