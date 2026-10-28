import { Logger } from '@nestjs/common';
import { EventReportImpersonationService } from '../services/impersonation/event-report-impersonation.service';
import {
    impersonationFromDto,
    impersonationLogLine,
    impersonationVisibleMark,
} from '../services/impersonation/impersonation.mark';

/**
 * РЕЖИМ «РАБОТАТЬ КАК»: суперпользователь April отчитывается от имени
 * сотрудника. На портале — ни следа, в журнале сервера — одна строка.
 * Не суперпользователь спрятаться не может: его отчёт подписан видимо.
 */
const DOMAIN = 'example.bitrix24.ru';

const dto = (over: Record<string, unknown> = {}) =>
    ({
        domain: DOMAIN,
        plan: { responsibility: { ID: 231 } },
        currentTask: { id: 900 },
        impersonatedBy: { ID: 447, NAME: ' Петров Пётр ' },
        ...over,
    }) as never;

describe('impersonationFromDto', () => {
    it('поля нет или id мусорный — отчёт обычный', () => {
        expect(impersonationFromDto({}, true)).toBeNull();
        expect(
            impersonationFromDto({ impersonatedBy: { ID: 'abc' } }, true),
        ).toBeNull();
    });

    it('как кто — ответственный плана; имя без пробелов по краям', () => {
        expect(impersonationFromDto(dto(), true)).toEqual({
            superUserId: 447,
            name: 'Петров Пётр',
            asUserId: 231,
            responsibleId: 231,
            isConfirmed: true,
        });
    });

    it('сотрудник отчитался за подчинённого — как кто = сам сотрудник', () => {
        const check = impersonationFromDto(
            dto({ actingManager: { ID: 481 } }),
            true,
        );
        expect(check).toMatchObject({ asUserId: 481, responsibleId: 231 });
    });
});

describe('impersonationVisibleMark', () => {
    const base = impersonationFromDto(dto(), false)!;

    it('подтверждённый — пометки нет', () => {
        expect(
            impersonationVisibleMark({ ...base, isConfirmed: true }),
        ).toBeNull();
    });

    it('неподтверждённый — «Отчёт отправил» с его id и именем', () => {
        expect(impersonationVisibleMark(base)).toEqual({
            id: 447,
            name: 'Петров Пётр',
            isConfirmedHead: false,
        });
    });

    it('отчёт записан на самого отправителя — пометки нет', () => {
        expect(
            impersonationVisibleMark({ ...base, responsibleId: 447 }),
        ).toBeNull();
        expect(
            impersonationVisibleMark({ ...base, responsibleId: 0 }),
        ).toBeNull();
    });
});

describe('impersonationLogLine', () => {
    const base = impersonationFromDto(dto(), true)!;

    it('кто, как кто и дело — одной строкой', () => {
        expect(impersonationLogLine(DOMAIN, base, 900)).toBe(
            `[${DOMAIN}] Петров Пётр (#447), суперпользователь: ` +
                'отчёт как сотрудник #231, дело #900',
        );
    });

    it('без имени и дела, отчёт записан на подчинённого', () => {
        const line = impersonationLogLine(
            DOMAIN,
            { ...base, name: '', asUserId: 481, isConfirmed: false },
            0,
        );
        expect(line).toBe(
            `[${DOMAIN}] #447, НЕ суперпользователь — пометка видна: ` +
                'отчёт как сотрудник #481, записан на #231, новое дело',
        );
    });
});

describe('EventReportImpersonationService.check', () => {
    let logSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
        warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    afterEach(() => jest.restoreAllMocks());

    const make = (isSuperUser: jest.Mock) =>
        new EventReportImpersonationService({ isSuperUser } as never);

    it('поля нет — роль не проверяется, журнал молчит', async () => {
        const isSuperUser = jest.fn();
        await expect(
            make(isSuperUser).check(dto({ impersonatedBy: undefined })),
        ).resolves.toBeNull();
        expect(isSuperUser).not.toHaveBeenCalled();
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('суперпользователь — тихая строка в журнал', async () => {
        const isSuperUser = jest.fn().mockResolvedValue(true);
        const check = await make(isSuperUser).check(dto());
        expect(check?.isConfirmed).toBe(true);
        expect(isSuperUser).toHaveBeenCalledWith(DOMAIN, 447);
        expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('отчёт как сотрудник #231, дело #900'),
        );
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('не суперпользователь — предупреждение в журнал', async () => {
        const check = await make(jest.fn().mockResolvedValue(false)).check(
            dto(),
        );
        expect(check?.isConfirmed).toBe(false);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('НЕ суперпользователь'),
        );
    });

    it('проверка упала — не подтверждено, отчёт не падает', async () => {
        const check = await make(
            jest.fn().mockRejectedValue(new Error('db down')),
        ).check(dto());
        expect(check?.isConfirmed).toBe(false);
    });
});
