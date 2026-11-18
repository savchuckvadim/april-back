import {
    methodologyDisplayTitle,
    POLYANSKY_DISPLAY_TITLE,
} from '../methodology-display-title';
import {
    POLYANSKY_METHODOLOGY,
    POLYANSKY_METHODOLOGY_CODE,
} from '../polyansky.methodology';

/**
 * Имя методики для людей (решение 18.11.2026): «Методика Полянского» вместо
 * «Полянский», без «Методика «Методика …»», своё название — в кавычках.
 */
describe('methodologyDisplayTitle', () => {
    it('встроенная Полянского по коду → «Методика Полянского»', () => {
        expect(
            methodologyDisplayTitle({
                code: POLYANSKY_METHODOLOGY_CODE,
                title: POLYANSKY_METHODOLOGY.title,
            }),
        ).toBe('Методика Полянского');
        expect(POLYANSKY_DISPLAY_TITLE).toBe('Методика Полянского');
    });

    it('строка таблицы с кодом встроенной сохраняет хвост названия', () => {
        expect(
            methodologyDisplayTitle({
                code: 'polyansky',
                title: 'Полянский (gsr)',
            }),
        ).toBe('Методика Полянского (gsr)');
        expect(
            methodologyDisplayTitle({
                code: 'polyansky',
                title: ' Полянский ',
            }),
        ).toBe('Методика Полянского');
    });

    it('код встроенной, но название другое — по общим правилам', () => {
        expect(
            methodologyDisplayTitle({ code: 'polyansky', title: 'Полянскийи' }),
        ).toBe('Методика «Полянскийи»');
        expect(
            methodologyDisplayTitle({ code: 'polyansky', title: 'Наш скрипт' }),
        ).toBe('Методика «Наш скрипт»');
        expect(
            methodologyDisplayTitle({
                code: 'polyansky',
                title: 'Методика Полянского v2',
            }),
        ).toBe('Методика Полянского v2');
    });

    it('название уже начинается со слова «методика» — как есть, с заглавной', () => {
        expect(
            methodologyDisplayTitle({
                code: 'voronezh',
                title: 'методика Воронежа',
            }),
        ).toBe('Методика Воронежа');
        expect(
            methodologyDisplayTitle({ code: 'b2b', title: 'МЕТОДИКА B2B' }),
        ).toBe('МЕТОДИКА B2B');
        expect(
            methodologyDisplayTitle({ code: 'solo', title: 'Методика' }),
        ).toBe('Методика');
        expect(
            methodologyDisplayTitle({
                code: 'quoted',
                title: 'Методика «Три шага»',
            }),
        ).toBe('Методика «Три шага»');
    });

    it('слово, лишь начинающееся на «методика», — не «методика»', () => {
        expect(
            methodologyDisplayTitle({ code: 'x', title: 'Методикам ОП' }),
        ).toBe('Методика «Методикам ОП»');
    });

    it('своё название — в кавычках; кода нет (старая запись) — тоже', () => {
        expect(
            methodologyDisplayTitle({ code: 'spin', title: 'SPIN-продажи' }),
        ).toBe('Методика «SPIN-продажи»');
        expect(
            methodologyDisplayTitle({ code: null, title: 'Полянский' }),
        ).toBe('Методика «Полянский»');
    });
});
