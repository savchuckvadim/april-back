import {
    Controller,
    Get,
    NotFoundException,
    Param,
    ParseIntPipe,
    Query,
} from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingDescriptor,
} from '@lib/portal-lib/store/app-settings/portal-app-settings.schema';
import {
    findHookEntry,
    HOOK_FAMILY_TITLES,
    listHookEntries,
} from '../catalog/hook-catalog';
import { HookCatalogEntry, HookPbxEntity } from '../catalog/hook-catalog.types';
import { kbDocLink } from '../catalog/kb-docs';
import { pbxFieldName, pbxFieldType } from '../catalog/lib/pbx-field-registry';
import { hookStageTitle } from '../catalog/lib/stage-titles';
import {
    HookCatalogEntryDto,
    HookCatalogItemDto,
    HookOperationsQueryDto,
    HookPbxFieldRefDto,
    HookSettingRefDto,
    HookStageRefDto,
} from './dto/hook-catalog.dto';
import {
    PortalHookReadinessDto,
    PortalHooksReadinessResponseDto,
} from './dto/hook-readiness.dto';
import { PortalHookOperationsResponseDto } from './dto/hook-operations.dto';
import { HookReadinessService } from '../readiness/hook-readiness.service';
import { HookReadiness } from '../readiness/lib/evaluate-readiness';
import { HookOperationsService } from '../monitoring/hook-operations.service';

/** Разделы админки, где ставятся поля и стадии (`{portalId}` подставляет фронт). */
const PBX_HREF: Record<HookPbxEntity, string> = {
    lead: '/portal/{portalId}/pbx/lead',
    deal: '/portal/{portalId}/pbx/deal',
    company: '/portal/{portalId}/pbx/company',
    contact: '/portal/{portalId}/pbx/contact',
    task: '/portal/{portalId}/pbx/task',
};
const SETTINGS_HREF = '/portal/{portalId}/app-settings';

const OPERATIONS_WINDOW_NOTE =
    'Статусы операций sales-хуков живут в кэше час и чистятся раз в час: ' +
    'здесь видно, что происходило за последний час-два. Более старое — ' +
    'в логах event-sales.';

/**
 * Каталог хуков и автоматики + их состояние на портале. Каталог
 * статический (код), состояние — слепок PortalDB и настройки, мониторинг
 * — операции из app-cache. Только для админки (ai/rules/app-api-surface.md).
 */
@ApiTags('Admin Hooks')
@Controller('admin')
export class HooksAdminController {
    constructor(
        private readonly readiness: HookReadinessService,
        private readonly operations: HookOperationsService,
    ) {}

    @Get('hooks')
    @ApiOperation({
        summary: 'Каталог хуков и автоматики (без состояния портала)',
        description:
            'Все хуки семейств sales-hooks, lead-request, cold-hook и кроны: ' +
            'коды, названия, семейства, расписания, счётчики требований.',
    })
    @ApiOkResponse({ type: [HookCatalogItemDto] })
    list(): HookCatalogItemDto[] {
        return listHookEntries().map(entry => this.toItem(entry));
    }

    @Get('hooks/:code')
    @ApiOperation({
        summary:
            'Карточка хука: теория, параметры, настройки, поля, стадии, статьи',
    })
    @ApiParam({
        name: 'code',
        description: 'Код хука.',
        example: 'lead-to-work',
    })
    @ApiOkResponse({ type: HookCatalogEntryDto })
    entry(@Param('code') code: string): HookCatalogEntryDto {
        return this.toEntry(this.requireEntry(code));
    }

