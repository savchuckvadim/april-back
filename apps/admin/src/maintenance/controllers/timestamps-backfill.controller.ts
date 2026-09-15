import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TimestampsBackfillService } from '../services/timestamps-backfill.service';
import {
    TimestampsBackfillDto,
    TimestampsBackfillResponseDto,
} from '../dto/timestamps-backfill.dto';

@ApiTags('Admin Maintenance')
@Controller('admin/maintenance/timestamps')
export class TimestampsBackfillController {
    constructor(private readonly service: TimestampsBackfillService) {}

    @Post('backfill')
    @ApiOperation({
        summary: 'Backfill empty portal timestamps',
        description:
            'Находит и чинит строки портальных таблиц с пустыми created_at/updated_at. ' +
            'Пустые таймстампы роняют разбор модели портала в python-сервисе, из-за чего ' +
            'get_rq и другие его ручки отвечают отказом. По умолчанию запуск «сухой»: ' +
            'только считает. Чтобы записать, нужно явно передать dryRun: false. ' +
            'Повторный запуск безопасен — уже заполненные строки не читаются и не пишутся.',
    })
    @ApiBody({
        type: TimestampsBackfillDto,
        description:
            'Режим запуска и, при необходимости, сужение до конкретных таблиц.',
    })
    @ApiOkResponse({
        type: TimestampsBackfillResponseDto,
        description:
            'Сколько строк было битых и сколько починено, с разбивкой по таблицам.',
    })
    async backfill(
        @Body() dto: TimestampsBackfillDto,
    ): Promise<TimestampsBackfillResponseDto> {
        return this.service.backfill(dto);
    }
}
