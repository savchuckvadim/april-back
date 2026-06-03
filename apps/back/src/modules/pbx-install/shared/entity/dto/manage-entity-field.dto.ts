import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNotEmpty, IsString } from 'class-validator';

/** Спец-значение домена: применить операцию ко всем порталам. */
export const MANAGE_DOMAIN_ALL = 'all';

const DOMAIN_DESCRIPTION =
    'Домен Bitrix-портала без протокола и завершающего слэша. ' +
    `Передайте "${MANAGE_DOMAIN_ALL}", чтобы выполнить операцию для всех порталов.`;

export class DeleteEntityFieldsDto {
    @ApiProperty({
        description: DOMAIN_DESCRIPTION,
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Список code полей для удаления из PortalDB и Bitrix.',
        example: ['op_status', 'op_source_select'],
        type: [String],
    })
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    codes: string[];
}

export class DeleteEntityFieldItemDto {
    @ApiProperty({
        description: DOMAIN_DESCRIPTION,
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Code поля-энумератора (например, "contractType").',
        example: 'contractType',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    fieldCode: string;

    @ApiProperty({
        description: 'Code элемента списка для удаления (например, "desctop").',
        example: 'desctop',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    itemCode: string;
}

export class EditEntityFieldItemDto {
    @ApiProperty({
        description: DOMAIN_DESCRIPTION,
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Code поля-энумератора (например, "contractType").',
        example: 'contractType',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    fieldCode: string;

    @ApiProperty({
        description:
            'Code редактируемого элемента списка. По нему находится запись в PortalDB; ' +
            'непосредственный update в Bitrix выполняется по `bitrixfield_items.bitrixId`, ' +
            'хранящемуся в PortalDB после установки поля.',
        example: 'desctop',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    itemCode: string;

    @ApiProperty({
        description:
            'Новое отображаемое значение item-а (`VALUE` в Bitrix, `name`/`title` в PortalDB). ' +
            'Code остаётся прежним.',
        example: 'Десктоп',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    newValue: string;
}
