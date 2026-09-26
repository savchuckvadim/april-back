import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    EBxDepartmentHeadType,
    EBxHeadOfSource,
    EBxVisibilityLevel,
} from '../dto/bx-department-structure.dto';
import {
    DOMAIN,
    makeStructureStand,
    type StructureStand,
} from './fixtures/structure-service.fixture';

describe('BxDepartmentStructureService: суперпользователь вендора (BX_SUPER_USER_IDS)', () => {
    let stand: StructureStand;
    let isSuperUser: jest.Mock;
    let settingsResolve: jest.Mock;

    beforeEach(() => {
        stand = makeStructureStand();
        ({ isSuperUser, settingsResolve } = stand);
    });

    const service = () => stand.service;
    const get = (userId: number, group = EDepartamentGroup.sales) =>
        service().getStructure(DOMAIN, group, userId);

    it('сотрудник-суперпользователь: all, cup, все ОП, source=superuser, isHead и коллеги по структуре', async () => {
        isSuperUser.mockImplementation(
            (_domain: string, id: number) => id === 204,
        );

        const { currentUser } = await get(204);

        expect(isSuperUser).toHaveBeenCalledWith(DOMAIN, 204);
        expect(currentUser.isSuperUser).toBe(true);
        expect(currentUser.visibility).toBe(EBxVisibilityLevel.all);
        expect(currentUser.headOf).toBe(EBxDepartmentHeadType.cup);
        expect(
            [...currentUser.headOfDepartmentIds].sort((a, b) => a - b),
        ).toEqual([37, 41, 49]);
        expect(currentUser.headOfSource).toBe(EBxHeadOfSource.superuser);
        expect(currentUser.isHead).toBe(false);
        expect(currentUser.colleagues.group.map(u => Number(u.ID))).toEqual([
            203,
        ]);
    });

    it('суперпользователь сильнее настроек видимости', async () => {
        isSuperUser.mockReturnValue(true);
        settingsResolve.mockResolvedValue({
            visibilityGroupUserIds: '204',
        });

        const { currentUser } = await get(204);

        expect(currentUser.headOfSource).toBe(EBxHeadOfSource.superuser);
        expect(currentUser.visibility).toBe(EBxVisibilityLevel.all);
    });

    it('группа service: суперпользователь тоже видит всё', async () => {
        isSuperUser.mockReturnValue(true);

        const { currentUser } = await get(204, EDepartamentGroup.service);

        expect(currentUser.isSuperUser).toBe(true);
        expect(currentUser.visibility).toBe(EBxVisibilityLevel.all);
    });

    it('остальные пользователи — isSuperUser=false, роль по структуре', async () => {
        for (const userId of [202, 203, 204, 309]) {
            const { currentUser } = await get(userId);
            expect(currentUser.isSuperUser).toBe(false);
            expect(currentUser.headOfSource).toBe(EBxHeadOfSource.structure);
        }
    });

    it('userId 0 никогда не суперпользователь', async () => {
        isSuperUser.mockReturnValue(true);

        const { currentUser } = await get(0);

        expect(currentUser.isSuperUser).toBe(false);
        expect(currentUser.visibility).toBe(EBxVisibilityLevel.own);
    });
});
