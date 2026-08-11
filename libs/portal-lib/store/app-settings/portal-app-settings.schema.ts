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
                'Bitrix GROUP_ID группы задач обзвона (legacy-константа ' +
                'фронта; кандидат на переезд в модель портала).',
            type: 'number',
            default: 1,
        }),
        bossId: setting({
            code: 'boss_id',
            name: 'Постановщик задач (руководитель)',
            description:
                'Bitrix ID руководителя — постановщик планируемых задач.',
            type: 'number',
            default: 1,
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
