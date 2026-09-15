import {
    buildEventReportTimelineComment,
    IEventReportTimelineSource,
} from '../services/timeline/event-report-timeline.formatter';

/**
 * Запись таймлайна основного потока отчёта: что произошло, с кем говорили,
 * какой следующий шаг и куда идти — кликабельными HTML-ссылками.
 */
const source = (
    over: Partial<IEventReportTimelineSource> = {},
): IEventReportTimelineSource => ({
    domain: 'd.b24.ru',
    happenedAt: '15 сентября 2026',
    reportEventType: 'presentation',
    reportEventName: 'Разбор договора',
    isResult: true,
    reportContact: { id: 56, name: 'Иванов Иван' },
    planEventType: 'hot',
    planEventName: '',
    planAt: '23 сентября 2026, 16:20',
    isExpired: false,
    planContact: { id: 57, name: 'Петров Пётр' },
    isUnplannedPresentation: false,
    comment: 'договорились созвониться после совета директоров',
    outcome: null,
    cards: [
        {
            section: 'deal',
            label: 'Сделка',
            id: 34,
            title: 'ООО «Ромашка» — СПС',
        },
        {
            section: 'company',
            label: 'Компания',
            id: 12,
            title: 'ООО «Ромашка»',
        },
    ],
    ...over,
});

const lines = (over: Partial<IEventReportTimelineSource> = {}): string[] =>
    buildEventReportTimelineComment(source(over)).split('\n');

describe('buildEventReportTimelineComment', () => {
    it('полная запись: дата, событие, контакты, следующий шаг, комментарий и карточки', () => {
        expect(lines()).toEqual([
            '<b>15 сентября 2026</b>',
            'Презентация проведена: Разбор договора',
            'Контакт: <a href="https://d.b24.ru/crm/contact/details/56/" target="_blank">Иванов Иван</a>',
            'Следующий шаг: Запланирован Звонок по решению на 23 сентября 2026, 16:20',
            'Контакт: <a href="https://d.b24.ru/crm/contact/details/57/" target="_blank">Петров Пётр</a>',
            'Комментарий: договорились созвониться после совета директоров',
            'Сделка: <a href="https://d.b24.ru/crm/deal/details/34/" target="_blank">ООО «Ромашка» — СПС</a>',
            'Компания: <a href="https://d.b24.ru/crm/company/details/12/" target="_blank">ООО «Ромашка»</a>',
        ]);
    });

    it('ссылки — HTML: BB-код таймлайн карточки показывает сырым текстом', () => {
        const comment = buildEventReportTimelineComment(source());
        expect(comment).not.toContain('[URL=');
        expect(comment).not.toContain('[B]');
    });

    it('контакт отчёта и контакт плана — РАЗНЫЕ: у каждого своя строка', () => {
        const contacts = lines().filter(line => line.startsWith('Контакт: '));
        expect(contacts).toHaveLength(2);
        expect(contacts[0]).toContain('details/56/');
        expect(contacts[1]).toContain('details/57/');
    });

    it('один человек в обеих ролях печатается один раз', () => {
        const contacts = lines({
            planContact: { id: 56, name: 'Иванов Иван' },
        }).filter(line => line.startsWith('Контакт: '));
        expect(contacts).toHaveLength(1);
    });

    it('несостоявшееся событие склоняется по роду типа', () => {
        expect(lines({ isResult: false })[1]).toBe(
            'Презентация не состоялась: Разбор договора',
        );
        expect(
            lines({
                isResult: false,
                reportEventType: 'warm',
                reportEventName: '',
            })[1],
        ).toBe('Звонок не состоялся');
    });

    it('перенос читается «Перенесён …», а не «Запланирован»', () => {
        const next = lines({
            isExpired: true,
            planEventType: null,
            reportEventType: 'warm',
        }).find(line => line.startsWith('Следующий шаг'));
        expect(next).toBe(
            'Следующий шаг: Перенесён Звонок на 23 сентября 2026, 16:20',
        );
    });

    it('название события не дублирует тип', () => {
        expect(lines({ reportEventName: 'Презентация' })[1]).toBe(
            'Презентация проведена',
        );
    });

    it('спонтанная презентация отмечается отдельной строкой', () => {
        expect(lines({ isUnplannedPresentation: true })).toContain(
            'Дополнительно: проведена спонтанная презентация',
        );
    });

    it('финал: итог работы вместо следующего шага', () => {
        const rows = lines({
            outcome: 'fail',
            planEventType: null,
            planAt: null,
            planContact: null,
        });
        expect(rows).toContain('Итог работы: Отказ');
        expect(rows.some(line => line.startsWith('Следующий шаг'))).toBe(false);
        expect(lines({ outcome: 'notCa' })).toContain(
            'Итог работы: Отказ — не целевой клиент',
        );
    });

    it('пустых строк не бывает: нет данных — нет строки', () => {
        expect(
            lines({
                reportEventType: null,
                reportContact: null,
                planEventType: null,
                planAt: null,
                planContact: null,
                comment: '   ',
                cards: [],
            }),
        ).toEqual(['<b>15 сентября 2026</b>']);
    });

    it('контакт без имени — честная подпись по id, а не пустая ссылка', () => {
        expect(lines({ reportContact: { id: 56, name: '' } })[2]).toContain(
            '>контакт #56</a>',
        );
    });
});
