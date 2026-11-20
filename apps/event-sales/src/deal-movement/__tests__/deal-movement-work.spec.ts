import { BitrixOwnerTypeId } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import { DEAL_MOVEMENT_WORK } from '../constants/deal-movement.const';
import {
    dealMovementWorkOf,
    toDealMovementWork,
} from '../lib/deal-movement-work';
import { DealMovementWorkReader } from '../services/deal-movement-work.reader';

/** Срок чтения: с 18.09.2026. */
const FROM_MS = Date.parse('2026-09-18T00:00:00.000Z');

describe('дела Битрикса → работа по сделке', () => {
    it('звонок — момент начала; 10 секунд — недозвон, разговор — нет', () => {
        expect(
            toDealMovementWork(
                {
                    TYPE_ID: '2',
                    PROVIDER_ID: 'VOXIMPLANT_CALL',
                    PROVIDER_TYPE_ID: 'CALL',
                    START_TIME: '2026-11-13T10:00:00+03:00',
                    END_TIME: '2026-11-13T10:00:10+03:00',
                    CREATED: '2026-11-13T10:00:30+03:00',
                },
                FROM_MS,
            ),
        ).toEqual({
            at: '2026-11-13T07:00:00.000Z',
            kind: 'call',
            missed: true,
        });
        expect(
            toDealMovementWork(
                {
                    TYPE_ID: '2',
                    START_TIME: '2026-11-16T10:00:00+03:00',
                    END_TIME: '2026-11-16T10:04:00+03:00',
                },
                FROM_MS,
            ),
        ).toMatchObject({ kind: 'call', missed: false });
        // Внешняя телефония: тип провайдера «звонок»; конца нет — не недозвон.
        expect(
            toDealMovementWork(
                {
                    TYPE_ID: '6',
                    PROVIDER_TYPE_ID: DEAL_MOVEMENT_WORK.callProviderType,
                    START_TIME: '2026-11-16T10:00:00+03:00',
                },
                FROM_MS,
            ),
        ).toMatchObject({ kind: 'call', missed: false });
    });

    it('дело и задача: закрытое — момент закрытия, открытое — момент создания', () => {
        expect(
            toDealMovementWork(
                {
                    TYPE_ID: '6',
                    PROVIDER_ID: 'CRM_TODO',
                    COMPLETED: 'Y',
                    CREATED: '2026-10-01T10:00:00+03:00',
                    LAST_UPDATED: '2026-11-12T15:00:00+03:00',
                },
                FROM_MS,
            ),
        ).toEqual({
            at: '2026-11-12T12:00:00.000Z',
            kind: 'activity',
            missed: false,
        });
        expect(
            toDealMovementWork(
                {
                    TYPE_ID: '6',
                    PROVIDER_ID: DEAL_MOVEMENT_WORK.taskProvider,
                    COMPLETED: 'N',
                    CREATED: '2026-11-14T09:00:00+03:00',
                    LAST_UPDATED: '2026-11-15T09:00:00+03:00',
                },
                FROM_MS,
            ),
        ).toEqual({
            at: '2026-11-14T06:00:00.000Z',
            kind: 'task',
            missed: false,
        });
    });

    it('старое открытое дело, которому недавно сдвинули срок, — не работа; мусор пропускается', () => {
        expect(
            toDealMovementWork(
                {
                    TYPE_ID: '6',
                    COMPLETED: 'N',
                    CREATED: '2026-08-01T10:00:00+03:00',
                    LAST_UPDATED: '2026-11-15T10:00:00+03:00',
                },
                FROM_MS,
            ),
        ).toBeNull();
        expect(
            dealMovementWorkOf(
                [null, 'строка', { TYPE_ID: '2' }, { CREATED: 'не дата' }],
                FROM_MS,
            ),
        ).toEqual([]);
        expect(dealMovementWorkOf({ error: 'x' }, FROM_MS)).toEqual([]);
    });
});

describe('читатель работы по сделкам', () => {
    const build = (responses: unknown[]) => {
        const addCmdBatch = jest.fn();
        const callBatchWithConcurrency = jest.fn().mockResolvedValue(responses);
        const reader = new DealMovementWorkReader({
            api: { addCmdBatch, callBatchWithConcurrency },
        } as never);
        return { reader, addCmdBatch, callBatchWithConcurrency };
    };

    it('команда на сделку по привязкам, свежие первыми, одна пачка одним инстансом', async () => {
        const { reader, addCmdBatch, callBatchWithConcurrency } = build([
            {
                result: {
                    movement_work_11: [
                        {
                            TYPE_ID: '2',
                            START_TIME: '2026-11-13T10:00:00+03:00',
                            END_TIME: '2026-11-13T10:00:10+03:00',
                        },
                    ],
                    movement_work_12: [],
                },
            },
        ]);
        const warnings: string[] = [];

        const work = await reader.load([11, 12], FROM_MS, warnings);

        expect(addCmdBatch).toHaveBeenCalledTimes(2);
        expect(addCmdBatch).toHaveBeenCalledWith(
            'movement_work_11',
            'crm.activity.list',
            {
                filter: {
                    BINDINGS: [
                        { OWNER_TYPE_ID: BitrixOwnerTypeId.DEAL, OWNER_ID: 11 },
                    ],
                    '>=LAST_UPDATED': '2026-09-18T00:00:00+00:00',
                },
                select: [...DEAL_MOVEMENT_WORK.select],
                order: { ID: 'DESC' },
                start: -1,
            },
        );
        expect(callBatchWithConcurrency).toHaveBeenCalledTimes(1);
        expect(callBatchWithConcurrency).toHaveBeenCalledWith(1);
        expect(work.get(11)).toEqual([
            { at: '2026-11-13T07:00:00.000Z', kind: 'call', missed: true },
        ]);
        expect(work.get(12)).toEqual([]);
        expect(warnings).toEqual([]);
    });

    it('часть пачки не ответила — без исключения, число в предупреждении', async () => {
        const { reader } = build([{ result: { movement_work_11: [] } }]);
        const warnings: string[] = [];

        const work = await reader.load([11, 12, 13], FROM_MS, warnings);

        expect(work.has(12)).toBe(false);
        expect(warnings).toEqual([
            'звонки и дела прочитаны не у всех сделок (не прочитано: 2) — у них «без внимания» считалось без дел',
        ]);
    });

    it('сделок нет — ни одного запроса', async () => {
        const { reader, callBatchWithConcurrency } = build([]);
        expect((await reader.load([], FROM_MS, [])).size).toBe(0);
        expect(callBatchWithConcurrency).not.toHaveBeenCalled();
    });
});
