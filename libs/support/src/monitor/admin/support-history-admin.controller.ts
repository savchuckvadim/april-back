import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupportDialogHistoryService } from '../application/support-dialog-history.service';
import {
    SUPPORT_STATS_DEFAULT_DAYS,
    SupportDialogStatsQueryDto,
    SupportDialogStatsResponseDto,
} from './dto/support-dialog-stats.dto';

/**
 * Статистика обращений портала-клиента в поддержку April — для сводки
 * портала в админке. Источник — история, которую ведёт крон монитора
 * линии (apps/bot); Битрикс здесь не вызывается.
 */
@ApiTags('Admin Support monitor')
@Controller('admin/support-monitor')
export class SupportHistoryAdminController {
    constructor(private readonly history: SupportDialogHistoryService) {}

    @Get('stats')
    @ApiOperation({
        summary: 'Статистика обращений портала в поддержку',
        description:
            'Сколько раз портал писал в линию поддержки за период, сколько ' +
            'открыто, как долго ждали ответа и последние обращения. Учёт ' +
            'ведёт крон монитора линии с момента применения миграции ' +
            'support_dialogs; диалоги короче одного такта крона не видны.',
    })
    @ApiOkResponse({
        type: SupportDialogStatsResponseDto,
        description:
            'Сводка обращений; available=false — история ещё не ведётся.',
    })
    stats(
        @Query() query: SupportDialogStatsQueryDto,
    ): Promise<SupportDialogStatsResponseDto> {
        return this.history.stats(
            query.clientPortal,
            query.days ?? SUPPORT_STATS_DEFAULT_DAYS,
        );
    }
}
