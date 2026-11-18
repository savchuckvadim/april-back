import { readCallPageAnalysis } from '../call-page-analysis.reader';
import { buildCallPageFacts } from '../call-page-facts.presenter';

/**
 * Строка итогов «Чек-лист 5К» / «Чек-лист ХВОСТ» на странице звонка
 * (17.11.2026): сохранённый разбор с записью словаря вместо строк
 * показывается строками по блокам анкеты, с новой строки после итога.
 * Чек-листы есть только у презентации (18.11.2026) — разборы здесь
 * презентационные.
 */
function checklistValue(
    payload: Record<string, unknown>,
    label: string,
): string | undefined {
    const view = readCallPageAnalysis({
        callType: 'presentation',
        ...payload,
    });
    if (view === null) throw new Error('разбор не прочитан');
    return buildCallPageFacts(view).find(fact => fact.label === label)?.value;
}

describe('страница звонка: чек-листы из сохранённого разбора', () => {
    it('запись словаря 5К — «не выполнен.» и строки блоков', () => {
        const value = checklistValue(
            {
                fiveKDone: false,
                fiveKAnalysis:
                    "{'client': 'Логист, ищет судебную практику;', " +
                    "'company': 'не выяснено;', 'colleagues': None, " +
                    "'competitor': 'другая система ;', 'criteria': 'цена;'}",
            },
            'Чек-лист 5К',
        );
        expect(value).toBe(
            [
                'не выполнен.',
                'Клиент: Логист, ищет судебную практику',
                'Компания: не выяснено',
                'Коллеги: не выяснено',
                'Конкурент: другая система',
                'Критерии выбора: цена',
            ].join('\n'),
        );
    });

    it('запись словаря хвоста — подписи хвоста', () => {
        const value = checklistValue(
            {
                hvostDone: true,
                hvostAnalysis:
                    '{"desire": "понравилось", "offered": "базовый комплект"}',
            },
            'Чек-лист ХВОСТ',
        );
        expect(value).toBe(
            [
                'выполнен.',
                'Желание работать с Гарантом: понравилось',
                'Что предложили: базовый комплект',
            ].join('\n'),
        );
    });

    it('однострочный разбор — через точку, как раньше', () => {
        const value = checklistValue(
            { fiveKDone: false, fiveKAnalysis: 'коллеги не выяснены' },
            'Чек-лист 5К',
        );
        expect(value).toBe('не выполнен. коллеги не выяснены');
    });

    it('многострочный обычный текст — без изменений, с новой строки', () => {
        const text = '1. КЛИЕНТ — ✓ юрист\n2. КОМПАНИЯ — ✗ не выяснено';
        const value = checklistValue(
            { fiveKDone: false, fiveKAnalysis: text },
            'Чек-лист 5К',
        );
        expect(value).toBe(`не выполнен.\n${text}`);
    });
});
