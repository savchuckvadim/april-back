/**
 * Путеводитель по AI-аналитике ОП для админки (запрос владельца
 * 21.10.2026): разделы с теорией и связями — настройки kpiSales, поля
 * конвейера портала, коды реестра, kind'ы базы знаний, ручки, страницы.
 * Каталог статический (код), названия и описания подтягиваются из реестров
 * при отдаче. Только для apps/admin (ai/rules/app-api-surface.md).
 */
import {
    Controller,
    Get,
    NotFoundException,
    Param,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '@lib/auth';
import { KNOWN_KNOWLEDGE_KINDS } from '@lib/ai-rag/domain/types/knowledge-kind-registry';
import { EnumPortalAppCode } from '@lib/portal-lib/store/app-settings/portal-app-settings.schema';
import { findParam } from '../../params/registry.const';
import type { ParamDescriptor } from '../../params/registry.types';
import {
    AI_ANALYTICS_ADMIN_PATH,
    AI_ANALYTICS_ADMIN_ROLES,
    AI_ANALYTICS_ADMIN_TAG,
} from '../controllers/admin-controller.const';
import { AI_GUIDE_SECTIONS, findAiGuideSection } from './ai-guide.catalog';
import { AI_GUIDE_HREF } from './ai-guide.links';
import {
    AI_GUIDE_PARAM_GROUPS,
    aiGuideParamGroupOf,
    AI_GUIDE_PORTAL_AI_SETTING_TITLES,
    findKpiSalesSetting,
    isAiGuideParamGroupCode,
} from './ai-guide.registry';
import type {
    AiGuideParamRef,
    AiGuideSection,
    AiGuideSettingRef,
} from './ai-guide.types';
import {
    AiGuideKnowledgeKindDto,
    AiGuideParamDto,
    AiGuideSectionDto,
    AiGuideSectionItemDto,
    AiGuideSettingRefDto,
} from './dto/ai-guide.dto';

/** Маршруты путеводителя под `admin/ai-analytics`. */
export const AI_GUIDE_ROUTES = {
    list: 'guide',
    entry: 'guide/:code',
} as const;

/** Swagger UI у всех приложений монорепозитория по одному пути. */
const SWAGGER_PATH = '/docs/api';

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsGuideAdminController {
    @ApiOperation({
        summary: 'Путеводитель по AI-аналитике: оглавление разделов',
        description:
            'Разделы путеводителя в порядке показа: включение и рассылки, ' +
            'сотрудники и цели, разбор звонков, модель и данные, прогноз, ' +
            'обратная связь и надёжность, запуск после выкладки — коды, ' +
            'названия и счётчики связей. Тексты — GET guide/:code.',
    })
    @ApiOkResponse({ type: [AiGuideSectionItemDto] })
    @Get(AI_GUIDE_ROUTES.list)
    list(): AiGuideSectionItemDto[] {
        return AI_GUIDE_SECTIONS.map(section => this.toItem(section));
    }

    @ApiOperation({
        summary: 'Раздел путеводителя: теория и связи',
        description:
            'Теория (markdown: что это, как работает, когда срабатывает, где ' +
            'смотреть результат, что подготовить, риски) и связи раздела: ' +
            'ключи kpiSales с названиями из схемы и категорией, поля ' +
            'настроек AI портала, коды реестра параметров с названиями, ' +
            'слоем и диапазоном, kind базы знаний с описаниями, ручки с ' +
            'телами запросов и кодами действий для форм, страницы админки ' +
            '(`{portalId}` подставляет фронт), связанные разделы и шаги ' +
            'чек-листа «Запуск».',
    })
    @ApiParam({
        name: 'code',
        description: 'Код раздела путеводителя.',
        example: 'launch-after-release',
    })
    @ApiOkResponse({ type: AiGuideSectionDto })
    @Get(AI_GUIDE_ROUTES.entry)
    entry(@Param('code') code: string): AiGuideSectionDto {
        const section = findAiGuideSection(code);
        if (!section) {
            throw new NotFoundException(
                `Раздел путеводителя «${code}» не найден`,
            );
        }
        return this.toSection(section);
    }

    private toItem(section: AiGuideSection): AiGuideSectionItemDto {
        return {
            code: section.code,
            title: section.title,
            summary: section.summary,
            settingsCount: section.settings.length,
            portalAiSettingsCount: section.portalAiSettings.length,
            paramsCount: this.collectParams(section).length,
            knowledgeKindsCount: section.knowledgeKinds.length,
            endpointsCount: section.endpoints.length,
            hasLaunch: (section.launch?.length ?? 0) > 0,
        };
    }

    private toSection(section: AiGuideSection): AiGuideSectionDto {
        return {
            ...this.toItem(section),
            theory: section.theory,
            settings: section.settings
                .map(ref => this.toSetting(ref))
                .filter((item): item is AiGuideSettingRefDto => item !== null),
            portalAiSettings: section.portalAiSettings.map(ref => ({
                field: ref.field,
                title: AI_GUIDE_PORTAL_AI_SETTING_TITLES[ref.field],
                note: ref.note,
                href: AI_GUIDE_HREF.portalAiSettings,
            })),
            params: this.collectParams(section).map(
                ({ descriptor, note }): AiGuideParamDto => {
                    const group = aiGuideParamGroupOf(descriptor.code);
                    return {
                        code: descriptor.code,
                        title: descriptor.title,
                        userTitle: descriptor.userTitle ?? null,
                        description: descriptor.description,
                        scope: descriptor.scope,
                        source: descriptor.source,
                        unit: descriptor.unit,
                        default: descriptor.defaultValue,
                        range: descriptor.range ? [...descriptor.range] : null,
                        phase: descriptor.phase,
                        breaksSeries: descriptor.breaksSeries,
                        group: group.code,
                        groupTitle: group.title,
                        note: note ?? null,
                    };
                },
            ),
            knowledgeKinds: section.knowledgeKinds
                .map((ref): AiGuideKnowledgeKindDto | null => {
                    const info = KNOWN_KNOWLEDGE_KINDS.find(
                        item => item.kind === ref.kind,
                    );
                    if (!info) return null;
                    return {
                        kind: info.kind,
                        title: info.title,
                        description: info.description,
                        consumer: info.consumer,
                        clientEditable: info.clientEditable,
                        note: ref.note ?? null,
                        href: AI_GUIDE_HREF.portalKnowledgeKind(info.kind),
                    };
                })
                .filter(
                    (item): item is AiGuideKnowledgeKindDto => item !== null,
                ),
            endpoints: section.endpoints.map(endpoint => ({
                app: endpoint.app,
                method: endpoint.method,
                path: endpoint.path,
                action: endpoint.action ?? null,
                body: endpoint.body ?? null,
                query: endpoint.query ?? null,
                when: endpoint.when,
                purpose: endpoint.purpose,
                swaggerPath: SWAGGER_PATH,
            })),
            adminPages: section.adminPages.map(page => ({
                title: page.title,
                href: page.href,
                note: page.note ?? null,
            })),
            related: section.related
                .map(code => findAiGuideSection(code))
                .filter((item): item is AiGuideSection => item !== null)
                .map(item => ({ code: item.code, title: item.title })),
            launch: (section.launch ?? []).map(step => ({
                code: step.code,
                title: step.title,
                markdown: step.markdown,
                action: step.action ?? null,
            })),
        };
    }

    private toSetting(ref: AiGuideSettingRef): AiGuideSettingRefDto | null {
        const found = findKpiSalesSetting(ref.key);
        if (!found) return null;
        return {
            app: EnumPortalAppCode.kpiSales,
            key: found.key,
            code: found.descriptor.code,
            name: found.descriptor.name,
            type: found.descriptor.type,
            default: found.descriptor.default as boolean | number | string,
            group: found.group,
            groupTitle: found.groupTitle,
            note: ref.note,
            href: AI_GUIDE_HREF.portalAppSetting(found.descriptor.code),
        };
    }

    /**
     * Коды раздела: сначала явные ссылки с заметками, затем целые
     * тематические группы; код встречается один раз, заметка — от явной
     * ссылки. Неизвестный код пропускается (его ловит спека каталога).
     */
    private collectParams(
        section: AiGuideSection,
    ): Array<{ descriptor: ParamDescriptor; note?: string }> {
        const seen = new Set<string>();
        const result: Array<{ descriptor: ParamDescriptor; note?: string }> =
            [];
        const push = (ref: AiGuideParamRef): void => {
            if (seen.has(ref.code)) return;
            const descriptor = findParam(ref.code);
            if (!descriptor) return;
            seen.add(ref.code);
            result.push(
                ref.note === undefined
                    ? { descriptor }
                    : { descriptor, note: ref.note },
            );
        };
        section.params.forEach(push);
        for (const group of section.paramGroups ?? []) {
            if (!isAiGuideParamGroupCode(group)) continue;
            AI_GUIDE_PARAM_GROUPS[group].params.forEach(descriptor =>
                push({ code: descriptor.code }),
            );
        }
        return result;
    }
}
