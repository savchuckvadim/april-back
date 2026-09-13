import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsIn,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

/**
 * Сценарий создания сервисной сделки из RPA «Поставка»:
 * - `supply` — поставка: сделка собирается из RPA и базовой сделки отдела продаж;
 * - `renewal` — перезаключение: источник — смарт «предложение на будущий период».
 *
 * Не передан — определяем по данным RPA: заполнен «предложение на будущий
 * период» значит перезаключение.
 */
export const SUPPLY_INIT_DEAL_FLOWS = ['supply', 'renewal'] as const;

export type SupplyInitDealFlow = (typeof SUPPLY_INIT_DEAL_FLOWS)[number];

export class BitrixHookAuthRequestDto {
    @ApiProperty({ description: 'Bitrix hook domain' })
    @IsString()
    domain: string;
}

export class InitDealDto {
    @ApiProperty({ description: 'Bitrix hook auth' })
    @ValidateNested()
    @Type(() => BitrixHookAuthRequestDto)
    auth: BitrixHookAuthRequestDto;

    @ApiProperty({ description: 'Document id info', type: [String] })
    @IsArray()
    @IsString({
        each: true,
        message: 'document_id must be an array of strings',
    })
    document_id: string[];

    @ApiProperty({
        description:
            'Сценарий: supply — поставка, renewal — перезаключение. Не передан — определяется по RPA',
        enum: SUPPLY_INIT_DEAL_FLOWS,
        required: false,
    })
    @IsOptional()
    @IsIn(SUPPLY_INIT_DEAL_FLOWS)
    flow?: SupplyInitDealFlow;
}
