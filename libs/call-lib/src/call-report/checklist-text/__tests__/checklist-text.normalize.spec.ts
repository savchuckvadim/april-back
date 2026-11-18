import {
    FIVE_K_TEXT_BLOCKS,
    HVOST_TEXT_BLOCKS,
    normalizeFiveKAnalysisText,
    normalizeHvostAnalysisText,
} from '../index';

describe('текст разбора чек-листа: запись словаря → строки по блокам', () => {
    it('подписи блоков взяты из каталога полей смарта, порядок анкеты', () => {
        expect(FIVE_K_TEXT_BLOCKS.map(block => block.label)).toEqual([
            'Клиент',
            'Компания',
            'Коллеги',
            'Конкурент',
            'Критерии выбора',
        ]);
        expect(HVOST_TEXT_BLOCKS.map(block => block.label)).toEqual([
            'Желание работать с Гарантом',
            'Что предложили',
            'Реакция на цену',
            'Процесс принятия решения',
            'Выход на решение',
        ]);
    });

    it('запись в одинарных кавычках (как у Python) — строки по блокам, без «;»', () => {
        const raw =
            "{'client': 'Бухгалтер, ведёт учёт склада;', 'company': 'не выяснено;', " +
            "'colleagues': 'не выяснено;', 'competitor': 'работает с другой системой ;', " +
            "'criteria': 'сравнивает цену и наполнение;'}";
        expect(normalizeFiveKAnalysisText(raw)).toBe(
            [
                'Клиент: Бухгалтер, ведёт учёт склада',
                'Компания: не выяснено',
                'Коллеги: не выяснено',
                'Конкурент: работает с другой системой',
                'Критерии выбора: сравнивает цену и наполнение',
            ].join('\n'),
        );
    });

    it('JSON в двойных кавычках, порядок ключей — как в анкете', () => {
        const raw = JSON.stringify({
            criteria: 'цена',
            client: 'Кадровик',
            company: 'ООО «Вектор»',
        });
        expect(normalizeFiveKAnalysisText(raw)).toBe(
            [
                'Клиент: Кадровик',
                'Компания: ООО «Вектор»',
                'Критерии выбора: цена',
            ].join('\n'),
        );
    });

    it('апостроф внутри значения не рвёт запись', () => {
        const raw =
            "{'client': 'Юрист, говорит 'посмотрим';', 'company': \"Кафе 'У моря'\"}";
        expect(normalizeFiveKAnalysisText(raw)).toBe(
            [
                "Клиент: Юрист, говорит 'посмотрим'",
                "Компания: Кафе 'У моря'",
            ].join('\n'),
        );
    });

    it("экранированный апостроф (\\') раскрывается", () => {
        const raw = "{'client': 'клиент\\'s choice'}";
        expect(normalizeFiveKAnalysisText(raw)).toBe("Клиент: клиент's choice");
    });

    it('перенос строки внутри значения и вокруг пар — одна строка на блок', () => {
        const raw =
            "{\n  'client': 'Директор,\n  решает сам;',\n  'company': 'Магазин'\n}";
        expect(normalizeFiveKAnalysisText(raw)).toBe(
            ['Клиент: Директор, решает сам', 'Компания: Магазин'].join('\n'),
        );
    });

    it('None и null — «не выяснено»', () => {
        expect(
            normalizeFiveKAnalysisText("{'client': None, 'company': 'Склад'}"),
        ).toBe(['Клиент: не выяснено', 'Компания: Склад'].join('\n'));
        expect(normalizeFiveKAnalysisText('{"client": null}')).toBe(
            'Клиент: не выяснено',
        );
    });

    it('пустое значение и одна «;» — «не выяснено»', () => {
        expect(
            normalizeFiveKAnalysisText("{'client': '', 'company': ';'}"),
        ).toBe(['Клиент: не выяснено', 'Компания: не выяснено'].join('\n'));
    });

    it('значение-список строк склеивается через «; »', () => {
        expect(
            normalizeFiveKAnalysisText(
                "{'colleagues': ['бухгалтер Анна', 'кадровик Олег;']}",
            ),
        ).toBe('Коллеги: бухгалтер Анна; кадровик Олег');
    });

    it('незнакомые ключи — в конце как есть', () => {
        expect(
            normalizeFiveKAnalysisText(
                "{'note': 'перезвонить', 'client': 'Инженер'}",
            ),
        ).toBe(['Клиент: Инженер', 'note: перезвонить'].join('\n'));
    });

    it('«хвост» в виде словаря — подписи хвоста', () => {
        const raw =
            "{'desire': 'понравился поиск;', 'offered': None, " +
            "'priceReaction': 'дорого', 'decisionProcess': 'решает директор', " +
            "'decisionWay': 'созвон в пятницу;'}";
        expect(normalizeHvostAnalysisText(raw)).toBe(
            [
                'Желание работать с Гарантом: понравился поиск',
                'Что предложили: не выяснено',
                'Реакция на цену: дорого',
                'Процесс принятия решения: решает директор',
                'Выход на решение: созвон в пятницу',
            ].join('\n'),
        );
    });

    it('уже разобранный объект — те же строки', () => {
        expect(
            normalizeFiveKAnalysisText({ client: 'Кадровик;', company: null }),
        ).toBe(['Клиент: Кадровик', 'Компания: не выяснено'].join('\n'));
    });

    it('обычный текст и нумерованный список — без изменений, только края', () => {
        const plain = '  Клиент — бухгалтер\nКоллеги — не выяснено  ';
        expect(normalizeFiveKAnalysisText(plain)).toBe(
            'Клиент — бухгалтер\nКоллеги — не выяснено',
        );
        const numbered =
            '1. ЖЕЛАНИЕ РАБОТАТЬ С ГАРАНТОМ — ✓ понравилось\n2. ЧТО ПРЕДЛОЖИЛИ — ✗ не озвучено';
        expect(normalizeHvostAnalysisText(numbered)).toBe(numbered);
    });

    it('фигурные скобки без ключей анкеты — без изменений', () => {
        expect(normalizeFiveKAnalysisText("{'foo': 'bar'}")).toBe(
            "{'foo': 'bar'}",
        );
        expect(normalizeFiveKAnalysisText('{не запись}')).toBe('{не запись}');
        expect(normalizeHvostAnalysisText("{'client': 'Юрист'}")).toBe(
            "{'client': 'Юрист'}",
        );
    });

    it('пустая строка, null и не строка — без исключений', () => {
        expect(normalizeFiveKAnalysisText('')).toBe('');
        expect(normalizeFiveKAnalysisText('   ')).toBe('');
        expect(normalizeFiveKAnalysisText(null)).toBeNull();
        expect(normalizeFiveKAnalysisText(undefined)).toBeNull();
        expect(normalizeFiveKAnalysisText(42)).toBeNull();
        expect(normalizeFiveKAnalysisText(['client'])).toBeNull();
        expect(normalizeFiveKAnalysisText("{'client': 'обрыв")).toBe(
            "{'client': 'обрыв",
        );
        expect(normalizeFiveKAnalysisText("{'client': 'обрыв}")).toBe(
            'Клиент: обрыв',
        );
    });
});
