import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const ENDPOINT_APPS = ['admin', 'kpi-report-sales', 'event-sales'] as const;
const METHODS = ['GET', 'POST'] as const;
const SETTING_TYPES = ['boolean', 'number', 'string'] as const;
const PARAM_SCOPES = ['global', 'portal', 'tenure', 'manager'] as const;
const PARAM_SOURCES = ['estimated', 'configured', 'hybrid'] as const;

/** Ключ настроек приложения kpiSales, которым пользуется раздел. */
export class AiGuideSettingRefDto {
    @ApiProperty({
        description: 'Код приложения настроек (всегда kpi-sales).',
        example: 'kpi-sales',
        type: String,
    })
    app: string;

    @ApiProperty({
        description: 'camelCase-ключ схемы PORTAL_APP_SETTINGS_SCHEMA.',
        example: 'aiAnalyticsEnabled',
        type: String,
    })
    key: string;

    @ApiProperty({
        description: 'snake_case-код настройки, как в админке и JSON портала.',
        example: 'ai_analytics_enabled',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Название настройки из реестра.',
        example: 'AI-аналитика ОП включена',
        type: String,
    })
    name: string;

    @ApiProperty({
        description: 'Тип значения.',
        enum: SETTING_TYPES,
        example: 'boolean',
    })
    type: (typeof SETTING_TYPES)[number];

    @ApiProperty({
        description: 'Значение по умолчанию (дефолт кода).',
        example: false,
    })
    default: boolean | number | string;

    @ApiProperty({
        description: 'Код категории настроек в админке.',
        example: 'ai_analytics_main',
        type: String,
    })
    group: string;

    @ApiProperty({
        description: 'Название категории настроек.',
        example: 'AI-аналитика: включение и рассылки',
        type: String,
    })
    groupTitle: string;

    @ApiProperty({
        description:
            'Как раздел использует настройку: к чему приведёт значение.',
        type: String,
    })
    note: string;

    @ApiProperty({
        description:
            'Ссылка на поле в карточке портала; `{portalId}` подставляет фронт.',
        example: '/portal/{portalId}/app-settings#setting-ai_analytics_enabled',
        type: String,
    })
    href: string;
}

/** Поле настроек конвейера разбора звонков портала (portal_ai_settings). */
export class AiGuidePortalAiSettingDto {
    @ApiProperty({
        description: 'Имя поля настроек AI портала (как в DTO ai-settings).',
        example: 'allowedUserIds',
        type: String,
    })
    field: string;

    @ApiProperty({
        description: 'Название поля по-русски.',
        example: 'Пилот: bitrix-id сотрудников, чьи звонки разбираются',
        type: String,
    })
    title: string;

    @ApiProperty({ description: 'Как раздел использует поле.', type: String })
    note: string;

    @ApiProperty({
        description: 'Вкладка «Настройки AI» карточки портала.',
        example: '/portal/{portalId}/ai-settings',
        type: String,
    })
    href: string;
}

/** Код реестра параметров AI-аналитики с данными из реестра. */
export class AiGuideParamDto {
    @ApiProperty({
        description: 'Код реестра (snake_case).',
        example: 'weak_section_score_max',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Название из реестра.',
        example: 'Порог слабого раздела разговора',
        type: String,
    })
    title: string;

    @ApiPropertyOptional({
        description: 'Название для руководителя простыми словами; null — нет.',
        example: 'Какая средняя оценка раздела считается слабой',
        type: String,
        nullable: true,
    })
    userTitle: string | null;

    @ApiProperty({ description: 'Описание из реестра.', type: String })
    description: string;

    @ApiProperty({
        description: 'Слой переопределения.',
        enum: PARAM_SCOPES,
        example: 'portal',
    })
    scope: (typeof PARAM_SCOPES)[number];

    @ApiProperty({
        description:
            'Класс параметра: решение человека, оценка из данных, гибрид.',
        enum: PARAM_SOURCES,
        example: 'configured',
    })
    source: (typeof PARAM_SOURCES)[number];

    @ApiProperty({
        description: 'Единица измерения.',
        example: 'баллы',
        type: String,
    })
    unit: string;

