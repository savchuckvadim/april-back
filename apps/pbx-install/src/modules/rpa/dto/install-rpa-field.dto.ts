import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';
import { InstallEntityFieldsBulkDto } from '../../shared';
import { RpaNameEnum } from './install-rpa.dto';

/**
 * DTO body-варианта установки полей RPA.
 * Расширяет общий `InstallEntityFieldsBulkDto` (массив полей) адресацией:
 * `domain` — портал, `rpaName` — конкретный RPA-процесс.
 */
export class InstallRpaFieldDto extends InstallEntityFieldsBulkDto {
    @ApiProperty({
        description:
            'Домен Bitrix-портала, на котором выполняется установка полей RPA. ' +
            'Передаётся без протокола и завершающего слэша.',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, {
        message:
            'domain must be a valid hostname without protocol (e.g. example.bitrix24.ru)',
    })
    domain!: string;

    @ApiProperty({
        description:
            'Имя RPA (то же значение, что в URL установки и в `btx_rpas.code`).',
        example: RpaNameEnum.SUPPLY,
        enum: RpaNameEnum,
    })
    @IsEnum(RpaNameEnum)
    rpaName!: RpaNameEnum;
}
