import 'reflect-metadata';
import { ForbiddenException, RequestMethod } from '@nestjs/common';
import {
    HTTP_CODE_METADATA,
    METHOD_METADATA,
    PATH_METADATA,
} from '@nestjs/common/constants';
import {
    AI_ROP_MARK_ROUTES,
    AiAnalyticsRopMarkController,
    buildRopMarkKey,
} from '../ai-analytics-rop-mark.controller';
import {
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE,
} from '../constants/ai-analytics.const';
import { AI_ROP_MARK_BLIND_NOTE } from '../constants/ai-rop-mark.const';
import type { RequesterAccess } from '../domain/access/perimeter.util';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { RopMarkUseCase } from '../domain/use-cases/rop-mark.use-case';
import type {
    AiRopMarkSaveResultDto,
    AiRopMarkWeekDto,
} from '../dto/ai-rop-mark.dto';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

/**
 * Контроллер слепой проверки (поток 19): ручки синхронные, поэтому
 * проверяется ровно то, за что отвечает контроллер, — маршруты, код 200,
 * периметр requester'а (правило self_view и «только руководителям») и
 * передача периметра в сценарий вместе с конвертом ответа. Подбор и метки
 * проверяет `rop-mark.use-case.spec.ts`.
 */
const DOMAIN = 'a.bitrix24.ru';
const WEEK = '2026-W36';

const leader: RequesterAccess = { role: 'op', visibleManagerIds: null };
const manager: RequesterAccess = { role: 'manager', visibleManagerIds: ['11'] };

const week = (): AiRopMarkWeekDto => ({
    weekKey: WEEK,
    from: '2026-08-31',
    to: '2026-09-06',
    calls: [],
    generatedAt: '2026-09-07T00:15:00.000Z',
    blindNote: AI_ROP_MARK_BLIND_NOTE,
});

const saved = (): AiRopMarkSaveResultDto => ({
    id: '9001',
    replaced: false,
    blind: true,
});

const base = { domain: DOMAIN, requesterUserId: '447', weekKey: WEEK };
const saveRequest = {
    ...base,
    transcriptionId: '103',
    agree: false,
    ropScore: 6,
};

/** Сервис доступа: resolve подменён, resolveViewer — настоящий. */
function accessServiceWith(access: RequesterAccess, selfViewEnabled = false) {
    const service = new RequesterAccessService(
        {} as never,
        {} as never,
        settingsLoaderWith({ selfViewEnabled }),
    );
    jest.spyOn(service, 'resolve').mockResolvedValue(access);
    return service;
}

function makeController(options: {
    access: RequesterAccess;
    selfViewEnabled?: boolean;
}) {
    const useCase = {
        pick: jest.fn().mockResolvedValue(week()),
        list: jest.fn().mockResolvedValue(week()),
        save: jest.fn().mockResolvedValue(saved()),
    };
    const controller = new AiAnalyticsRopMarkController(
        accessServiceWith(options.access, options.selfViewEnabled),
        useCase as never,
    );

    return { controller, useCase };
}

type Route = keyof typeof AI_ROP_MARK_ROUTES;

const ROUTES: Route[] = ['pick', 'list', 'save'];

function call(controller: AiAnalyticsRopMarkController, route: Route) {
    return route === 'save'
        ? controller.save(saveRequest)
        : controller[route](base);
}

describe('AiAnalyticsRopMarkController: маршруты', () => {
    it('контроллер живёт под общим префиксом ai-analytics', () => {
        expect(
            Reflect.getMetadata(PATH_METADATA, AiAnalyticsRopMarkController),
        ).toBe(AI_ANALYTICS_ROUTE_PREFIX);
    });

    it.each(ROUTES)('POST ai-analytics/%s с кодом 200', route => {
        // Дескриптор, а не ссылка на метод: правило unbound-method
        // запрещает отрывать метод от экземпляра даже в тесте.
        const handler = Object.getOwnPropertyDescriptor(
            AiAnalyticsRopMarkController.prototype,
            route,
        )?.value as object;
        expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
            AI_ROP_MARK_ROUTES[route],
        );
        expect(AI_ROP_MARK_ROUTES[route]).toBe(`rop-mark/${route}`);
        expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
            RequestMethod.POST,
        );
        expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    });
});

describe('AiAnalyticsRopMarkController: руководитель', () => {
    it('pick: сценарий получает запрос и периметр, ответ — конверт ready с ключом недели', async () => {
        const { controller, useCase } = makeController({ access: leader });

        const result = await controller.pick({ ...base, forceRefresh: true });

        expect(useCase.pick).toHaveBeenCalledWith(
            { ...base, forceRefresh: true },
            leader,
        );
        expect(result).toEqual({
            status: 'ready',
            requestKey: buildRopMarkKey(DOMAIN, WEEK),
            data: week(),
        });
        expect(result.requestKey).toBe(
            `sales-ai-analytics:v1:${DOMAIN}:rop-mark:${WEEK}`,
        );
    });

    it('list: сценарий получает запрос и периметр, ключ — неделя из ответа', async () => {
        const { controller, useCase } = makeController({ access: leader });

        const result = await controller.list(base);

        expect(useCase.list).toHaveBeenCalledWith(base, leader);
        expect(result.status).toBe('ready');
        expect(result.requestKey).toBe(buildRopMarkKey(DOMAIN, WEEK));
        expect(result.data).toEqual(week());
    });

    it('save: сценарий получает метку и периметр, ключ — звонок метки', async () => {
        const { controller, useCase } = makeController({ access: leader });

        const result = await controller.save(saveRequest);

        expect(useCase.save).toHaveBeenCalledWith(saveRequest, leader);
        expect(result).toEqual({
            status: 'ready',
            requestKey: buildRopMarkKey(DOMAIN, '103'),
            data: saved(),
        });
    });
});

describe('AiAnalyticsRopMarkController: менеджеру 403', () => {
    it.each(ROUTES)(
        '%s: при выключенной ai_analytics_self_view_enabled — 403 ещё до сценария',
        async route => {
            const { controller, useCase } = makeController({ access: manager });

            await expect(call(controller, route)).rejects.toBeInstanceOf(
                ForbiddenException,
            );
            await expect(call(controller, route)).rejects.toThrow(
                AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE,
            );
            expect(useCase[route]).not.toHaveBeenCalled();
        },
    );

    it.each(ROUTES)(
        '%s: при включённой настройке менеджер всё равно получает 403 — метка не для менеджеров',
        async route => {
            // Настоящий сценарий: правило «только руководителям» живёт в
            // нём (assertLeader), стор при этом не трогается.
            const store = { loadPick: jest.fn(), listMarks: jest.fn() };
            const access = accessServiceWith(manager, true);
            const controller = new AiAnalyticsRopMarkController(
                access,
                new RopMarkUseCase(
                    store as never,
                    access,
                    settingsLoaderWith(),
                    {} as never,
                ),
            );

            await expect(call(controller, route)).rejects.toBeInstanceOf(
                ForbiddenException,
            );
            await expect(call(controller, route)).rejects.toThrow(
                /руководител/,
            );
            expect(store.loadPick).not.toHaveBeenCalled();
        },
    );
});