    @ApiProperty({ description: 'Глобальный дефолт.', example: 5 })
    default: boolean | number | string;

    @ApiPropertyOptional({
        description: 'Границы [min, max] для числовых; null — нет.',
        example: [3, 7],
        type: [Number],
        nullable: true,
    })
    range: number[] | null;

    @ApiProperty({ description: 'Фаза внедрения.', example: 1, type: Number })
    phase: number;

    @ApiProperty({
        description: 'Смена значения рвёт сравнимость рядов.',
        example: false,
        type: Boolean,
    })
    breaksSeries: boolean;

    @ApiProperty({
        description: 'Код тематической группы реестра.',
        example: 'thresholds',
        type: String,
    })
    group: string;

    @ApiProperty({
        description: 'Название тематической группы.',
        example: 'Пороги сигналов и чисел',
        type: String,
    })
    groupTitle: string;

    @ApiPropertyOptional({
        description: 'Заметка раздела; null — смотрите описание.',
        type: String,
        nullable: true,
    })
    note: string | null;
}

/** Kind базы знаний с описанием из реестра kind'ов. */
export class AiGuideKnowledgeKindDto {
    @ApiProperty({
        description: 'Слаг kind (имя папки базы знаний).',
        example: 'call-analysis-event-invite',
        type: String,
    })
    kind: string;

    @ApiProperty({
        description: 'Человеческое название.',
        example: 'Анализ: приглашение на мероприятие',
        type: String,
    })
    title: string;

    @ApiProperty({ description: 'Что внутри и на что влияет.', type: String })
    description: string;

    @ApiProperty({
        description: 'Кто читает материалы kind.',
        example: 'ночной агент (tier-3)',
        type: String,
    })
    consumer: string;

    @ApiProperty({
        description: 'Может ли клиент править kind в своём кабинете.',
        example: true,
        type: Boolean,
    })
    clientEditable: boolean;

    @ApiPropertyOptional({
        description: 'Заметка раздела; null — нет.',
        type: String,
        nullable: true,
    })
    note: string | null;

    @ApiProperty({
        description:
            'База знаний портала с выбранным kind; `{portalId}` подставляет фронт.',
        example:
            '/portal/{portalId}/ai-settings?tab=knowledge&kind=call-analysis-event-invite',
        type: String,
    })
    href: string;
}

/** Ручка, связанная с разделом. */
export class AiGuideEndpointDto {
    @ApiProperty({
        description: 'Приложение, где живёт ручка (у каждого свой Swagger).',
        enum: ENDPOINT_APPS,
        example: 'admin',
    })
    app: (typeof ENDPOINT_APPS)[number];

    @ApiProperty({ description: 'HTTP-метод.', enum: METHODS, example: 'POST' })
    method: (typeof METHODS)[number];

    @ApiProperty({
        description: 'Путь без префикса /api.',
        example: 'admin/ai-analytics/backfill',
        type: String,
    })
    path: string;

    @ApiPropertyOptional({
        description:
            'Код действия формы «Запуск» в админке; null — формы нет, только описание.',
        example: 'backfill',
        type: String,
        nullable: true,
    })
    action: string | null;

    @ApiPropertyOptional({
        description:
            'Пример тела JSON одной строкой; `{domain}` подставляет фронт.',
        example: '{"domain":"{domain}","from":"2024-11","to":"2026-09"}',
        type: String,
        nullable: true,
    })
    body: string | null;

    @ApiPropertyOptional({
        description: 'Пример query-строки; `{domain}` подставляет фронт.',
        example: 'domain={domain}&months=6',
        type: String,
        nullable: true,
    })
    query: string | null;

    @ApiProperty({ description: 'Когда звать.', type: String })
    when: string;

    @ApiProperty({
        description: 'Зачем: что произойдёт и что вернётся.',
        type: String,
    })
    purpose: string;

    @ApiProperty({
        description: 'Путь Swagger UI приложения (относительно его хоста).',
        example: '/docs/api',
        type: String,
    })
    swaggerPath: string;
}

/** Страница админки, связанная с разделом. */
export class AiGuideAdminPageDto {
    @ApiProperty({ description: 'Подпись ссылки.', type: String })
    title: string;

