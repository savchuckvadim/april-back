import { EVENT_TYPE_REGISTRY } from '@lib/portal-lib/pbx/event-type-registry';

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

/** Вариант значения-списка: код уезжает в CSV, название — подпись. */
export interface PortalAppSettingOption {
    code: string;
    name: string;
}

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
    /**
     * Справочник значений: админка рисует выбор, а не свободный ввод.
     * Необязательное поле — остальные ключи реестра его не имеют и не
     * меняются от его появления.
     */
    options?: readonly PortalAppSettingOption[];
    /**
     * Значение — СПИСОК кодов через запятую (тип при этом `string`).
     * Админка рисует чекбоксы, потребитель разбирает CSV. Тип значения в
     * БД не меняется намеренно: реестр типов остаётся тремя скалярами, и
     * `getStoredAppSettingKeys` продолжает работать как работал.
     */
    isList?: boolean;
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
    [EnumPortalAppCode.sales]: {
        // --- Принудительная видимость в отчётах продаж (kpi-sales и др.).
        // Читает BxDepartmentStructureService (libs/bx-department) при
        // расчёте роли текущего пользователя: уровень из списка поднимает
        // структурный и никогда не понижает. Сотрудник вне структуры
        // продаж из списков group/department получает all (решение
        // владельца 05.09.2026). CSV Bitrix ID, парсер — parseUserIds.
        visibilityGroupUserIds: setting({
            code: 'visibility_group_user_ids',
            name: 'Видят свою группу (принудительно)',
            description:
                'Bitrix ID сотрудников через запятую: «32, 40, 1». ' +
                'Получают уровень «группа»: себя и свою группу, как ' +
                'руководитель группы, независимо от структуры. Без своей ' +
                'группы — уровень «отдел»; вне отдела продаж — «все». ' +
                'Пусто — только по структуре.',
            type: 'string',
            default: '',
        }),
        visibilityDepartmentUserIds: setting({
            code: 'visibility_department_user_ids',
            name: 'Видят свой отдел (принудительно)',
            description:
                'Bitrix ID сотрудников через запятую: «32, 40, 1». ' +
                'Получают уровень «отдел»: свой отдел продаж со всеми ' +
                'группами, как руководитель отдела, независимо от ' +
                'структуры. Вне отдела продаж — «все». Пусто — только по ' +
                'структуре.',
            type: 'string',
            default: '',
        }),
        visibilityAllUserIds: setting({
            code: 'visibility_all_user_ids',
            name: 'Видят всю структуру (принудительно)',
            description:
                'Bitrix ID сотрудников через запятую: «32, 40, 1». ' +
                'Получают уровень «все»: вся структура продаж (все отделы ' +
                'в мультирежиме), как руководитель направления. Пусто — ' +
                'только по структуре.',
            type: 'string',
            default: '',
        }),
    },
    [EnumPortalAppCode.kpiSales]: {
        // --- AI-аналитика ОП (apps/kpi-report-sales/ai-analytics, план
        // ai/tasks/ai-sales-analytics-plan.md). Флаги живут здесь, а не в
        // portal_ai_settings: тот рубильник включает КОНВЕЙЕР разбора
        // звонков (event-sales), а эти — ВИТРИНУ и рассылки поверх уже
        // накопленных разборов; их сочетание даёт режим kpi-only.
        aiAnalyticsEnabled: setting({
            code: 'ai_analytics_enabled',
            name: 'AI-аналитика ОП включена',
            description:
                'Вкладка AI-аналитики в KPI-отчёте и её ручки ' +
                '(settings/get, pulse, agenda, overview). Выключено — ' +
                'вкладка скрыта, фоновые джобы не ставятся.',
            type: 'boolean',
            default: false,
        }),
        aiAnalyticsAuditEnabled: setting({
            code: 'ai_analytics_audit_enabled',
            name: 'Аудит и калибровка данных AI-аналитики разрешены',
            description:
                'Разрешает считать аудит данных по этому порталу (Фаза 0 ' +
                'плана): админ-ручка POST admin/ai-analytics/audit и ' +
                'месячный снапшот 1-го числа читают transcriptions/ais ' +
                'портала и пишут отчёт в ais. Выключено — ручка отвечает ' +
                '403, крон портал пропускает. Не зависит от ' +
                'ai_analytics_enabled: аудит делается ДО включения витрины.',
            type: 'boolean',
            default: false,
        }),
        aiAnalyticsAlertsEnabled: setting({
            code: 'ai_analytics_alerts_enabled',
            name: 'Алерты РОПу в день звонка',
            description:
                'После разбора звонка с риск-флагом (обещание, конфликт, ' +
                'комплаенс, негатив клиента) или срочным приоритетом ' +
                'коучинга РОПу уходит уведомление с цитатой и ссылкой — ' +
                'один раз на звонок.',
            type: 'boolean',
            default: false,
        }),
        aiAnalyticsDigestEnabled: setting({
            code: 'ai_analytics_digest_enabled',
            name: 'Утренний разбор менеджерам',
            description:
                'В 08:00 по TZ портала каждому менеджеру — 1–3 его ' +
                'вчерашних звонка с худшими разделами и фразами «как ' +
                'лучше» (alternatives).',
            type: 'boolean',
            default: false,
        }),
        aiAnalyticsRopUserIds: setting({
            code: 'ai_analytics_rop_user_ids',
            name: 'Bitrix-id РОПов через запятую',
            description:
                'Получатели алертов и повестки недели (пн 08:30): ' +
                '«1, 42, 107». Пусто — алерты и повестка не отправляются. ' +
                'Разбор строки — parseUserIds.',
            type: 'string',
            default: '',
        }),
        aiAnalyticsCalendar: setting({
            code: 'ai_analytics_calendar',
            name:
                'JSON календаря: {"timeZone":"Europe/Moscow",' +
                '"holidays":["YYYY-MM-DD"],"workweek":[1,2,3,4,5]}',
            description:
                'Рабочий календарь для окон «5 рабочих дней», «вчера» и ' +
                'утренних рассылок: TZ портала, праздники датами ' +
                'YYYY-MM-DD, рабочие дни недели (1 — понедельник). Пусто ' +
                'или битый JSON — дефолт кода (Europe/Moscow, пн–пт, без ' +
                'праздников).',
            type: 'string',
            default: '',
        }),
        // --- Решения владельца 07.09.2026 (план §14.5, анкета «А-ответы»
        // и «Дополнения»): видимость витрины, план дня, сводный дайджест,
        // пул порталов, эксперименты. Все дефолты выключают поведение.
        aiAnalyticsSelfViewEnabled: setting({
            code: 'ai_analytics_self_view_enabled',
            name: 'Менеджер видит витрину по себе',
            description:
                'Выключено (по умолчанию) — витрина AI-аналитики доступна ' +
                'только руководителям (headOf) и суперпользователю: менеджер ' +
                'без роли руководителя получает 403 на читающих ручках ' +
                '(pulse, agenda, overview, attention, by-type, feedback/list), ' +
                'фронт скрывает вкладку. Включено — менеджер видит только ' +
                'свои строки. На push-рассылки менеджеру не влияет.',
            type: 'boolean',
            default: false,
        }),
        aiAnalyticsDailyPlanEnabled: setting({
            code: 'ai_analytics_daily_plan_enabled',
            name: 'План дня менеджеру',
            description:
                'Блок «план дня» в утреннем дайджесте менеджера и ручка ' +
                'plan/daily (Фаза 2). Выключено — дайджест без плана дня, ' +
                'ручка отвечает 403.',
            type: 'boolean',
            default: false,
        }),
        aiAnalyticsDigestAllUserIds: setting({
            code: 'ai_analytics_digest_all_user_ids',
            name: 'Bitrix-id получателей сводного дайджеста через запятую',
            description:
                'Адресаты сводного утреннего дайджеста по ВСЕМ менеджерам ' +
                'портала (по отделам, до 3 звонков на менеджера, итог «кому ' +
                'что»): «1, 42, 107». Отправляется в 08:00 по TZ портала тем же ' +
                'кроном, что и личный дайджест, и НЕ зависит от ' +
                'ai_analytics_digest_enabled. Пусто — никому. Разбор строки — ' +
                'parseUserIds.',
            type: 'string',
            default: '',
        }),
        aiAnalyticsStyleOptOut: setting({
            code: 'ai_analytics_style_opt_out',
            name: 'Bitrix-id сотрудников, отказавшихся от профиля стиля',
            description:
                'Право сотрудника на отказ от профилирования (документ ' +
                'ai/tasks/ai-analytics-manager-style.md, §1.3): «1, 42, 107». ' +
                'Профиль стиля такому сотруднику не показывается никому — ' +
                'карточка приходит со статусом opt_out и текстом «профиль ' +
                'отключён по запросу сотрудника». Из нормы коллег (peers) ' +
                'чужих профилей его строки пока НЕ исключаются — это ' +
                'отдельная доработка ночного шага. Пусто — отказавшихся ' +
                'нет. Разбор строки — parseUserIds.',
            type: 'string',
            default: '',
        }),
        aiAnalyticsPoolOptIn: setting({
            code: 'ai_analytics_pool_opt_in',
            name: 'Согласие на обезличенный пул порталов',
            description:
                'Портал согласен передавать обезличенные агрегаты (нормы, ' +
                'сезонность, лаги; без транскриптов и имён) в общий пул ' +
                'порталов линейки. Выключено — одно-портальный режим. ' +
                'Включая, заполните дату согласия ai_analytics_pool_consent_at.',
            type: 'boolean',
            default: false,
        }),
        aiAnalyticsPoolConsentAt: setting({
            code: 'ai_analytics_pool_consent_at',
            name: 'Дата согласия на пул (ISO)',
            description:
                'Дата и время согласия клиента на участие в пуле в формате ' +
                'ISO 8601 («2026-09-07» или «2026-09-07T10:00:00+03:00»). ' +
                'Пусто — согласие не датировано (при включённом пуле — ' +
                'ошибка конфигурации).',
            type: 'string',
            default: '',
        }),
        aiAnalyticsExperimentsEnabled: setting({
            code: 'ai_analytics_experiments_enabled',
            name: 'Эксперименты на портале',
            description:
                'Вмешательства с измерением эффекта: «фокус недели» (Фаза 3), ' +
                'кроссовер коучинга и A/B скрипта (отдельный опт-ин Фазы 4). ' +
                'Выключено (по умолчанию) — система только наблюдает и ' +
                'советует.',
            type: 'boolean',
            default: false,
        }),
        // --- Фаза 2 (план ai/tasks/ai-sales-analytics-phase2-plan.md, §3.3):
        // решения ЛЮДЕЙ, которых нет ни в Bitrix, ни в разборах — уровни,
        // цели, отсутствия, определения событий, гиперпараметры модели,
        // журнал событий портала, потолки оценивания, гипотеза качества и
        // подтверждение ростера. Все ключи — JSON-СТРОКОЙ по образцу
        // ai_analytics_calendar: реестр настроек держит три скаляра
        // (boolean/number/string) и не превращается в дерево, а разбор
        // живёт чистыми функциями в libs/sales-ai-analytics/src/settings
        // (битый JSON → дефолт кода, без исключения). Дефолт у всех —
        // пустая строка: «портал ничего не решал» отличимо от «решил так».
        aiAnalyticsLevels: setting({
            code: 'ai_analytics_levels',
            name: 'JSON уровней менеджеров',
            description:
                'Массив [{"managerId":447,"level":"senior",' +
                '"since":"2025-03-01","source":"manual"}]: уровень назначает ' +
                'руководитель, since — начало стажа (не позже сегодня в TZ ' +
                'портала). Пусто — уровень подсказывается по стажу. Заменяет ' +
                'временную ais-запись ai-analytics-settings (Фаза 1b): пока ' +
                'ключ пуст, читается она.',
            type: 'string',
            default: '',
        }),
        aiAnalyticsTargets: setting({
            code: 'ai_analytics_targets',
            name: 'JSON целей по уровням и переопределений по менеджерам',
            description:
                '{"byLevel":{"junior":{"sales":3,"presentationsMin":20,' +
                '"coldPerDay":40}},"overrides":{"447":5}}: цель продаж ' +
                'уровня в месяц, минимум презентаций обучения и дневной ' +
                'минимум холодных; overrides — личная цель менеджера ' +
                '(null — снять). Пусто — цель считается медианой полосы стажа.',
            type: 'string',
            default: '',
        }),
        aiAnalyticsAbsences: setting({
            code: 'ai_analytics_absences',
            name: 'JSON отсутствий менеджеров',
            description:
                '{"447":[{"from":"2026-07-01","to":"2026-07-14",' +
                '"kind":"vacation"}]}: отпуска, больничные и обучение. ' +
                'Отрезки одного менеджера не пересекаются, from ≤ to. ' +
                'Экспозиция считается по календарю минус отсутствия, иначе ' +
                'отпуск выглядит как провал темпа.',
            type: 'string',
            default: '',
        }),
        aiAnalyticsModelParams: setting({
            code: 'ai_analytics_model_params',
            name: 'JSON гиперпараметров модели (коды реестра)',
            description:
                '{"forget_lambda":0.85,"kappa_edge_early":100,' +
                '"norm_stratum":"tenure"}: переопределения портала для кодов ' +
                'реестра параметров (libs/sales-ai-analytics/src/params). ' +
                'Значение вне диапазона реестра или чужого типа не ' +
                'применяется — действует дефолт кода.',
            type: 'string',
            default: '',
        }),
        aiAnalyticsManagerParams: setting({
            code: 'ai_analytics_manager_params',
            name: 'JSON параметров по менеджерам',
            description:
                '{"447":{"fteShare":0.5,"targetOverride":4,' +
                '"excludeFromNorms":true,"alertsMuted":false}}: ставка ' +
                '[0.25; 1], личная цель, исключение из норм отдела, ' +
                'глушение алертов, наставник, свой рабочий календарь. ' +
                'Слой менеджера сильнее полосы стажа и портала.',
            type: 'string',
            default: '',
        }),
        aiAnalyticsDefinitions: setting({
            code: 'ai_analytics_definitions',
            name: 'JSON определений событий портала',
            description:
                'Что считается продуктивным звонком и презентацией, порог ' +
                'длительности по типам, вложенность счетов, стадии решения, ' +
                'рёбра воронки, слой нормы (tenure|level) и цвета «горячих». ' +
                'Смена определения рвёт сравнимость рядов: сохранение ' +
                'сдвигает comparableFrom вперёд.',
            type: 'string',
            default: '',
        }),
        aiAnalyticsEvents: setting({
            code: 'ai_analytics_events',
            name: 'JSON журнала событий портала',
            description:
                '[{"date":"2026-09-05","kind":"script_change",' +
                '"note":"новый скрипт","source":"manual"}]: смена скрипта, ' +
                'рубрики, цены, приход новичка и автособытие разрыва ряда ' +
                'после смены определений. Журнал объясняет изломы трендов.',
            type: 'string',
            default: '',
        }),
        aiAnalyticsScoring: setting({
            code: 'ai_analytics_scoring',
            name: 'JSON потолков оценивания и стоп-фраз',
            description:
                '{"caps":[{"ruleCode":"no_next_step","condition":' +
                '"nextStep.set = false","section":"CLOSING","maxScore":5,' +
                '"flag":"no_next_step"}],"stopWords":["как-то так"]}: не ' +
                'более 20 правил (maxScore 1–9) и 100 стоп-фраз. Меняет ' +
                'шкалу оценки — сохранение сдвигает comparableFrom.',
            type: 'string',
            default: '',
        }),
        aiAnalyticsHypothesis: setting({
            code: 'ai_analytics_hypothesis',
            name: 'JSON гипотезы «качество → объём»',
            description:
                '{"pairs":[{"s":8,"n":30},{"s":5,"n":50}],' +
                '"since":"2026-09-08","author":"447"}: сколько презентаций ' +
                'нужно при качестве S. Не меньше двух пар, S ∈ [3; 10], ' +
                'n > 0. Без неё режим гипотезы недоступен и план считается ' +
                'только по объёму.',
            type: 'string',
            default: '',
        }),
        aiAnalyticsRosterConfirmedAt: setting({
            code: 'ai_analytics_roster_confirmed_at',
            name: 'Дата подтверждения состава и уровней (YYYY-MM-DD)',
            description:
                'Руководитель подтвердил, что список менеджеров и их уровни ' +
                'верны. Дата не может быть в будущем. Учитывается только ' +
                'при roster_confirm_required = true; иначе ростер считается ' +
                'подтверждённым, если заполнен ai_analytics_levels.',
            type: 'string',
            default: '',
        }),
    },
    [EnumPortalAppCode.eventSales]: {
        // --- Выключатель портального каталога анкет ПО ТИПУ СОБЫТИЯ.
        // Живёт в настройках, а не в каталоге, по трём причинам: (1) это
        // рубильник ПОДСИСТЕМЫ — он гасит и те анкеты, которые заведут
        // завтра, а в каталоге его пришлось бы дублировать в каждую
        // анкету; (2) настройки применяются за 5 минут кэша, каталог
        // пришлось бы пересобирать и ждать сверки хэша; (3) каталог
        // обязан оставаться описанием СОСТАВА — иначе на вопрос «почему
        // анкета не видна» появится два ответа в двух местах.
        questionnairesDisabledEventTypes: setting({
            code: 'questionnaires_disabled_event_types',
            name: 'Анкеты выключены для типов события',
            description:
                'Для выбранных типов события анкеты портального каталога ' +
                'не показываются и ответы по ним не принимаются. Пусто — ' +
                'анкеты работают везде.',
            // Список кодов через запятую: типы значений реестра остаются
            // тремя скалярами, а выбор рисуется по options.
            type: 'string',
            default: '',
            options: EVENT_TYPE_REGISTRY.map(({ code, name }) => ({
                code,
                name,
            })),
            isList: true,
        }),

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
        leadIntakeSlaMaxTransfers: setting({
            code: 'lead_intake_sla_max_transfers',
            name: 'SLA: передач одной заявки за сутки',
            description:
                'Сколько раз одну и ту же непринятую работу можно передать ' +
                'по кругу за сутки. Дальше передача прекращается и ' +
                'руководителю уходит уведомление: если работу не приняли ' +
                'столько раз подряд, дело не в расписании. 0 — без лимита ' +
                '(не рекомендуется).',
            type: 'number',
            default: 3,
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
        //
        // ГДЕ крон ищет — задаётся не здесь, а сопоставлением стадии лида
        // «Очередь в ХО» (lead_xo_queue) в карточке портала: сопоставлена —
        // берём только из неё, не сопоставлена — окно создания ниже.
        leadIntakeRescueEnabled: setting({
            code: 'lead_intake_rescue_enabled',
            name: 'Страховка входа заявок',
            description:
                'Cron ищет лиды, по которым назначение не отработало (нет ни ' +
                'ответственного от хука, ни нашей сделки), и запускает по ним ' +
                'назначение повторно. Если стадия лида «Очередь в ХО» ' +
                'сопоставлена на портале — берёт ТОЛЬКО лиды из неё; если нет ' +
                '— свежие лиды в любой открытой стадии.',
            type: 'boolean',
            default: false,
        }),
        leadIntakeDepartmentAliases: setting({
            code: 'lead_intake_department_aliases',
            name: 'Отдел заявки: как читать «Отдел строка»',
            description:
                'Соответствие значения поля «Отдел строка» лида и отдела ' +
                'продаж, между парами — точка с запятой: ' +
                '«Питер=ОП САНКТ-ПЕТЕРБУРГ (ОП); Воронеж=ОП Воронеж (ОП); ' +
                'Ростов=Отдел продаж Ростов (ОП)». Справа можно указать ' +
                'Bitrix ID отдела вместо названия. Нужно, когда в лиде город ' +
                'написан коротко («Питер»), а отдел называется иначе: без ' +
                'соответствия заявка уходит в общий круг по всем ОП. Пусто — ' +
                'прежнее поведение (сравнение по вхождению названия).',
            type: 'string',
            default: '',
        }),
        leadIntakeRescueLookbackMinutes: setting({
            code: 'lead_intake_rescue_lookback_minutes',
            name: 'Страховка входа: глубина поиска (минут)',
            description:
                'Насколько давние лиды проверять. Больше — надёжнее после ' +
                'долгого простоя, но тяжелее выборка. Работает ТОЛЬКО когда ' +
                'стадия «Очередь в ХО» не сопоставлена: очередь разбирается ' +
                'целиком, без ограничений по датам.',
            type: 'number',
            default: 180,
        }),
        leadIntakeRescueMaxPerRun: setting({
            code: 'lead_intake_rescue_max_per_run',
            name: 'Страховка входа: лидов за проход',
            description:
                'Максимум лидов, дожимаемых за один проход крона. Очередь ' +
                'длиннее этого числа разбирается по частям, остаток уходит ' +
                'на следующий проход.',
            type: 'number',
            default: 20,
        }),
        leadIntakeRescueRequestsOnly: setting({
            code: 'lead_intake_rescue_requests_only',
            name: 'Страховка входа: только заявки',
            description:
                'Включено — дожимаются только распознанные заявки и входящие ' +
                'обращения. Выключено — любой свежий лид без назначения, ' +
                'включая заведённые вручную. НЕ применяется к стадии ' +
                '«Очередь в ХО»: что туда положил робот, то и разбираем.',
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
        leadWorkLinkClient: setting({
            code: 'lead_work_link_client',
            name: 'Клиент из заявки',
            description:
                'При переводе лида в работу: у лида без компании и контакта ' +
                'создать контакт (телефоны и почта уезжают в него) и ' +
                'привязать его к сделке — звонки клиента станут видны в ' +
                'сделке. Лид при этом остаётся открытым.',
            type: 'boolean',
            default: false,
        }),
        leadClientCompanyDepartmentIds: setting({
            code: 'lead_client_company_department_ids',
            name: 'Отделы, где заявка становится компанией',
            description:
                'Bitrix ID отделов через запятую (подотделы входят). Лид ' +
                'сотрудника такого отдела, похожий на организацию, ' +
                'становится компанией, а не контактом; лид с одним ФИО — ' +
                'по-прежнему контактом. Пусто — всегда контакт.',
            type: 'string',
            default: '',
        }),

        // === Фич-флаги фронта «Звонки» ===============================
        // Переезд из хардкода по доменам (front:
        // apps/event-sales/modules/app/consts/domain-config.ts).
        //
        // ПРАВИЛО ДЕФОЛТА: `default` обязан совпадать с ОБЩИМ дефолтом
        // фронта (DEFAULT_CONFIG), а не со значением конкретного портала.
        // Значения приезжают ПОЛНЫМ набором (дефолты кода слиты с
        // сохранённым), поэтому разошедшийся дефолт молча меняет поведение
        // всех порталов, где ключ не задан (так и было у
        // with_presentation_animate: false здесь против true на фронте).
        //
        // «Портал не задавал» от «портал задал ровно столько же» фрейм
        // теперь отличает: рядом со значениями едет storedKeys — ключи,
        // реально лежащие в JSON портала (getStoredAppSettingKeys), и
        // применяет фрейм только их. Ключи, доменные значения которых
        // РАЗЛИЧАЮТСЯ по порталам (with_no_plan, with_no_reschedle,
        // with_post_fail, with_color_required — april-dev/gsirk; with_tm,
        // with_department_mode_toggle — gsr/april-dev;
        // with_check_presentation — alfacentr), портал задаёт здесь ЯВНО:
        // без строки в БД действует доменное значение фронта. Сверх того у
        // идентификаторов (task_group_id, boss_id) есть свой сентинел
        // 0 = «не задано» — он остаётся страховкой для старых фреймов.
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
            description:
                'Анимированная кнопка «Проведена презентация» (эхо-кольца ' +
                'вокруг главного действия экрана). ВКЛЮЧЕНА по умолчанию — ' +
                'как и на фронте; выключать имеет смысл там, где презентаций ' +
                'не проводят.',
            type: 'boolean',
            // true, а не false: это общий дефолт фронта. С дефолтом false
            // настройка гасила анимацию на КАЖДОМ портале — фрейм не
            // отличает дефолт реестра от заданного значения и клал false
            // поверх своего true на любом старте.
            default: true,
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
        withRefineStageOnPlan: setting({
            code: 'refine_stage_on_plan_enabled',
            name: 'Стадия «Доработка» при планировании доработки',
            description:
                'Планирование события «Доработка» всегда переводит основную ' +
                'сделку на стадию «Доработка» — даже назад, с более поздней ' +
                'стадии («Клиент на решении», «Документы»). Единственное ' +
                'исключение из правила «стадию нельзя понизить». ВЫКЛЮЧЕНО ' +
                'по умолчанию: лестница берёт максимум из плана, отчёта и ' +
                'текущей стадии.',
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
            name: 'Чек-лист «Клиент на решении»',
            description:
                'При планировании звонка по решению перед отправкой отчёта ' +
                'обязательны дата КП и дата звонка по решению; проект ' +
                'договора, счёт и плановая дата покупки — по желанию. ' +
                'Условие — планируемое событие, а не стадия сделки.',
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
        // === Политики полей карточки (event-report/field-policy) ===
        withCalculatedNextEvent: setting({
            code: 'calculated_next_event_enabled',
            name: 'Даты следующего события считать по делам клиента',
            description:
                '«ОП Дата Следующего звонка», «ОП Тема Следующего звонка» и ' +
                '«ОП Дата назначенной презентации» считаются по ВСЕМ открытым ' +
                'делам клиента, а не пишутся последним планом. Иначе отчёт, ' +
                'планирующий звонок на 7-е, ставит 7-е клиенту, у которого ' +
                'презентация назначена на 5-е, и стирает дату этой ' +
                'презентации. Работает только со сборками фрейма, которые ' +
                'присылают список открытых дел; старые сборки ведут себя ' +
                'по-прежнему независимо от настройки.',
            type: 'boolean',
            default: true,
        }),
        withFinalFieldsReset: setting({
            code: 'final_fields_reset_enabled',
            name: 'Финал обнуляет даты следующего события',
            description:
                'Продажа, отказ и «не ЦА» очищают даты и тему следующего ' +
                'события: работа с клиентом окончена, и оставшиеся даты ' +
                'вводят в заблуждение отчётность и обзвон. Выключать имеет ' +
                'смысл только там, где карточку после финала продолжают ' +
                'вести руками.',
            type: 'boolean',
            default: true,
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
            // Код оставлен прежним намеренно: значения уже сохранены на
            // порталах, а переименование ключа обнулило бы их. Смысл при
            // этом шире названия — порог ОБЩИЙ для всех ХО-кронов
            // (реанимация отказников, подстраховка лида/компании/сделки),
            // чтобы не держать в голове два разных числа.
            code: 'reject_revive_resend_after_minutes',
            name: 'Подстраховка ХО: порог досылки (минут)',
            description:
                'Через сколько минут элемент, «взятый в очередь» без ' +
                'отметки «хук отправлен», считается недоехавшим и ' +
                'досылается. Общий порог для реанимации отказников и ' +
                'подстраховки по лидам, компаниям и сделкам.',
            type: 'number',
            default: 120,
        }),
        // --- Подстраховка ХО по компаниям и сделкам (крон досыла) --------
        xoRescueEnabled: setting({
            code: 'xo_rescue_enabled',
            name: 'Подстраховка ХО: включена',
            description:
                'Крон дожимает компании и сделки, по которым холодный ' +
                'звонок отправляли, но работа не создалась (хук упал). ' +
                'Ищет по меткам «взято в очередь» / «хук отправлен», ' +
                'которые робот пишет перед вызовом хука.',
            type: 'boolean',
            default: false,
        }),
        xoRescueMaxPerRun: setting({
            code: 'xo_rescue_max_per_run',
            name: 'Подстраховка ХО: лимит за прогон',
            description:
                'Максимум элементов за один тик крона — защита от того, ' +
                'чтобы разом дослать сотни звонков после долгого простоя.',
            type: 'number',
            default: 20,
        }),
        xoRescueOrphanEnabled: setting({
            code: 'xo_rescue_orphan_enabled',
            name: 'Подстраховка ХО: искать по дате звонка',
            description:
                'ВТОРОЙ способ поиска, независимый от меток робота: ' +
                '«дата ХО заполнена, а работы по ней не появилось». Ловит ' +
                'случай, когда робот упал ДО того, как поставил метку. ' +
                'Приблизительный — включайте после того, как посмотрите в ' +
                'логе, кого он забирает (по умолчанию выключен).',
            type: 'boolean',
            default: false,
        }),
        xoRescueOrphanDryRun: setting({
            code: 'xo_rescue_orphan_dry_run',
            name: 'Подстраховка ХО: дата звонка только в лог',
            description:
                'Второй способ ищет кандидатов и пишет их в лог, но НЕ ' +
                'досылает звонки. Включите вместе с поиском по дате, ' +
                'посмотрите один-два прогона, кого он забирает, — и только ' +
                'потом выключайте холостой ход. По умолчанию включён: ' +
                'лишняя досылка уводит клиента у работающего менеджера.',
            type: 'boolean',
            default: true,
        }),
        xoRescueOrphanLookbackHours: setting({
            code: 'xo_rescue_orphan_lookback_hours',
            name: 'Подстраховка ХО: окно поиска по дате (часов)',
            description:
                'Насколько старые даты ХО ещё считаются потерянной ' +
                'работой. Слишком маленькое окно не переживёт выходные ' +
                '(звонок с вечера пятницы к утру понедельника выпадет), ' +
                'слишком большое подметёт историю давно отработанных ' +
                'клиентов. 96 часов покрывают длинные выходные.',
            type: 'number',
            default: 96,
        }),
        xoRescueOrphanWorkingDays: setting({
            code: 'xo_rescue_orphan_working_days',
            name: 'Подстраховка ХО: окно считать в рабочих днях',
            description:
                'Окно поиска отсчитывается по рабочему календарю портала, ' +
                'а не по календарным часам: выходные и праздники не ' +
                '«съедают» окно. Требует доступа к календарю портала ' +
                '(scope calendar); без него отсчёт календарный.',
            type: 'boolean',
            default: false,
        }),
        // === Аудит сделок (deal-audit): «забытые» сделки ==================
        // Крон считает ПРИЗНАКИ по открытым сделкам ОП и пишет их в поля
        // сделки, чтобы забытая работа искалась штатным фильтром CRM и
        // годилась как вход для роботов. Ничего не создаёт и не двигает —
        // только размечает (решение владельца 15.09.2026).
        dealAuditEnabled: setting({
            code: 'deal_audit_enabled',
            name: 'Аудит сделок: включён',
            description:
                'Крон обходит открытые сделки воронки ОП и размечает ' +
                '«забытые»: без задачи, с просроченной задачей, без работы ' +
                'долгое время, забытые перед продажей/отказом. Перед ' +
                'включением установите поля аудита (op_audit_*) на сделку. ' +
                'По умолчанию ВЫКЛЮЧЕНО — фича обкатывается.',
            type: 'boolean',
            default: false,
        }),
        dealAuditIntervalMinutes: setting({
            code: 'deal_audit_interval_minutes',
            name: 'Аудит сделок: интервал (минут)',
            description:
                'Крон тикает часто, но портал аудируется не чаще этого ' +
                'интервала. Признаки меняются по дням, поэтому 1440 (раз в ' +
                'сутки) — рабочее значение; на обкатке ставьте 60.',
            type: 'number',
            default: 1440,
        }),
        dealAuditDryRun: setting({
            code: 'deal_audit_dry_run',
            name: 'Аудит сделок: только считать (не писать)',
            description:
                'Признаки считаются и попадают в лог и в ответ ручного ' +
                'прогона, но в карточки НЕ пишутся. Включено по умолчанию: ' +
                'сначала смотрим один-два прогона, кого аудит помечает, и ' +
                'только потом разрешаем запись.',
            type: 'boolean',
            default: true,
        }),
        dealAuditMaxPerRun: setting({
            code: 'deal_audit_max_per_run',
            name: 'Аудит сделок: лимит за прогон',
            description:
                'Максимум сделок, размечаемых за один тик. Защита от ' +
                'лавины записей на большом портале: остаток доедет ' +
                'следующим тиком (сделки берутся в порядке ID).',
            type: 'number',
            default: 500,
        }),
        dealAuditIdleDays: setting({
            code: 'deal_audit_idle_days',
            name: 'Аудит: дней без работы = «забыта»',
            description:
                'Сколько дней по сделке не было никакой активности ' +
                '(звонок, дело, комментарий, правка), чтобы она считалась ' +
                'забытой. Отсчёт от последней активности карточки.',
            type: 'number',
            default: 14,
        }),
        dealAuditOverdueHours: setting({
            code: 'deal_audit_overdue_hours',
            name: 'Аудит: часов просрочки задачи',
            description:
                'С какой просрочки дедлайна открытая задача считается ' +
                'просроченной. Меньше суток даёт ложные срабатывания на ' +
                'задачах «на сегодня».',
            type: 'number',
            default: 24,
        }),
        dealAuditStageStuckDays: setting({
            code: 'deal_audit_stage_stuck_days',
            name: 'Аудит: дней в одной стадии = «застряла»',
            description:
                'Сколько дней сделка стоит в одной стадии, чтобы попасть ' +
                'в признак «застряла». Считается от даты последнего ' +
                'перемещения по воронке.',
            type: 'number',
            default: 30,
        }),
        dealAuditForgotCloseDays: setting({
            code: 'deal_audit_forgot_close_days',
            name: 'Аудит: дней до «забыли закрыть»',
            description:
                'Сделка стоит в предпродажных стадиях (в решении, в ' +
                'оплате, поставка) дольше этого срока без активности — ' +
                'признак «забыли перевести в продажу или отказ».',
            type: 'number',
            default: 21,
        }),
        dealAuditDigestToManager: setting({
            code: 'deal_audit_digest_to_manager',
            name: 'Аудит: сводку сотруднику',
            description:
                'Каждому ответственному менеджеру уходит уведомление ' +
                'портала со СВОИМИ забытыми сделками (BB-код со ссылками ' +
                'на карточки). По умолчанию выключено: сначала смотрим ' +
                'разметку в карточках, потом включаем рассылку.',
            type: 'boolean',
            default: false,
        }),
        dealAuditDigestToHead: setting({
            code: 'deal_audit_digest_to_head',
            name: 'Аудит: сводку РОПу',
            description:
                'Руководителю отдела, в котором состоит ответственный ' +
                '(РОП и его заместители), уходит сводка по забытым сделкам ' +
                'его сотрудников. Руководитель определяется по структуре ' +
                'компании; если у отдела руководителя нет — берётся ' +
                'руководитель вышестоящего отдела.',
            type: 'boolean',
            default: false,
        }),
        dealAuditDigestUserIds: setting({
            code: 'deal_audit_digest_user_ids',
            name: 'Аудит: получатели общей сводки',
            description:
                'Bitrix ID сотрудников через запятую: «1, 42». Им уходит ' +
                'ОБЩАЯ сводка по всем отделам и подотделам портала — ' +
                'независимо от того, чей менеджер забыл сделку. Пусто — ' +
                'общая сводка не отправляется.',
            type: 'string',
            default: '',
        }),
        dealAuditDigestLimit: setting({
            code: 'deal_audit_digest_limit',
            name: 'Аудит сделок: строк в сводке',
            description:
                'Сколько сделок перечислять в одном уведомлении. Остаток ' +
                'сворачивается в строку «и ещё N» — уведомление портала не ' +
                'резиновое, а простыня на 300 строк не читается.',
            type: 'number',
            default: 20,
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

/**
 * Ключи, РЕАЛЬНО заданные на портале: те, что лежат в JSON-записи
 * (`portal_app_settings.settings`, snake_case-коды) и совпали по типу с
 * дескриптором. Единственное определение признака «задано на портале» —
 * им пользуются и сервис (что отдать фрейму), и админка (бэйдж
 * «настроено»), чтобы два места не разошлись.
 *
 * Совпадение типа входит в признак НАРОЧНО: значение чужого типа `merge`
 * не применяет — действует дефолт кода, — и назвать такой ключ заданным
 * значило бы соврать фрейму: он принял бы дефолт за решение владельца.
 *
 * Наружу уезжают camelCase-ключи схемы, а не snake_case-коды: значения в
 * ответе тоже лежат под ключами схемы.
 */
export function getStoredAppSettingKeys(
    app: EnumPortalAppCode,
    settings: Record<string, unknown>,
): string[] {
    const schema = PORTAL_APP_SETTINGS_SCHEMA[app] as Record<
        string,
        PortalAppSettingDescriptor
    >;
    const keys: string[] = [];
    for (const [key, descriptor] of Object.entries(schema)) {
        const raw = settings[descriptor.code];
        if (raw !== undefined && typeof raw === descriptor.type) {
            keys.push(key);
        }
    }
    return keys;
}
