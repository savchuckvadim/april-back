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
import { AppSettingsResolvedDto } from './app-settings.dto';

/**
 * Чтение действующих настроек приложения для ФРОНТОВ (фрейм «Звонки»
 * и др.): дефолты кода + переопределения портала из админки, с Redis-кэшем.
 * Заменяет фронтовый хардкод по доменам (domain-config.ts).
 */
@ApiTags('Event Sales App Settings')
@Controller('app-settings')
export class AppSettingsController {
    constructor(private readonly service: PortalAppSettingsService) {}

    @Get(':appCode')
    @ApiExtraModels(AppSettingsResolvedDto)
    @ApiOperation({
        summary: 'Действующие настройки приложения на домене',
        description:
            'Значения по ключам реестра PORTAL_APP_SETTINGS_SCHEMA ' +
            '(camelCase): дефолты кода, перекрытые настройками портала ' +
            'из админки. Рядом — storedKeys: какие ключи РЕАЛЬНО заданы ' +
            'на портале, чтобы фронт со своими дефолтами не принимал ' +
            'дефолт кода за решение владельца. Кэшируется на бэке — ' +
            'дёргать при инициализации фрейма безопасно.',
    })
    @ApiParam({
        name: 'appCode',
        description: 'Код приложения из реестра.',
        type: String,
        enum: PORTAL_APP_CODES,
        example: EnumPortalAppCode.eventSales,
    })
    @ApiQuery({
        name: 'domain',
        description: 'Домен портала Bitrix.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    // Схема собрана вручную, а не `type: AppSettingsResolvedDto`: у ответа
    // ДВЕ части — именованное поле storedKeys и произвольные ключи реестра
    // со значениями. Голый `type:` описал бы только первую, и фронтовый
    // клиент (orval) потерял бы доступ к значениям; `type: Object`, как
    // было, наоборот отдавал бы клиенту `any`.
    @ApiOkResponse({
        description:
            'Ключ → значение (типы — из реестра) + storedKeys: ключи, ' +
            'заданные на портале.',
        schema: {
            allOf: [
                { $ref: getSchemaPath(AppSettingsResolvedDto) },
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
    ): Promise<AppSettingsResolvedDto> {
        const { values, storedKeys } = await this.service.resolveWithStored(
            domain,
            appCode,
        );
        // Значения — плоско, признак — полем-соседом: старый фрейм читает
        // ключи как читал, новый ещё и знает, чему верить.
        return {
            ...(values as Record<string, boolean | number | string>),
            storedKeys,
        };
    }
}
