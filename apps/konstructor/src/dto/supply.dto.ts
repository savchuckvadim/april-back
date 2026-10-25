import { IsNumber } from 'class-validator';
import { IsString } from 'class-validator';
import { IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsNumberOrString } from '@lib/core/decorators/dto/number-or-string.decorator';

/**
 * Поставка в payload генерации. Легаси-фронт присылает все тексты договоров
 * готовыми; новый — только code/type/usersQuantity, тексты бэк резолвит
 * сам (SupplyTextService), поэтому текстовые поля необязательны.
 */
export class SupplyDto {
    @ApiProperty({
        description:
            'Код поставки (internet_5, proxima_flash, X-ОД: x_internet_7)',
        required: false,
    })
    @IsOptional()
    @IsString()
    code?: string;

    @ApiProperty({
        description: 'Число одновременных доступов',
        required: false,
    })
    @IsOptional()
    @IsNumber()
    usersQuantity?: number;

    @ApiProperty({
        description: 'Contract prop supplies quantity',
        required: false,
        oneOf: [{ type: 'number' }, { type: 'string' }],
    })
    @IsOptional()
    @IsNumberOrString()
    contractPropSuppliesQuantity?: number | string;

    @ApiProperty({ description: 'Contract prop 2', required: false })
    @IsOptional()
    @IsString()
    lcontractProp2?: string;

    @ApiProperty({ description: 'Contract name', required: false })
    @IsOptional()
    @IsString()
    lcontractName?: string;

    @ApiProperty({ description: 'Contract prop email', required: false })
    @IsOptional()
    @IsString()
    lcontractPropEmail?: string;
    @ApiProperty({ description: 'Type' })
    @IsString()
    type: string;

    @ApiProperty({
        description: 'Contract prop logins quantity',
        required: false,
    })
    @IsOptional()
    @IsString()
    contractPropLoginsQuantity?: string;

    @ApiProperty({ description: 'Number' })
    @IsNumber()
    number: number;

    @ApiProperty({ description: 'Acontract name', required: false })
    @IsOptional()
    @IsString()
    acontractName?: string;

    @ApiProperty({ description: 'Contract prop comment', required: false })
    @IsOptional()
    @IsString()
    contractPropComment?: string;

    @ApiProperty({ description: 'Contract prop email', required: false })
    @IsOptional()
    @IsString()
    contractPropEmail?: string;

    @ApiProperty({ description: 'Quantity for KP', required: false })
    @IsOptional()
    @IsString()
    quantityForKp?: string;

    @ApiProperty({ description: 'Name' })
    @IsString()
    name: string;
    @ApiProperty({ description: 'Coefficient' })
    @IsNumber()
    coefficient: number;

    @ApiProperty({ description: 'Acontract prop comment', required: false })
    @IsOptional()
    @IsString()
    acontractPropComment?: string;

    @ApiProperty({ description: 'Contract name', required: false })
    @IsOptional()
    @IsString()
    contractName?: string;

    @ApiProperty({ description: 'Contract prop comment', required: false })
    @IsOptional()
    @IsString()
    lcontractPropComment?: string;
    @ApiProperty({ description: 'Contract prop 1', required: false })
    @IsOptional()
    @IsString()
    contractProp1?: string;
}
