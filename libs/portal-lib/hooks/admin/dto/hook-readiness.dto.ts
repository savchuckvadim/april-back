import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const STATUSES = ['ready', 'partial', 'not-installed', 'none'] as const;

export class HookFieldCheckDto {
    @ApiProperty({
        description: 'Сущность.',
        enum: ['lead', 'deal', 'company', 'contact', 'task'],
    })
    entity: 'lead' | 'deal' | 'company' | 'contact' | 'task';

    @ApiProperty({ description: 'Код поля реестра.', example: 'to_base_sales' })
    code: string;

    @ApiProperty({
        description: 'Название поля.',
        example: 'Корневая сделка Продажи',
    })
    name: string;

    @ApiProperty({
        description: 'Роль поля для хука.',
        enum: ['reads', 'writes', 'marker', 'routing', 'link'],
    })
    role: 'reads' | 'writes' | 'marker' | 'routing' | 'link';

    @ApiProperty({ description: 'Обязательно для полной работы.' })
    required: boolean;

    @ApiProperty({
        description: 'Установлено на портале (по слепку PortalDB).',
    })
    installed: boolean;

    @ApiPropertyOptional({ description: 'Пояснение.', nullable: true })
    note: string | null;

    @ApiProperty({
        description: 'Раздел админки, где поле ставится.',
        example: '/portal/{portalId}/pbx/lead',
    })
    href: string;
}

export class HookStageCheckDto {
    @ApiProperty({ description: 'Сущность стадии.', enum: ['lead', 'deal'] })
    entity: 'lead' | 'deal';

    @ApiProperty({
        description: 'Код стадии шаблона.',
        example: 'lead_assigned',
    })
    code: string;

    @ApiProperty({ description: 'Название стадии.' })
    title: string;

    @ApiProperty({ description: 'Обязательна для полной работы.' })
    required: boolean;

    @ApiProperty({ description: 'Сопоставлена/установлена на портале.' })
    mapped: boolean;

    @ApiPropertyOptional({ description: 'Пояснение.', nullable: true })
    note: string | null;

    @ApiProperty({
        description: 'Раздел админки, где стадия ставится или сопоставляется.',
    })
    href: string;
}

export class HookSettingCheckDto {
    @ApiProperty({
        description: 'Код приложения настроек.',
        example: 'event-sales',
    })
    app: string;

    @ApiProperty({
        description: 'camelCase-ключ схемы.',
        example: 'leadIntakeSlaEnabled',
    })
    key: string;

    @ApiProperty({
        description: 'snake_case-код настройки.',
        example: 'lead_intake_sla_enabled',
    })
    code: string;

    @ApiProperty({ description: 'Название настройки.' })
    name: string;

    @ApiProperty({
        description: 'Тип значения.',
        enum: ['boolean', 'number', 'string'],
    })
    type: 'boolean' | 'number' | 'string';

    @ApiProperty({
        description: 'Роль: gate — рубильник, param — параметр.',
        enum: ['gate', 'param'],
    })
    role: 'gate' | 'param';

    @ApiPropertyOptional({
        description: 'Действующее значение на портале.',
        nullable: true,
    })
    value: boolean | number | string | null;

    @ApiProperty({ description: 'Дефолт кода.' })
    default: boolean | number | string;

    @ApiProperty({ description: 'Значение задано на портале (не дефолт).' })
    stored: boolean;

    @ApiProperty({ description: 'Как хук использует настройку.' })
    note: string;

    @ApiProperty({
        description: 'Раздел админки с этой настройкой.',
        example: '/portal/{portalId}/app-settings',
    })
    href: string;
}

export class PortalHookReadinessDto {
    @ApiProperty({ description: 'Код хука.', example: 'lead-to-work' })
    code: string;

    @ApiProperty({ description: 'Название хука.' })
    title: string;

    @ApiProperty({
        description: 'Семейство.',
        enum: ['sales-hook', 'cold-hook', 'lead-request', 'cron'],
    })
    family: 'sales-hook' | 'cold-hook' | 'lead-request' | 'cron';

    @ApiProperty({
        description:
            'Статус установки: ready — всё обязательное есть; partial — часть; not-installed — ничего; none — требований нет.',
        enum: STATUSES,
    })
    status: (typeof STATUSES)[number];

    @ApiPropertyOptional({
        description:
            'Рубильник на портале: true/false; null — у хука нет рубильника (вебхук работает всегда).',
        nullable: true,
    })
    enabled: boolean | null;

    @ApiProperty({
        description:
            'Чего не хватает из обязательного (человеческие названия).',
        type: [String],
    })
    missingRequired: string[];

    @ApiProperty({ type: [HookFieldCheckDto] })
    fields: HookFieldCheckDto[];

    @ApiProperty({ type: [HookStageCheckDto] })
    stages: HookStageCheckDto[];

    @ApiProperty({ type: [HookSettingCheckDto] })
    settings: HookSettingCheckDto[];
}

export class PortalHooksReadinessResponseDto {
    @ApiProperty({ description: 'Id портала.', example: 7 })
    portalId: number;

    @ApiProperty({
        description: 'Домен портала.',
        example: 'example.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({ type: [PortalHookReadinessDto] })
    hooks: PortalHookReadinessDto[];
}