    @Get('portal/:portalId/hooks')
    @ApiOperation({
        summary: 'Готовность всех хуков на портале',
        description:
            'Для каждого хука: установлены ли нужные PBX-поля (слепок PortalDB), ' +
            'сопоставлены ли стадии, действующие значения настроек и рубильник.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Id портала (наша БД).',
        example: 7,
    })
    @ApiOkResponse({ type: PortalHooksReadinessResponseDto })
    async portalHooks(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalHooksReadinessResponseDto> {
        const result = await this.readiness.evaluateAll(
            portalId,
            listHookEntries(),
        );
        return {
            portalId: result.portalId,
            domain: result.domain,
            hooks: result.hooks.map(item => this.toReadiness(item)),
        };
    }

    @Get('portal/:portalId/hooks/operations')
    @ApiOperation({
        summary:
            'Операции sales-хуков портала за последний час-два (app-cache)',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Id портала (наша БД).',
        example: 7,
    })
    @ApiOkResponse({ type: PortalHookOperationsResponseDto })
    async portalOperations(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Query() query: HookOperationsQueryDto,
    ): Promise<PortalHookOperationsResponseDto> {
        const domain = await this.readiness.requireDomain(portalId);
        const page = await this.operations.listByPortal(
            portalId,
            query.hook ?? null,
            query.limit ?? 50,
        );
        return {
            portalId,
            domain,
            windowNote: OPERATIONS_WINDOW_NOTE,
            summary: page.summary,
            operations: page.operations,
        };
    }

    @Get('portal/:portalId/hooks/:code')
    @ApiOperation({ summary: 'Готовность одного хука на портале' })
    @ApiParam({
        name: 'portalId',
        description: 'Id портала (наша БД).',
        example: 7,
    })
    @ApiParam({
        name: 'code',
        description: 'Код хука.',
        example: 'lead-to-work',
    })
    @ApiOkResponse({ type: PortalHookReadinessDto })
    async portalHook(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('code') code: string,
    ): Promise<PortalHookReadinessDto> {
        const entry = this.requireEntry(code);
        const { readiness } = await this.readiness.evaluateOne(portalId, entry);
        return this.toReadiness(readiness);
    }

    private requireEntry(code: string): HookCatalogEntry {
        const entry = findHookEntry(code);
        if (!entry) {
            throw new NotFoundException(`Хук «${code}» не найден в каталоге`);
        }
        return entry;
    }

    private toItem(entry: HookCatalogEntry): HookCatalogItemDto {
        return {
            code: entry.code,
            title: entry.title,
            family: entry.family,
            familyTitle: HOOK_FAMILY_TITLES[entry.family],
            kind: entry.kind,
            summary: entry.summary,
            cron: entry.cron
                ? {
                      name: entry.cron.name,
                      schedule: entry.cron.schedule,
                      note: entry.cron.note ?? null,
                  }
                : null,
            hasOperations: entry.operationHook !== null,
            requiredFieldsCount: entry.pbxFields.filter(f => f.required).length,
            requiredStagesCount: entry.stages.filter(s => s.required).length,
            settingsCount: entry.settings.length,
        };
    }

    private toEntry(entry: HookCatalogEntry): HookCatalogEntryDto {
        return {
            ...this.toItem(entry),
            theory: entry.theory,
            howItWorks: entry.howItWorks,
            triggers: [...entry.triggers],
            endpoints: entry.endpoints.map(endpoint => ({
                kind: endpoint.kind,
                method: endpoint.method,
                path: endpoint.path,
                description: endpoint.description,
                example: endpoint.example ?? null,
            })),
            params: entry.params.map(param => ({
                name: param.name,
                where: param.where,
                values: param.values ?? null,
                default: param.default ?? null,
                required: param.required ?? false,
                description: param.description,
                runOnly: param.runOnly ?? false,
            })),
            settings: entry.settings
                .map(ref =>
                    this.toSettingRef(
                        ref.app ?? EnumPortalAppCode.eventSales,
                        ref.key,
                        ref.role,
                        ref.note,
                    ),
                )
                .filter((item): item is HookSettingRefDto => item !== null),
            pbxFields: entry.pbxFields.map(
                (field): HookPbxFieldRefDto => ({
                    entity: field.entity,
                    code: field.code,
                    name: pbxFieldName(field.code),
                    type: pbxFieldType(field.code),
                    role: field.role,
                    required: field.required,
                    note: field.note ?? null,
                }),
            ),
            stages: entry.stages.map(
                (stage): HookStageRefDto => ({
                    entity: stage.entity,
                    code: stage.code,
                    title: hookStageTitle(stage.entity, stage.code),
                    required: stage.required,
                    note: stage.note ?? null,
                }),
            ),
            kbDocs: entry.kbDocs.map(key => kbDocLink(key)),
            related: entry.related
                .map(code => findHookEntry(code))
                .filter((item): item is HookCatalogEntry => item !== null)
                .map(item => ({ code: item.code, title: item.title })),
            install: entry.install,
            verify: entry.verify,
            warnings: [...(entry.warnings ?? [])],
            operationHook: entry.operationHook,
        };
    }

    private toSettingRef(
        app: EnumPortalAppCode,
        key: string,
        role: 'gate' | 'param',
        note: string,
    ): HookSettingRefDto | null {
        const schema = PORTAL_APP_SETTINGS_SCHEMA[app] as Record<
            string,
            PortalAppSettingDescriptor
        >;
        const descriptor = schema[key];
        if (!descriptor) return null;
        return {
            app,
            key,
            code: descriptor.code,
            name: descriptor.name,
            type: descriptor.type,
            default: descriptor.default as boolean | number | string,
            role,
            note,
        };
    }

    private toReadiness(item: HookReadiness): PortalHookReadinessDto {
        const entry = this.requireEntry(item.code);
        return {
            code: item.code,
            title: entry.title,
            family: entry.family,
            status: item.status,
            enabled: item.enabled,
            missingRequired: item.missingRequired,
            fields: item.fields.map(field => ({
                ...field,
                href: PBX_HREF[field.entity],
            })),
            stages: item.stages.map(stage => ({
                ...stage,
                href: PBX_HREF[stage.entity],
            })),
            settings: item.settings.map(setting => ({
                ...setting,
                href: SETTINGS_HREF,
            })),
        };
    }
}
