import { Controller, Get, Param } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PbxUserMonitoringService } from '../services/pbx-user-monitoring.service';
import {
    PbxUserMonitoringAllResponseDto,
    PbxUserMonitoringResultDto,
} from '../dto/pbx-user-monitoring.dto';

/**
 * Мониторинг полей пользователя в трёх слоях pbx одновременно:
 * шаблон-константа (USER_FIELDS) / PortalDB / живой Bitrix. Только чтение —
 * ничего не меняет ни в БД, ни в Bitrix.
 */
@ApiTags('PBX User Install Monitoring')
@Controller('pbx-user-install-monitoring')
export class PbxUserInstallMonitoringController {
    constructor(private readonly monitoringService: PbxUserMonitoringService) {}

    @ApiOperation({
        summary: 'Полная картина полей пользователя по домену (3 слоя)',
        description:
            'Возвращает по каждому полю шаблон (USER_FIELDS), запись PortalDB и ' +
            'живое поле Bitrix, статус согласованности и «висящие» поля без пары.',
    })
    @ApiParam({
        name: 'domain',
        description: 'Домен портала (april-dev.bitrix24.ru).',
        example: 'april-dev.bitrix24.ru',
    })
    @ApiOkResponse({ type: PbxUserMonitoringResultDto })
    @Get('domain/:domain')
    async getByDomain(
        @Param('domain') domain: string,
    ): Promise<PbxUserMonitoringResultDto> {
        return this.monitoringService.getByDomain(domain);
    }

    @ApiOperation({
        summary: 'Полная картина полей пользователя по всем порталам (3 слоя)',
        description:
            'Агрегирует представление по всем порталам PortalDB. Порталы, по ' +
            'которым не удалось получить данные, возвращаются в списке errors.',
    })
    @ApiOkResponse({ type: PbxUserMonitoringAllResponseDto })
    @Get('all')
    async getAll(): Promise<PbxUserMonitoringAllResponseDto> {
        return this.monitoringService.getAll();
    }
}
