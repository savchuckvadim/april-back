import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { InstallEntityFieldDto } from '../../shared';
import { PbxTaskParseService } from '../services/pbx-task-parse.service';

/**
 * Мониторинг констант полей ЗАДАЧИ.
 *
 * Отдаёт поля из констант приложения в формате parsed-field (`Field`) —
 * БЕЗ обращения к Bitrix. Аналог `/parse/...` у остальных модулей.
 */
@ApiTags('PBX Task Install Monitoring')
@Controller('pbx-task-install-monitoring')
export class PbxTaskInstallMonitoringController {
    constructor(private readonly parseService: PbxTaskParseService) {}

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
}
