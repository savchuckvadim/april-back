import { Controller, Get, Param } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { RqMonitoringUseCase } from '../use-cases/rq-monitoring.use-case';
import {
    RqMonitoringResponseDto,
    RqParseResponseDto,
} from '../dto/rq-response.dto';

@ApiTags('PBX Rq Install Monitoring')
@Controller('pbx-rq-install')
export class PbxRqInstallMonitoringController {
    constructor(private readonly useCase: RqMonitoringUseCase) {}

    @ApiOperation({
        summary: 'Предпросмотр эталона реквизитов',
        description:
            'Возвращает TS-эталон: пресеты (org/ip/fiz) и пользовательские поля, ' +
            'которые будут установлены. Для диалога подтверждения перед установкой.',
    })
    @ApiOkResponse({
        type: RqParseResponseDto,
        description: 'Эталон presets + fields.',
    })
    @Get('/monitoring/parse')
    parse(): RqParseResponseDto {
        return this.useCase.parse();
    }

    @ApiOperation({
        summary: 'Текущее состояние реквизитов на портале',
        description:
            'Смерженный вид: Bitrix (`crm.requisite.preset.list` + ' +
            '`crm.requisite.userfield.list`) × PortalDB (`bx_rqs`) × эталон. ' +
            'По каждому пресету — статусы inBitrix / inDb / inSync.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiOkResponse({
        type: RqMonitoringResponseDto,
        description: 'Состояние пресетов и полей со статусами.',
    })
    @Get('/monitoring/domain/:domain')
    async monitoring(
        @Param('domain') domain: string,
    ): Promise<RqMonitoringResponseDto> {
        return await this.useCase.monitoring(domain);
    }
}
