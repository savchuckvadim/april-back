import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested, IsString, IsNumber } from 'class-validator';

/** Скидка строки (легаси precent — коэффициент 1 = без скидки) */
export class RowDiscountDto {
    @ApiProperty({ description: 'Коэффициент скидки (0.8 = −20%)', type: Number })
    @IsNumber()
    precent: number;
    @ApiProperty({ description: 'Скидка в рублях', type: Number })
    @IsNumber()
    amount: number;
    @ApiProperty({ description: 'Активный режим: percent | amount', type: String })
    @IsString()
    current: string;
}

/** Единица измерения строки: id/code — «Код» единицы Bitrix портала, type — месяцев в периоде */
export class RowMeasureDto {
    @ApiProperty({ type: Number })
    @IsNumber()
    id: number;
    @ApiProperty({ description: 'Код единицы Bitrix (portal_measure.bitrixId)', type: Number })
    @IsNumber()
    code: number;
    @ApiProperty({ description: 'Длительность договора в месяцах (1/6/12/24)', type: Number })
    @IsNumber()
    type: number;
    @ApiProperty({ type: String })
    @IsString()
    name: string;
    @ApiProperty({ description: 'Легаси-номер договора', type: Number })
    @IsNumber()
    contractNumber: number;
}

/** Цена строки (легаси ProductRowPriceType) */
export class RowPriceDto {
    @ApiProperty({ description: 'Цена без скидки за период', type: Number })
    @IsNumber()
    default: number;
    @ApiProperty({ description: 'Цена со скидкой', type: Number })
    @IsNumber()
    current: number;
    @ApiProperty({ type: RowMeasureDto })
    @ValidateNested()
    @Type(() => RowMeasureDto)
    measure: RowMeasureDto;
    @ApiProperty({ description: 'Цена в месяц', type: Number })
    @IsNumber()
    month: number;
    @ApiProperty({ type: Number })
    @IsNumber()
    quantity: number;
    @ApiProperty({ type: RowDiscountDto })
    @ValidateNested()
    @Type(() => RowDiscountDto)
    discount: RowDiscountDto;
    @ApiProperty({ description: 'current × quantity', type: Number })
    @IsNumber()
    sum: number;
}
