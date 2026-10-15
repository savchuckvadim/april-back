import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

const FAMILIES = ['sales-hook', 'cold-hook', 'lead-request', 'cron'] as const;
const KINDS = ['webhook', 'button', 'cron', 'internal'] as const;
const ENTITIES = ['lead', 'deal', 'company', 'contact', 'task'] as const;
const FIELD_ROLES = ['reads', 'writes', 'marker', 'routing', 'link'] as const;

export class HookEndpointDto {
    @ApiProperty({
        description: 'Роль ручки.',
        enum: ['webhook', 'run', 'button', 'status'],
        example: 'webhook',
    })
    kind: 'webhook' | 'run' | 'button' | 'status';

    @ApiProperty({
        description: 'HTTP-метод.',
        enum: ['GET', 'POST'],
        example: 'POST',
    })
    method: 'GET' | 'POST';

    @ApiProperty({
        description: 'Путь относительно корня API event-sales.',
        example: '/api/sales-hooks/lead-to-work/webhook',
    })
    path: string;

    @ApiProperty({ description: 'Что делает ручка и кто её зовёт.' })
    description: string;

    @ApiPropertyOptional({
        description: 'Готовый пример вызова одной строкой.',
        nullable: true,
    })
    example: string | null;
}

export class HookParamDto {
    @ApiProperty({ description: 'Имя параметра.', example: 'leadId' })
    name: string;

    @ApiProperty({
        description: 'Где передаётся: query (робот) или body (run).',
        enum: ['query', 'body'],
    })
    where: 'query' | 'body';

    @ApiPropertyOptional({
        description: 'Допустимые значения.',
        example: 'Y / N',
        nullable: true,
    })
    values: string | null;

    @ApiPropertyOptional({
        description: 'Значение по умолчанию.',
        example: 'N',
        nullable: true,
    })
    default: string | null;

    @ApiProperty({ description: 'Обязателен ли параметр.', example: false })
    required: boolean;

    @ApiProperty({ description: 'Что делает параметр.' })
    description: string;

    @ApiProperty({
        description: 'Доступен только в /run (кнопка), роботу — нет.',
        example: false,
    })
    runOnly: boolean;
}

export class HookSettingRefDto {
    @ApiProperty({
        description: 'Код приложения настроек.',
        example: 'event-sales',
    })
    app: string;

    @ApiProperty({
        description: 'camelCase-ключ схемы настроек.',
        example: 'leadIntakeSlaMinutes',
    })
    key: string;

    @ApiProperty({
        description: 'snake_case-код настройки (как в админке).',
        example: 'lead_intake_sla_minutes',
    })
    code: string;

    @ApiProperty({
        description: 'Название настройки из реестра.',
        example: 'SLA: минут на принятие',
    })
    name: string;

    @ApiProperty({
        description: 'Тип значения.',
        enum: ['boolean', 'number', 'string'],
    })
    type: 'boolean' | 'number' | 'string';

    @ApiProperty({ description: 'Дефолт кода.', example: 60 })
    default: boolean | number | string;

    @ApiProperty({
        description: 'Роль для хука: gate — рубильник, param — параметр.',
        enum: ['gate', 'param'],
    })
    role: 'gate' | 'param';

    @ApiProperty({ description: 'Как хук использует настройку.' })
    note: string;
}

export class HookPbxFieldRefDto {
    @ApiProperty({
        description: 'Сущность Битрикса.',
        enum: ENTITIES,
        example: 'lead',
    })
    entity: (typeof ENTITIES)[number];

    @ApiProperty({
        description: 'Код поля в реестре PBX_SALES_EVENT_FIELDS.',
        example: 'to_base_sales',
    })
    code: string;

    @ApiProperty({
        description: 'Название поля из реестра.',
        example: 'Корневая сделка Продажи',
    })
    name: string;

    @ApiProperty({
        description: 'Тип поля Битрикса из реестра.',
        example: 'crm',
    })
    type: string;

    @ApiProperty({
        description: 'Роль поля для хука.',
        enum: FIELD_ROLES,
        example: 'link',
    })
    role: (typeof FIELD_ROLES)[number];

    @ApiProperty({
        description: 'Без поля хук теряет часть функции.',
        example: true,
    })
    required: boolean;

    @ApiPropertyOptional({ description: 'Пояснение.', nullable: true })
    note: string | null;
}

export class HookStageRefDto {
    @ApiProperty({
        description: 'Сущность стадии.',
        enum: ['lead', 'deal'],
        example: 'lead',
    })
    entity: 'lead' | 'deal';

    @ApiProperty({
        description: 'Код стадии шаблона.',
        example: 'lead_assigned',
    })
    code: string;

    @ApiProperty({
        description: 'Название стадии.',
        example: 'Назначена менеджеру',
    })
    title: string;

    @ApiProperty({
        description: 'Обязательна для полной работы хука.',
        example: true,
    })
    required: boolean;

    @ApiPropertyOptional({ description: 'Пояснение.', nullable: true })
    note: string | null;
}

