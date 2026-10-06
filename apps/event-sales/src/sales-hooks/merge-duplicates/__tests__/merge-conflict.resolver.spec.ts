import { DuplicateEntityType } from '@lib/portal-lib/pbx-duplicate';
import { MergeConflictResolver } from '../services/merge-conflict.resolver';
import { MergeGroup } from '../services/merge-plan.service';

const GROUP: MergeGroup = {
    entityType: DuplicateEntityType.COMPANY,
    entityTypeId: 4,
    survivorId: 431,
    victimIds: [8821],
};

/** Битрикс: чтение пачкой по id, запись прямыми вызовами — журналом. */
const makeBitrix = (rows: Record<string, unknown>) => {
    const queued: string[] = [];
    const calls: { method: string; params: Record<string, unknown> }[] = [];
    const api = {
        addCmdBatch: jest.fn((cmd: string) => queued.push(cmd)),
        callBatchAsync: jest.fn(() => {
            const result: Record<string, unknown> = {};
            for (const cmd of queued.splice(0)) {
                if (cmd in rows) result[cmd] = rows[cmd];
            }
            return Promise.resolve([{ result }]);
        }),
        call: jest.fn((method: string, params: Record<string, unknown>) => {
            calls.push({ method, params });
            return Promise.resolve({ result: true });
        }),
    };
    return { bitrix: { api }, calls };
};

describe('MergeConflictResolver', () => {
    it('лента главной карточки — первой, потом дополнение главной и правка дубля', async () => {
        const { bitrix, calls } = makeBitrix({
            mc_get_431: { ID: '431', TITLE: 'Ромашка', ADDRESS: '' },
            mc_get_8821: {
                ID: '8821',
                TITLE: 'ООО «Ромашка»',
                ADDRESS: 'Воронеж',
            },
            mc_fields: {
                TITLE: { type: 'string', title: 'Название компании' },
            },
        });

        const resolution = await new MergeConflictResolver(
            bitrix as never,
        ).resolve(GROUP, [8821]);

        expect(resolution).toEqual({ changed: true, keptInTimeline: 1 });
        expect(calls.map(call => call.method)).toEqual([
            'crm.timeline.comment.add',
            'crm.company.update',
            'crm.company.update',
        ]);
        const [timeline, survivor, victim] = calls;
        expect(timeline.params).toEqual({
            fields: expect.objectContaining({
                ENTITY_ID: 431,
                ENTITY_TYPE: 'company',
            }) as unknown,
        });
        expect(survivor.params).toEqual({
            id: 431,
            fields: { ADDRESS: 'Воронеж' },
        });
        expect(victim.params).toEqual({
            id: 8821,
            fields: { TITLE: 'Ромашка' },
        });
    });

    it('расхождений, которые можно снять, нет — ничего не пишет', async () => {
        const { bitrix, calls } = makeBitrix({
            mc_get_431: { ID: '431', TITLE: 'Ромашка' },
            mc_get_8821: { ID: '8821', TITLE: 'Ромашка' },
            mc_fields: {},
        });

        const resolution = await new MergeConflictResolver(
            bitrix as never,
        ).resolve(GROUP, [8821]);

        expect(resolution.changed).toBe(false);
        expect(calls).toEqual([]);
    });

    it('главная карточка не прочиталась — ничего не трогает', async () => {
        const { bitrix, calls } = makeBitrix({
            mc_get_8821: { ID: '8821', TITLE: 'Другое' },
        });

        const resolution = await new MergeConflictResolver(
            bitrix as never,
        ).resolve(GROUP, [8821]);

        expect(resolution.changed).toBe(false);
        expect(calls).toEqual([]);
    });
});
