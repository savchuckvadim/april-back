import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject } from 'class-validator';
import {
    EnumPortalAppCode,
    PORTAL_APP_CODES,
} from './portal-app-settings.schema';

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

    @ApiPropertyOptional({
        description: 'Текущее действующее значение на портале.',
        example: 90,
        nullable: true,
    })
    value: boolean | number | string | null;
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
