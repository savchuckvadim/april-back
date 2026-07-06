import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';
import { InstallEntityFieldsBulkDto } from '@app/pbx-install/shared';
import { ListGroupEnum } from '../type/parse.type';

export const LIST_TYPE_DESCRIPTION =
    'Тип списка (то же значение, что в `bitrixlists.type`, например "kpi", "history").';
export const LIST_GROUP_DESCRIPTION =
    'Группа отдела, к которой относится список (`bitrixlists.group`).';

/**
 * DTO body-варианта установки полей списка.
 * Расширяет общий `InstallEntityFieldsBulkDto` (массив полей) тремя параметрами
 * для адресации: `domain` — портал, `type` + `group` — конкретный список.
 */
export class InstallListFieldDto extends InstallEntityFieldsBulkDto {
    @ApiProperty({
        description:
            'Домен Bitrix-портала, на котором выполняется установка полей списка. ' +
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
        description: LIST_TYPE_DESCRIPTION,
        example: 'kpi',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    type!: string;

    @ApiProperty({
        description: LIST_GROUP_DESCRIPTION,
        example: ListGroupEnum.SALES,
        enum: ListGroupEnum,
    })
    @IsEnum(ListGroupEnum)
    group!: ListGroupEnum;
}
