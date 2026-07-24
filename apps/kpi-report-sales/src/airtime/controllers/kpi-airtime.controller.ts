import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PBXService } from '@/modules/pbx';
import {
    AirtimeStatisticResponseDto,
    GetAirtimeStatisticDto,
} from '../dto/airtime-statistic.dto';
import { AirtimeStatisticUseCase } from '../use-cases/kpi-airtime.use-case';

/**
 * Отдельный контроллер отчёта «эфирное время» —
 * альтернатива счётной статистике kpi-report/calling-statistic.
 */
@ApiTags('Sales Airtime')
@Controller('kpi-airtime')
export class KpiAirtimeController {
    constructor(private readonly pbx: PBXService) {}

    @Post('get')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Эфирное время менеджеров',
        description:
            'Считает по каждому сотруднику отдела суммарное время телефонной ' +
            'коммуникации (сумма CALL_DURATION из voximplant.statistic.get) ' +
            'за период, с разбивкой на входящие и исходящие звонки. ' +
            'Альтернатива kpi-report/calling-statistic: возвращает ' +
            'длительности, а не счётчики по бакетам.',
    })
    @ApiBody({
        type: GetAirtimeStatisticDto,
        description: 'Домен портала и фильтры: отдел, период, лимит строк.',
    })
    @ApiOkResponse({
        type: AirtimeStatisticResponseDto,
        description:
            'Эфирное время по каждому сотруднику + метаданные выгрузки.',
    })
    async getAirtimeStatistic(
        @Body() dto: GetAirtimeStatisticDto,
    ): Promise<AirtimeStatisticResponseDto> {
        const { bitrix } = await this.pbx.init(dto.domain);
        const airtimeUseCase = new AirtimeStatisticUseCase(bitrix.api);
        return await airtimeUseCase.get(dto);
    }
}