    @ApiProperty({
        description:
            'Путь админки; `{portalId}` подставляет фронт, без него — глобальная страница.',
        example: '/ai-analytics/model',
        type: String,
    })
    href: string;

    @ApiPropertyOptional({
        description: 'Что там смотреть; null — нет.',
        type: String,
        nullable: true,
    })
    note: string | null;
}

export class AiGuideRelatedDto {
    @ApiProperty({
        description: 'Код связанного раздела.',
        example: 'call-analysis',
        type: String,
    })
    code: string;

    @ApiProperty({ description: 'Название связанного раздела.', type: String })
    title: string;
}

/** Шаг чек-листа «Запуск после выкладки». */
export class AiGuideLaunchStepDto {
    @ApiProperty({
        description: 'Код шага.',
        example: 'install-smart',
        type: String,
    })
    code: string;

    @ApiProperty({ description: 'Название шага.', type: String })
    title: string;

    @ApiProperty({
        description: 'Что сделать и как проверить (markdown).',
        type: String,
    })
    markdown: string;

    @ApiPropertyOptional({
        description:
            'Код действия формы «Запуск» рядом с шагом; null — без формы.',
        example: 'install-smart',
        type: String,
        nullable: true,
    })
    action: string | null;
}

/** Строка оглавления путеводителя. */
export class AiGuideSectionItemDto {
    @ApiProperty({
        description: 'Код раздела.',
        example: 'enable-and-push',
        type: String,
    })
    code: string;

    @ApiProperty({ description: 'Название раздела.', type: String })
    title: string;

    @ApiProperty({
        description: 'Одно-два предложения для оглавления.',
        type: String,
    })
    summary: string;

    @ApiProperty({
        description: 'Сколько ключей kpiSales связано.',
        example: 10,
        type: Number,
    })
    settingsCount: number;

    @ApiProperty({
        description: 'Сколько полей настроек AI портала связано.',
        example: 4,
        type: Number,
    })
    portalAiSettingsCount: number;

    @ApiProperty({
        description: 'Сколько кодов реестра связано.',
        example: 10,
        type: Number,
    })
    paramsCount: number;

    @ApiProperty({
        description: 'Сколько kind базы знаний связано.',
        example: 0,
        type: Number,
    })
    knowledgeKindsCount: number;

    @ApiProperty({
        description: 'Сколько ручек связано.',
        example: 4,
        type: Number,
    })
    endpointsCount: number;

    @ApiProperty({
        description: 'У раздела есть чек-лист «Запуск».',
        example: false,
        type: Boolean,
    })
    hasLaunch: boolean;
}

/** Полный раздел путеводителя: теория и связи. */
export class AiGuideSectionDto extends AiGuideSectionItemDto {
    @ApiProperty({
        description:
            'Теория (markdown) с подразделами «Что это», «Как работает», «Когда срабатывает», «Где смотреть результат», «Что подготовить», «Риски».',
        type: String,
    })
    theory: string;

    @ApiProperty({ type: [AiGuideSettingRefDto] })
    settings: AiGuideSettingRefDto[];

    @ApiProperty({ type: [AiGuidePortalAiSettingDto] })
    portalAiSettings: AiGuidePortalAiSettingDto[];

    @ApiProperty({
        description:
            'Коды реестра: сначала с заметками раздела, затем целые группы.',
        type: [AiGuideParamDto],
    })
    params: AiGuideParamDto[];

    @ApiProperty({ type: [AiGuideKnowledgeKindDto] })
    knowledgeKinds: AiGuideKnowledgeKindDto[];

    @ApiProperty({ type: [AiGuideEndpointDto] })
    endpoints: AiGuideEndpointDto[];

    @ApiProperty({ type: [AiGuideAdminPageDto] })
    adminPages: AiGuideAdminPageDto[];

    @ApiProperty({ type: [AiGuideRelatedDto] })
    related: AiGuideRelatedDto[];

    @ApiProperty({
        description: 'Шаги чек-листа «Запуск»; пусто — у раздела его нет.',
        type: [AiGuideLaunchStepDto],
    })
    launch: AiGuideLaunchStepDto[];
}
