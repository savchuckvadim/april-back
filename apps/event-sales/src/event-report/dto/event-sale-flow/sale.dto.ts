import { IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
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

    @ApiPropertyOptional({
        description:
            'Сумма продажи — уходит в штатное поле OPPORTUNITY основной ' +
            'сделки (+ IS_MANUAL_OPPORTUNITY=Y, чтобы Bitrix не пересчитал ' +
            'её из товарных позиций). Обязательна при включённом ' +
            'чек-листе продажи (checklist_sale_enabled).',
        type: Number,
        example: 150000,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    opportunity?: number;

    @ApiPropertyOptional({
        description:
            'Дата первой оплаты (`YYYY-MM-DD`) — пишется в pbx-поле сделки ' +
            '`first_pay_date` (konstructor-реестр); поле не установлено на ' +
            'портале — значение молча пропускается.',
        type: String,
        example: '2026-09-01',
    })
    @IsOptional()
    @IsString()
    firstPayDate?: string;
}
