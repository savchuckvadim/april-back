/**
 * РЕЕСТР настроек placement-приложений — единственный источник правды:
 * какие приложения бывают, какие ключи к какому принадлежат, что ключ
 * означает (name/description для админки), тип значения и дефолт кода.
 *
 * БД (portal_app_settings) хранит app_code СТРОКОЙ и параметры JSON'ом —
 * новые приложения и ключи добавляются ТОЛЬКО здесь, без миграций.
 * Тотальная типизация: значения настроек выводятся из схемы, magic
 * strings исключены, автокомплит ключей и кодов везде.
 */

/** Коды placement-приложений (+ 'portal' — общие настройки портала). */
export enum EnumPortalAppCode {
    /** Общие настройки портала (версия продукта и т.п.). */
    portal = 'portal',
    /** Приложение отдела продаж (звонки/фрейм ОП). */
    sales = 'sales',
    /** KPI-отчётность продаж. */
    kpiSales = 'kpi-sales',
    /** Event-sales (Звонки: отчёты, заявки, хуки). */
    eventSales = 'event-sales',
    /** Конструктор документов. */
    konstructor = 'konstructor',
    /** Импорт статистики СКАП (крон-конвейер event-service). */
    skap = 'skap',
}

/** Runtime-массив кодов приложений — для @IsIn и Swagger enum. */
export const PORTAL_APP_CODES = Object.values(EnumPortalAppCode);

/** Тип значения настройки. */
export type PortalAppSettingType = 'boolean' | 'number' | 'string';

/** Описатель одного ключа настроек (метаданные для админки + дефолт). */
export interface PortalAppSettingDescriptor<
    TType extends PortalAppSettingType = PortalAppSettingType,
    TDefault = unknown,
> {
    /** Ключ в JSON-колонке `settings` (snake_case, стабилен навсегда). */
    code: string;
    /** Название на русском — заголовок поля в админке. */
    name: string;
    /** Что означает и на что влияет — подсказка в админке. */
    description: string;
    type: TType;
    /** Дефолт кода: действует, пока на портале не задано своё значение. */
    default: TDefault;
}

const setting = <TType extends PortalAppSettingType, TDefault>(
    descriptor: PortalAppSettingDescriptor<TType, TDefault>,
): PortalAppSettingDescriptor<TType, TDefault> => descriptor;

