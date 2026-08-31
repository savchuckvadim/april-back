import {
    normalizeListValues,
    SideFlowKpiRowBinderService,
} from '../side-flow-kpi-row-binder.service';
import { FlowBitrix, SmartKpiRowRef } from '../side-flow.types';

/**
 * Обратная ссылка элемента смарта в строках KPI/History-списков.
 *
 * Главный инвариант — семантика `lists.element.update`: Битрикс
 * ПЕРЕЗАПИСЫВАЕТ элемент, непереданные свойства очищаются. Поэтому назад
 * обязаны уехать NAME и ВСЕ PROPERTY_* строки, а не только crm-поле.
 */
describe('SideFlowKpiRowBinderService', () => {
    const row: SmartKpiRowRef = {
        iblockId: 21,
        elementId: 900,
        crmFieldId: 'PROPERTY_77',
    };

    const makeBitrix = (over?: {
        element?: Record<string, unknown> | null;
        getError?: Error;
    }) => {
        const updates: Array<Record<string, unknown>> = [];
        const bitrix = {
            listItem: {
                get: () => {
                    if (over?.getError) return Promise.reject(over.getError);
                    return Promise.resolve({
                        result:
                            over?.element === null ? [] : [over?.element ?? {}],
                    });
                },
                update: (dto: Record<string, unknown>) => {
                    updates.push(dto);
                    return Promise.resolve({ result: true });
                },
            },
        } as unknown as FlowBitrix;
        return { bitrix, updates };
    };

    it('дописывает ссылку, сохранив NAME и ВСЕ свойства строки', async () => {
        const { bitrix, updates } = makeBitrix({
            element: {
                ID: '900',
                NAME: 'Звонок по решению',
                IBLOCK_ID: '21',
                // Множественное свойство приходит ОБЪЕКТОМ {valueId: value}.
                PROPERTY_77: { '111': 'CO_167075', '112': 'D_25359' },
                PROPERTY_80: { '113': '31.08.2026 12:00:00' },
                PROPERTY_81: 'скаляр',
            },
        });
        const binder = new SideFlowKpiRowBinderService();

        await binder.append(bitrix, [row], 1060, 15, 'zpr-flow');

        expect(updates).toHaveLength(1);
        const fields = updates[0].FIELDS as Record<string, unknown>;
        expect(updates[0].IBLOCK_ID).toBe('21');
        expect(updates[0].ELEMENT_ID).toBe(900);
        // NAME обязателен — без него update отклоняется.
        expect(fields.NAME).toBe('Звонок по решению');
        // Соседние свойства не потеряны и нормализованы в массивы значений.
        expect(fields.PROPERTY_80).toEqual(['31.08.2026 12:00:00']);
        expect(fields.PROPERTY_81).toEqual(['скаляр']);
        // Ссылка дописана к существующим привязкам.
        expect(fields.PROPERTY_77).toEqual(['CO_167075', 'D_25359', 'T424_15']);
        // Системные ключи (ID/IBLOCK_ID) в FIELDS не уезжают.
        expect(fields.ID).toBeUndefined();
    });

    it('ссылка уже есть — повторной записи нет (идемпотентность)', async () => {
        const { bitrix, updates } = makeBitrix({
            element: {
                NAME: 'Строка',
                PROPERTY_77: { '111': 'T424_15' },
            },
        });
        const binder = new SideFlowKpiRowBinderService();

        await binder.append(bitrix, [row], 1060, 15);

        expect(updates).toHaveLength(0);
    });

    it('строка не найдена — warn, update не зовётся, джоб не падает', async () => {
        const { bitrix, updates } = makeBitrix({ element: null });
        const binder = new SideFlowKpiRowBinderService();
        const warn = jest
            .spyOn(binder['logger'], 'warn')
            .mockImplementation(() => undefined);

        await binder.append(bitrix, [row], 1060, 15, 'pres-flow');

        expect(updates).toHaveLength(0);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('[pres-flow]'),
        );
    });

    it('ошибка чтения одной строки не мешает остальным и не пробрасывается', async () => {
        const calls: number[] = [];
        const bitrix = {
            listItem: {
                get: (dto: { filter: { ID: number } }) => {
                    calls.push(dto.filter.ID);
                    if (dto.filter.ID === 900) {
                        return Promise.reject(new Error('network'));
                    }
                    return Promise.resolve({
                        result: [{ NAME: 'ок', PROPERTY_77: null }],
                    });
                },
                update: () => Promise.resolve({ result: true }),
            },
        } as unknown as FlowBitrix;
        const binder = new SideFlowKpiRowBinderService();
        jest.spyOn(binder['logger'], 'warn').mockImplementation(
            () => undefined,
        );

        await expect(
            binder.append(bitrix, [row, { ...row, elementId: 901 }], 1060, 15),
        ).resolves.toBeUndefined();
        expect(calls).toEqual([900, 901]);
    });
});

describe('normalizeListValues', () => {
    it('объект-форма {valueId: value} → массив значений', () => {
        expect(normalizeListValues({ '1': 'a', '2': 'b' })).toEqual(['a', 'b']);
    });

    it('скаляр → массив из одного, массив — как есть', () => {
        expect(normalizeListValues('x')).toEqual(['x']);
        expect(normalizeListValues(['x', 'y'])).toEqual(['x', 'y']);
    });

    it('пустые формы (null/undefined/false/"") → пустой массив', () => {
        expect(normalizeListValues(null)).toEqual([]);
        expect(normalizeListValues(undefined)).toEqual([]);
        expect(normalizeListValues(false)).toEqual([]);
        expect(normalizeListValues('')).toEqual([]);
    });
});
