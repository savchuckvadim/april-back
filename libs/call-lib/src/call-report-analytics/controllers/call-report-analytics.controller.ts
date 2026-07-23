import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CallReportAnalyticsService } from '../call-report-analytics.service';
import {
    CallReportAnalyticsCacheResetDto,
    CallReportAnalyticsQueryDto,
} from '../dto/call-report-analytics-query.dto';
import {
    CallReportAnalyticsCacheResetResponseDto,
    CallReportManagersReportDto,
    CallReportObjectionsReportDto,
    CallReportSpeechReportDto,
    CallReportSummaryReportDto,
} from '../dto/call-report-analytics-response.dto';

/**
 * Отчёты по накопленной AI-аналитике звонков. Каждый endpoint принимает
 * период (from/to по времени звонка) и опциональные фильтры: менеджер,
 * длительность, тип звонка; флаги useCache (Redis) и saveToHistory (ais).
 * Отдельный endpoint — сброс кэша.
 *
 * Модуль переносим: контроллер приезжает в любой app импортом
 * CallReportAnalyticsModule (см. README модуля).
 */
@ApiTags('Call Report Analytics')
@Controller('call-report/analytics')
export class CallReportAnalyticsController {
    constructor(private readonly analytics: CallReportAnalyticsService) {}

    @Post('summary')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сводный отчёт за период',
        description:
            'Объёмы звонков, распределение по типам и менеджерам, ' +
            'результативность, средние оценки, доля назначенных следующих шагов.',
    })
    @ApiBody({ type: CallReportAnalyticsQueryDto })
    @ApiOkResponse({ type: CallReportSummaryReportDto })
    async summary(
        @Body() query: CallReportAnalyticsQueryDto,
    ): Promise<CallReportSummaryReportDto> {
        return (await this.analytics.buildReport(
            'summary',
            query,
        )) as unknown as CallReportSummaryReportDto;
    }

    @Post('speech')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Речевая аналитика за период',
        description:
            'Доля речи менеджера (и выходы за норму СВОЕГО типа звонка), ' +
            'вопросы, соответствие скрипту, средние оценки по 7 разделам разговора.',
    })
    @ApiBody({ type: CallReportAnalyticsQueryDto })
    @ApiOkResponse({ type: CallReportSpeechReportDto })
    async speech(
        @Body() query: CallReportAnalyticsQueryDto,
    ): Promise<CallReportSpeechReportDto> {
        return (await this.analytics.buildReport(
            'speech',
            query,
        )) as unknown as CallReportSpeechReportDto;
    }

    @Post('objections')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Возражения, конкуренты и риски за период',
        description:
            'Частоты категорий возражений и доля отработанных, упоминания ' +
            'конкурентов, риск-флаги, категории отказов (рыночные/исполнительские).',
    })
    @ApiBody({ type: CallReportAnalyticsQueryDto })
    @ApiOkResponse({ type: CallReportObjectionsReportDto })
    async objections(
        @Body() query: CallReportAnalyticsQueryDto,
    ): Promise<CallReportObjectionsReportDto> {
        return (await this.analytics.buildReport(
            'objections',
            query,
        )) as unknown as CallReportObjectionsReportDto;
    }

    @Post('managers')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Рейтинг менеджеров за период',
        description:
            'По каждому менеджеру: звонки, доля результативных, средняя ' +
            'взвешенная оценка, доля речи. Отсортировано по оценке.',
    })
    @ApiBody({ type: CallReportAnalyticsQueryDto })
    @ApiOkResponse({ type: CallReportManagersReportDto })
    async managers(
        @Body() query: CallReportAnalyticsQueryDto,
    ): Promise<CallReportManagersReportDto> {
        return (await this.analytics.buildReport(
            'managers',
            query,
        )) as unknown as CallReportManagersReportDto;
    }

    @Post('cache/reset')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сбросить кэш отчётов',
        description:
            'Удаляет кэшированные отчёты по фильтрам: домен и/или вид отчёта; ' +
            'без фильтров — весь кэш модуля. Использовать после массовых ' +
            'изменений данных (переразбор звонков, правка анализов).',
    })
    @ApiBody({ type: CallReportAnalyticsCacheResetDto })
    @ApiOkResponse({ type: CallReportAnalyticsCacheResetResponseDto })
    async resetCache(
        @Body() dto: CallReportAnalyticsCacheResetDto,
    ): Promise<CallReportAnalyticsCacheResetResponseDto> {
        return this.analytics.resetCache({
            report: dto.report,
            domain: dto.domain,
        });
    }
}
