import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import {
    EVENT_REPORT_EVENT_TYPE,
    EventReportEventType,
} from '../../../types/event-report.event-codes';
import {
    EFieldResetRule,
    FieldPolicy,
    FieldPolicyInput,
    POLICY_KEEP,
    PolicyOutcome,
} from './event-field-policy.types';
import { increment, nearestEvent, overwrite } from './event-field-strategies';

/**
 * ТАБЛИЦА ПОЛИТИК ПОЛЕЙ: одно описание на поле — как значение получается и
 * когда обнуляется.
 *
 * Зачем таблица, а не ветки по месту: одно и то же поле пишется из шести
 * мест (компания, лид, четыре роли сделок), и «как оно считается» жило
 * размазанным по гейтам `if`. Разъехаться этим гейтам ничего не мешало — и
 * они разъезжались (см. историю `pres_count` и «последней проведённой
 * презентации» в модели полей).
 *
 * Здесь пока ТОЛЬКО те поля, которые через политику реально проходят.
 * Пустых записей «на будущее» нет намеренно: неиспользуемая политика — это
 * документация, которая начинает врать в первый же месяц.
 */

const policy = (value: FieldPolicy): FieldPolicy => value;

/**
 * «Дата следующего звонка» — ближайшее ОТКРЫТОЕ дело клиента любого типа.
 *
 * Было: слепо писалась дата только что запланированного события. У клиента
 * с двумя открытыми делами (презентация 5-го, звонок 3-го) отчёт, который
 * планирует звонок на 7-е, ставил в карточку 7-е — хотя следующим будет
 * 5-е. Поле «когда мы к этому клиенту вернёмся» врало ровно в том случае,
 * ради которого его и заводили.
 */
export const CALL_NEXT_DATE_POLICY = policy({
    code: PBX_SALES_EVENT_FIELD_CODES.call_next_date,
    why: 'Следующим будет ближайшее открытое дело, а не последнее запланированное.',
    source: { kind: 'nearestEventDate' },
    resetOn: [EFieldResetRule.final, EFieldResetRule.noOpenEvent],
});

/** Тема следующего звонка — пара к {@link CALL_NEXT_DATE_POLICY}. */
export const CALL_NEXT_NAME_POLICY = policy({
    code: PBX_SALES_EVENT_FIELD_CODES.call_next_name,
    why: 'Тема обязана описывать то же дело, что и дата рядом с ней.',
    source: { kind: 'nearestEventName' },
    resetOn: [EFieldResetRule.final, EFieldResetRule.noOpenEvent],
});

/**
 * «Дата назначенной презентации» — ближайшая открытая ПРЕЗЕНТАЦИЯ клиента.
 *
 * Было: поле обнулялось при ЛЮБОМ отчёте и заполнялось обратно, только
 * если этот же отчёт планировал презентацию. Отчёт по звонку у клиента с
 * назначенной на 5-е презентацией стирал её дату — и карточка сообщала,
 * что презентации нет, пока она есть.
 */
export const NEXT_PRES_PLAN_DATE_POLICY = policy({
    code: PBX_SALES_EVENT_FIELD_CODES.next_pres_plan_date,
    why: 'Назначенная презентация не перестаёт существовать от отчёта по звонку.',
    source: {
        kind: 'nearestEventDate',
        eventTypes: [EVENT_REPORT_EVENT_TYPE.presentation],
    },
    resetOn: [EFieldResetRule.final, EFieldResetRule.noOpenEvent],
});

/**
 * «Дата последнего звонка» — слепая перезапись «сейчас», и это ВЕРНО:
 * поле по смыслу и есть «последний контакт», вычислять там нечего.
 *
 * Отдельно: `latestDate` («максимум из текущего и нового») здесь был бы
 * ошибкой — cold-hook исторически пишет в это же поле БУДУЩИЙ дедлайн
 * холодного звонка (`event-entity.model.ts`, ветка `call_last_date`), и
 * «максимум» законсервировал бы дату из будущего навсегда. Перезапись эту
 * порчу как раз чинит.
 */
export const CALL_LAST_DATE_POLICY = policy({
    code: PBX_SALES_EVENT_FIELD_CODES.call_last_date,
    why: 'Последний контакт только что состоялся — считать нечего.',
    source: { kind: 'overwrite' },
    resetOn: [],
});

/**
 * «Проведено презентаций» — накопительный счётчик.
 *
 * Роль сделки-презентации (счётчик не копится, а равен 0/1) остаётся в
 * модели полей: это не «как считается значение», а «чей это счётчик».
 */
export const PRES_COUNT_POLICY = policy({
    code: PBX_SALES_EVENT_FIELD_CODES.pres_count,
    why: 'Счётчик клиента копится через все его сделки.',
    source: { kind: 'increment', step: 1 },
    resetOn: [],
});

/**
 * Планы, которые уводят клиента ДАЛЬШЕ доработки: решение, оплата,
 * поставка. Решение владельца 02.09.2026: «Документы» состояние не
 * трогают (документы готовят и на доработке), «Звонок» и «Презентация» —
 * тоже; холодные планы снимают состояние правилом `cold`. Порядок
 * повторяет лестницу `SALES_BASE_EVENT_ORDER` калькулятора стадий: новая
 * ступень между доработкой и решением правится в двух местах.
 */
