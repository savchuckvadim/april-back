import 'reflect-metadata';
import {
    GUARDS_METADATA,
    HTTP_CODE_METADATA,
    METHOD_METADATA,
    PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { PortalSessionGuard } from '@lib/auth';
import type { PortalViewSaveRequestDto } from '../dto/portal-view-request.dto';
import type { PortalViewResponseDto } from '../dto/portal-view.dto';
import { PortalViewController } from '../portal-view.controller';
import type { PortalViewUseCase } from '../portal-view.use-case';
import { DEFAULT_VIEW } from './portal-view.fixtures';

const response: PortalViewResponseDto = {
    view: DEFAULT_VIEW,
    canEdit: true,
    supportUrl: null,
    options: { tabs: [], badges: [], methodology: null, indicators: [] },
};

function build() {
    const useCase = {
        get: jest.fn().mockResolvedValue(response),
        save: jest.fn().mockResolvedValue(response),
    };
    const controller = new PortalViewController(
        useCase as unknown as PortalViewUseCase,
    );
    return { controller, useCase };
}

/**
 * Метод контроллера как объект для чтения метаданных. Дескриптор, а не
 * ссылка на метод: правило unbound-method запрещает отрывать метод от
 * экземпляра даже в тесте.
 */
const handlerOf = (name: 'getView' | 'saveView'): object =>
    Object.getOwnPropertyDescriptor(PortalViewController.prototype, name)
        ?.value as object;

describe('PortalViewController', () => {
    it('get и save передают запрос в use-case и возвращают его ответ', async () => {
        const { controller, useCase } = build();
        const getRequest = {
            domain: 'gsr.bitrix24.ru',
            requesterUserId: '447',
        };
        const saveRequest: PortalViewSaveRequestDto = {
            ...getRequest,
            chartsEnabled: false,
        };

        expect(await controller.getView(getRequest)).toBe(response);
        expect(await controller.saveView(saveRequest)).toBe(response);
        expect(useCase.get).toHaveBeenCalledWith(getRequest);
        expect(useCase.save).toHaveBeenCalledWith(saveRequest);
    });

    it('маршруты: POST kpi-report/portal-view/get и /save, код ответа 200', () => {
        expect(Reflect.getMetadata(PATH_METADATA, PortalViewController)).toBe(
            'kpi-report/portal-view',
        );
        for (const [name, path] of [
            ['getView', 'get'],
            ['saveView', 'save'],
        ] as const) {
            const handler = handlerOf(name);
            expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
            expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
                RequestMethod.POST,
            );
            expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
        }
    });

    it('обе ручки под сессией портала', () => {
        for (const name of ['getView', 'saveView'] as const) {
            const handler = handlerOf(name);
            const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) ??
                []) as unknown[];
            expect(guards).toContain(PortalSessionGuard);
        }
    });
});
