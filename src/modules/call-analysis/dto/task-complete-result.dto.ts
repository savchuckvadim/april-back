import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsInt,
    IsObject,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { EventSalesFlowDto } from '@/apps/event-sales/dto/event-sale-flow/event-sales-flow.dto';

export class TaskCompleteResultDto {
    @ApiProperty({
        description:
            'Принят ли webhook (true только когда задача закрыта и для неё найден сохранённый flowDto в Redis).',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    accepted: boolean;

    @ApiPropertyOptional({
        description:
            'Причина отказа в обработке (когда accepted=false): missing domain/taskId, статус не 5, нет сохранённого flowDto.',
        type: String,
        example: 'Status 2 is not completed (5)',
    })
    @IsOptional()
    @IsString()
    reason?: string;

    @ApiPropertyOptional({
        description: 'Домен портала Bitrix24, с которого пришёл webhook.',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    @IsOptional()
    @IsString()
    domain?: string;

    @ApiPropertyOptional({
        description: 'ID задачи, по которой пришёл webhook.',
        type: Number,
        example: 136086,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    taskId?: number;

    @ApiPropertyOptional({
        description:
            'Подготовленный EventSalesFlowDto (частично заполненный), готов к отправке в /event-sales/flow.',
        type: EventSalesFlowDto,
    })
    @IsOptional()
    @IsObject()
    flowDto?: Partial<EventSalesFlowDto>;
}
