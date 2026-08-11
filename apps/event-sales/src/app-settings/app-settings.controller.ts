import { Controller, Get, Param, Query } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import {
    EnumPortalAppCode,
    PORTAL_APP_CODES,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';

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
    @ApiOperation({
        summary: 'Действующие настройки приложения на домене',
        description:
            'Значения по ключам реестра PORTAL_APP_SETTINGS_SCHEMA ' +
            '(camelCase): дефолты кода, перекрытые настройками портала ' +
            'из админки. Кэшируется на бэке — дёргать при инициализации ' +
            'фрейма безопасно.',
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
    @ApiOkResponse({
        description: 'Ключ → значение (типы — из реестра).',
        type: Object,
    })
    async resolve(
        @Param('appCode') appCode: EnumPortalAppCode,
        @Query('domain') domain: string,
    ): Promise<Record<string, boolean | number | string>> {
        return (await this.service.resolve(domain, appCode)) as Record<
            string,
            boolean | number | string
        >;
    }
}
