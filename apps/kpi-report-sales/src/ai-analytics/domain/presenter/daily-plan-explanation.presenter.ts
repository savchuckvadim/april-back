/**
 * Объяснение плана дня словами (план Фазы 2, §5.2, поток 17): шаги
 * строго в порядке расчёта (цель → закрыто → сделки в работе → нужный
 * объём → разворот по воронке → потолок дня) и одно итоговое
 * предложение. Число каждого шага берётся ИЗ САМОГО DTO — так объяснение
 * нельзя разойтись с планом, а текст пишется по правилу владельца: без
 * формул, обозначений и кодов рёбер — только русские слова.
 *
 * Вынесено из `daily-plan.presenter.ts` по лимиту 300 строк. Чистые
 * функции: без DI, Bitrix и Prisma, без `new Date()`.
 */
import {
    RU_FORMS,
    ruCount,
    ruInt,
    type RuPluralForms,
} from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_FUNNEL_EDGE_CODES } from '../../constants/ai-overview.const';
import {
    AI_DAILY_PLAN_REASON_TEXTS,
    AI_DAILY_PLAN_STEP_CODES,
    AI_DAILY_PLAN_TARGET_SOURCE_TEXTS,
    dailyPlanActivityForms,
} from '../../constants/ai-plan.const';
import type {
    AiDailyPlanExplanationDto,
    AiDailyPlanItemDto,
    AiDailyPlanStepDto,
} from '../../dto/ai-daily-plan.dto';
import type { DailyPlanView } from '../assembler/daily-plan-input.types';

const ACTIVITY_FALLBACK_FORMS: RuPluralForms = [
    'активность',
    'активности',
    'активностей',
];

