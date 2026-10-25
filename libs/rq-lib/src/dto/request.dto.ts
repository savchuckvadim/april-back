import { ApiProperty } from '@nestjs/swagger';
import {
    IsNumber,
    IsString,
    IsBoolean,
    IsOptional,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ERQItem } from './erq-item.dto';
import { ERQAddressItem } from './erq-address.dto';
import { ERQBankItem } from './erq-bank.dto';

export class GetRqRequestDto {
    @ApiProperty({
        description: 'ID компании',
        example: 123,
    })
    @IsNumber()
    company_id: number;

    @ApiProperty({
        description: 'Домен портала (может быть пустой строкой)',
        example: 'alfacentr.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'TRUE - внеочереди, FALSE - в очередь',
        example: true,
    })
    @IsBoolean()
    iswait: boolean;
}

export class StoreRqRequestDto {
    //     bx_id
    // :
    // "176358"
    // company_id
    // :
    // "353516"
    // domain
    // :
    // "alfacentr.bitrix24.ru"
    // iswait
    // :
    // true
    // preset_id
    // :
    // 6
    // rq

    @ApiProperty({
        description: 'ID компании',
        example: 123,
    })
    @IsNumber()
    company_id: number;

    @ApiProperty({
        description: 'Домен портала (может быть пустой строкой)',
        example: 'alfacentr.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'TRUE - внеочереди, FALSE - в очередь',
        example: true,
    })
    @IsBoolean()
    iswait: boolean;

    @ApiProperty({
        description:
            'Набор полей реквизита {bx_id: int, fields: dict, address: list[RQAddress], bank: [RQBank]',
        type: ERQItem,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ERQItem)
    rq?: ERQItem;

    @ApiProperty({
        description: 'ID реквизита в Bitrix',
        example: 123,
        required: false,
    })
    @IsOptional()
    @IsNumber()
    bx_id?: number;

    @ApiProperty({
        description: 'Адрес реквизита',
        type: ERQAddressItem,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ERQAddressItem)
    address?: ERQAddressItem;

    @ApiProperty({
        description: 'Банковские реквизиты',
        type: ERQBankItem,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ERQBankItem)
    bank?: ERQBankItem;

    @ApiProperty({
        description: 'ID пресета реквизита',
        example: 1,
        required: false,
    })
    @IsOptional()
    @IsNumber()
    preset_id?: number;
}

export class UpdateAddressRequestDto {
    @ApiProperty({
        description: 'ID компании',
        example: 123,
    })
    @IsNumber()
    @Type(() => Number)
    company_id: number | string;

    @ApiProperty({
        description: 'Домен портала (может быть пустой строкой)',
        example: 'alfacentr.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'TRUE - внеочереди, FALSE - в очередь',
        example: true,
    })
    @IsBoolean()
    iswait: boolean;

    @ApiProperty({
        description: 'ID реквизита в Bitrix (rq_id или bx_id)',
        example: 123,
        required: false,
    })
    @IsOptional()
    @Type(() => Number)
    bx_id?: number | string;

    @ApiProperty({
        description: 'ID реквизита в Bitrix (rq_id или bx_id)',
        example: 123,
        required: false,
    })
    @IsOptional()
    @Type(() => Number)
    rq_id?: number | string;

    @ApiProperty({
        description: 'Адрес реквизита',
        type: ERQAddressItem,
    })
    @ValidateNested()
    @Type(() => ERQAddressItem)
    address: ERQAddressItem;
}

export class StoreRqItemResponseDto {
    @ApiProperty({
        description: 'Результат',
        type: ERQItem,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ERQItem)
    data: ERQItem;
}
export class StoreRqAddressResponseDto {
    @ApiProperty({
        description: 'Результат',
    })
    @IsOptional()
    @IsBoolean()
    data: boolean;
}
export class StoreRqBankResponseDto {
    @ApiProperty({
        description: 'Результат',
    })
    @IsOptional()
    @IsNumber()
    data: number;
}
