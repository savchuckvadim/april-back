import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { IsoMonth } from '../../shared/lib/month-segments.util';
import { AirtimeCacheService } from '../cache/airtime-cache.service';
import {
    AirtimeCacheResetRequestDto,
    AirtimeCacheResetResponseDto,
} from '../dto/airtime-cache-reset.dto';

/**
 * Сброс кэша эфирного времени (прецедент — bx/department/cache/reset).
 * Нужен «на всякий случай»: после сброса следующий запрос честно
 * пересчитает задетые месяцы из Bitrix.
 */
@ApiTags('Sales Airtime')
@Controller('kpi-airtime/cache')
export class AirtimeCacheController {
    constructor(private readonly cache: AirtimeCacheService) {}

    @ApiOperation({
        summary: 'Сбросить кэш эфирного времени',
        description:
            'Удаляет месячные ячейки (БД app_cache + Redis разом) по фильтрам: ' +
            'только domain — весь портал; + month — месяц по всем сотрудникам; ' +
            '+ userIds — все месяцы сотрудников; month + userIds — точечные ' +
            'ячейки. Следующий запрос пересчитает данные из Bitrix.',
    })
    @ApiBody({ type: AirtimeCacheResetRequestDto })
    @ApiOkResponse({ type: AirtimeCacheResetResponseDto })
    @Post('reset')
    @HttpCode(200)
    async reset(
        @Body() dto: AirtimeCacheResetRequestDto,
    ): Promise<AirtimeCacheResetResponseDto> {
        return await this.cache.reset(
            dto.domain,
            dto.month as IsoMonth | undefined,
            dto.userIds,
        );
    }
}
