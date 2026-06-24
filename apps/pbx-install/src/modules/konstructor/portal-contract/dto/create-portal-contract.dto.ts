import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

/**
 * Тело запроса на создание договора портала (`portal_contracts`).
 *
 * Портал определяется по `domain` в URL, поэтому `portal_id` здесь не передаётся.
 * Остальные связи (`contract_id`, `portal_measure_id`, `bitrixfield_item_id`)
 * выбираются из initial-данных формы (`GET /pbx-portal-contract/form/domain/:domain`).
 */
export class CreatePortalContractDto {
    @ApiProperty({
        description: 'ID глобального вида договора (relation contract_id)',
        example: 1,
        type: Number,
    })
    @IsInt()
    @Min(1)
    contract_id: number;

    @ApiProperty({
        description:
            'ID портальной единицы измерения (relation portal_measure_id)',
        example: 1,
        type: Number,
    })
    @IsInt()
    @Min(1)
    portal_measure_id: number;

    @ApiProperty({
        description:
            'ID item-а bitrix-поля contract_type (relation bitrixfield_item_id)',
        example: 1,
        type: Number,
    })
    @IsInt()
    @Min(1)
    bitrixfield_item_id: number;

    @ApiProperty({
        description: 'Заголовок договора',
        example: 'Договор поставки',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiPropertyOptional({
        description: 'Ссылка на шаблон',
        example: 'template',
        type: String,
    })
    @IsOptional()
    @IsString()
    template?: string;

    @ApiPropertyOptional({ description: 'Порядок', example: 1, type: Number })
    @IsOptional()
    @IsInt()
    order?: number;

    @ApiPropertyOptional({
        description: 'Наименование продукта',
        example: 'Товар',
        type: String,
    })
    @IsOptional()
    @IsString()
    productName?: string;

    @ApiPropertyOptional({
        description: 'Описание',
        example: 'Описание договора',
        type: String,
    })
    @IsOptional()
    @IsString()
    description?: string;
}
