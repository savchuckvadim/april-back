import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import {
    PortalBitrixLoadDto,
    PortalBitrixLoadQueryDto,
} from './portal-bitrix-load.dto';
import { PortalBitrixLoadService } from './portal-bitrix-load.service';

const DEFAULT_HOURS = 24;

/** Нагрузка портала на Битрикс — для сводки портала в админке. */
@ApiTags('Admin Portal')
@Controller('admin/portal/:portalId/bitrix-load')
export class PortalBitrixLoadController {
    constructor(private readonly service: PortalBitrixLoadService) {}

    @Get()
    @ApiOperation({
        summary: 'Нагрузка портала на Битрикс',
        description:
            'Сколько обращений в Битрикс сделали приложения April за окно: исходы (успех/ошибка/таймаут), менеджер или фон, самые частые методы, ожидание в ограничителе, p95 длительности и пиковый час. Данные — из Prometheus; не ответил — available=false и причина.',
    })
    @ApiParam({ name: 'portalId', description: 'ID портала.', example: 1 })
    @ApiOkResponse({
        type: PortalBitrixLoadDto,
        description: 'Нагрузка за окно.',
    })
    @ApiNotFoundResponse({ description: 'Портал не найден или без домена.' })
    load(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Query() query: PortalBitrixLoadQueryDto,
    ): Promise<PortalBitrixLoadDto> {
        return this.service.load(portalId, query.hours ?? DEFAULT_HOURS);
    }
}
