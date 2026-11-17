import {
    bbBold,
    bbClip,
    bbLink,
    bbRow,
    bbSafe,
    bbTable,
} from '../bb-code.util';

describe('BB-код описаний задач', () => {
    it('текст извне: скобки не ломают разметку, пробелы схлопнуты', () => {
        expect(bbSafe('  ООО [Ромашка]\n\tрозница ')).toBe(
            'ООО (Ромашка) розница',
        );
    });

    it('обрезка длинного текста с многоточием', () => {
        expect(bbClip('Анна Иванова', 6)).toBe('Анна…');
        expect(bbClip('Анна', 6)).toBe('Анна');
    });

    it('ссылка с защищённой подписью и жирный фрагмент', () => {
        expect(
            bbLink('https://p.b24.ru/crm/deal/details/5/', 'Сделка [5]'),
        ).toBe('[URL=https://p.b24.ru/crm/deal/details/5/]Сделка (5)[/URL]');
        expect(bbBold('Итоги')).toBe('[B]Итоги[/B]');
    });

    it('строки и таблица: шапка жирная, фрагменты как есть', () => {
        expect(bbRow(['a', '[B]b[/B]'])).toBe(
            '[TR][TD]a[/TD][TD][B]b[/B][/TD][/TR]',
        );
        expect(bbTable(['Менеджер', 'Звонков'], [['Анна', '41']])).toBe(
            [
                '[TABLE]',
                '[TR][TD][B]Менеджер[/B][/TD][TD][B]Звонков[/B][/TD][/TR]',
                '[TR][TD]Анна[/TD][TD]41[/TD][/TR]',
                '[/TABLE]',
            ].join('\n'),
        );
    });
});