export class HookCronDto {
    @ApiProperty({
        description: 'Имя крона в коде.',
        example: 'lead-intake-rescue',
    })
    name: string;

    @ApiProperty({
        description: 'Расписание человеческим текстом.',
        example: 'каждые 30 минут в рабочее время',
    })
    schedule: string;

    @ApiPropertyOptional({
        description: 'Замечания: лок, лимиты за проход.',
        nullable: true,
    })
    note: string | null;
}

export class HookKbDocDto {
    @ApiProperty({
        description: 'Ключ статьи в дереве базы знаний.',
        example: 'h8',
    })
    key: string;

    @ApiProperty({ description: 'Название статьи.' })
    title: string;

    @ApiProperty({
        description: 'Ссылка на документ «Базы знаний 2.0» портала вендора.',
    })
    url: string;

    @ApiProperty({
        description:
            'Статья опубликована целиком; false — на портале пока заготовка ' +
            '«Статья готовится» (текст лежит в исходниках базы знаний).',
        example: true,
    })
    ready: boolean;
}

export class HookRelatedDto {
    @ApiProperty({
        description: 'Код связанного хука.',
        example: 'lead-accept',
    })
    code: string;

    @ApiProperty({ description: 'Название связанного хука.' })
    title: string;
}

/** Строка списка каталога (без тяжёлых текстов). */
export class HookCatalogItemDto {
    @ApiProperty({ description: 'Код хука.', example: 'lead-to-work' })
    code: string;

    @ApiProperty({ description: 'Название.' })
    title: string;

    @ApiProperty({ description: 'Семейство.', enum: FAMILIES })
    family: (typeof FAMILIES)[number];

    @ApiProperty({ description: 'Название семейства на русском.' })
    familyTitle: string;

    @ApiProperty({
        description: 'Чем запускается в первую очередь.',
        enum: KINDS,
    })
    kind: (typeof KINDS)[number];

    @ApiProperty({ description: 'Одно-два предложения для списка.' })
    summary: string;

    @ApiPropertyOptional({
        description: 'Для кронов — расписание.',
        type: HookCronDto,
        nullable: true,
    })
    cron: HookCronDto | null;

    @ApiProperty({
        description: 'Есть ли у хука операции в app-cache (мониторинг).',
        example: true,
    })
    hasOperations: boolean;

    @ApiProperty({ description: 'Сколько PBX-полей обязательны.', example: 5 })
    requiredFieldsCount: number;

    @ApiProperty({ description: 'Сколько стадий обязательны.', example: 3 })
    requiredStagesCount: number;

    @ApiProperty({
        description: 'Сколько настроек портала читает.',
        example: 12,
    })
    settingsCount: number;
}

/** Полная карточка хука: теория, параметры, поля, стадии, статьи. */
export class HookCatalogEntryDto extends HookCatalogItemDto {
    @ApiProperty({ description: 'Теория (markdown).' })
    theory: string;

    @ApiProperty({ description: 'Как работает по факту (markdown).' })
    howItWorks: string;

    @ApiProperty({ description: 'Кто вызывает.', type: [String] })
    triggers: string[];

    @ApiProperty({ type: [HookEndpointDto] })
    endpoints: HookEndpointDto[];

    @ApiProperty({ type: [HookParamDto] })
    params: HookParamDto[];

    @ApiProperty({ type: [HookSettingRefDto] })
    settings: HookSettingRefDto[];

    @ApiProperty({ type: [HookPbxFieldRefDto] })
    pbxFields: HookPbxFieldRefDto[];

    @ApiProperty({ type: [HookStageRefDto] })
    stages: HookStageRefDto[];

    @ApiProperty({ type: [HookKbDocDto] })
    kbDocs: HookKbDocDto[];

    @ApiProperty({ type: [HookRelatedDto] })
    related: HookRelatedDto[];

    @ApiProperty({ description: 'Что установить и настроить (markdown).' })
    install: string;

    @ApiProperty({ description: 'Как проверить, что сработало (markdown).' })
    verify: string;

    @ApiProperty({ description: 'Предупреждения и ловушки.', type: [String] })
    warnings: string[];

    @ApiPropertyOptional({
        description: 'Код хука в операциях app-cache; null — операций нет.',
        nullable: true,
    })
    operationHook: string | null;
}

/** Параметры списка операций. */
export class HookOperationsQueryDto {
    @ApiPropertyOptional({
        description: 'Фильтр по коду хука (hook операции).',
        example: 'lead-to-work',
    })
    @IsOptional()
    @IsString()
    hook?: string;

    @ApiPropertyOptional({
        description: 'Сколько операций вернуть (1–200).',
        example: 50,
        default: 50,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(200)
    limit?: number;
}

export const HOOK_FAMILY_VALUES = FAMILIES;
export const HOOK_KIND_VALUES = KINDS;

/** Защита от опечаток семейства в query (на будущее для фильтра списка). */
export class HookCatalogQueryDto {
    @ApiPropertyOptional({ description: 'Семейство хуков.', enum: FAMILIES })
    @IsOptional()
    @IsIn(FAMILIES)
    family?: (typeof FAMILIES)[number];
}
