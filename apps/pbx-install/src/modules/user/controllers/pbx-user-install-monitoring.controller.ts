import { Controller, Get, Param } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { InstallEntityFieldDto } from '../../shared';
import { PbxUserParseService } from '../services/pbx-user-parse.service';
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
    constructor(
        private readonly monitoringService: PbxUserMonitoringService,
        private readonly parseService: PbxUserParseService,
    ) {}

    @ApiOperation({
        summary: 'Поля пользователя из констант (шаблон)',
        description:
            'Вернуть все поля пользователя из констант приложения (USER_FIELDS) ' +
            'в формате "parsed field" (`Field`). Источник — код, без Bitrix и БД.',
    })
    @ApiOkResponse({
        type: [InstallEntityFieldDto],
        description: 'Массив всех полей пользователя из констант.',
    })
    @Get('/parse')
    getUserFields(): InstallEntityFieldDto[] {
        return this.parseService.getFields() as InstallEntityFieldDto[];
    }

    @ApiOperation({
        summary: 'Поля пользователя из констант, помеченные к установке',
        description:
            'Вернуть только поля пользователя с `isNeedUpdate = true` ' +
            '(именно они уходят в Bitrix при установке).',
    })
    @ApiOkResponse({
        type: [InstallEntityFieldDto],
        description: 'Массив полей пользователя к установке (`isNeedUpdate`).',
    })
    @Get('/parse/install')
    getUserFieldsForInstall(): InstallEntityFieldDto[] {
        return this.parseService.getFieldsForInstall() as InstallEntityFieldDto[];
    }

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
