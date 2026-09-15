import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DealAuditRunRequestDto } from '../dto/deal-audit-run.dto';
import {
    DealAuditRunResponseDto,
    DealAuditVerdictDto,
} from '../dto/deal-audit-result.dto';
import { DealAuditSettingsService } from '../services/deal-audit-settings.service';
import { DealAuditService } from '../services/deal-audit.service';

/**
 * Ручной прогон аудита сделок.
 *
 * Зачем ручка при существующем кроне: включать разметку на живом портале
 * вслепую нельзя. Ручка даёт посмотреть ПОЛНЫЙ результат прогона (кого и
 * почему помечает) при выключенной записи — и только потом владелец
 * включает крон в админке.
 */
@ApiTags('Deal audit')
@Controller('deal-audit')
export class DealAuditController {
    constructor(
        private readonly settings: DealAuditSettingsService,
        private readonly audit: DealAuditService,
    ) {}

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
            byStatus: result.byStatus,
            deals: result.verdicts as DealAuditVerdictDto[],
            warnings: [...result.warnings],
        };
    }
}
