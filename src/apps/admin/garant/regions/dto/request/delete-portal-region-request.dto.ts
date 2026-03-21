import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import {
    IsDecimal,
    TransformToDecimalString,
} from '@/core/decorators/dto/decimal.decorator';

export class CreatePortalRegionDto {
    @ApiProperty({
        description: 'Domain of the Bitrix24 portal',
        example: 'april-dev.bitrix24.ru',
        required: true,
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'Code of the region',
        example: 'kbr',
        required: true,
    })
    @IsString()
    regionCode: string;
}

export class UpdatePortalRegionDto {
    @ApiProperty({
        description: 'Domain of the Bitrix24 portal',
        example: 'april-dev.bitrix24.ru',
        required: true,
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'Code of the region',
        example: 'kbr',
        required: true,
    })
    @IsString()
    regionCode: string;

    @ApiProperty({
        description:
            'Own AB (decimal value, max 8 digits with 2 decimal places). Can be sent as string or number from frontend.',
        example: '1000.00',
        required: false,
        oneOf: [{ type: 'string' }, { type: 'number' }],
    })
    @IsOptional()
    @TransformToDecimalString()
    @IsDecimal()
    own_abs?: string | null;

    @ApiProperty({
        description:
            'Own tax (decimal value, max 8 digits with 2 decimal places). Can be sent as string or number from frontend.',
        example: '1000.00',
        required: false,
        oneOf: [{ type: 'string' }, { type: 'number' }],
    })
    @IsOptional()
    @TransformToDecimalString()
    @IsDecimal()
    own_tax?: string | null;

    @ApiProperty({
        description:
            'Own tax abs (decimal value, max 8 digits with 2 decimal places). Can be sent as string or number from frontend.',
        example: '1000.00',
        required: false,
        oneOf: [{ type: 'string' }, { type: 'number' }],
    })
    @IsOptional()
    @TransformToDecimalString()
    @IsDecimal()
    own_tax_abs?: string | null;
}

export class DeletePortalRegionDto {
    @ApiProperty({
        description: 'ID of the portal',
        example: 1,
        required: true,
    })
    @IsNumber()
    portalId: number;

    @ApiProperty({
        description: 'ID of the region',
        example: 1,
        required: true,
    })
    @IsNumber()
    regionId: number;
}