/** Схема: приложение → его ключи. Расширяется только здесь. */
export const PORTAL_APP_SETTINGS_SCHEMA = {
    [EnumPortalAppCode.portal]: {
        productVersion: setting({
            code: 'product_version',
            name: 'Версия продукта',
            description:
                'Версия комплекта приложений, установленного на портале — ' +
                'для отображения и совместимости фронтов.',
            type: 'string',
            default: '',
        }),
    },
    [EnumPortalAppCode.sales]: {},
    [EnumPortalAppCode.kpiSales]: {},
    [EnumPortalAppCode.eventSales]: {
        leadIntakeSlaEnabled: setting({
            code: 'lead_intake_sla_enabled',
            name: 'SLA принятия заявок',
            description:
                'Контроль «не принял заявку за N минут → передать другому ' +
                'и уведомить руководителя» (cron-страховка).',
            type: 'boolean',
            default: false,
        }),
        leadIntakeSlaMinutes: setting({
            code: 'lead_intake_sla_minutes',
            name: 'SLA: минут на принятие',
            description:
                'Через сколько минут непринятая заявка передаётся другому ' +
                'сотруднику отдела.',
            type: 'number',
            default: 60,
        }),
        leadIntakeSlaMaxPerRun: setting({
            code: 'lead_intake_sla_max_per_run',
            name: 'SLA: лидов за проход',
            description:
                'Максимум просроченных заявок, обрабатываемых за один ' +
                'проход крона (защита от лавины).',
            type: 'number',
            default: 30,
        }),

        // --- Страховка входа: заявка пришла, а хук назначения не долетел
        // (Битрикс вебхуки не повторяет). SLA такой лид не видит — он
        // никому не назначен, значит и не просрочен.
        leadIntakeRescueEnabled: setting({
            code: 'lead_intake_rescue_enabled',
            name: 'Страховка входа заявок',
            description:
                'Cron ищет свежие лиды, по которым назначение не отработало ' +
                '(нет ни ответственного от хука, ни нашей сделки), и ' +
                'запускает по ним назначение повторно.',
            type: 'boolean',
            default: false,
        }),
        leadIntakeRescueLookbackMinutes: setting({
            code: 'lead_intake_rescue_lookback_minutes',
            name: 'Страховка входа: глубина поиска (минут)',
            description:
                'Насколько давние лиды проверять. Больше — надёжнее после ' +
                'долгого простоя, но тяжелее выборка.',
            type: 'number',
            default: 180,
        }),
        leadIntakeRescueMaxPerRun: setting({
            code: 'lead_intake_rescue_max_per_run',
            name: 'Страховка входа: лидов за проход',
            description: 'Максимум лидов, дожимаемых за один проход крона.',
            type: 'number',
            default: 20,
        }),
        leadIntakeRescueRequestsOnly: setting({
            code: 'lead_intake_rescue_requests_only',
            name: 'Страховка входа: только заявки',
            description:
                'Включено — дожимаются только распознанные заявки и входящие ' +
                'обращения. Выключено — любой свежий лид без назначения, ' +
                'включая заведённые вручную.',
            type: 'boolean',
            default: true,
        }),

        // --- Дубли на входе: увидеть «этого клиента уже ведут» ДО первого
        // звонка менеджера. Проверка ставится один раз на лид (гейт —
        // маркер op_lead_is_duplicate_check).
        leadIntakeDuplicateCheckEnabled: setting({
            code: 'lead_intake_duplicate_check_enabled',
            name: 'Проверка дублей при назначении заявки',
            description:
                'При назначении входящей заявки автоматически ставить ' +
                'проверку на дубли: итог — комментарий в таймлайне лида и ' +
                'маркеры «проверено» / «есть дубль».',
            type: 'boolean',
            default: false,
        }),
        leadIntakeDuplicateCheckDeep: setting({
            code: 'lead_intake_duplicate_check_deep',
            name: 'Проверка дублей: глубокий поиск',
            description:
                'Включено — глубокий обход связей (точнее, но дороже по ' +
                'запросам к порталу). Выключено — быстрая проверка.',
            type: 'boolean',
            default: true,
        }),

        // --- Прошлое заявки в сделке: менеджер работает в сделке и в лид
        // не заходит, поэтому переписка и звонки должны быть видны там же.
        leadWorkCopyActivities: setting({
            code: 'lead_work_copy_activities',
            name: 'Переносить дела заявки в сделку',
            description:
                'При переводе лида в работу дела его таймлайна (письма, ' +
                'звонки) дополнительно привязываются к сделке. В лиде они ' +
                'остаются — это привязка, а не перенос.',
            type: 'boolean',
            default: false,
        }),
        leadWorkCopyActivitiesLimit: setting({
            code: 'lead_work_copy_activities_limit',
            name: 'Дел заявки к переносу',
            description:
                'Сколько последних дел привязывать. Битрикс допускает не ' +
                'более 100 привязок у одного дела.',
            type: 'number',
            default: 50,
        }),
        leadWorkOriginComment: setting({
            code: 'lead_work_origin_comment',
            name: 'Комментарий «создано из заявки»',
            description:
                'В таймлайн новой сделки писать комментарий со ссылкой на ' +
                'лид-первоисточник.',
            type: 'boolean',
            default: true,
        }),

        // --- Фич-флаги фронта «Звонки» (переезд domain-config.ts из
        // хардкода по доменам; фронт читает их через resolve по домену) ---
        withNoPlan: setting({
            code: 'with_no_plan',
            name: 'Отправка без плана',
            description:
                'Разрешить отправлять отчёт без запланированного ' +
                'следующего события.',
            type: 'boolean',
            default: false,
        }),
        withNoReschedle: setting({
            code: 'with_no_reschedle',
            name: 'Перенос события',
            description: 'Кнопка переноса события на другое время.',
            type: 'boolean',
            default: false,
        }),
        withPostFail: setting({
            code: 'with_post_fail',
            name: 'Пост-отказная дата',
            description:
                'Поле «дата повторного касания» при отказе (вернуться позже).',
            type: 'boolean',
            default: false,
        }),
        withNoCall: setting({
            code: 'with_no_call',
            name: 'Недозвон',
            description: 'Меню недозвона (отчёт без разговора).',
            type: 'boolean',
            default: false,
        }),
        withTM: setting({
            code: 'with_tm',
            name: 'Режим ТМЦ',
            description: 'Функциональность телемаркетинга (ТМЦ).',
            type: 'boolean',
            default: false,
        }),
        withRecords: setting({
            code: 'with_records',
            name: 'Записи звонков',
            description: 'Показывать записи звонков в форме отчёта.',
            type: 'boolean',
            default: true,
        }),
        withTranscribation: setting({
            code: 'with_transcribation',
            name: 'Транскрибация',
            description: 'Тексты звонков (расшифровки) в интерфейсе.',
            type: 'boolean',
            default: false,
        }),
        withAI: setting({
            code: 'with_ai',
            name: 'AI-анализ',
            description: 'AI-разборы звонков в интерфейсе «Звонков».',
            type: 'boolean',
            default: false,
        }),
        withPresentationAnimate: setting({
            code: 'with_presentation_animate',
            name: 'Анимация презентации',
            description: 'Анимированная кнопка «Проведена презентация».',
            type: 'boolean',
            default: false,
        }),
        withColorRequired: setting({
            code: 'with_color_required',
            name: 'Обязательный «цвет» клиента',
            description: 'Требовать выбор прогноза/цвета клиента при отправке.',
            type: 'boolean',
            default: false,
        }),
        withCheckPresentation: setting({
            code: 'with_check_presentation',
            name: 'Опросник после презентации',
            description:
                'Обязательный опросник (CheckPresentation) после ' +
                'проведённой презентации.',
            type: 'boolean',
            default: false,
        }),
        withDepartmentModeToggle: setting({
            code: 'with_department_mode_toggle',
            name: 'Переключатель ОП/ТМЦ',
            description: 'Показывать переключатель режима отдела ОП/ТМЦ.',
            type: 'boolean',
            default: false,
        }),
        taskGroupId: setting({
            code: 'task_group_id',
            name: 'Группа задач обзвона',
            description:
                'Bitrix GROUP_ID группы задач обзвона. 0 = НЕ ЗАДАНО: ' +
                'действует значение по домену из фронтового конфига. ' +
                'Дефолт 1 был ловушкой — незаполненная настройка приезжала ' +
                'как настоящая единица и затирала рабочую группу портала, ' +
                'после чего дела «пропадали» (инцидент 27.08).',
            type: 'number',
            default: 0,
        }),
        bossId: setting({
            code: 'boss_id',
            name: 'Постановщик задач (руководитель)',
            description:
                'Bitrix ID руководителя — постановщик планируемых задач. ' +
                '0 = НЕ ЗАДАНО: действует значение по домену (та же ' +
                'ловушка ложного дефолта, что у группы задач).',
            type: 'number',
            default: 0,
        }),
        // === Чек-листы pbx-полей (каталог — данные фронта CallChecklist) ===
        withChecklistRefine: setting({
            code: 'checklist_refine_enabled',
            name: 'Чек-лист «Доработка»',
            description:
                'При планировании звонка «Доработка» менеджер обязан ' +
                'заполнить причину возражения (поле сделки «ОП Причина ' +
                'Отказа») — с показом текущего значения.',
            type: 'boolean',
            default: false,
        }),
        withChecklistPay: setting({
            code: 'checklist_pay_enabled',
            name: 'Чек-лист «Оплата»',
            description:
                'При планировании звонка «Оплата» показывать дату ' +
                'последнего выставления счёта (op_invoice_date, поле ' +
                'конструктора) и требовать её заполнить.',
            type: 'boolean',
            default: false,
        }),
        withChecklistDecision: setting({
            code: 'checklist_decision_enabled',
            name: 'Чек-лист перехода «Клиент на решении»',
            description:
                'Перед отправкой отчёта, двигающего основную сделку на ' +
                '«Клиент на решении», обязательны даты КП, проекта ' +
                'договора, счёта и дата звонка по решению.',
            type: 'boolean',
            default: false,
        }),
        withChecklistSale: setting({
            code: 'checklist_sale_enabled',
            name: 'Чек-лист продажи',
            description:
                'Перед отправкой отчёта «Продажа» обязательны сумма сделки ' +
                '(OPPORTUNITY) и дата первой оплаты (first_pay_date).',
            type: 'boolean',
            default: false,
        }),
        withReportQuestions: setting({
            code: 'checklist_report_enabled',
            name: 'Вопросы при отчёте (по типу события)',
            description:
                'При отчёте по «Доработке», «Решению» и «Оплате» менеджер ' +
                'заполняет короткий набор вопросов: возражение клиента и его ' +
                'формулировка, исход решения с датой, обещанная дата оплаты. ' +
                'Ответы ложатся в поля клиента — по ним строятся отчёты, а не ' +
                'только текст комментария.',
            type: 'boolean',
            default: false,
        }),
        withTaskChecklist: setting({
            code: 'task_checklist_enabled',
            name: 'Чек-лист в задаче обзвона',
            description:
                'Планируемая задача создаётся с чек-листом («Презентация ' +
                'проведена», «Решение подтверждено», «Дата следующей ' +
                'коммуникации назначена», «Возражения зафиксированы» — ' +
                'состав зависит от типа события). При закрытии задачи ' +
                'отмеченные пункты попадают в историю карточки и в ' +
                'комментарий задачи. ВЫКЛЮЧЕНО по умолчанию: включение ' +
                'меняет вид задач у всех менеджеров портала.',
            type: 'boolean',
            default: false,
        }),
        withKonstructorSlider: setting({
            code: 'konstructor_slider_enabled',
            name: 'Кнопка карточки сделки (конструктор)',
            description:
                'В чек-листах решения/продажи показывать кнопку, открывающую ' +
                'слайдер карточки сделки — там таб «Гарант: Конструктор КП» ' +
                'с комплектами и ценами.',
            type: 'boolean',
            default: false,
        }),
        // === Реанимация отказников (sales-hooks/reject-revive) ===
        rejectReviveEnabled: setting({
            code: 'reject_revive_enabled',
            name: 'Реанимация отказников',
            description:
                'Крон возвращает отказные сделки основной воронки в работу: ' +
                'через интервал (или по дате звонка после отказа) ставится ' +
                'холодный звонок cold-call хуком. Перед включением установите ' +
                'поля post_fail_date / op_xo_revive_* на сделки.',
            type: 'boolean',
            default: false,
        }),
        rejectReviveIntervalDays: setting({
            code: 'reject_revive_interval_days',
            name: 'Реанимация: интервал (дней)',
            description:
                'Сколько дней сделка лежит в отказе до постановки холодного ' +
                'звонка (отсчёт от даты закрытия).',
            type: 'number',
            default: 120,
        }),
        rejectReviveAssignMode: setting({
            code: 'reject_revive_assign_mode',
            name: 'Реанимация: кому назначать',
            description:
                "'same' — тому же ответственному сделки; 'random' — " +
                'случайному активному менеджеру отдела продаж (при пустом ' +
                'отделе — фолбэк на того же).',
            type: 'string',
            default: 'same',
        }),
        rejectReviveMaxPerRun: setting({
            code: 'reject_revive_max_per_run',
            name: 'Реанимация: лимит за прогон',
            description:
                'Максимум сделок, обрабатываемых за один тик крона ' +
                '(досылка «недоехавших» входит в лимит).',
            type: 'number',
            default: 20,
        }),
        rejectReviveUsePostFailDate: setting({
            code: 'reject_revive_use_post_fail_date',
            name: 'Реанимация: учитывать дату после отказа',
            description:
                'Если у сделки заполнена «ОП Дата звонка после отказа» ' +
                '(post_fail_date) — она перебивает интервал: звонок ставится ' +
                'по ней.',
            type: 'boolean',
            default: false,
        }),
        rejectReviveResendAfterMinutes: setting({
            code: 'reject_revive_resend_after_minutes',
            name: 'Реанимация: порог досылки (минут)',
            description:
                'Через сколько минут «взятая в очередь» сделка без отметки ' +
                '«хук отправлен» считается недоехавшей и досылается ' +
                '(подстраховка на падение хука).',
            type: 'number',
            default: 120,
        }),
    },
    [EnumPortalAppCode.konstructor]: {},
    [EnumPortalAppCode.skap]: {
        enabled: setting({
            code: 'enabled',
            name: 'Импорт СКАП включён',
            description:
                'Крон сканирует папку «СКАП» на Диске группы Сервиса и ' +
                'импортирует выгрузки в смарт-процесс «СКАП».',
            type: 'boolean',
            default: false,
        }),
        contactTasksEnabled: setting({
            code: 'contact_tasks_enabled',
            name: 'Сводные задачи по контактам',
            description:
                'Раз в неделю (пн 09:00 МСК) ставить ответственным сводные ' +
                'задачи «СКАП: проверьте созданные контакты» по контактам, ' +
                'автосозданным импортом. ВЫКЛЮЧЕНО по умолчанию: включение ' +
                'самого импорта задач НЕ создаёт (инцидент 12.08.2026 — ' +
                'задачи ставились неожиданно для владельца).',
            type: 'boolean',
            default: false,
        }),
        groupId: setting({
            code: 'group_id',
            name: 'Группа (override)',
            description:
                'Bitrix ID рабочей группы с папкой загрузок. 0 — брать ' +
                'группу отдела сервиса из PortalDB (callings, group=service).',
            type: 'number',
            default: 0,
        }),
        folderId: setting({
            code: 'folder_id',
            name: 'Папка на Диске (кэш)',
            description:
                'ID папки «СКАП. Загрузка» на Диске группы. 0 — найти/' +
                'создать по имени и запомнить.',
            type: 'number',
            default: 0,
        }),
        folderUrl: setting({
            code: 'folder_url',
            name: 'Ссылка на папку (кэш)',
            description:
                'URL папки «СКАП. Загрузка» на Диске — ссылка «Хранилище ' +
                'СКАП» рядом с кнопкой «пересчитать» на фронте. Заполняется ' +
                'автоматически при первом прогоне.',
            type: 'string',
            default: '',
        }),
        scanIntervalMinutes: setting({
            code: 'scan_interval_minutes',
            name: 'Интервал скана, мин',
            description:
                'Крон тикает часто, но портал сканируется не чаще этого ' +
                'интервала. На обкатке — 60; после выравнивания можно ' +
                '10080 (раз в неделю).',
            type: 'number',
            default: 60,
        }),
        maxRunMinutes: setting({
            code: 'max_run_minutes',
            name: 'Тайм-бюджет прогона, мин',
            description:
                'Максимум непрерывной работы одного прогона (требование ' +
                '«не более 3 часов»). Недообработанные файлы уйдут в ' +
                'следующий тик.',
            type: 'number',
            default: 180,
        }),
        maxFilesPerRun: setting({
            code: 'max_files_per_run',
            name: 'Файлов за прогон',
            description:
                'Максимум файлов, обрабатываемых за один прогон (защита ' +
                'от лавины при заливке многолетней истории).',
            type: 'number',
            default: 10,
        }),
        maxHistoryYears: setting({
            code: 'max_history_years',
            name: 'Глубина истории, лет',
            description:
                'Месяцы старше этого лимита не импортируются ' +
                '(skipped_too_old). 0 — без лимита.',
            type: 'number',
            default: 3,
        }),
        notifyUserIds: setting({
            code: 'notify_user_ids',
            name: 'Получатели уведомлений',
            description:
                'Bitrix ID сотрудников для сводки прогона в портале ' +
                '(im-notify), через запятую: «1, 42, 107». Пусто — не ' +
                'уведомлять. Telegram-дайджест идёт отдельно в админ-чат ' +
                'бэка (логгер-транспорт).',
            type: 'string',
            default: '',
        }),
        digestLevel: setting({
            code: 'digest_level',
            name: 'Telegram-дайджест',
            description:
                'Когда слать сводку прогона в Telegram: all — каждый ' +
                'прогон с работой, errors — только при проблемах, off — ' +
                'не слать.',
            type: 'string',
            default: 'all',
        }),
    },
} as const;

