import {
    BadgeRecord,
    EnumBadgeOutcome,
    EnumBadgePlanType,
    EnumBadgeTarget,
    EnumBadgeTone,
} from './portal-badges.schema';

/**
 * ОБЩИЙ набор бейджиков — действует на портале в режиме «по умолчанию» и
 * служит заготовкой для режима «свои».
 *
 * Состав согласован с владельцем 27.10.2026 по замерам «ОП История» gsirk
 * и garant (документ «Бейджики для комментария и названия»). Правила:
 *  - в группе «не дошёл до нужного человека» профессии НЕ называем
 *    (бухгалтер/юрист/кадровик): ролей слишком много, должность менеджер
 *    дописывает сам. Где профессия сама и есть причина отказа
 *    («Бухгалтерия на аутсорсе») — остаётся;
 *  - группы «не дозвонился» нет: на gsirk её закрывает функция «недозвон»
 *    со своим списком типов нерезультативности, дублировать нельзя;
 *  - название события при выборе типа фрейм заполняет сам именем клиента;
 *    бейджики названия здесь — только уточнения за кнопкой.
 */

const comment = (
    code: string,
    text: string,
    tone: EnumBadgeTone,
    outcomes: EnumBadgeOutcome[],
    sort: number,
): BadgeRecord => ({
    code,
    text,
    target: EnumBadgeTarget.comment,
    tone,
    outcomes,
    planTypes: [],
    isDefault: false,
    sort,
    isActive: true,
});

const title = (
    code: string,
    text: string,
    planTypes: EnumBadgePlanType[],
    sort: number,
    isDefault = false,
): BadgeRecord => ({
    code,
    text,
    target: EnumBadgeTarget.title,
    tone: EnumBadgeTone.neutral,
    outcomes: [],
    planTypes,
    isDefault,
    sort,
    isActive: true,
});

const { inJob, setAside, success, fail, notCa, presentationDone } =
    EnumBadgeOutcome;
const T = EnumBadgePlanType;

export const DEFAULT_BADGES: readonly BadgeRecord[] = [
    // --- Отказ -------------------------------------------------------
    comment(
        'fail_has_garant',
        'Уже пользуются «Гарантом»',
        EnumBadgeTone.destructive,
        [fail],
        100,
    ),
    comment(
        'fail_consultant',
        'Работают с «Консультант+»',
        EnumBadgeTone.destructive,
        [fail],
        110,
    ),
    comment('fail_expensive', 'Дорого', EnumBadgeTone.destructive, [fail], 120),
    comment(
        'fail_no_interest',
        'Не интересно, нет времени',
        EnumBadgeTone.destructive,
        [fail],
        130,
    ),
    comment(
        'fail_no_demo',
        'Отказ от демонстрации',
        EnumBadgeTone.destructive,
        [fail],
        140,
    ),
    comment(
        'fail_director',
        'Директор отказал сразу',
        EnumBadgeTone.destructive,
        [fail],
        150,
    ),
    // Причины, которые чаще «не ЦА», чем отказ — видны в обоих итогах.
    comment(
        'fail_small_company',
        'Маленькая компания, нет потребности',
        EnumBadgeTone.muted,
        [fail, notCa],
        160,
    ),
    comment(
        'fail_outsource',
        'Бухгалтерия на аутсорсе',
        EnumBadgeTone.muted,
        [fail, notCa],
        170,
    ),
    comment(
        'fail_closing',
        'Организация закрывается',
        EnumBadgeTone.muted,
        [fail, notCa],
        180,
    ),

    // --- Не дошёл до нужного человека (работа продолжается) ------------
    comment(
        'reach_not_connected',
        'Не соединили с нужным сотрудником',
        EnumBadgeTone.info,
        [inJob],
        200,
    ),
    comment(
        'reach_no_answer',
        'Нужный сотрудник не ответил',
        EnumBadgeTone.info,
        [inJob],
        210,
    ),
    comment(
        'reach_no_contacts',
        'Контакты не дали',
        EnumBadgeTone.info,
        [inJob],
        220,
    ),
    comment(
        'reach_not_decider',
        'Решает не он',
        EnumBadgeTone.info,
        [inJob],
        230,
    ),

    // --- Отложить ------------------------------------------------------
    comment(
        'aside_call_later',
        'Просил перезвонить позже',
        EnumBadgeTone.warning,
        [setAside],
        300,
    ),
    comment(
        'aside_busy',
        'Занят, неудобно говорить',
        EnumBadgeTone.warning,
        [setAside],
        310,
    ),
    comment(
        'aside_vacation',
        'В отпуске',
        EnumBadgeTone.warning,
        [setAside],
        320,
    ),
    comment(
        'aside_thinking',
        'Думает после демонстрации',
        EnumBadgeTone.warning,
        [setAside],
        330,
    ),
    comment(
        'aside_approval',
        'Нужно согласование с руководителем',
        EnumBadgeTone.warning,
        [setAside],
        340,
    ),
    comment(
        'aside_procurement',
        'Решают через закупку',
        EnumBadgeTone.warning,
        [setAside],
        350,
    ),

    // --- Договорённость и продажа ------------------------------------
    comment(
        'deal_demo',
        'Договорились о демонстрации',
        EnumBadgeTone.success,
        [inJob],
        400,
    ),
    comment(
        'deal_access',
        'Выслал доступ',
        EnumBadgeTone.success,
        [inJob],
        410,
    ),
    comment(
        'deal_kp_requested',
        'Запросили КП',
        EnumBadgeTone.success,
        [inJob],
        420,
    ),
    comment(
        'deal_kp_invoice',
        'Договорились на КП и счёт',
        EnumBadgeTone.success,
        [inJob, success],
        430,
    ),
    comment(
        'deal_will_buy',
        'Будут покупать, ждём оплату',
        EnumBadgeTone.success,
        [inJob, success],
        440,
    ),

    // --- Презентация проведена ---------------------------------------
    comment(
        'pres_thinking',
        'Провёл, думают',
        EnumBadgeTone.accent,
        [presentationDone],
        500,
    ),
    comment(
        'pres_kp',
        'Провёл, запросили КП',
        EnumBadgeTone.accent,
        [presentationDone],
        510,
    ),
    comment(
        'pres_approval',
        'Провёл, нужно согласование',
        EnumBadgeTone.accent,
        [presentationDone],
        520,
    ),
    comment(
        'pres_handed',
        'Передал на рассмотрение руководителю',
        EnumBadgeTone.accent,
        [presentationDone],
        530,
    ),

    // --- Название события: уточнения (за кнопкой) ----------------------
    // Основного текста типа в общем наборе НЕТ: согласованное «Звонок + имя
    // клиента» фрейм получает, подставляя одно имя клиента, — слово типа
    // заголовок задачи добавляет сам («<тип>  <название>  <контакт>»,
    // event-report-task-flow: buildTitle). «Звонок» в названии дал бы
    // «Звонок  Звонок — клиент». Свой основной текст портал может завести в
    // режиме «свои» (`isDefault`) — тогда подставится «<текст> — <клиент>».
    title('title_repeat_call', 'Повторный звонок', [T.cold, T.warm], 700),
    title('title_head_call', 'Созвон с руководителем', [T.warm, T.hot], 710),
    title('title_send_kp', 'Выслать КП', [T.warm, T.refine], 720),
    title('title_send_access', 'Выслать доступ', [T.warm, T.refine], 730),
    title('title_repeat_demo', 'Повторная демонстрация', [T.presentation], 740),
    title('title_collect_docs', 'Собрать документы', [T.refine, T.hot], 750),
];
