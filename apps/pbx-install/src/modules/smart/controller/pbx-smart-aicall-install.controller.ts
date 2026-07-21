import { Controller, Get, Param } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import {
    InstallCallReportSmartUseCase,
    InstallCallReportSmartResult,
} from '@lib/call-lib';
import { InstallAicallSmartResponseDto } from '../dto/install-aicall-smart.dto';

/**
 * Установка смарта «AI-анализ звонков» (aicall_report) — канонная точка
 * pbx-install рядом с остальными установками. Без Excel: const-конфиг
 * полей живёт в @lib/portal-lib/pbx/pbx-aicall-smart, сам use-case —
 * в @lib/call-lib (его же используют контроллеры event-sales и admin).
 */
@ApiTags('Pbx Smart Install')
@Controller('pbx-smart-install')
export class PbxSmartAicallInstallController {
    constructor(
        private readonly installUseCase: InstallCallReportSmartUseCase,
    ) {}

    @Get('install-aicall/domain/:domain')
    @ApiOperation({
        summary: 'Установить смарт «AI-анализ звонков»',
        description:
            'Идемпотентная установка из const-конфига (без Excel): тип при отсутствии, ' +
            'долив недостающих полей, зеркало в smarts/bitrixfields, инвалидация ' +
            'кэша портала.',
    })
    @ApiParam({
        name: 'domain',
        description: 'Домен портала Bitrix24 (hostname без протокола).',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    @ApiOkResponse({
        type: InstallAicallSmartResponseDto,
        description: 'Результат установки: entityTypeId и статистика полей.',
    })
    async install(
        @Param('domain') domain: string,
    ): Promise<InstallCallReportSmartResult> {
        return this.installUseCase.execute(domain);
    }
}
