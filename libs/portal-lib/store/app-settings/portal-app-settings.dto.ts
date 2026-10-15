import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject } from 'class-validator';
import {
    EnumPortalAppCode,
    PORTAL_APP_CODES,
} from './portal-app-settings.schema';

/** Вариант значения-списка: код уезжает в CSV, название — подпись. */
export class PortalAppSettingOptionDto {
    @ApiProperty({
        description: 'Код значения — ровно он попадает в CSV настройки.',
        example: 'presentation',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Название на русском — подпись чекбокса.',
        example: 'Презентация',
        type: String,
    })
    name: string;
}

/** Ссылка группы на связанный раздел админки. */
export class PortalAppSettingLinkDto {
    @ApiProperty({
        description: 'Подпись ссылки.',
        example: 'Поля и стадии сделки',
        type: String,
    })
    title: string;

    @ApiProperty({
        description:
            'Путь раздела админки; `{portalId}` заменяется id портала на фронте.',
        example: '/portal/{portalId}/pbx/deal',
        type: String,
    })
    href: string;
}

/** Хук каталога, который читает настройку (ссылка на страницу хука). */
export class PortalAppSettingHookLinkDto {
    @ApiProperty({
        description: 'Код хука в каталоге админки.',
        example: 'lead-to-work',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Название хука.',
        example: 'Лид → работа (заявка в отдел продаж)',
        type: String,
    })
    title: string;

    @ApiProperty({
        description:
            'Путь страницы хука в карточке портала; `{portalId}` заменяется на фронте.',
        example: '/portal/{portalId}/hooks/lead-to-work',
        type: String,
    })
    href: string;

    @ApiProperty({
        description:
            'Роль настройки для хука: gate — рубильник (включает хук или крон), ' +
            'param — параметр поведения.',
        example: 'param',
        enum: ['gate', 'param'],
    })
    role: 'gate' | 'param';

    @ApiProperty({
        description:
            'Как именно хук использует настройку — внутренняя документация ' +
            'для сотрудников: к чему приведёт значение.',
        example:
            'Порог SLA — он же срок задачи обзвона при распределении по кругу.',
        type: String,
    })
    note: string;
}

/** Стадия лида или воронки ОП, нужная хукам, которые читают настройку. */
export class PortalAppSettingStageDto {
    @ApiProperty({
        description: 'Сущность стадии.',
        example: 'lead',
        enum: ['lead', 'deal'],
    })
    entity: 'lead' | 'deal';

    @ApiProperty({
        description: 'Код стадии шаблона.',
        example: 'lead_assigned',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Название стадии.',
        example: 'Назначена менеджеру',
        type: String,
    })
    title: string;

    @ApiProperty({
        description:
            'Обязательна хотя бы одному из хуков (без неё хук теряет основную функцию).',
        example: true,
        type: Boolean,
    })
    required: boolean;

    @ApiProperty({
        description:
            'Раздел админки, где стадия ставится или сопоставляется; `{portalId}` заменяется на фронте.',
        example: '/portal/{portalId}/pbx/lead',
        type: String,
    })
    href: string;
}

/** PBX-поле, с которым связана настройка через хук, который её читает. */
export class PortalAppSettingPbxFieldDto {
    @ApiProperty({
        description: 'Сущность Битрикса.',
        example: 'lead',
        enum: ['lead', 'deal', 'company', 'contact', 'task'],
    })
    entity: 'lead' | 'deal' | 'company' | 'contact' | 'task';

    @ApiProperty({
        description: 'Код поля реестра PBX.',
        example: 'to_base_sales',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Название поля.',
        example: 'Корневая сделка Продажи',
        type: String,
    })
    name: string;

    @ApiProperty({
        description:
            'Обязательно хотя бы одному из хуков (без него хук теряет основную ' +
            'функцию); необязательное хук пропускает молча с предупреждением.',
        example: true,
        type: Boolean,
    })
    required: boolean;

    @ApiProperty({
        description:
            'Раздел админки, где поле устанавливается; `{portalId}` заменяется на фронте.',
        example: '/portal/{portalId}/pbx/lead',
        type: String,
    })
    href: string;
}

/** Категория настроек приложения (секция в админке). */
export class PortalAppSettingGroupDto {
    @ApiProperty({
        description: 'Код категории — тот же, что у настроек в поле group.',
        example: 'xo_rescue',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Название категории на русском.',
        example: 'Подстраховка ХО',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Что объединяет категория и что для неё нужно.',
        example: 'Досылка холодных обзвонов, которые не дошли.',
        type: String,
    })
    description: string;

    @ApiProperty({
        description: 'Связанные разделы админки (поля, стадии, отделы).',
        type: [PortalAppSettingLinkDto],
    })
    links: PortalAppSettingLinkDto[];

    @ApiPropertyOptional({
        description:
            'Теория категории (markdown, русский): как работает механизм, ' +
            'которым управляют эти настройки, и что от них зависит.',
        type: String,
    })
    theory?: string;

    @ApiPropertyOptional({
        description: 'Хуки каталога, которые читают настройки категории.',
        type: [PortalAppSettingHookLinkDto],
    })
    hooks?: PortalAppSettingHookLinkDto[];

