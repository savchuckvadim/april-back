import { DealMoveCountService } from '../services/deal/deal-move-count.service';

/**
 * Счётчик переносов op_move_count (todo2508-02 №6): пишется ТОЛЬКО при
 * переносе, значение — «текущее из слепка + 1», носитель — текущая
 * ХО-сделка при холодном контексте и текущая основная при остальных.
 */
type Call = { cmd: string; dealId: number; fields: Record<string, string> };

const FIELD_KEY = 'UF_CRM_MOVE_COUNT';

const makeBitrix = () => {
    const updates: Call[] = [];
    return {
        updates,
        bitrix: {
            batch: {
                deal: {
                    update: (
                        cmd: string,
                        dealId: number,
                        fields: Record<string, string>,
                    ) => updates.push({ cmd, dealId, fields }),
                },
            },
        },
    };
};

const makePortal = (installed = true) => ({
    getEntityFieldByCode: (entity: string, code: string) =>
        installed && entity === 'deal' && code === 'op_move_count'
            ? { bitrixId: 'MOVE_COUNT' }
            : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
});

const makeCtx = (over: Record<string, unknown> = {}) =>
    ({
        isExpired: true,
        reportEventType: 'warm',
        planEventType: null,
        currentBaseDeal: null,
        currentXoDeal: null,
        ...over,
    }) as never;

const run = (
    ctx: unknown,
    { installed = true }: { installed?: boolean } = {},
) => {
    const { bitrix, updates } = makeBitrix();
    new DealMoveCountService(
        bitrix as never,
        makePortal(installed) as never,
    ).queue(ctx as never);
    return updates;
};

describe('DealMoveCountService — счётчик переносов', () => {
    it('обычный тип: инкремент на текущей основной сделке из слепка', () => {
        const updates = run(
            makeCtx({
                currentBaseDeal: { ID: '10', [FIELD_KEY]: '2' },
            }),
        );

        expect(updates).toEqual([
            {
                cmd: 'move_count_deal_10',
                dealId: 10,
                fields: { [FIELD_KEY]: '3' },
            },
        ]);
    });

    it('холодный контекст: инкремент на ХО-сделке, основную не трогаем', () => {
        const updates = run(
            makeCtx({
                reportEventType: 'xoRequest',
                currentBaseDeal: { ID: '10', [FIELD_KEY]: '5' },
                currentXoDeal: { ID: '20' },
            }),
        );

        // Пустой слепок = 0 переносов до сих пор → пишем 1.
        expect(updates).toEqual([
            {
                cmd: 'move_count_deal_20',
                dealId: 20,
                fields: { [FIELD_KEY]: '1' },
            },
        ]);
    });

    it('холодный план без типа отчёта тоже уводит на ХО-сделку', () => {
        const updates = run(
            makeCtx({
                reportEventType: null,
                planEventType: 'xo',
                currentXoDeal: { ID: '21', [FIELD_KEY]: '1' },
            }),
        );

        expect(updates[0]?.dealId).toBe(21);
        expect(updates[0]?.fields[FIELD_KEY]).toBe('2');
    });

    it('мусор в слепке трактуется как 0 — счётчик не ломается', () => {
        const updates = run(
            makeCtx({
                currentBaseDeal: { ID: '10', [FIELD_KEY]: 'oops' },
            }),
        );

        expect(updates[0]?.fields[FIELD_KEY]).toBe('1');
    });

    it('не перенос — команды нет', () => {
        const updates = run(
            makeCtx({
                isExpired: false,
                currentBaseDeal: { ID: '10', [FIELD_KEY]: '2' },
            }),
        );

        expect(updates).toEqual([]);
    });

    it('холодный контекст без ХО-сделки — чужую воронку не трогаем', () => {
        const updates = run(
            makeCtx({
                reportEventType: 'xo',
                currentBaseDeal: { ID: '10', [FIELD_KEY]: '2' },
            }),
        );

        expect(updates).toEqual([]);
    });

    it('поле не установлено на портале — graceful-пропуск', () => {
        const updates = run(
            makeCtx({ currentBaseDeal: { ID: '10', [FIELD_KEY]: '2' } }),
            { installed: false },
        );

        expect(updates).toEqual([]);
    });
});
