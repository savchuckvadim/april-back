import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';

import { PbxTaskInstallUseCase } from '../use-cases/pbx-task-install.use-case';
import { PbxTaskInstallFieldUseCase } from '../use-cases/pbx-task-install-field.use-case';
import { PbxTaskFieldManageUseCase } from '../use-cases/pbx-task-field-manage.use-case';
import { InstallTaskFieldDto } from '../dto/install-task-field.dto';
import { DeleteEntityFieldsDto } from '../../shared';

@ApiTags('PBX Task Install')
@Controller('pbx-task-install')
export class PbxTaskFieldInstallController {
    constructor(
        private readonly useCase: PbxTaskInstallUseCase,
        private readonly fieldUseCase: PbxTaskInstallFieldUseCase,
        private readonly manageUseCase: PbxTaskFieldManageUseCase,
    ) {}

    @ApiOperation({
        summary: 'Install task fields by domain (from constants)',
        description:
            'Установить "fields" для "Task" по "домену". Поля берутся из констант ' +
            'приложения (без Excel). Устанавливается/обновляется в Bitrix через ' +
            'task.item.userfield.*. Синхронизация с PortalDB не выполняется ' +
            '(в БД нет сущности task).',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @Get('/install/domain/:domain')
    async installTaskFields(@Param('domain') domain: string): Promise<unknown> {
        return await this.useCase.installTaskFields(domain);
    }

    @ApiOperation({
        summary: 'Install task fields by provided fields data',
        description:
            'Установить "fields" для "Task" по уже подготовленному массиву полей ' +
            '(в теле запроса). Только Bitrix, без синхронизации с PortalDB.',
    })
    @ApiBody({ type: InstallTaskFieldDto })
    @ApiResponse({
        status: 201,
        description:
            'Поля успешно отправлены в Bitrix. Возвращает результат установки (`bxResult`).',
    })
    @Post('/install-fields/')
    async installTaskFieldsByFieldsData(
        @Body() dto: InstallTaskFieldDto,
    ): Promise<unknown> {
        return await this.fieldUseCase.installTaskFields(dto);
    }

    @ApiOperation({
        summary: 'Delete task fields by codes',
        description:
            'Удаляет указанные поля Task из Bitrix (task.item.userfield.delete, batch). ' +
            '`bxFieldName` для каждого code берётся из констант. Поддерживает ' +
            '`domain: "all"` — операция выполняется для всех порталов. ' +
            'Item-операции (enumeration) для задач не поддерживаются.',
    })
    @ApiBody({ type: DeleteEntityFieldsDto })
    @Post('/delete-fields/')
    async deleteTaskFields(
        @Body() dto: DeleteEntityFieldsDto,
    ): Promise<unknown> {
        return await this.manageUseCase.deleteFields(dto);
    }
}
