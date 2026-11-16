import {
    parseAiSettingsJson,
    positiveInteger,
    positiveNumber,
} from '../portal-ai-settings.json.util';

/** 16.11.2026: лимиты настроек AI портала — «не задано» хранится отсутствием ключа. */
describe('настройки AI портала: лимиты ночного догона и Яндекса', () => {
    it('положительное число: ноль, пусто, null и мусор — не задано', () => {
        expect(positiveNumber(1500)).toBe(1500);
        expect(positiveNumber('0.5')).toBe(0.5);
        for (const empty of [0, -3, null, undefined, '', 'много', NaN]) {
            expect(positiveNumber(empty)).toBeUndefined();
        }
    });

    it('положительное целое: дробная часть отбрасывается, меньше единицы — не задано', () => {
        expect(positiveInteger(200)).toBe(200);
        expect(positiveInteger(200.9)).toBe(200);
        expect(positiveInteger(0.4)).toBeUndefined();
        expect(positiveInteger(null)).toBeUndefined();
    });

    it('JSON настроек: оба лимита читаются, нулевые и кривые — как не заданные', () => {
        expect(
            parseAiSettingsJson({
                factsCatchupNightlyBudgetRub: 100,
                factsCatchupNightlyMaxCalls: 200,
                yandexMonthlyBudgetRub: 1500,
            }),
        ).toMatchObject({
            factsCatchupNightlyBudgetRub: 100,
            factsCatchupNightlyMaxCalls: 200,
            yandexMonthlyBudgetRub: 1500,
        });

        const empty = parseAiSettingsJson({
            factsCatchupNightlyMaxCalls: 0,
            yandexMonthlyBudgetRub: 'нет',
        });
        expect(empty.factsCatchupNightlyBudgetRub).toBeUndefined();
        expect(empty.factsCatchupNightlyMaxCalls).toBeUndefined();
        expect(empty.yandexMonthlyBudgetRub).toBeUndefined();
    });
});
