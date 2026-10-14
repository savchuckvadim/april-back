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
