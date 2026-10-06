import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    DealAuditRunNowRequestDto,
    DealAuditRunRequestDto,
} from '../dto/deal-audit-run.dto';
import {
    DealAuditRunNowResponseDto,
    DealAuditRunResponseDto,
    DealAuditVerdictDto,
} from '../dto/deal-audit-result.dto';
import { DealAuditScheduler } from '../deal-audit.scheduler';
import { DealAuditSettingsService } from '../services/deal-audit-settings.service';
import { DealAuditService } from '../services/deal-audit.service';
import { BackgroundCalls } from '@lib/core/call-context';

/**
 * Ручной прогон аудита сделок.
 *
 * Зачем ручка при существующем кроне: включать разметку на живом портале
 * вслепую нельзя. Ручка даёт посмотреть ПОЛНЫЙ результат прогона (кого и
 * почему помечает) при выключенной записи — и только потом владелец
 * включает крон в админке.
 */
@ApiTags('Deal audit')
@BackgroundCalls()
@Controller('deal-audit')
export class DealAuditController {
    constructor(
        private readonly settings: DealAuditSettingsService,
        private readonly audit: DealAuditService,
        private readonly scheduler: DealAuditScheduler,
    ) {}

    @Post('run-now')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Прогнать аудит сейчас, как крон',
        description:
            'Прогон портала вне интервала, по его настройкам: разметка и ' +
            'сводки — как у ночного крона. Идёт в фоне (на большой воронке ' +
            'он дольше таймаута прокси), итог приходит в Telegram. Метка ' +
            'последнего прогона обновляется — крон не повторит его следом.',
    })
    @ApiBody({
        type: DealAuditRunNowRequestDto,
        description: 'Домен портала.',
    })
    @ApiOkResponse({
        type: DealAuditRunNowResponseDto,
        description: 'Начат ли прогон; итог — в Telegram.',
    })
    async runNow(
        @Body() body: DealAuditRunNowRequestDto,
    ): Promise<DealAuditRunNowResponseDto> {
        const started = await this.scheduler.runNow(body.domain);
        return {
            started,
            message: started
                ? 'Прогон начат — итог придёт в Telegram через несколько минут'
                : 'Уже идёт другой прогон аудита — повторите позже',
        };
    }

    @Post('run')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Прогнать аудит сделок по домену',
        description:
            'Считает признаки «забытости» по открытым сделкам воронки ОП ' +
            'и возвращает полный разбор. Пороги и получатели сводок — из ' +
            'настроек портала; `dryRun` и `maxDeals` их перебивают. ' +
            'Выполняется синхронно: на большой воронке ответ занимает ' +
            'десятки секунд.',
    })
    @ApiBody({
        type: DealAuditRunRequestDto,
        description: 'Домен и (необязательно) режим прогона.',
    })
    @ApiOkResponse({
        type: DealAuditRunResponseDto,
        description:
            'Сводка прогона: сколько проверено, сколько забытых, разбивка ' +
            'по статусам и сами сделки с расшифровкой.',
    })
    async run(
        @Body() body: DealAuditRunRequestDto,
    ): Promise<DealAuditRunResponseDto> {
        const options = await this.settings.resolveOptions(body.domain, {
            dryRun: body.dryRun,
            maxPerRun: body.maxDeals,
            dealIds: body.dealIds,
        });
        const result = await this.audit.runForDomain(body.domain, options);
        return {
            domain: result.domain,
            scanned: result.scanned,
            written: result.written,
            flagged: result.flagged,
            dryRun: result.dryRun,
            digestSent: result.digestSent,
            byStatus: result.byStatus,
            deals: result.verdicts as DealAuditVerdictDto[],
            warnings: [...result.warnings],
        };
    }
}
