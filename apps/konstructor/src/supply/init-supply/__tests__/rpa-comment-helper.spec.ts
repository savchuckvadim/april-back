import { BitrixService } from '@lib/bitrix';
import {
    RPA_NESTED_BULLET,
    RpaCommentHelper,
    RpaIconEnum,
    toSafeHref,
} from '../services/rpa-timeline-comment/lib/rpa-comment-helper.service';
import {
    RPA_COMMENT_ADD_METHOD,
    addRpaComment,
} from '../services/rpa-timeline-comment/lib/rpa-comment.writer';

const H = RpaCommentHelper;

/**
 * Разметка записей RPA — BB-код комментария. Формат проверен глазами на gsr
 * 26.11 (заявка 2063): [list] карточка не закрывает, поэтому пункты строками.
 */
describe('RpaCommentHelper: BB-разметка записи RPA', () => {
    it('собранная запись совпадает с форматом, проверенным на gsr', () => {
        const raw = `
            ${H.getHeaderWithIcon(RpaIconEnum.ARM, 'АРМ: ')}
            ${H.getListWithBold([{ head: 'Рег. лист:', value: '61-40762-0000746' }])}
            ${H.getHeaderWithIcon(RpaIconEnum.COMPLECT, 'Наименование комплекта: ')}
            ${H.getList(['Гарант-Профессионал\n, [b]Интернет 1 ОД[/b]'])}
            ${H.getHeaderWithIcon(RpaIconEnum.INFOBLOCK, 'Платный LegalTech: ')}
            ${H.getGroupedList([{ head: 'Legal Tech', items: ['Малый пакет', 'Сутяжник'] }])}
        `;

        expect(H.toTimelineText(raw)).toBe(
            [
                '[b][color=#005fa8]АРМ:[/color][/b]',
                '• [b]Рег. лист:[/b] 61-40762-0000746',
                '',
                '[b][color=#005fa8]Наименование комплекта:[/color][/b]',
                '• Гарант-Профессионал, [b]Интернет 1 ОД[/b]',
                '',
                '[b][color=#005fa8]Платный LegalTech:[/color][/b]',
                '• [b]Legal Tech[/b]',
                `${RPA_NESTED_BULLET}Малый пакет`,
                `${RPA_NESTED_BULLET}Сутяжник`,
            ].join('\n'),
        );
    });

    it('ни HTML, ни [list]: карточка показала бы их сырыми или вложила разделы', () => {
        const text = H.toTimelineText(
            H.getHeaderWithIcon(RpaIconEnum.CLIENT, 'Покупатель:') +
                H.getList(['a', 'b']) +
                H.getGroupedList([{ head: 'p', items: ['x'] }]),
        );
        expect(text).not.toMatch(/<[a-z/]/i);
        expect(text).not.toContain('[list]');
        expect(text).not.toContain('[*]');
    });

    it('пустые пункты и пустая группа не дают пустых строк', () => {
        expect(H.getList(['', 'a', '  '])).toBe('• a');
        expect(H.getList([])).toBe('');
        expect(H.getGroupedList([{ head: '', items: [''] }])).toBe('');
        expect(H.getGroupedList([{ head: '', items: ['x'] }])).toBe(
            `${RPA_NESTED_BULLET}x`,
        );
    });

    it('отступ вложенного пункта переживает чистку строк', () => {
        const text = H.toTimelineText(
            `   ${H.getGroupedList([{ head: 'p', items: ['x'] }])}   `,
        );
        expect(text.split('\n')[1]).toBe(`${RPA_NESTED_BULLET}x`);
    });

    it('у комментария нет заголовка — он первой жирной строкой', () => {
        expect(H.toCommentDescription('Перезаключение', '• a')).toBe(
            '[b]Перезаключение[/b]\n• a',
        );
    });
});

describe('ссылки в записи RPA', () => {
    it('адрес папки с пробелом и кириллицей кодируется, а не обрезается', () => {
        expect(
            H.getLink(
                'https://gsr.bitrix24.ru/disk/path/182917/Перезаключение 2071',
                'Папка на Диске',
            ),
        ).toBe(
            '[url=https://gsr.bitrix24.ru/disk/path/182917/%D0%9F%D0%B5%D1%80%D0%B5%D0%B7%D0%B0%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%B8%D0%B5%202071]Папка на Диске[/url]',
        );
    });

    it('уже закодированный адрес не кодируется второй раз', () => {
        const url = 'https://d.b24.ru/path/%D0%94%D0%BE%D0%B3%20%D1%8B';
        expect(toSafeHref(url)).toBe(url);
    });

    it('квадратные скобки в подписи не становятся тегом', () => {
        expect(H.getLink('https://d.b24.ru/', 'Файл [1]')).toBe(
            '[url=https://d.b24.ru/]Файл (1)[/url]',
        );
    });
});

describe('addRpaComment', () => {
    it('пишет комментарием RPA, заголовок — первой строкой', async () => {
        const call = jest.fn<Promise<unknown>, [string, unknown]>(() =>
            Promise.resolve({}),
        );
        const bitrix = { api: { call } } as unknown as BitrixService;

        await addRpaComment(bitrix, {
            typeId: 9,
            itemId: 2063,
            title: 'Задача для бухгалтера',
            description: '[url=https://d.b24.ru/t/1/]Задача[/url]',
        });

        expect(call).toHaveBeenCalledWith(RPA_COMMENT_ADD_METHOD, {
            typeId: 9,
            itemId: 2063,
            fields: {
                description:
                    '[b]Задача для бухгалтера[/b]\n[url=https://d.b24.ru/t/1/]Задача[/url]',
            },
        });
        expect(RPA_COMMENT_ADD_METHOD).toBe('rpa.comment.add');
    });
});
