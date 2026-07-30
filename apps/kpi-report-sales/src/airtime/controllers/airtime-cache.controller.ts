import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { IsoMonth } from '../../shared/lib/month-segments.util';
import { AirtimeCacheService } from '../cache/airtime-cache.service';
import { AirtimeMarkerCacheService } from '../cache/airtime-marker-cache.service';
import {
    AirtimeCacheResetRequestDto,
    AirtimeCacheResetResponseDto,
} from '../dto/airtime-cache-reset.dto';

/**
 * Сброс кэша эфирного времени (прецедент — bx/department/cache/reset).
 * Нужен «на всякий случай»: после сброса следующий запрос честно
 * пересчитает задетые месяцы из Bitrix.
 *
 * Вместе с ячейками ОБЯЗАТЕЛЬНО сносятся маркеры партиций: ячейки без
 * маркера — честный промах (пересбор), а маркер без ячеек дал бы тихие
 * нули в отчёте.
 */
@ApiTags('Sales Airtime')
@Controller('kpi-airtime/cache')
export class AirtimeCacheController {
    constructor(
        private readonly cache: AirtimeCacheService,
        private readonly markerCache: AirtimeMarkerCacheService,
    ) {}

    @ApiOperation({
        summary: 'Сбросить кэш эфирного времени',
        description:
            'Удаляет ячейки И маркеры партиций (БД app_cache + Redis разом) ' +
            'по фильтрам: только domain — весь портал; + month — месяц по ' +
            'всем сотрудникам; + userIds — все месяцы сотрудников; month + ' +
            'userIds — точечные ячейки (маркеры месяца сбрасываются в любом ' +
            'случае). Следующий запрос пересчитает данные из Bitrix.',
    })
    @ApiBody({ type: AirtimeCacheResetRequestDto })
    @ApiOkResponse({ type: AirtimeCacheResetResponseDto })
    @Post('reset')
    @HttpCode(200)
    async reset(
        @Body() dto: AirtimeCacheResetRequestDto,
    ): Promise<AirtimeCacheResetResponseDto> {
        const month = dto.month as IsoMonth | undefined;
        const result = await this.cache.reset(dto.domain, month, dto.userIds);
        // Маркеры сносим всегда: сброс любой ячейки месяца делает партицию
        // «несобранной» — иначе отсутствующая ячейка читалась бы как ноль.
        await this.markerCache.resetMarkers(dto.domain, month);
        return result;
    }
}
