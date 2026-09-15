import {
    crmCardUrl,
    timelineBold,
    timelineLink,
    timelineLinkLine,
    timelineText,
    toTimelineComment,
} from '../timeline.consts';

/**
 * Разметка комментария таймлайна: HTML (BB-код карточка показывает сырым
 * текстом) плюс единственное экранирование под batch-провод на выходе.
 */
describe('timelineLink / timelineBold', () => {
    it('ссылка — html-тег с target=_blank, а не BB-код', () => {
        expect(timelineLink('https://d.b24.ru/crm/deal/details/1/', '#1')).toBe(
            '<a href="https://d.b24.ru/crm/deal/details/1/" target="_blank">#1</a>',
        );
    });

    it('подпись санируется: угловые скобки не ломают разметку', () => {
        expect(timelineLink('https://d.b24.ru/', 'ООО <b>Ромашка</b>')).toBe(
            '<a href="https://d.b24.ru/" target="_blank">ООО bРомашка/b</a>',
        );
    });

    it('кавычки в url не закрывают атрибут', () => {
        expect(timelineLink('https://d.b24.ru/" onmouseover="x', 'текст')).toBe(
            '<a href="https://d.b24.ru/onmouseover=x" target="_blank">текст</a>',
        );
    });

    it('«&» и кавычки в тексте остаются как есть — html-сущности карточка показала бы буквально', () => {
        expect(timelineText('Иванов & Партнёры «Ромашка»')).toBe(
            'Иванов & Партнёры «Ромашка»',
        );
    });

    it('жирный — <b>, строка-ссылка — «Подпись: <ссылка>»', () => {
        expect(timelineBold('Итог')).toBe('<b>Итог</b>');
        expect(timelineLinkLine('Сделка', 'https://d.b24.ru/x/', 'СПС')).toBe(
            'Сделка: <a href="https://d.b24.ru/x/" target="_blank">СПС</a>',
        );
    });
});

describe('crmCardUrl', () => {
    it('собирает адрес карточки портала', () => {
        expect(crmCardUrl('d.b24.ru', 'contact', 56)).toBe(
            'https://d.b24.ru/crm/contact/details/56/',
        );
    });
});

describe('toTimelineComment', () => {
    it('склеивает строки переносом и экранирует их ОДИН раз', () => {
        expect(toTimelineComment(['первая', 'вторая'])).toBe('первая%0Aвторая');
    });

    it('«#» из подписи ссылки уезжает как %23 — иначе команда обрывается', () => {
        const comment = toTimelineComment([
            `Закрытые сделки: ${timelineLink('https://d.b24.ru/crm/deal/details/25645/', '#25645')}.`,
        ]);
        expect(comment).toContain('%2325645');
        expect(comment).not.toContain('#');
    });

    it('пустые строки не оставляют дырок в комментарии', () => {
        expect(toTimelineComment(['a', '', '   ', 'b'])).toBe('a%0Ab');
    });
});
