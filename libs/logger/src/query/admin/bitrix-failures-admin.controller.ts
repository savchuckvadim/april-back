import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BitrixFailureQueryService } from '../bitrix-failures/bitrix-failures.service';
import { LOG_QUERY_HOURS } from '../log-query.types';
import {
    BitrixFailuresQueryDto,
    BitrixFailuresResponseDto,
} from './dto/bitrix-failures-admin.dto';

/**
 * Журнал сбоев Битрикса для админки: окончательные сбои записи и чтения
 * (попытки исчерпаны, ошибка без повтора, упавший чанк пачки, ошибка
 * команды) с приложением, операцией, карточкой и сотрудником. Только чтение.
 */
@ApiTags('Admin Logs')
@Controller('admin/logs/bitrix-failures')
export class BitrixFailuresAdminController {
    constructor(private readonly failures: BitrixFailureQueryService) {}

    @Get()
    @ApiOperation({
        summary: 'Сбои Битрикса: сводка и последние строки',
        description:
            'Окончательные сбои обращений в Битрикс за окно: сколько сбоев ' +
            'записи и чтения, по приложениям и операциям, и последние строки ' +
            '(время, приложение, операция, карточка, сотрудник, что не ' +
            'записалось, ошибка). Фильтр по порталу, приложению и «только ' +
            'запись»; промежуточные неудачные попытки сюда не попадают.',
    })
    @ApiOkResponse({
        type: BitrixFailuresResponseDto,
        description: 'Сводка за окно и строки журнала сбоев.',
    })
    async journal(
        @Query() query: BitrixFailuresQueryDto,
    ): Promise<BitrixFailuresResponseDto> {
        const { limit, ...filter } = query;
        return this.failures.journal(
            { ...filter, hours: filter.hours ?? LOG_QUERY_HOURS.fallback },
            limit,
        );
    }
}
