import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import {
    IsDecimal,
    TransformToDecimalString,
} from '@/core/decorators/dto/decimal.decorator';

export class UpdatePortalRegionDtoAdmin {
    // constructor(domain: string, regionCode: string, own_abs: number, own_tax: number, own_tax_abs: number) {
    //     this.domain = domain;
    //     this.regionCode = regionCode;
    //     this.own_abs = own_abs.toString();
    //     this.own_tax = own_tax.toString();
    //     this.own_tax_abs = own_tax_abs.toString();
    // }
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
