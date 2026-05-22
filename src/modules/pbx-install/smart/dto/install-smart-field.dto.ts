import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';
import { InstallEntityFieldsBulkDto } from '../../shared';
import { SmartGroupEnum, SmartNameEnum } from './install-smart.dto';

/**
 * DTO body-варианта установки полей смарта.
 * Расширяет общий `InstallEntityFieldsBulkDto` (массив полей) тремя параметрами для адресации:
 * `domain` — портал, `smartName` + `group` — конкретный смарт-процесс на этом портале.
 */
export class InstallSmartFieldDto extends InstallEntityFieldsBulkDto {
    @ApiProperty({
        description:
            'Домен Bitrix-портала, на котором выполняется установка полей смарта. ' +
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
            'Имя смарта (то же значение, что в URL установки и в `smarts.type`).',
        example: SmartNameEnum.PRESENTATION,
        enum: SmartNameEnum,
    })
    @IsEnum(SmartNameEnum)
    smartName!: SmartNameEnum;

    @ApiProperty({
        description: 'Группа отдела, к которой относится смарт (`smarts.group`).',
        example: SmartGroupEnum.SALES,
        enum: SmartGroupEnum,
    })
    @IsEnum(SmartGroupEnum)
    group!: SmartGroupEnum;
}
