import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { CreateFieldData } from '@lib/portal-lib/konstructor';

/**
 * Тело запроса на создание поля конструктора (`fields`).
 */
export class CreateFieldDto implements CreateFieldData {
    @ApiProperty({
        description: 'Порядковый номер поля в шаблоне',
        example: 1,
        type: Number,
        minimum: 0,
    })
    @IsInt()
    @Min(0)
    number: number;

    @ApiProperty({
        description: 'Название поля',
        example: 'Наименование товара',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Символьный код поля (идентификатор внутри конструктора)',
        example: 'product_name',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description: 'Тип поля (string/integer/boolean/date/…).',
        example: 'string',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({
        description: 'Поле является общим (используется во всех шаблонах)',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    isGeneral: boolean;

    @ApiProperty({
        description: 'Поле подставляется по умолчанию',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    isDefault: boolean;

    @ApiProperty({
        description: 'Поле обязательно к заполнению',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    isRequired: boolean;

    @ApiPropertyOptional({
        description: 'Значение поля по умолчанию',
        example: 'Товар',
        type: String,
    })
    @IsOptional()
    @IsString()
    value?: string | null;

    @ApiPropertyOptional({
        description: 'Описание поля',
        example: 'Отображаемое наименование позиции',
        type: String,
    })
    @IsOptional()
    @IsString()
    description?: string | null;

    @ApiPropertyOptional({
        description: 'ID соответствующего пользовательского поля в Bitrix',
        example: 'UF_CRM_123',
        type: String,
    })
    @IsOptional()
    @IsString()
    bitixId?: string | null;

    @ApiPropertyOptional({
        description: 'ID шаблона Bitrix, к которому относится поле',
        example: '45',
        type: String,
    })
    @IsOptional()
    @IsString()
    bitrixTemplateId?: string | null;

    @ApiProperty({
        description: 'Поле активно',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    isActive: boolean;

    @ApiProperty({
        description: 'Поле множественное (может иметь несколько значений)',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    isPlural: boolean;

    @ApiPropertyOptional({
        description: 'Поле относится к данным клиента',
        example: false,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isClient?: boolean | null;
}