export const REFINE_BEYOND_PLAN_TYPES: readonly EventReportEventType[] = [
    EVENT_REPORT_EVENT_TYPE.hot,
    EVENT_REPORT_EVENT_TYPE.moneyAwait,
    EVENT_REPORT_EVENT_TYPE.supply,
];

/** Вход в состояние «на доработке» — только план/перенос «Доработка». */
const REFINE_ENTRY_PLAN_TYPES: readonly EventReportEventType[] = [
    EVENT_REPORT_EVENT_TYPE.refine,
];

/** Выход: финал (безусловно), холодный план, план дальше по лестнице. */
const REFINE_RESET_RULES = [
    EFieldResetRule.final,
    EFieldResetRule.cold,
    EFieldResetRule.planBeyond,
] as const;

/**
 * «На доработке?» — состояние сделки ВНЕ стадий воронки (02.09.2026): у
 * части порталов стадии «Доработка» нет, а признак показывать и снимать
 * нужно. Булево: обнуляется нулём, не пустой строкой.
 */
export const IS_IN_REFINE_POLICY = policy({
    code: PBX_SALES_EVENT_FIELD_CODES.op_is_in_refine,
    why: 'Состояние живёт полем, потому что стадии «Доработка» у портала может не быть.',
    source: { kind: 'planFlag', planTypes: REFINE_ENTRY_PLAN_TYPES },
    resetOn: REFINE_RESET_RULES,
    emptyValue: 0,
});

/** «На доработке с» — момент входа; повторный план дату не двигает. */
export const REFINED_AT_POLICY = policy({
    code: PBX_SALES_EVENT_FIELD_CODES.op_refined_at,
    why: 'Дата входа ставится синхронно с флагом и снимается вместе с ним.',
    source: { kind: 'planEnteredAt', planTypes: REFINE_ENTRY_PLAN_TYPES },
    resetOn: REFINE_RESET_RULES,
});

/** «Почему на доработке» — фолбэк из возражений; набранное менеджером не трогаем. */
export const REFINED_REASON_POLICY = policy({
    code: PBX_SALES_EVENT_FIELD_CODES.op_refined_reason,
    why: 'Причину пишет менеджер в чек-листе; сборка из возражений — только для пустого поля.',
    source: { kind: 'planReason', planTypes: REFINE_ENTRY_PLAN_TYPES },
    resetOn: REFINE_RESET_RULES,
});

/**
 * Источники `plan*`: вход по типу события уже проверен вызывающим.
 * Флаг — 1, если не стоял; дата — «сегодня» при входе (флаг снят или дата
 * пуста); причина — только в пустое поле.
 */
const resolvePlanState = (
    kind: 'planFlag' | 'planEnteredAt' | 'planReason',
    input: FieldPolicyInput,
): PolicyOutcome => {
    const current = input.currentText?.trim() ?? '';
    switch (kind) {
        case 'planFlag':
            return input.currentFlag ? POLICY_KEEP : 1;
        case 'planEnteredAt':
            return input.currentFlag === false || !current
                ? (input.now ?? POLICY_KEEP)
                : POLICY_KEEP;
        case 'planReason':
            if (current) return POLICY_KEEP;
            return input.reason?.trim() ? input.reason : POLICY_KEEP;
    }
};

/**
 * Единственная точка, которая превращает политику + состояние прогона в
 * значение поля. Чистая функция: ни портала, ни Bitrix.
 *
 * Порядок принципиален — правила обнуления проверяются ДО стратегии:
 * «после продажи следующего звонка нет» сильнее любого расчёта.
 */
export const resolveFieldValue = (
    policyToApply: FieldPolicy,
    input: FieldPolicyInput,
): PolicyOutcome => {
    if (
        input.isFinal &&
        policyToApply.resetOn.includes(EFieldResetRule.final)
    ) {
        return null;
    }
    if (input.isCold && policyToApply.resetOn.includes(EFieldResetRule.cold)) {
        return null;
    }
    if (
        input.isPlanBeyond &&
        policyToApply.resetOn.includes(EFieldResetRule.planBeyond)
    ) {
        return null;
    }

    const source = policyToApply.source;

    switch (source.kind) {
        case 'nearestEventDate':
        case 'nearestEventName': {
            const event = nearestEvent(input.events, source.eventTypes);
            if (!event) {
                /*
                 * Дел нужного типа не осталось. Обнуляем только если поле об
                 * этом просило: молчаливое `null` в общем случае стирало бы
                 * данные, о которых отчёт ничего не знает.
                 */
                return policyToApply.resetOn.includes(
                    EFieldResetRule.noOpenEvent,
                )
                    ? null
                    : POLICY_KEEP;
            }
            return source.kind === 'nearestEventDate'
                ? event.crmDateTime
                : event.name;
        }
        case 'overwrite':
            return input.value === undefined
                ? POLICY_KEEP
                : overwrite(input.value);
        case 'increment':
            return increment(input.current, source.step);
        case 'planFlag':
        case 'planEnteredAt':
        case 'planReason':
            // Не наш вход (другой план, отчёт без плана) — поле не трогаем.
            if (
                !input.plannedEventType ||
                !source.planTypes.includes(input.plannedEventType)
            ) {
                return POLICY_KEEP;
            }
            return resolvePlanState(source.kind, input);
    }
};
