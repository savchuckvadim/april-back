import { Controller, Get, Param } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';

import { InstallEntityFieldDto } from '../../shared';
import { PbxTaskParseService } from '../services/pbx-task-parse.service';
import { PbxTaskMonitoringService } from '../services/pbx-task-monitoring.service';
import {
    BxTaskFieldsListResponseDto,
    PbxTaskMonitoringAllResponseDto,
    PbxTaskMonitoringResultDto,
} from '../dto/pbx-task-monitoring.dto';

/**
 * Мониторинг полей ЗАДАЧИ.
 *
 * `/parse*` — поля из констант приложения (`Field`), без обращения к Bitrix.
 * `/domain/:domain`, `/all`, `/bitrix/domain/:domain` — склейка шаблона с живым
 * Bitrix (у задач нет слоя PortalDB).
 */
@ApiTags('PBX Task Install Monitoring')
@Controller('pbx-task-install-monitoring')
export class PbxTaskInstallMonitoringController {
    constructor(
        private readonly parseService: PbxTaskParseService,
        private readonly monitoringService: PbxTaskMonitoringService,
    ) {}

    @ApiOperation({
        summary: 'Get task fields from constants',
        description:
            'Вернуть все поля задачи из констант приложения в формате ' +
            '"parsed field" (`Field`). Источник — код, без обращения к Bitrix.',
    })
    @ApiOkResponse({
        type: [InstallEntityFieldDto],
        description: 'Массив всех полей задачи из констант в формате `Field`.',
    })
    @Get('/parse')
    getTaskFields(): InstallEntityFieldDto[] {
        return this.parseService.getFields() as InstallEntityFieldDto[];
    }

    @ApiOperation({
        summary: 'Get task fields marked for install',
        description:
            'Вернуть только поля задачи, помеченные к установке/обновлению ' +
            '(`isNeedUpdate = true`), в формате "parsed field" (`Field`). ' +
            'Именно эти поля уходят в Bitrix при установке по домену.',
    })
    @ApiOkResponse({
        type: [InstallEntityFieldDto],
        description:
            'Массив полей задачи к установке (`isNeedUpdate`) в формате `Field`.',
    })
    @Get('/parse/install')
    getTaskFieldsForInstall(): InstallEntityFieldDto[] {
        return this.parseService.getFieldsForInstall() as InstallEntityFieldDto[];
    }

    @ApiOperation({
        summary: 'Полная картина полей задачи по домену (шаблон + Bitrix)',
        description:
            'По каждому полю шаблона (TASK_FIELDS) отдаёт живое поле Bitrix и ' +
            'статус (installed / not_installed), плюс UF_TASK_-поля Bitrix без ' +
            'пары в шаблоне. Слоя PortalDB у задач нет.',
    })
    @ApiParam({
        name: 'domain',
        description: 'Домен портала (april-dev.bitrix24.ru).',
        example: 'april-dev.bitrix24.ru',
    })
    @ApiOkResponse({ type: PbxTaskMonitoringResultDto })
    @Get('/domain/:domain')
    async getByDomain(
        @Param('domain') domain: string,
    ): Promise<PbxTaskMonitoringResultDto> {
        return this.monitoringService.getByDomain(domain);
    }

    @ApiOperation({
        summary:
            'Полная картина полей задачи по всем порталам (шаблон + Bitrix)',
        description:
            'Агрегирует представление по всем порталам PortalDB. Порталы, по ' +
            'которым не удалось получить данные, возвращаются в списке errors.',
    })
    @ApiOkResponse({ type: PbxTaskMonitoringAllResponseDto })
    @Get('/all')
    async getAll(): Promise<PbxTaskMonitoringAllResponseDto> {
        return this.monitoringService.getAll();
    }

    @ApiOperation({
        summary: 'Живые поля задачи Bitrix портала (UF_TASK_*)',
        description:
            'Читает определения пользовательских полей задачи напрямую из ' +
            'Bitrix (task.item.userfield.getlist) и отдаёт только UF_TASK_-поля.',
    })
    @ApiParam({
        name: 'domain',
        description: 'Домен портала (april-dev.bitrix24.ru).',
        example: 'april-dev.bitrix24.ru',
    })
    @ApiOkResponse({ type: BxTaskFieldsListResponseDto })
    @Get('/bitrix/domain/:domain')
    async listBitrixFields(
        @Param('domain') domain: string,
    ): Promise<BxTaskFieldsListResponseDto> {
        return this.monitoringService.listBitrixFields(domain);
    }
}
