import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Post,
} from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingDescriptor,
    PortalAppSettingsPatch,
} from './portal-app-settings.schema';
import { PortalAppSettingsService } from './portal-app-settings.service';
import {
    PortalAppSettingsBlockDto,
    PortalAppSettingsResponseDto,
    PortalAppSettingsSaveDto,
} from './portal-app-settings.dto';

/**
 * Админка настроек placement-приложений портала: вкладка «Приложения»
 * карточки портала. Схема (какие приложения/ключи бывают, названия,
 * описания, типы, дефолты) отдаётся вместе со значениями — фронт рисует
 * формы, ничего не хардкодя.
 */
@ApiTags('Admin Portal App Settings')
@Controller('admin/portal/:portalId/app-settings')
export class PortalAppSettingsController {
    constructor(private readonly service: PortalAppSettingsService) {}

    @Get()
    @ApiOperation({
        summary: 'Настройки всех приложений портала (схема + значения)',
        description:
            'Все приложения из реестра PORTAL_APP_SETTINGS_SCHEMA: каждый ' +
            'ключ — с названием, описанием, типом, дефолтом и действующим ' +
            'значением на портале.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала (наша БД).',
        type: Number,
        example: 7,
    })
    @ApiOkResponse({
        type: PortalAppSettingsResponseDto,
        description: 'Блоки настроек по приложениям.',
    })
    async list(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalAppSettingsResponseDto> {
        const rows = await this.service.listByPortal(portalId);
        const storedByApp = new Map(
            rows.map(row => [row.appCode, row.settings]),
        );

        const apps: PortalAppSettingsBlockDto[] = [];
        for (const appCode of Object.values(EnumPortalAppCode)) {
            const schema = PORTAL_APP_SETTINGS_SCHEMA[appCode] as Record<
                string,
                PortalAppSettingDescriptor
            >;
            const stored = storedByApp.get(appCode) ?? {};
            apps.push({
                appCode,
                settings: Object.values(schema).map(descriptor => ({
                    code: descriptor.code,
                    name: descriptor.name,
                    description: descriptor.description,
                    type: descriptor.type,
                    default: descriptor.default as boolean | number | string,
                    value:
                        stored[descriptor.code] !== undefined &&
                        typeof stored[descriptor.code] === descriptor.type
                            ? (stored[descriptor.code] as
                                  | boolean
                                  | number
                                  | string)
                            : null,
                })),
            });
        }
        return { apps };
    }

    @Post(':appCode')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сохранить настройки приложения портала',
        description:
            'Частичное сохранение: применяются только известные схеме ' +
            'ключи с верным типом; кэш настроек домена сбрасывается.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала (наша БД).',
        type: Number,
        example: 7,
    })
    @ApiParam({
        name: 'appCode',
        description: 'Код приложения из реестра.',
        type: String,
        enum: Object.values(EnumPortalAppCode),
        example: EnumPortalAppCode.eventSales,
    })
    @ApiBody({
        type: PortalAppSettingsSaveDto,
        description: 'Значения по ключам схемы (camelCase).',
    })
    @ApiOkResponse({
        description: 'Действующие значения приложения после сохранения.',
        type: Object,
    })
    async save(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('appCode') appCode: EnumPortalAppCode,
        @Body() dto: PortalAppSettingsSaveDto,
    ): Promise<Record<string, boolean | number | string>> {
        return (await this.service.save(
            portalId,
            appCode,
            dto.values as PortalAppSettingsPatch<typeof appCode>,
        )) as Record<string, boolean | number | string>;
    }
}
