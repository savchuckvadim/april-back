import { Controller, Get, Param } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { ListMonitoringUseCase } from '../use-cases/list-monitoring.use-case';
import {
    ListMonitoringResponseDto,
    ListParseResponseDto,
} from '../dto/list-response.dto';

@ApiTags('PBX List Install Monitoring')
@Controller('pbx-list-install')
export class PbxListInstallMonitoringController {
    constructor(private readonly useCase: ListMonitoringUseCase) {}

    @ApiOperation({
        summary: 'Предпросмотр эталона списков',
        description:
            'Возвращает эталон из всех Excel-шаблонов ' +
            '(`install/<group>/list/<folder>/data.xlsx`): списки и их поля, ' +
            'которые будут установлены. Для диалога подтверждения перед установкой.',
    })
    @ApiOkResponse({
        type: ListParseResponseDto,
        description: 'Эталонные списки с полями.',
    })
    @Get('/monitoring/parse')
    async parse(): Promise<ListParseResponseDto> {
        return await this.useCase.parse();
    }

    @ApiOperation({
        summary: 'Текущее состояние списков на портале',
        description:
            'Смерженный вид: эталон × Bitrix (`lists.get` + `lists.field.get`) × ' +
            'PortalDB (`bitrixlists` + `bitrixfields`). По каждому списку и полю — ' +
            'статусы inBitrix / inDb / inSync.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiOkResponse({
        type: ListMonitoringResponseDto,
        description: 'Состояние списков и полей со статусами.',
    })
    @Get('/monitoring/domain/:domain')
    async monitoring(
        @Param('domain') domain: string,
    ): Promise<ListMonitoringResponseDto> {
        return await this.useCase.monitoring(domain);
    }
}
