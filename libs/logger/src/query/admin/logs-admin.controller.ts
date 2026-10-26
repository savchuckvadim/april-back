import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LogQueryService } from '../log-query.service';
import {
    LogsQueryDto,
    LogsRowsQueryDto,
    LogsRowsResponseDto,
    LogsSummaryResponseDto,
} from './dto/logs-admin.dto';

/**
 * Журналы всех приложений из ClickHouse для админки: сводка с выводами и
 * строки по фильтру (приложение, портал, уровень, текст). Только чтение.
 */
@ApiTags('Admin Logs')
@Controller('admin/logs')
export class LogsAdminController {
    constructor(private readonly logs: LogQueryService) {}

    @Get('summary')
    @ApiOperation({
        summary: 'Сводка журналов с выводами',
        description:
            'По приложениям — ошибки и предупреждения против прошлого такого же ' +
            'окна, повторяющиеся ошибки, порталы с ошибками и выводы словами: ' +
            'всплески, новые ошибки, замолчавшие приложения.',
    })
    @ApiOkResponse({
        type: LogsSummaryResponseDto,
        description: 'Сводка за окно.',
    })
    async summary(
        @Query() query: LogsQueryDto,
    ): Promise<LogsSummaryResponseDto> {
        return this.logs.summary({ ...query, hours: query.hours ?? 24 });
    }

    @Get()
    @ApiOperation({
        summary: 'Строки журналов по фильтру',
        description: 'Последние записи, новые сверху: до 500 строк.',
    })
    @ApiOkResponse({
        type: LogsRowsResponseDto,
        description: 'Строки журнала.',
    })
    async rows(@Query() query: LogsRowsQueryDto): Promise<LogsRowsResponseDto> {
        const { limit, ...filter } = query;
        return {
            rows: await this.logs.rows(
                { ...filter, hours: filter.hours ?? 24 },
                limit,
            ),
        };
    }
}
