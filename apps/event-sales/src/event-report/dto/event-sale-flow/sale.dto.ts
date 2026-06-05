import { IsObject, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IBXDeal } from 'src/modules/bitrix';

export class SaleDto {
    @ApiPropertyOptional({
        description:
            'Сделка-связка «продажа ↔ презентация» (`IBXDeal`). ' +
            '`null`, если связанной сделки нет. Структура соответствует сделке Bitrix.',
        type: Object,
        nullable: true,
    })
    @IsOptional()
    @IsObject()
    relationSalePresDeal?: IBXDeal | null;
}
