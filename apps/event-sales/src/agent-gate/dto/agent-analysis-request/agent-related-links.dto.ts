import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import {
    CALL_REPORT_LINK_STATUS_CODES,
    CallReportLinkStatusCode,
} from '@lib/call-lib';

/**
 * Связи разбора со сделками и элементами списков — вынесены из общего файла
 * контракта агента (лимит файла); имена и декораторы прежние.
 */

/** Привязка к сделкам воронок (если агент установил связь по смыслу). */
export class AgentRelatedDealsDto {
    @ApiPropertyOptional({
        description: 'ID основной сделки ОП (воронка sales_base).',
        example: 12345,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    mainDealId?: number;

    @ApiPropertyOptional({
        description: 'ID сделки ОП Презентации (воронка sales_presentation).',
        example: 12346,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    presentationDealId?: number;

    @ApiPropertyOptional({
        description: 'ID сделки ХО (воронка sales_xo).',
        example: 12347,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    xoDealId?: number;
}

export class AgentListItemLinkDto {
    @ApiProperty({
        description: 'ID элемента списка Bitrix.',
        example: '10231',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    itemId: string;

    @ApiProperty({
        description:
            'Уверенность привязки: confirmed — точно эта запись, suspected — похоже, но не точно.',
        enum: CALL_REPORT_LINK_STATUS_CODES,
        example: 'confirmed',
    })
    @IsString()
    @IsIn(CALL_REPORT_LINK_STATUS_CODES as unknown as string[])
    status: CallReportLinkStatusCode;
}