    @ApiPropertyOptional({
        description:
            'PBX-поля, задействованные хуками категории (что должно быть установлено).',
        type: [PortalAppSettingPbxFieldDto],
    })
    pbxFields?: PortalAppSettingPbxFieldDto[];

    @ApiPropertyOptional({
        description:
            'Стадии лида и воронки ОП, нужные хукам категории (что поставить или сопоставить).',
        type: [PortalAppSettingStageDto],
    })
    stages?: PortalAppSettingStageDto[];
}

/** Описатель ключа настройки для админки (из реестра-схемы). */
export class PortalAppSettingDescriptorDto {
    @ApiProperty({
        description: 'Ключ настройки (snake_case, стабилен навсегда).',
        example: 'lead_intake_sla_minutes',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Название на русском (заголовок поля).',
        example: 'SLA: минут на принятие',
        type: String,
    })
    name: string;

    @ApiProperty({
        description: 'Что означает и на что влияет.',
        example: 'Через сколько минут непринятая заявка передаётся другому.',
        type: String,
    })
    description: string;

    @ApiProperty({
        description: 'Тип значения.',
        example: 'number',
        type: String,
        enum: ['boolean', 'number', 'string'],
    })
    type: 'boolean' | 'number' | 'string';

    @ApiProperty({
        description: 'Дефолт кода (действует, пока на портале не задано).',
        example: 60,
    })
    default: boolean | number | string;

    @ApiProperty({
        description:
            'Значение ЗАДАНО на портале: ключ реально лежит в JSON ' +
            'портала (а не приехал дефолтом кода). Ровно этот признак ' +
            'фрейм получает списком storedKeys — админка показывает его ' +
            'бэйджем «настроено».',
        example: true,
        type: Boolean,
    })
    stored: boolean;

    @ApiPropertyOptional({
        description:
            'Текущее действующее значение на портале; null — не задано ' +
            '(действует дефолт кода), то же самое, что stored: false.',
        example: 90,
        nullable: true,
    })
    value: boolean | number | string | null;

    @ApiPropertyOptional({
        description:
            'Справочник значений: админка рисует выбор, а не свободный ' +
            'ввод. Пусто — обычное поле по типу.',
        type: [PortalAppSettingOptionDto],
    })
    options?: PortalAppSettingOptionDto[];

    @ApiPropertyOptional({
        description:
            'Значение — СПИСОК кодов через запятую (тип при этом string): ' +
            'админка рисует чекбоксы по options.',
        example: true,
        type: Boolean,
    })
    isList?: boolean;

    @ApiProperty({
        description:
            'Код категории настройки (секция в админке); описание категории — ' +
            'в groups блока приложения.',
        example: 'lead_sla',
        type: String,
    })
    group: string;

    @ApiPropertyOptional({
        description: 'Хуки каталога, которые читают именно эту настройку.',
        type: [PortalAppSettingHookLinkDto],
    })
    hooks?: PortalAppSettingHookLinkDto[];

    @ApiPropertyOptional({
        description: 'PBX-поля хуков, читающих настройку.',
        type: [PortalAppSettingPbxFieldDto],
    })
    pbxFields?: PortalAppSettingPbxFieldDto[];

    @ApiPropertyOptional({
        description: 'Стадии, нужные хукам, читающим настройку.',
        type: [PortalAppSettingStageDto],
    })
    stages?: PortalAppSettingStageDto[];
}

/** Настройки одного приложения портала: схема + действующие значения. */
export class PortalAppSettingsBlockDto {
    @ApiProperty({
        description: 'Код приложения.',
        example: EnumPortalAppCode.eventSales,
        type: String,
        enum: PORTAL_APP_CODES,
    })
    @IsIn(PORTAL_APP_CODES)
    appCode: EnumPortalAppCode;

    @ApiProperty({
        description: 'Ключи настроек приложения со значениями.',
        type: [PortalAppSettingDescriptorDto],
    })
    settings: PortalAppSettingDescriptorDto[];

    @ApiProperty({
        description:
            'Категории, в которые попали ключи приложения, в порядке показа.',
        type: [PortalAppSettingGroupDto],
    })
    groups: PortalAppSettingGroupDto[];
}

/** Ответ админки: настройки всех приложений портала. */
export class PortalAppSettingsResponseDto {
    @ApiProperty({
        description: 'Блоки настроек по приложениям (из реестра-схемы).',
        type: [PortalAppSettingsBlockDto],
    })
    apps: PortalAppSettingsBlockDto[];
}

/** Тело сохранения настроек одного приложения. */
export class PortalAppSettingsSaveDto {
    @ApiProperty({
        description:
            'Значения по КЛЮЧАМ схемы (camelCase, как в реестре): ' +
            'неизвестные ключи и значения неверного типа пропускаются; ' +
            'явный null сбрасывает ключ на дефолт кода.',
        example: { leadIntakeSlaEnabled: true, leadIntakeSlaMinutes: null },
        type: Object,
    })
    @IsObject()
    values: Record<string, boolean | number | string | null>;
}
