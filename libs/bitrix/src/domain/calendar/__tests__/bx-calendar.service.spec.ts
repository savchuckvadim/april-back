import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BitrixApiFactoryService } from '../../../core/queue/bitrix-api.factory.service';
import { BitrixServiceFactory } from '../../../bitrix-service.factory';
import { ServiceClonerFactory } from '../../service-clone.factory';
import { BxCalendarRepository } from '../repository/bx-calendar.repository';
import { BxCalendarService } from '../services/bx-calendar.service';
import { IBXCalendarSettings } from '../interface/bx-calendar.interface';
import {
    BX_CALENDAR_WEEK_DAY_INDEX,
    isBxCalendarUnavailable,
} from '../consts/bx-calendar.const';

/**
 * Домен календаря портала: строка метода собирается ядром из
 * 'calendar' + 'settings' + 'get' (calendar.settings.get, параметров нет —
 * см. официальную документацию метода).
 */
const SETTINGS: IBXCalendarSettings = {
    work_time_start: '9',
    work_time_end: '19',
    year_holidays: '1.1,7.1,23.2,8.3,1.5,9.5,12.6,4.11',
    week_holidays: ['SA', 'SU'],
    week_start: 'MO',
};

function okResponse(result: unknown) {
    return { result, next: 0, total: 1 };
}

/** Ошибка REST в том виде, в каком её бросает ядро (axios). */
function restError(code: string, description: string, status = 403) {
    return Object.assign(new Error(`Request failed with status ${status}`), {
        response: {
            status,
            data: { error: code, error_description: description },
        },
    });
}

function makeApi() {
    const callType = jest.fn();
    const api = { callType } as unknown as BitrixBaseApi;
    return { api, callType };
}

describe('BxCalendarRepository / BxCalendarService', () => {
    let callType: jest.Mock;
    let api: BitrixBaseApi;
    let service: BxCalendarService;

    beforeEach(() => {
        ({ api, callType } = makeApi());
        service = new BxCalendarService().clone(api);
    });

    it('settingsGet: зовёт calendar.settings.get без параметров и отдаёт типизированный ответ', async () => {
        callType.mockResolvedValueOnce(okResponse(SETTINGS));

        const response = await service.settingsGet();

        expect(callType).toHaveBeenCalledTimes(1);
        expect(callType).toHaveBeenCalledWith(
            'calendar',
            'settings',
            'get',
            {},
        );
        expect(response.result.week_holidays).toEqual(['SA', 'SU']);
        expect(response.result.year_holidays).toBe(SETTINGS.year_holidays);
        expect(response.result.work_time_start).toBe('9');
        expect(response.result.work_time_end).toBe('19');
    });

    it('репозиторий зовёт тот же метод (сервис — тонкая обёртка)', async () => {
        callType.mockResolvedValueOnce(okResponse(SETTINGS));

        await new BxCalendarRepository(api).settingsGet();

        expect(callType).toHaveBeenCalledWith(
            'calendar',
            'settings',
            'get',
            {},
        );
    });

    it('settingsGetSafe: успех — ok: true и настройки календаря', async () => {
        callType.mockResolvedValueOnce(okResponse(SETTINGS));

        const result = await service.settingsGetSafe();

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('ожидался успешный результат');
        expect(result.settings.week_holidays).toEqual(['SA', 'SU']);
        expect(
            result.settings.week_holidays.map(
                day => BX_CALENDAR_WEEK_DAY_INDEX[day as 'SA' | 'SU'],
            ),
        ).toEqual([6, 0]);
    });

    it('settingsGetSafe: числовые work_time_* (реальные порталы) — тоже успех', async () => {
        callType.mockResolvedValueOnce(
            okResponse({
                ...SETTINGS,
                work_time_start: 8.5,
                work_time_end: 18,
            }),
        );

        const result = await service.settingsGetSafe();

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('ожидался успешный результат');
        expect(result.settings.work_time_start).toBe(8.5);
    });

    it('settingsGetSafe: нет прав на метод — типизированный отказ, без исключения', async () => {
        callType.mockRejectedValueOnce(
            restError(
                'ACCESS_DENIED',
                'Доступ запрещен. Требуется права: calendar',
            ),
        );

        const result = await service.settingsGetSafe();

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('ожидался отказ');
        expect(result.reason).toBe('access-denied');
        expect(result.code).toBe('ACCESS_DENIED');
        expect(result.description).toContain('calendar');
        expect(isBxCalendarUnavailable(result.reason)).toBe(true);
    });

    it('settingsGetSafe: метода нет на портале — reason method-not-found', async () => {
        callType.mockRejectedValueOnce(
            restError('ERROR_METHOD_NOT_FOUND', 'Method not found!', 400),
        );

        const result = await service.settingsGetSafe();

        if (result.ok) throw new Error('ожидался отказ');
        expect(result.reason).toBe('method-not-found');
        expect(isBxCalendarUnavailable(result.reason)).toBe(true);
    });

    it('settingsGetSafe: сетевой сбой — reason request-failed (повтор имеет смысл)', async () => {
        callType.mockRejectedValueOnce(
            new Error('timeout of 25000ms exceeded'),
        );

        const result = await service.settingsGetSafe();

        if (result.ok) throw new Error('ожидался отказ');
        expect(result.reason).toBe('request-failed');
        expect(result.code).toBeNull();
        expect(result.description).toContain('timeout');
        expect(isBxCalendarUnavailable(result.reason)).toBe(false);
    });

    it('settingsGetSafe: ответ без полей календаря — reason invalid-response', async () => {
        callType.mockResolvedValueOnce(okResponse({ week_start: 'MO' }));

        const result = await service.settingsGetSafe();

        if (result.ok) throw new Error('ожидался отказ');
        expect(result.reason).toBe('invalid-response');
        expect(result.code).toBeNull();
    });

    it('settingsGetSafe: week_holidays не массив строк — reason invalid-response', async () => {
        callType.mockResolvedValueOnce(
            okResponse({ ...SETTINGS, week_holidays: [6, 0] }),
        );

        const result = await service.settingsGetSafe();

        if (result.ok) throw new Error('ожидался отказ');
        expect(result.reason).toBe('invalid-response');
    });

    it('settingsGetSafe: пустой ответ метода — reason invalid-response, не исключение', async () => {
        callType.mockResolvedValueOnce(okResponse(null));

        const result = await service.settingsGetSafe();

        if (result.ok) throw new Error('ожидался отказ');
        expect(result.reason).toBe('invalid-response');
    });
});

describe('BitrixService.calendar (инстанс обычного пути инициализации портала)', () => {
    it('bitrix.calendar есть у инстанса из BitrixServiceFactory и клонирован под его api', async () => {
        const { api, callType } = makeApi();
        callType.mockResolvedValueOnce(okResponse(SETTINGS));
        const apiFactory = {
            create: jest.fn().mockReturnValue(api),
        } as unknown as BitrixApiFactoryService;
        const factory = new BitrixServiceFactory(
            apiFactory,
            new ServiceClonerFactory(),
        );

        const bitrix = await factory.create({
            domain: 'portal.bitrix24.ru',
            key: 'hook-key',
        });
        const result = await bitrix.calendar.settingsGetSafe();

        expect(bitrix.calendar).toBeInstanceOf(BxCalendarService);
        expect(callType).toHaveBeenCalledWith(
            'calendar',
            'settings',
            'get',
            {},
        );
        expect(result.ok).toBe(true);
    });
});
