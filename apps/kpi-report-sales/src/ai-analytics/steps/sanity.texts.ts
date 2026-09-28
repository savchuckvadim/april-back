/**
 * Тексты предупреждений санити-панели словами (правило владельца: без
 * кодов уровней, стадий и типов звонков, без «p25/p50/p90», «n = …» и
 * «dq-гейт»). Правила (`sanity.rules.ts`) решают, есть ли расхождение;
 * здесь — только как сказать о нём руководителю.
 *
 * Менеджеры в панели без имён (только Bitrix-id), поэтому текст говорит
 * «у одного из менеджеров» — id руководителю ничего не скажет.
 *
 * Чистые функции: без DI, Битрикс и снапшотов.
 */
import {
    callTypeTitleOf,
    managerLevelLabel,
    RU_FORMS,
    ruCount,
    type RuPluralForms,
    type StageSlaFact,
} from '@lib/sales-ai-analytics';
import { AI_SANITY_SLA_STAGE_TITLES } from './sanity.types';

const PERCENT = 100;
const SECONDS_IN_MINUTE = 60;

/** «по 8 месяцам работы» — дательный падеж. */
const MONTHS_DATIVE: RuPluralForms = ['месяцу', 'месяцам', 'месяцам'];
/** «по 12 сделкам». */
const DEALS_DATIVE: RuPluralForms = ['сделке', 'сделкам', 'сделкам'];
/** «по 10 звонкам». */
const CALLS_DATIVE: RuPluralForms = ['звонку', 'звонкам', 'звонкам'];
/** «дольше 21 дня», «дольше 14 дней» — родительный падеж. */
const DAYS_GENITIVE: RuPluralForms = ['дня', 'дней', 'дней'];
/** «5 минут», «1 минута» — при пороге (именительный). */
const MINUTES: RuPluralForms = ['минута', 'минуты', 'минут'];
const SECONDS: RuPluralForms = ['секунда', 'секунды', 'секунд'];
/** «от 2 минут до 15 минут» — родительный падеж. */
const MINUTES_GENITIVE: RuPluralForms = ['минуты', 'минут', 'минут'];
const SECONDS_GENITIVE: RuPluralForms = ['секунды', 'секунд', 'секунд'];
/** «4 тревожных сигнала за неделю». */
const SIGNALS: RuPluralForms = [
    'тревожный сигнал',
    'тревожных сигнала',
    'тревожных сигналов',
];
/** «у 3 менеджеров» — родительный падеж. */
const MANAGERS_GENITIVE: RuPluralForms = [
    'менеджера',
    'менеджеров',
    'менеджеров',
];

/**
 * Длительность словами: до минуты — в секундах, дальше — в целых минутах
 * (дробные минуты руководителю не нужны, а склонение дробей у форм в
 * родительном падеже ломается).
 */
function durationWords(
    seconds: number,
    minutes: RuPluralForms,
    secondsForms: RuPluralForms,
): string {
    if (seconds < SECONDS_IN_MINUTE) {
        return ruCount(Math.round(seconds), secondsForms);
    }
    return ruCount(Math.round(seconds / SECONDS_IN_MINUTE), minutes);
}

/** Цель уровня против обычного результата менеджеров этого уровня. */
export function targetWarning(
    level: string,
    targetSales: number,
    median: number,
    observations: number,
): string {
    return (
        `Цель для уровня «${managerLevelLabel(level)}» — ` +
        `${ruCount(targetSales, RU_FORMS.sales)} в месяц, а обычный ` +
        'результат менеджеров этого уровня за последние месяцы — ' +
        `${ruCount(median, RU_FORMS.sales)} ` +
        `(по ${ruCount(observations, MONTHS_DATIVE)} работы): цель и факт ` +
        'разошлись больше чем в полтора раза'
    );
}

/** Договорённость о сроке стадии против фактических сроков сделок. */
export function slaWarning(
    stage: string,
    agreedDays: number,
    fact: StageSlaFact,
): string {
    const title = AI_SANITY_SLA_STAGE_TITLES[stage];
    const where =
        title === undefined
            ? 'Срок на одной из стадий'
            : `Срок на стадии «${title}»`;
    const tail =
        fact.p90 > fact.p50
            ? `, каждая десятая — дольше ${ruCount(fact.p90, DAYS_GENITIVE)}`
            : '';
    return (
        `${where}: договорились не дольше ` +
        `${ruCount(agreedDays, DAYS_GENITIVE)}, а половина сделок стоит ` +
        `дольше ${ruCount(fact.p50, DAYS_GENITIVE)}${tail} ` +
        `(по ${ruCount(fact.n, DEALS_DATIVE)}) — половина сделок вне ` +
        'договорённости'
    );
}

/** Порог длительности отрезает слишком большую долю звонков типа. */
export function durationWarning(
    callType: string,
    thresholdSec: number,
    cutShare: number,
    quantiles: { p10: number; p50: number; p90: number },
    observations: number,
): string {
    const typical = (seconds: number): string =>
        durationWords(seconds, MINUTES_GENITIVE, SECONDS_GENITIVE);
    return (
        `Порог длительности для звонков типа «${callTypeTitleOf(callType)}» — ` +
        `${durationWords(thresholdSec, MINUTES, SECONDS)}: он отрезает ` +
        `${Math.round(cutShare * PERCENT)} % таких звонков, хотя обычно ` +
        `такой звонок длится от ${typical(quantiles.p10)} до ` +
        `${typical(quantiles.p90)}, а половина — дольше ` +
        `${typical(quantiles.p50)} (по ${ruCount(observations, CALLS_DATIVE)})`
    );
}

/** Слишком много тревожных сигналов по звонкам одного менеджера. */
export function alertsWarning(alerts: number, limit: number): string {
    return (
        `У одного из менеджеров ${ruCount(alerts, SIGNALS)} за неделю ` +
        `при допустимых ${limit} — разбирать столько некогда, сигнал ` +
        'тонет в шуме'
    );
}

/** Отсутствия угаданы по тишине телефонии, а не заведены руками. */
export function exposureWarning(managers: number): string {
    const who =
        managers === 1
            ? 'У одного из менеджеров'
            : `У ${ruCount(managers, MANAGERS_GENITIVE)}`;
    return (
        `${who} отсутствия за последние месяцы не заведены руками, а ` +
        'угаданы по тишине в телефонии — такие месяцы в расчёт норм не ' +
        'идут; отсутствия стоит завести в настройках'
    );
}

/** Продажи закрыты раньше презентации или счёта — датам нельзя верить. */
export function timestampLeakWarning(fact: {
    leaked: number;
    n: number;
    sharePct: number;
    maxPct: number;
}): string {
    return (
        `Даты в сделках не сходятся: ${fact.leaked} из ${fact.n} продаж ` +
        'закрыты раньше последней презентации или счёта ' +
        `(${fact.sharePct} % при пороге ` +
        `${Math.round(fact.maxPct * PERCENT)} %) — сделки оформлены ` +
        'задним числом, этим цифрам пока нельзя доверять'
    );
}
