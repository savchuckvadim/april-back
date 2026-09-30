import {
    aboutMonths,
    type AiAboutEndpointText,
    type AiAboutNumbers,
} from './ai-analytics-about.const';
import {
    AI_ABOUT_SHARED_PARAMS,
    AI_ABOUT_STAGE_PARAMS,
} from './ai-analytics-about.params.const';

/**
 * Тексты блока «Как считаем» для прогноза отдела (Фаза 4, план §4.8,
 * §10). Вынесены из `ai-analytics-about.texts.const.ts` по лимиту 300
 * строк. Правило владельца: простым русским, без формул и кодов; числа
 * подставляет билдер из реестра портала.
 *
 * Перечень кодов закреплён `__tests__/about.spec.ts` (транзитивный скан
 * исходников ручки прогноза).
 */

/** Доля 0..1 → проценты: 0,8 → 80. */
const pct = (share: number): number => Math.round(share * 100);
/** Доля 0..1 → «8 из 10». */
const outOfTen = (share: number): string => `${Math.round(share * 10)} из 10`;

export const AI_ABOUT_FORECAST_TEXT: AiAboutEndpointText = {
    endpoint: 'forecast',
    title: 'Прогноз продаж отдела на месяц',
    purpose:
        'Вилка продаж отдела до конца месяца: сколько закроется при ' +
        'текущем темпе и сделках в работе, и насколько прогноз точен на ' +
        'прошлых месяцах.',
    sources: [
        'закрытые продажи месяца на сегодня',
        'сделки в работе и сроки оплаты по истории портала',
        'ежедневный прогноз по менеджерам, сложенный по отделу',
        'факт продаж прошлых месяцев — для проверки точности',
        'обычный чек закрытых сделок (не среднее: редкие крупные сделки ' +
            'его не раздувают) — для вилки в деньгах; пока своих продаж ' +
            'мало, берётся чек по умолчанию, и карточка об этом пишет',
    ],
    howToRead: [
        (numbers: AiAboutNumbers): string =>
            'вилка — диапазон, в который факт месяца попадает примерно в ' +
            `${outOfTen(numbers.value('forecast_interval_level'))} случаях`,
        (numbers: AiAboutNumbers): string =>
            'сначала прогноз считается без показа и после каждого ' +
            'закрытого месяца сверяется с фактом; открыть показ можно ' +
            'не раньше, чем через ' +
            `${aboutMonths(numbers.value('forecast_shadow_min_months'))} ` +
            'такой сверки',
        (numbers: AiAboutNumbers): string =>
            'прогноз принимается, если факт попадает в вилку примерно в ' +
            `${pct(numbers.value('forecast_coverage_target'))} % дней и ` +
            'прогноз ошибается реже простых правил «по темпу с начала месяца» ' +
            'и «среднее за три месяца»',
        (numbers: AiAboutNumbers): string =>
            'пока закрытых месяцев меньше ' +
            `${aboutMonths(numbers.value('forecast_backtest_min_months'))}, ` +
            'точность не оценивается — данных мало, это не провал',
        'показ вилки включает разработчик после того, как проверка на ' +
            'истории пройдена',
    ],
    notDoing: [
        'не показывает вилку, пока проверка на истории не пройдена',
        'не прогнозирует отдельного менеджера — только отдел целиком',
        'не обещает выполнение плана: это оценка при текущем темпе',
    ],
    params: [
        ...AI_ABOUT_SHARED_PARAMS,
        ...AI_ABOUT_STAGE_PARAMS,
        'forecast_backtest_min_months',
        'forecast_interval_level',
        'forecast_coverage_target',
        'forecast_mase_max',
    ],
};
