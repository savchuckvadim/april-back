import { ForbiddenException, Logger } from '@nestjs/common';
import {
    EBxDepartmentHeadType,
    EBxVisibilityLevel,
} from '@lib/bx-department/dto/bx-department-structure.dto';
import {
    HEAD_ONLY_MESSAGE,
    HeadAccessService,
    isDuplicatesManager,
} from '../head-access.service';

type User = Parameters<typeof isDuplicatesManager>[0];

const EMPLOYEE: User = {
    isHead: false,
    headOf: null,
    visibility: EBxVisibilityLevel.own,
    isSuperUser: false,
};

const setup = (currentUser: User | Error, superUser = false) => {
    const getStructure = jest.fn(() =>
        currentUser instanceof Error
            ? Promise.reject(currentUser)
            : Promise.resolve({ currentUser }),
    );
    const isSuperUser = jest.fn().mockResolvedValue(superUser);
    const service = new HeadAccessService(
        { getStructure } as never,
        { isSuperUser } as never,
    );
    return { service, getStructure, isSuperUser };
};

describe('HeadAccessService — присоединять и объединять может только руководитель', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    it('рядовой менеджер — нет; руководитель группы/ОП/«Главы» — да', () => {
        expect(isDuplicatesManager(EMPLOYEE)).toBe(false);
        expect(
            isDuplicatesManager({ ...EMPLOYEE, isHead: true, headOf: null }),
        ).toBe(true);
        expect(
            isDuplicatesManager({
                ...EMPLOYEE,
                headOf: EBxDepartmentHeadType.cup,
            }),
        ).toBe(true);
    });

    it('видимость шире своей из настроек «Отдел продаж» — да (руководитель вне структуры)', () => {
        expect(
            isDuplicatesManager({
                ...EMPLOYEE,
                visibility: EBxVisibilityLevel.department,
            }),
        ).toBe(true);
    });

    it('суперпользователь вендора проходит, даже если структура не прочиталась', async () => {
        const { service, getStructure } = setup(new Error('timeout'), true);

        expect(await service.canManageDuplicates('a.bitrix24.ru', 1)).toBe(
            true,
        );
        expect(getStructure).not.toHaveBeenCalled();
    });

    it('сбой структуры — отказ (fail closed)', async () => {
        const { service } = setup(new Error('timeout'));

        expect(await service.canManageDuplicates('a.bitrix24.ru', 11)).toBe(
            false,
        );
    });

    it('кто нажал — неизвестно: отказ без запросов', async () => {
        const { service, getStructure, isSuperUser } = setup(EMPLOYEE);

        expect(
            await service.canManageDuplicates('a.bitrix24.ru', undefined),
        ).toBe(false);
        expect(getStructure).not.toHaveBeenCalled();
        expect(isSuperUser).not.toHaveBeenCalled();
    });

    it('assert — 403 с понятным текстом для рядового менеджера', async () => {
        const { service } = setup(EMPLOYEE);

        await expect(
            service.assertCanManageDuplicates('a.bitrix24.ru', 11),
        ).rejects.toThrow(new ForbiddenException(HEAD_ONLY_MESSAGE));
    });

    it('assert — руководитель проходит', async () => {
        const { service } = setup({ ...EMPLOYEE, isHead: true });

        await expect(
            service.assertCanManageDuplicates('a.bitrix24.ru', 309),
        ).resolves.toBeUndefined();
    });
});
