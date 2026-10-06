import {
    harmonizeForMerge,
    hasHarmonizationChanges,
} from '../lib/merge-harmonize';

/**
 * Правила подготовки к повторному объединению после CONFLICT: главная
 * карточка дополняется, дубли подстраиваются под неё, уступившие значения
 * дублей попадают в заметки — ничего не теряется молча.
 */
describe('harmonizeForMerge', () => {
    it('пустое поле главной карточки дополняется значением дубля', () => {
        const result = harmonizeForMerge({ ID: '1', ADDRESS: '' }, [
            { id: 2, row: { ID: '2', ADDRESS: 'Воронеж, Ленина 1' } },
        ]);

        expect(result.survivorPatch).toEqual({ ADDRESS: 'Воронеж, Ленина 1' });
        expect(result.victimPatches.size).toBe(0);
        expect(result.notes).toEqual([]);
    });

    it('разные значения: главная остаётся, дубль подстраивается, его значение — в заметку', () => {
        const result = harmonizeForMerge({ TITLE: 'Ромашка' }, [
            { id: 2, row: { TITLE: 'ООО «Ромашка»' } },
        ]);

        expect(result.survivorPatch).toEqual({});
        expect(result.victimPatches.get(2)).toEqual({ TITLE: 'Ромашка' });
        expect(result.notes).toEqual([
            {
                victimId: 2,
                field: 'TITLE',
                victimValue: 'ООО «Ромашка»',
                keptValue: 'Ромашка',
            },
        ]);
    });

    it('второй дубль сравнивается с уже дополненным значением', () => {
        const result = harmonizeForMerge({ UF_CRM_INN: '' }, [
            { id: 2, row: { UF_CRM_INN: '3664000001' } },
            { id: 3, row: { UF_CRM_INN: '3664000002' } },
        ]);

        expect(result.survivorPatch).toEqual({ UF_CRM_INN: '3664000001' });
        expect(result.victimPatches.has(2)).toBe(false);
        expect(result.victimPatches.get(3)).toEqual({
            UF_CRM_INN: '3664000001',
        });
        expect(result.notes.map(note => note.victimId)).toEqual([3]);
    });

    it('множественные поля объединяются: главной — всё вместе, дублю — то же', () => {
        const result = harmonizeForMerge({ UF_CRM_LEADS: ['L_1'] }, [
            { id: 2, row: { UF_CRM_LEADS: ['L_2', 'L_1'] } },
        ]);

        expect(result.survivorPatch).toEqual({ UF_CRM_LEADS: ['L_1', 'L_2'] });
        expect(result.victimPatches.get(2)).toEqual({
            UF_CRM_LEADS: ['L_1', 'L_2'],
        });
        // Объединённое ничего не теряет — заметка не нужна.
        expect(result.notes).toEqual([]);
    });

    it('пустое множественное поле (false) расхождением не считается', () => {
        const result = harmonizeForMerge({ UF_CRM_LEADS: ['L_1'] }, [
            { id: 2, row: { UF_CRM_LEADS: false } },
        ]);

        expect(hasHarmonizationChanges(result)).toBe(false);
    });

    it('комментарии склеиваются, без повторов', () => {
        const result = harmonizeForMerge({ COMMENTS: 'Звонить после обеда' }, [
            { id: 2, row: { COMMENTS: 'Бухгалтер Ирина' } },
            { id: 3, row: { COMMENTS: 'Звонить после обеда' } },
        ]);

        const merged = 'Звонить после обеда\n\nБухгалтер Ирина';
        expect(result.survivorPatch).toEqual({ COMMENTS: merged });
        expect(result.victimPatches.get(2)).toEqual({ COMMENTS: merged });
        expect(result.victimPatches.get(3)).toEqual({ COMMENTS: merged });
        expect(result.notes).toEqual([]);
    });

    it('одно и то же число в разной записи — не расхождение', () => {
        const result = harmonizeForMerge({ OPPORTUNITY: '100.00' }, [
            { id: 2, row: { OPPORTUNITY: 100 } },
        ]);

        expect(hasHarmonizationChanges(result)).toBe(false);
    });

    it('служебные поля, ответственный, стадии и привязки не трогаются', () => {
        const result = harmonizeForMerge(
            {
                ID: '1',
                ASSIGNED_BY_ID: '11',
                STAGE_ID: 'C1:NEW',
                COMPANY_ID: '5',
                DATE_CREATE: '2026-01-01',
                IS_RETURN_CUSTOMER: 'N',
                HAS_PHONE: 'Y',
                ADDRESS_LOC_ADDR_ID: '7',
            },
            [
                {
                    id: 2,
                    row: {
                        ID: '2',
                        ASSIGNED_BY_ID: '369',
                        STAGE_ID: 'C1:WON',
                        COMPANY_ID: '6',
                        DATE_CREATE: '2026-02-01',
                        IS_RETURN_CUSTOMER: 'Y',
                        HAS_PHONE: 'N',
                        ADDRESS_LOC_ADDR_ID: '8',
                    },
                },
            ],
        );

        expect(hasHarmonizationChanges(result)).toBe(false);
    });

    it('телефоны, почты и файлы (объекты) оставляются Битриксу', () => {
        const result = harmonizeForMerge(
            {
                PHONE: [{ ID: '1', VALUE: '+7900', VALUE_TYPE: 'WORK' }],
                UF_CRM_FILE: { id: 1, showUrl: '/a' },
            },
            [
                {
                    id: 2,
                    row: {
                        PHONE: [
                            { ID: '2', VALUE: '+7911', VALUE_TYPE: 'WORK' },
                        ],
                        UF_CRM_FILE: { id: 2, showUrl: '/b' },
                    },
                },
            ],
        );

        expect(hasHarmonizationChanges(result)).toBe(false);
    });

    it('у дубля пусто — ничего не меняется', () => {
        const result = harmonizeForMerge({ TITLE: 'Ромашка' }, [
            { id: 2, row: { TITLE: '' } },
        ]);

        expect(hasHarmonizationChanges(result)).toBe(false);
    });
});
