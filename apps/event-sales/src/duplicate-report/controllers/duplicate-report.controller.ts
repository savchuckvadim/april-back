import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DuplicateReportScheduler } from '../duplicate-report.scheduler';
import {
    DuplicateReportRunNowRequestDto,
    DuplicateReportRunNowResponseDto,
} from '../dto/duplicate-report-run-now.dto';
import { BackgroundCalls } from '@lib/core/call-context';

/**
 * Ручной прогон еженедельного отчёта по дублям сделок.
 *
 * Зачем при существующем кроне: включать задачи руководителям вслепую
 * нельзя. Ручка прогоняет отчёт сейчас — «только посчитать» (цифры в
 * Telegram) или по-настоящему — и владелец решает, включать ли крон.
 */
@ApiTags('Duplicate report')
@BackgroundCalls()
@Controller('duplicate-report')
export class DuplicateReportController {
    constructor(private readonly scheduler: DuplicateReportScheduler) {}

    @Post('run-now')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Прогнать отчёт по дублям сейчас',
        description:
            'Отчёт по клиентам с несколькими открытыми сделками воронки ОП — ' +
            'вне расписания и независимо от того, включён ли он на портале. ' +
            'Идёт в фоне (чтение воронки и задачи получателям дольше ' +
            'таймаута прокси), итог приходит в Telegram. Прогон с задачами ' +
            'закрывает неделю — крон не повторит его следом. С previewUserId — ' +
            'проба: весь отчёт одной задачей одному сотруднику, остальным ' +
            'ничего, неделя не закрывается.',
    })
    @ApiBody({
        type: DuplicateReportRunNowRequestDto,
        description:
            'Домен портала и (необязательно) режим «только посчитать» или ' +
            'пробный получатель.',
    })
    @ApiOkResponse({
        type: DuplicateReportRunNowResponseDto,
        description: 'Начат ли прогон; итог — в Telegram.',
    })
    async runNow(
        @Body() body: DuplicateReportRunNowRequestDto,
    ): Promise<DuplicateReportRunNowResponseDto> {
        const started = await this.scheduler.runNow(
            body.domain,
            body.dryRun,
            body.previewUserId,
        );
        return {
            started,
            message: started
                ? 'Прогон начат — итог придёт в Telegram через несколько минут'
                : 'Уже идёт другой прогон отчёта по дублям — повторите позже',
        };
    }
}
