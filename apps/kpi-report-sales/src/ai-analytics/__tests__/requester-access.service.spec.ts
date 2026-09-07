import { ForbiddenException } from '@nestjs/common';
import { EBxVisibilityLevel } from '@lib/bx-department/dto/bx-department-structure.dto';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import {
    filterByPerimeter,
    isManagerVisible,
} from '../domain/access/perimeter.util';
import { AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE } from '../constants/ai-analytics.const';
import { portalSettings } from './fixtures/lite-row.fixture';

const users = (...ids: number[]) => ids.map(ID => ({ ID: String(ID) }));

function makeService(
    visibility: EBxVisibilityLevel | Error,
    colleagues = { group: users(11, 12), department: users(11, 12, 21, 22) },
    selfViewEnabled = false,
) {
    const getStructure = jest.fn().mockImplementation(() => {
        if (visibility instanceof Error) return Promise.reject(visibility);
        return Promise.resolve({ currentUser: { visibility, colleagues } });
    });
    // Кэш прозрачный: сразу считает и возвращает.
    const remember = jest
        .fn()
        .mockImplementation(
            async (
                _key: string,
                _ttl: number,
                compute: () => Promise<unknown>,
            ) => ({
                value: await compute(),
                fromCache: false,
            }),
        );
    const load = jest
        .fn()
        .mockResolvedValue(portalSettings({ selfViewEnabled }));
    const service = new RequesterAccessService(
        { getStructure } as never,
        { remember } as never,
        { load } as never,
    );
    return { service, getStructure, remember, load };
}

describe('RequesterAccessService (права по структуре)', () => {
    it('visibility all → cup, видит всех (null)', async () => {
        const { service, getStructure } = makeService(EBxVisibilityLevel.all);
        const access = await service.resolve('april.bitrix24.ru', '447');
        expect(access).toEqual({ role: 'cup', visibleManagerIds: null });
        expect(getStructure).toHaveBeenCalledWith(
            'april.bitrix24.ru',
            'sales',
            447,
        );
    });

    it('visibility department → op, периметр = отдел + сам', async () => {
        const { service } = makeService(EBxVisibilityLevel.department);
        const access = await service.resolve('d', '447');
        expect(access.role).toBe('op');
        expect(access.visibleManagerIds).toEqual([
            '11',
            '12',
            '21',
            '22',
            '447',
        ]);
    });

    it('visibility group → group, периметр = группа + сам', async () => {
        const { service } = makeService(EBxVisibilityLevel.group);
        const access = await service.resolve('d', '447');
        expect(access).toEqual({
            role: 'group',
            visibleManagerIds: ['11', '12', '447'],
        });
    });

    it('visibility own → manager, только сам', async () => {
        const { service } = makeService(EBxVisibilityLevel.own);
        expect(await service.resolve('d', '447')).toEqual({
            role: 'manager',
            visibleManagerIds: ['447'],
        });
    });

    it('ошибка структуры → fail-closed: manager, только сам', async () => {
        const { service } = makeService(new Error('bitrix down'));
        expect(await service.resolve('d', '447')).toEqual({
            role: 'manager',
            visibleManagerIds: ['447'],
        });
    });

    it('результат кэшируется по ключу access:{userId} на 300 с', async () => {
        const { service, remember } = makeService(EBxVisibilityLevel.all);
        await service.resolve('d', '447');
        expect(remember).toHaveBeenCalledWith(
            'sales-ai-analytics:v1:d:access:447',
            300,
            expect.any(Function),
        );
    });

    it('resolveViewer: менеджер без headOf при выключенной self_view → 403 с русским сообщением', async () => {
        const { service, load } = makeService(EBxVisibilityLevel.own);
        await expect(service.resolveViewer('d', '447')).rejects.toThrow(
            AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE,
        );
        await expect(service.resolveViewer('d', '447')).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect(load).toHaveBeenCalledWith('d');
    });

    it('resolveViewer: при self_view_enabled менеджер получает «только себя»; ошибка структуры — тоже менеджер', async () => {
        const { service } = makeService(
            EBxVisibilityLevel.own,
            undefined,
            true,
        );
        expect(await service.resolveViewer('d', '447')).toEqual({
            role: 'manager',
            visibleManagerIds: ['447'],
        });
        const { service: broken } = makeService(new Error('bitrix down'));
        await expect(broken.resolveViewer('d', '447')).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });

    it('resolveViewer: руководителям настройка не читается — периметр как у resolve', async () => {
        for (const level of [
            EBxVisibilityLevel.all,
            EBxVisibilityLevel.department,
            EBxVisibilityLevel.group,
        ]) {
            const { service, load } = makeService(level);
            expect(await service.resolveViewer('d', '447')).toEqual(
                await service.resolve('d', '447'),
            );
            expect(load).not.toHaveBeenCalled();
        }
    });

    it('assertLeader: менеджер → 403, group-руководитель проходит, для cache/reset нужен cup|op', () => {
        const { service } = makeService(EBxVisibilityLevel.all);
        expect(() =>
            service.assertLeader({ role: 'manager', visibleManagerIds: ['1'] }),
        ).toThrow(ForbiddenException);
        expect(() =>
            service.assertLeader({ role: 'group', visibleManagerIds: ['1'] }),
        ).not.toThrow();
        expect(() =>
            service.assertLeader({ role: 'group', visibleManagerIds: ['1'] }, [
                'cup',
                'op',
            ]),
        ).toThrow(ForbiddenException);
    });

    it('assertVisible / isManagerVisible: чужой менеджер и строки без менеджера', () => {
        const { service } = makeService(EBxVisibilityLevel.all);
        const group = { role: 'group' as const, visibleManagerIds: ['1', '2'] };
        expect(() => service.assertVisible(group, '2')).not.toThrow();
        expect(() => service.assertVisible(group, '3')).toThrow(
            ForbiddenException,
        );
        expect(isManagerVisible(group, null)).toBe(false);
        expect(
            isManagerVisible({ role: 'cup', visibleManagerIds: null }, null),
        ).toBe(true);
        expect(
            filterByPerimeter(
                [{ managerId: '1' }, { managerId: '3' }, { managerId: null }],
                group,
            ),
        ).toEqual([{ managerId: '1' }]);
    });
});