/** Место ребра в справочнике воронки; чужой код — в конец. */
function edgeIndex(callType: string): number {
    const index = (AI_ANALYTICS_FUNNEL_EDGE_CODES as readonly string[]).indexOf(
        callType,
    );

    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/** Строки плана в порядке воронки: входная активность первой. */
export function funnelOrdered(
    items: readonly AiDailyPlanItemDto[],
): AiDailyPlanItemDto[] {
    return [...items].sort(
        (a, b) => edgeIndex(a.callType) - edgeIndex(b.callType),
    );
}

/** Формы активности ребра; чужое ребро — «активность». */
const activityFormsOf = (callType: string): RuPluralForms =>
    dailyPlanActivityForms(callType) ?? ACTIVITY_FALLBACK_FORMS;

/** «250 звонков» — объём строки словами по её ребру. */
const itemCount = (item: AiDailyPlanItemDto, value: number): string =>
    ruCount(ruInt(value), activityFormsOf(item.callType));

/** Подпись строки в перечислении: «звонков — 250»; чужое ребро — по названию. */
function itemLabel(item: AiDailyPlanItemDto): string {
    const forms = dailyPlanActivityForms(item.callType);

    return forms === null ? item.title : forms[2];
}

/** Сколько продаж ещё нужно добрать: цель минус закрытое и сделки в работе. */
function remainingSales(view: DailyPlanView): number {
    return Math.max(
        0,
        ruInt(
            view.target.value - view.doneSales - (view.pipelineExpected ?? 0),
        ),
    );
}

const dealsText = (value: number): string =>
    ruCount(ruInt(value), RU_FORMS.deals);

/** Шаги «цель» и «закрыто» — начало цепочки объяснения. */
function goalSteps(view: DailyPlanView): AiDailyPlanStepDto[] {
    const source = AI_DAILY_PLAN_TARGET_SOURCE_TEXTS[view.target.source];

    return [
        {
            code: AI_DAILY_PLAN_STEP_CODES.target,
            value: view.target.value,
            text: `Цель на месяц — ${dealsText(view.target.value)} (${source}).`,
        },
        {
            code: AI_DAILY_PLAN_STEP_CODES.doneSales,
            value: view.doneSales,
            text: `Уже закрыто в этом месяце: ${dealsText(view.doneSales)}.`,
        },
    ];
}

function pipelineText(view: DailyPlanView): string {
    if (view.pipelineExpected === null) {
        return view.volumeBased
            ? 'Сделки в работе не учитываем: прогноза на эту дату нет — ' +
                  'цель не уменьшаем.'
            : 'Сделки в работе не учитываем: нет истории движения сделок ' +
                  'по стадиям — цель не уменьшаем.';
    }
    const expected = ruInt(view.pipelineExpected);

    return expected === 0
        ? 'Из сделок, которые уже в работе, дополнительных продаж пока не ожидаем.'
        : 'Из сделок, которые уже в работе, ожидаем ещё около ' +
              `${ruCount(expected, RU_FORMS.salesGenitive)}.`;
}

function requiredVolumeText(
    view: DailyPlanView,
    entryForms: RuPluralForms,
): string {
    if (view.requiredVolume === null) {
        return (
            'Сколько нужно активностей, по нормам не считаем: план ' +
            'построен по объёму — остаток месяца берём из плана ' +
            'руководителя, а без него из темпа отработанных дней.'
        );
    }
    const remaining = remainingSales(view);
    if (remaining === 0) {
        return 'Цель на месяц уже закрыта: по нормам добирать нечего.';
    }

    return (
        `Чтобы добрать ещё ${ruCount(remaining, RU_FORMS.salesAccusative)}, ` +
        'при нынешней конверсии воронки до конца месяца нужно около ' +
        `${ruCount(ruInt(view.requiredVolume), entryForms)}.`
    );
}

/**
 * Шаги «сделки в работе» и «нужный объём». В деградации (`volumeBased`)
 * обратную задачу никто не решал: оба числа равны null, а текст называет
 * настоящую причину — иначе «нужно 0» противоречил бы непустым строкам.
 */
function volumeSteps(
    view: DailyPlanView,
    entryForms: RuPluralForms,
): AiDailyPlanStepDto[] {
    return [
        {
            code: AI_DAILY_PLAN_STEP_CODES.pipeline,
            value: view.pipelineExpected,
            text: pipelineText(view),
        },
        {
            code: AI_DAILY_PLAN_STEP_CODES.requiredVolume,
            value: view.requiredVolume,
            text: requiredVolumeText(view, entryForms),
        },
    ];
}

/** Шаги разворота по рёбрам и потолка дня — то, что видно в строках. */
function planSteps(
    ordered: readonly AiDailyPlanItemDto[],
    daysLeft: number,
): AiDailyPlanStepDto[] {
    const entry = ordered[0];
    const unwind = ordered
        .map(item => `${itemLabel(item)} — ${ruInt(item.monthPlan)}`)
        .join(', ');
    const today =
        entry === undefined
            ? ''
            : `сегодня — ${itemCount(entry, entry.requiredToday)}.`;

    return [
        {
            code: AI_DAILY_PLAN_STEP_CODES.unwind,
            value: entry === undefined ? null : entry.monthPlan,
            text:
                entry === undefined
                    ? 'По воронке разворачивать нечего: строк плана нет.'
                    : `По воронке за месяц это: ${unwind}.`,
        },
        {
            code: AI_DAILY_PLAN_STEP_CODES.ceiling,
            value: entry === undefined ? null : entry.requiredToday,
            text:
                entry === undefined
                    ? 'Дневной максимум применять не к чему: строк плана нет.'
                    : daysLeft > 0
                      ? `Оставшееся делим на ${ruCount(daysLeft, RU_FORMS.workdays)}, ` +
                        `но не больше дневного максимума: ${today}`
                      : `Рабочих дней до конца месяца не осталось: ${today}`,
        },
    ];
}

/**
 * Причина деградации словами — хвост текста объяснения. Незнакомый код
 * (старая запись в кэше) остаётся без подписи, но не превращает текст в
 * «undefined»: объяснение читает человек.
 */
function tailText(view: DailyPlanView): string {
    if (view.reason === null) return '';
    const texts: Partial<Record<string, string>> = AI_DAILY_PLAN_REASON_TEXTS;
    const text = texts[view.reason];

    return text === undefined ? '' : `${text}.`;
}

/** Одно предложение о всей цепочке — для карточки без раскрытия шагов. */
function summaryText(
    view: DailyPlanView,
    ordered: readonly AiDailyPlanItemDto[],
    entryForms: RuPluralForms,
): string {
    const source = AI_DAILY_PLAN_TARGET_SOURCE_TEXTS[view.target.source];
    const goal =
        `Цель на месяц — ${dealsText(view.target.value)} (${source}), ` +
        `уже закрыто ${ruInt(view.doneSales)}`;
    const pipeline =
        view.pipelineExpected !== null && ruInt(view.pipelineExpected) > 0
            ? `, из сделок в работе ждём ещё около ${ruInt(view.pipelineExpected)}`
            : '';
    const remaining = remainingSales(view);
    const required =
        view.requiredVolume === null
            ? 'план построен по объёму прошлого темпа'
            : remaining === 0
              ? 'цель уже закрыта'
              : `чтобы добрать ещё ${ruCount(remaining, RU_FORMS.salesAccusative)}, ` +
                `до конца месяца нужно около ${ruCount(ruInt(view.requiredVolume), entryForms)}`;
    const entry = ordered[0];
    const today =
        entry === undefined
            ? ''
            : `, сегодня — ${itemCount(entry, entry.requiredToday)}`;

    return `${goal}${pipeline}; ${required}${today}.`;
}

/**
 * Объяснение плана дня: шаги и итоговое предложение. `items` — уже
 * собранные строки DTO (числа шагов берутся из них), порядок воронки
 * выстраивается здесь — входная активность первой.
 */
export function buildDailyPlanExplanation(
    view: DailyPlanView,
    items: readonly AiDailyPlanItemDto[],
): AiDailyPlanExplanationDto {
    const ordered = funnelOrdered(items);
    const entry = ordered[0];
    const forms =
        entry === undefined
            ? ACTIVITY_FALLBACK_FORMS
            : activityFormsOf(entry.callType);
    const steps = [
        ...goalSteps(view),
        ...volumeSteps(view, forms),
        ...planSteps(ordered, view.daysLeft),
    ];

    return {
        steps,
        text: [summaryText(view, ordered, forms), tailText(view)]
            .filter(part => part.length > 0)
            .join(' '),
    };
}
