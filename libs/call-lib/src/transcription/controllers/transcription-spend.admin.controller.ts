import { Controller, Get, Param, Query } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import {
    TranscriptionSpendPortalDto,
    TranscriptionSpendQueryDto,
    TranscriptionSpendSummaryDto,
} from '../dto/transcription-spend.dto';
import { TranscriptionSpendService } from '../services/transcription-spend.service';

/**
 * Расход на распознавание звонков (`admin/transcription-spend`): сколько
 * звонков и минут ушло каждому распознавателю и сколько это стоит. Платим
 * только Яндексу; цена минуты — в «Настройках приложения». Только чтение.
 */
@ApiTags('Admin Transcription Spend')
@Controller('admin/transcription-spend')
export class AdminTranscriptionSpendController {
    constructor(private readonly spendService: TranscriptionSpendService) {}

    @ApiOperation({
        summary: 'Расход на распознавание по всем порталам за месяц',
        description:
            'Порталы — сначала самые дорогие. Рубли — только за Яндекс, по цене минуты из «Настроек приложения»; звонок короче 15 секунд — как 15 секунд.',
    })
    @ApiOkResponse({ type: TranscriptionSpendSummaryDto })
    @Get()
    async summary(
        @Query() query: TranscriptionSpendQueryDto,
    ): Promise<TranscriptionSpendSummaryDto> {
        return this.spendService.summary(query.month);
    }

    @ApiOperation({
        summary: 'Расход портала на распознавание за месяц',
        description:
            'По распознавателям, дням и сотрудникам, самые длинные звонки Яндекса и итог прошлого месяца для сравнения.',
    })
    @ApiParam({
        name: 'domain',
        type: String,
        description: 'Домен портала Битрикс24.',
        example: 'april-garant.bitrix24.ru',
    })
    @ApiOkResponse({ type: TranscriptionSpendPortalDto })
    @Get('portal/:domain')
    async portal(
        @Param('domain') domain: string,
        @Query() query: TranscriptionSpendQueryDto,
    ): Promise<TranscriptionSpendPortalDto> {
        return this.spendService.portal(domain, query.month);
    }
}
