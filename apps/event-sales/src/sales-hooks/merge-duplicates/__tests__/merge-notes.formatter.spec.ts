import {
    describeValue,
    formatMergeNotes,
    toFieldsMeta,
} from '../lib/merge-notes.formatter';

/**
 * Запись в ленту главной карточки: значения дублей, уступившие ей при
 * объединении. Читает человек — только подписи полей, без кодов.
 */
const FIELDS = toFieldsMeta({
    TITLE: { type: 'string', title: 'Название компании' },
    UF_CRM_1700000001: {
        type: 'enumeration',
        title: 'UF_CRM_1700000001',
        listLabel: 'Тип клиента',
        items: [
            { ID: '41', VALUE: 'Бюджетный' },
            { ID: '42', VALUE: 'Коммерческий' },
        ],
    },
    UF_CRM_1700000002: { type: 'boolean', title: 'UF_CRM_1700000002' },
});

describe('toFieldsMeta / describeValue', () => {
    it('подпись поля — из подписей списка и формы, код как подпись не берётся', () => {
        expect(FIELDS.UF_CRM_1700000001.title).toBe('Тип клиента');
        expect(FIELDS.UF_CRM_1700000002.title).toBe('');
    });

    it('вариант списка — подписью, «да/нет» — словами, ссылка CRM — по-русски', () => {
        expect(describeValue(FIELDS.UF_CRM_1700000001, '42')).toBe(
            'Коммерческий',
        );
        expect(describeValue(FIELDS.UF_CRM_1700000002, '1')).toBe('да');
        expect(describeValue(undefined, 'CO_431')).toBe('компания 431');
    });
});

describe('formatMergeNotes', () => {
    it('расхождений нет — писать нечего', () => {
        expect(
            formatMergeNotes({
                notes: [],
                fields: FIELDS,
                victimTitles: new Map(),
            }),
        ).toBeNull();
    });

    it('по дублю: его название, поле подписью, было и оставлено', () => {
        const text = formatMergeNotes({
            notes: [
                {
                    victimId: 8821,
                    field: 'TITLE',
                    victimValue: 'ООО «Ромашка»',
                    keptValue: 'Ромашка',
                },
                {
                    victimId: 8821,
                    field: 'UF_CRM_1700000001',
                    victimValue: '41',
                    keptValue: '42',
                },
                {
                    victimId: 8821,
                    field: 'UF_CRM_1700000002',
                    victimValue: '0',
                    keptValue: '1',
                },
            ],
            fields: FIELDS,
            victimTitles: new Map([[8821, 'ООО «Ромашка»']]),
        });

        expect(text).toContain('«ООО «Ромашка»» (№8821):');
        expect(text).toContain(
            '• Название компании: было «ООО «Ромашка»», оставлено «Ромашка»',
        );
        expect(text).toContain(
            '• Тип клиента: было «Бюджетный», оставлено «Коммерческий»',
        );
        expect(text).toContain(
            '• Дополнительное поле: было «нет», оставлено «да»',
        );
        // Коды полей человеку не показываются.
        expect(text).not.toMatch(/UF_CRM/);
    });

    it('у дубля нет названия — подписывается номером', () => {
        const text = formatMergeNotes({
            notes: [
                {
                    victimId: 7,
                    field: 'TITLE',
                    victimValue: 'А',
                    keptValue: 'Б',
                },
            ],
            fields: FIELDS,
            victimTitles: new Map(),
        });

        expect(text).toContain('Дубль №7:');
    });
});
