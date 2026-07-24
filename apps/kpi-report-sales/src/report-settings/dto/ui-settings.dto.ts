import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString } from 'class-validator';

/**
 * UI-настройки KPI-отчёта (конверсии, видимость блоков, локальные фильтры
 * таблиц и т.п.). Для бэка блоб непрозрачен: фронт сам версионирует формат,
 * бэк только хранит строку per portal+user (изоляция domain+userId).
 */
export class UiSettingsGetRequestDto {
    @ApiProperty({ example: 'portal.bitrix24.ru' })
    @IsString()
    domain: string;

    @ApiProperty({ example: 447, description: 'BX user id' })
    @IsInt()
    userId: number;
}

export class UiSettingsGetResponseDto {
    @ApiProperty({
        type: String,
        nullable: true,
        description: 'JSON-блоб UI-настроек (null — ещё не сохранялись)',
    })
    settings: string | null;

    @ApiProperty({
        type: String,
        nullable: true,
        description: 'ISO-дата последнего сохранения',
    })
    updatedAt: string | null;
}

export class UiSettingsSaveRequestDto {
    @ApiProperty({ example: 'portal.bitrix24.ru' })
    @IsString()
    domain: string;

    @ApiProperty({ example: 447, description: 'BX user id' })
    @IsInt()
    userId: number;

    @ApiProperty({ description: 'JSON-блоб UI-настроек' })
    @IsString()
    settings: string;
}

export class UiSettingsSaveResponseDto {
    @ApiProperty()
    saved: boolean;
}
