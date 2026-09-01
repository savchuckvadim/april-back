import {
    buildSurveyTemplateText,
    FIVE_K_TEMPLATES,
    isSurveyTemplateOnly,
    stripSurveyTemplate,
    SURVEY_TEMPLATES,
    surveyTemplateByCode,
    XVOST_TEMPLATES,
} from '../presentation-survey.templates';
import { normalizePresentationSurvey } from '../presentation-survey.values';

/**
 * Шаблон вопросов внутри поля — и главное, что из него следует.
 *
 * Раньше пустая строка означала «не отвечали», и на этом стояла гарантия
 * анкеты: пустое в портал не пишется, чтобы не стереть чужой ответ. С
 * шаблоном внутри поле не бывает пустым никогда, поэтому «менеджер не
 * трогал» теперь отдельный вопрос — и этот файл про него.
 */

const desire = XVOST_TEMPLATES[0]!; // ЖЕЛАНИЕ РАБОТАТЬ С ГАРАНТОМ, 3 вопроса
const priceReaction = XVOST_TEMPLATES[2]!; // РЕАКЦИЯ НА ЦЕНУ, 1 вопрос

describe('состав шаблонов', () => {
    it('пять блоков «5К» и пять блоков «Хвоста»', () => {
        expect(FIVE_K_TEMPLATES).toHaveLength(5);
        expect(XVOST_TEMPLATES).toHaveLength(5);
        expect(SURVEY_TEMPLATES).toHaveLength(10);
    });

    it('семнадцать подвопросов в «5К», одиннадцать в «Хвосте»', () => {
        const count = (blocks: typeof FIVE_K_TEMPLATES) =>
            blocks.reduce((sum, block) => sum + block.questions.length, 0);
        expect(count(FIVE_K_TEMPLATES)).toBe(17);
        expect(count(XVOST_TEMPLATES)).toBe(11);
    });

    it('коды уникальны — иначе один блок затирал бы другой', () => {
        const codes = SURVEY_TEMPLATES.map(block => block.code);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('пустых блоков и пустых вопросов нет', () => {
        for (const block of SURVEY_TEMPLATES) {
            expect(block.questions.length).toBeGreaterThan(0);
            for (const question of block.questions) {
                expect(question.trim()).not.toBe('');
            }
        }
    });

    it('поиск по коду находит блок, чужой код даёт null', () => {
        expect(surveyTemplateByCode(desire.code)).toBe(desire);
        expect(surveyTemplateByCode('op_presentation_5k')).toBeNull();
    });
});

describe('buildSurveyTemplateText', () => {
    it('нумерация в каждом блоке начинается с единицы', () => {
        expect(buildSurveyTemplateText(desire)).toBe(
            [
                '1. Первое впечатление о системе',
                '2. Что особенно запомнилось',
                '3. С чем клиент хотел бы работать в Гаранте',
            ].join('\n'),
        );
        // Второй блок тоже с единицы, а не с продолжения сквозного счёта.
        expect(buildSurveyTemplateText(priceReaction)).toBe(
            '1. Реакция клиента на цену',
        );
    });
});

describe('stripSurveyTemplate — что менеджер дописал', () => {
    it('нетронутый шаблон не даёт ни одного ответа', () => {
        expect(stripSurveyTemplate(buildSurveyTemplateText(desire), desire)).toBe(
            '',
        );
    });

    it('ответ следующей строкой', () => {
        const value = [
            '1. Первое впечатление о системе',
            'Понравилось, смотрел внимательно',
            '2. Что особенно запомнилось',
            '3. С чем клиент хотел бы работать в Гаранте',
        ].join('\n');

        expect(stripSurveyTemplate(value, desire)).toBe(
            'Понравилось, смотрел внимательно',
        );
    });

    it('ответ в той же строке после вопроса — через любой разделитель', () => {
        const value = [
            '1. Первое впечатление о системе — понравилось',
            '2. Что особенно запомнилось: таблицы',
            '3. С чем клиент хотел бы работать в Гаранте',
        ].join('\n');

        expect(stripSurveyTemplate(value, desire)).toBe(
            'понравилось\nтаблицы',
        );
    });

    it('переносы и лишние пробелы шаблон не ломают', () => {
        const value = [
            '',
            '  1.   Первое впечатление о системе  ',
            '',
            '2) Что особенно запомнилось',
            '3. С чем клиент хотел бы работать   в Гаранте',
            '',
        ].join('\r\n');

        expect(stripSurveyTemplate(value, desire)).toBe('');
    });

    it('текст без шаблона вовсе считается ответом целиком', () => {
        expect(stripSurveyTemplate('просто ответ', desire)).toBe('просто ответ');
    });
});

describe('isSurveyTemplateOnly', () => {
    it.each([
        ['пусто', ''],
        ['пробелы', '   \n  '],
        ['нетронутый шаблон', buildSurveyTemplateText(desire)],
    ])('%s → поле не трогали', (_name, value) => {
        expect(isSurveyTemplateOnly(value, desire)).toBe(true);
    });

    it.each([
        ['не строка', null],
        ['не строка', undefined],
    ])('%s → поле не трогали', (_name, value) => {
        expect(isSurveyTemplateOnly(value, desire)).toBe(true);
    });

    it('хотя бы один ответ — поле тронули', () => {
        const value = `${buildSurveyTemplateText(desire)}\nпонравилось`;
        expect(isSurveyTemplateOnly(value, desire)).toBe(false);
    });

    /*
     * Крайние случаи, на которых спотыкался построчный разбор: он вычитал из
     * значения все строки-вопросы и смотрел на остаток, поэтому ответ,
     * совпавший с текстом вопроса, и ответ вида «5)» схлопывались в пустоту —
     * поле считалось нетронутым, и ответ менеджера пропадал молча. Сравнение
     * с эталоном целиком таких дыр не имеет.
     */
    it('ответ, дословно совпавший с вопросом, НЕ считается шаблоном', () => {
        const value = `${buildSurveyTemplateText(
            desire,
        )}\nПервое впечатление о системе`;
        expect(isSurveyTemplateOnly(value, desire)).toBe(false);
    });

    it('ответ из одной нумерации («5)») НЕ считается шаблоном', () => {
        const value = `${buildSurveyTemplateText(desire)}\n5)`;
        expect(isSurveyTemplateOnly(value, desire)).toBe(false);
    });

    it('удалённая строка шаблона — тоже правка, а не нетронутое поле', () => {
        const value = buildSurveyTemplateText(desire)
            .split('\n')
            .slice(0, 2)
            .join('\n');
        expect(isSurveyTemplateOnly(value, desire)).toBe(false);
    });
});

describe('нормализация ответов уважает шаблон', () => {
    it('нетронутое поле НЕ попадает в ответы — иначе затрёт чужое', () => {
        const values = normalizePresentationSurvey({
            talk: {
                [desire.code]: buildSurveyTemplateText(desire),
                [priceReaction.code]: `${buildSurveyTemplateText(
                    priceReaction,
                )} — сказал, что дорого`,
            },
        });

        expect(values.talk.has(desire.code)).toBe(false);
        // А тронутое доезжает ЦЕЛИКОМ, вместе с вопросами: владелец решил,
        // что вопросы должны быть видны и в карточке.
        expect(values.talk.get(priceReaction.code)).toBe(
            '1. Реакция клиента на цену — сказал, что дорого',
        );
    });

    it('коды вне whitelist попадают в droppedCodes, а не в тишину', () => {
        const values = normalizePresentationSurvey({
            fiveK: { op_5k_client_what: 'старый код легаси-фронта' },
        });

        expect(values.fiveK.size).toBe(0);
        expect(values.droppedCodes).toEqual(['op_5k_client_what']);
    });

    it('пустое значение под чужим кодом потерей не считается', () => {
        const values = normalizePresentationSurvey({
            fiveK: { op_5k_client_what: '   ' },
        });

        expect(values.droppedCodes).toEqual([]);
    });
});
