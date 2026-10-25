import { Controller, Get, Param, Query } from '@nestjs/common';
import {
    ApiExtraModels,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiTags,
    getSchemaPath,
} from '@nestjs/swagger';
import {
    EnumPortalAppCode,
    PORTAL_APP_CODES,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { KonstructorAppSettingsResolvedDto } from './app-settings.dto';

/**
 * Действующие настройки приложения для фрейма конструктора (зеркало
 * event-sales `AppSettingsController`): дефолты реестра + переопределения
 * портала из админки. Конструктору нужны флаги вроде «3 КП для торгов».
 */
@ApiTags('KonstructorAppSettings')
@Controller('app-settings')
export class KonstructorAppSettingsController {
    constructor(private readonly service: PortalAppSettingsService) {}

    @Get(':appCode')
    @ApiExtraModels(KonstructorAppSettingsResolvedDto)
    @ApiOperation({
        summary: 'Действующие настройки приложения на домене',
        description:
            'Значения по ключам реестра PORTAL_APP_SETTINGS_SCHEMA (camelCase) + storedKeys: ' +
            'какие ключи реально заданы на портале. Кэшируется на бэке.',
    })
    @ApiParam({
        name: 'appCode',
        type: String,
        enum: PORTAL_APP_CODES,
        example: EnumPortalAppCode.konstructor,
    })
    @ApiQuery({ name: 'domain', type: String, example: 'example.bitrix24.ru' })
    @ApiOkResponse({
        description: 'Ключ → значение (типы — из реестра) + storedKeys.',
        schema: {
            allOf: [
                { $ref: getSchemaPath(KonstructorAppSettingsResolvedDto) },
                {
                    type: 'object',
                    additionalProperties: {
                        oneOf: [
                            { type: 'boolean' },
                            { type: 'number' },
                            { type: 'string' },
                        ],
                    },
                },
            ],
        },
    })
    async resolve(
        @Param('appCode') appCode: EnumPortalAppCode,
        @Query('domain') domain: string,
    ): Promise<KonstructorAppSettingsResolvedDto> {
        const { values, storedKeys } = await this.service.resolveWithStored(
            domain,
            appCode,
        );
        return {
            ...(values as Record<string, boolean | number | string>),
            storedKeys,
        };
    }
}