export type PortalAppSettingsSchema = typeof PORTAL_APP_SETTINGS_SCHEMA;

/** TS-тип значения по типу дескриптора. */
type ValueOfType<T extends PortalAppSettingType> = T extends 'boolean'
    ? boolean
    : T extends 'number'
      ? number
      : string;

/** Значения настроек приложения (дефолты слиты с сохранённым в БД). */
export type PortalAppSettingsValues<App extends EnumPortalAppCode> = {
    [K in keyof PortalAppSettingsSchema[App]]: PortalAppSettingsSchema[App][K] extends PortalAppSettingDescriptor<
        infer TType,
        unknown
    >
        ? ValueOfType<TType>
        : never;
};

/**
 * Частичное обновление значений приложения (admin): отсутствие ключа =
 * «не трогать», явный null = «сбросить на дефолт кода» (ключ удаляется
 * из JSON портала).
 */
export type PortalAppSettingsPatch<App extends EnumPortalAppCode> = {
    [K in keyof PortalAppSettingsValues<App>]?:
        | PortalAppSettingsValues<App>[K]
        | null;
};

/** Дефолты приложения из схемы (то, что действует без строки в БД). */
export function getPortalAppDefaults<App extends EnumPortalAppCode>(
    app: App,
): PortalAppSettingsValues<App> {
    const schema = PORTAL_APP_SETTINGS_SCHEMA[app];
    const values: Record<string, unknown> = {};
    for (const key of Object.keys(schema)) {
        values[key] = (schema as Record<string, PortalAppSettingDescriptor>)[
            key
        ].default;
    }
    return values as PortalAppSettingsValues<App>;
}
