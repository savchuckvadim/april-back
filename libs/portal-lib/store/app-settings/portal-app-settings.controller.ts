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
    getStoredAppSettingKeys,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingDescriptor,
    PortalAppSettingsPatch,
} from './portal-app-settings.schema';
import { PortalAppSettingsService } from './portal-app-settings.service';
import {
    listAppSettingGroups,
    PortalAppSettingGroupCode,
    resolveAppSettingGroup,
} from './lib/app-setting-groups';
import {
    PortalAppSettingsBlockDto,
    PortalAppSettingsResponseDto,
    PortalAppSettingsSaveDto,
} from './portal-app-settings.dto';
import {
    GroupRelationsAccumulator,
    relationsPayload,
    resolveSettingRelations,
} from './lib/app-setting-relations';

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
            'ключ — с названием, описанием, типом, дефолтом, действующим ' +
            'значением на портале и признаком stored («значение задано ' +
            'на портале», а не приехало дефолтом кода).',
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
            // Признак «задано на портале» считается ОДНОЙ функцией реестра —
            // той же, что отдаёт фрейму storedKeys: разойдись эти два места,
            // и админка показывала бы «настроено» там, где фрейм настройку
            // не применяет.
            const storedKeys = new Set(
                getStoredAppSettingKeys(appCode, stored),
            );
            const usedGroups = new Set<PortalAppSettingGroupCode>();
            // Связи категории = объединение связей её настроек.
            const groupRelations = new Map<
                PortalAppSettingGroupCode,
                GroupRelationsAccumulator
            >();
            apps.push({
                appCode,
                settings: Object.entries(schema).map(([key, descriptor]) => {
                    const group = resolveAppSettingGroup(
                        appCode,
                        descriptor.code,
                    );
                    usedGroups.add(group);
                    const relations = resolveSettingRelations(
                        appCode,
                        descriptor.code,
                    );
                    const accumulator =
                        groupRelations.get(group) ??
                        new GroupRelationsAccumulator();
                    accumulator.add(relations);
                    groupRelations.set(group, accumulator);
                    return {
                        code: descriptor.code,
                        name: descriptor.name,
                        description: descriptor.description,
                        type: descriptor.type,
                        default: descriptor.default as
                            | boolean
                            | number
                            | string,
                        stored: storedKeys.has(key),
                        value: storedKeys.has(key)
                            ? (stored[descriptor.code] as
                                  | boolean
                                  | number
                                  | string)
                            : null,
                        // Необязательные поля отдаём, только когда они есть:
                        // остальные ключи реестра ничего в ответе не меняют.
                        ...(descriptor.options
                            ? { options: [...descriptor.options] }
                            : {}),
                        ...(descriptor.isList ? { isList: true } : {}),
                        group,
                        // Связи отдаём только когда они есть: у настроек
                        // без хуков ответ не меняется.
                        ...relationsPayload(relations),
                    };
                }),
                groups: listAppSettingGroups(usedGroups).map(item => ({
                    code: item.code,
                    title: item.title,
                    description: item.description,
                    links: item.links.map(entry => ({ ...entry })),
                    ...(item.theory ? { theory: item.theory } : {}),
                    ...relationsPayload(
                        groupRelations.get(item.code)?.result() ?? {
                            hooks: [],
                            pbxFields: [],
                            stages: [],
                        },
                    ),
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
            'ключи с верным типом; кэш настроек домена сбрасывается. ' +
            'Сохранённый ключ становится «заданным на портале» (stored) ' +
            'даже со значением, равным дефолту кода — снимается это ' +
            'только явным null. Форма ответа прежняя (ключ → значение); ' +
            'признак приезжает следующим GET.',
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
