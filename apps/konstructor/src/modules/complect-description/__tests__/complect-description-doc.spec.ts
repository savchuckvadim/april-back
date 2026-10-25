import { Packer } from 'docx';
import {
    buildDescriptionDocument,
    countInfoblocks,
    descriptionFileName,
    resolveDescriptionGroups,
} from '../lib/complect-description-doc';

describe('complect-description-doc', () => {
    const groups = [
        {
            name: 'Нормативно-правовые акты',
            infoblocks: [
                { code: 'rus', name: 'Законодательство России' },
                {
                    code: 'reg',
                    name: 'Региональное законодательство',
                    description: 'С фронта',
                },
                { code: 'empty', name: 'Без текста' },
            ],
        },
        {
            name: 'Legal Tech',
            infoblocks: [
                { code: 'ltsut', name: 'Сутяжник', description: '  ' },
            ],
        },
    ];

    it('тексты из БД важнее фронта, блоки без текста и пустые группы выпадают, абзацы — по строкам', () => {
        const resolved = resolveDescriptionGroups(
            groups,
            new Map([
                ['rus', { description: 'Первый абзац\n\nВторой абзац\r\n' }],
                ['reg', { description: null }],
            ]),
        );
        expect(resolved).toHaveLength(1);
        expect(resolved[0].infoblocks.map(item => item.code)).toEqual([
            'rus',
            'reg',
        ]);
        expect(resolved[0].infoblocks[0].paragraphs).toEqual([
            'Первый абзац',
            'Второй абзац',
        ]);
        expect(resolved[0].infoblocks[1].paragraphs).toEqual(['С фронта']);
        expect(countInfoblocks(resolved)).toBe(2);
    });

    it('собирает DOCX в буфер', async () => {
        const doc = buildDescriptionDocument({
            complectName: 'ГАРАНТ-Бухгалтер',
            supply: '3 ОД',
            groups: resolveDescriptionGroups(
                groups,
                new Map([['rus', { description: 'Текст' }]]),
            ),
        });
        const buffer = await Packer.toBuffer(doc);
        expect(buffer.length).toBeGreaterThan(1000);
    });

    it('имя файла без запрещённых символов', () => {
        expect(descriptionFileName('Эксперт: PRO/Макс?', '2026-10-24')).toBe(
            'Описание комплекта Эксперт- PRO-Макс- 2026-10-24.docx',
        );
    });
});
