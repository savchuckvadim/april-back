import {
    Controller,
    Post,
    Body,
    HttpException,
    HttpStatus,
    ValidationPipe,
    UsePipes,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBody,
    ApiBadRequestResponse,
    ApiCreatedResponse,
} from '@nestjs/swagger';
import { PbxFieldEntityInstallService } from '../services/pbx-field-entity-install.service';
import { PbxFieldSmartInstallService } from '../services/pbx-field-smart-install.service';
import {
    InstallEntityFieldsDto,
    InstallSmartFieldsDto,
    InstallResultDto,
} from '../dto/pbx-field-install.dto';

@ApiTags('PBX Field Install')
@Controller('pbx-field-install')
export class PbxFieldInstallController {
    constructor(
        private readonly pbxFieldEntityInstallService: PbxFieldEntityInstallService,
        private readonly pbxFieldSmartInstallService: PbxFieldSmartInstallService,
    ) { }

    @Post('entity')
    @UsePipes(new ValidationPipe({ transform: true }))
    @ApiOperation({
        summary: 'Установить поля для обычных сущностей (Lead, Company, Deal)',
        description:
            'Устанавливает пользовательские поля для обычных CRM сущностей. ' +
            'Использует методы сущностей (company.addField, deal.getFieldsList) для работы с полями.',
    })
    @ApiBody({
        type: InstallEntityFieldsDto,
        description: 'Параметры установки полей для обычных сущностей',
    })
    @ApiCreatedResponse({
        description: 'Поля успешно установлены',
        type: InstallResultDto,
    })
    @ApiBadRequestResponse({
        description: 'Некорректные данные запроса',
    })
    async installEntityFields(
        @Body() dto: InstallEntityFieldsDto,
    ): Promise<InstallResultDto> {
        try {
            const result = await this.pbxFieldEntityInstallService.install(
                dto.domain,
                dto.group,
                dto.appType,
                {
                    entities: dto.entities,
                    fieldCodes: dto.fieldCodes,
                },
            );

            return result;
        } catch (error) {
            throw new HttpException(
                {
                    success: false,
                    error: 'PBX Field Entity Install failed',
                    details: {
                        domain: dto.domain,
                        group: dto.group,
                        appType: dto.appType,
                        message: error.message,
                        stack: error.stack,
                    },
                },
                HttpStatus.BAD_REQUEST,
            );
        }
    }

    @Post('smart')
    @UsePipes(new ValidationPipe({ transform: true }))
    @ApiOperation({
        summary: 'Установить поля для Smart сущностей',
        description:
            'Устанавливает пользовательские поля для Smart сущностей. ' +
            'Использует userFieldConfig API для работы с полями.',
    })
    @ApiBody({
        type: InstallSmartFieldsDto,
        description: 'Параметры установки полей для Smart сущностей',
    })
    @ApiCreatedResponse({
        description: 'Поля успешно установлены',
        type: InstallResultDto,
    })
    @ApiBadRequestResponse({
        description: 'Некорректные данные запроса',
    })
    async installSmartFields(
        @Body() dto: InstallSmartFieldsDto,
    ): Promise<InstallResultDto> {
        try {
            const result = await this.pbxFieldSmartInstallService.install(
                dto.domain,
                dto.group,
                dto.appType,
                {
                    entityTypeIds: dto.entityTypeIds,
                    fieldCodes: dto.fieldCodes,
                },
            );

            return result;
        } catch (error) {
            throw new HttpException(
                {
                    success: false,
                    error: 'PBX Field Smart Install failed',
                    details: {
                        domain: dto.domain,
                        group: dto.group,
                        appType: dto.appType,
                        message: error.message,
                        stack: error.stack,
                    },
                },
                HttpStatus.BAD_REQUEST,
            );
        }
    }
}
