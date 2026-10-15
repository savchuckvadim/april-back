import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core/prisma';
import { PbxEntityType } from '@/shared/enums';
// Импорт точечный (не индекс store/app-settings): индекс реэкспортирует
// админ-модуль с контроллером, который сам читает каталог хуков —
// получился бы цикл.
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingDescriptor,
} from '@lib/portal-lib/store/app-settings/portal-app-settings.schema';
import { PortalAppSettingsService } from '@lib/portal-lib/store/app-settings/portal-app-settings.service';
import {
    BtxCategoryService,
    BtxStageRepository,
    PortalCompanyService,
    PortalDealService,
    PortalLeadService,
} from '@lib/portal-lib/pbx-domain';
import { PBX_DEAL_SALES_BASE_STAGES } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { HookCatalogEntry, HookPbxEntity } from '../catalog/hook-catalog.types';
import { pbxFieldName } from '../catalog/lib/pbx-field-registry';
import { hookStageTitle } from '../catalog/lib/stage-titles';
import {
    evaluateHookReadiness,
    EvaluateReadinessDeps,
    HookReadiness,
    HookReadinessSnapshot,
} from './lib/evaluate-readiness';

/** Код воронки «ОП Основная» в btx_categories портала. */
const SALES_BASE_CATEGORY_CODE = 'sales_base';
/** Группа лид-якоря стадий отдела продаж (см. EnsureLeadCategoryService в pbx-install). */
const LEAD_STAGES_GROUP = 'sales';

export interface PortalHooksReadiness {
    portalId: number;
    domain: string;
    hooks: HookReadiness[];
}

/**
 * Готовность хуков на портале по слепку PortalDB: установленные поля
 * лида/сделки/компании (`bitrixfields` через сервисы сущностей),
 * сопоставленные стадии лида (лид-якорь в `btx_categories` + `btx_stages`),
 * стадии воронки ОП и действующие настройки event-sales. В Битрикс не
 * ходит — это то же, что показывают экраны PBX админки, только разрезом
 * «что нужно этому хуку».
 */
@Injectable()
export class HookReadinessService {
    private readonly logger = new Logger(HookReadinessService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly appSettings: PortalAppSettingsService,
        private readonly portalLead: PortalLeadService,
        private readonly portalDeal: PortalDealService,
        private readonly portalCompany: PortalCompanyService,
        private readonly categories: BtxCategoryService,
        private readonly stages: BtxStageRepository,
    ) {}

    async requireDomain(portalId: number): Promise<string> {
        const portal = await this.prisma.portal.findUnique({
            where: { id: BigInt(portalId) },
            select: { domain: true },
        });
        if (!portal?.domain) {
            throw new NotFoundException(
                `Портал ${portalId} не найден или у него нет домена`,
            );
        }
        return portal.domain;
    }

    async evaluateAll(
        portalId: number,
        entries: readonly HookCatalogEntry[],
    ): Promise<PortalHooksReadiness> {
        const domain = await this.requireDomain(portalId);
        const snapshot = await this.loadSnapshot(portalId, domain);
        const deps = this.deps();
        return {
            portalId,
            domain,
            hooks: entries.map(entry =>
                evaluateHookReadiness(entry, snapshot, deps),
            ),
        };
    }

    async evaluateOne(
        portalId: number,
        entry: HookCatalogEntry,
    ): Promise<{ domain: string; readiness: HookReadiness }> {
        const domain = await this.requireDomain(portalId);
        const snapshot = await this.loadSnapshot(portalId, domain);
        return {
            domain,
            readiness: evaluateHookReadiness(entry, snapshot, this.deps()),
        };
    }

    private deps(): EvaluateReadinessDeps {
        return {
            descriptor: (app, key) => {
                const schema = PORTAL_APP_SETTINGS_SCHEMA[
                    app as EnumPortalAppCode
                ] as Record<string, PortalAppSettingDescriptor> | undefined;
                const descriptor = schema?.[key];
                if (!descriptor) return null;
                return {
                    code: descriptor.code,
                    name: descriptor.name,
                    type: descriptor.type,
                    default: descriptor.default as boolean | number | string,
                };
            },
            fieldName: pbxFieldName,
            stageTitle: hookStageTitle,
        };
    }

    private async loadSnapshot(
        portalId: number,
        domain: string,
    ): Promise<HookReadinessSnapshot> {
        const [fields, leadStages, dealStages, settings] = await Promise.all([
            this.loadFields(portalId),
            this.loadLeadStages(portalId),
            this.loadDealStages(portalId),
            this.loadSettings(domain),
        ]);
        return { fields, leadStages, dealStages, ...settings };
    }

    private async loadFields(
        portalId: number,
    ): Promise<Record<HookPbxEntity, ReadonlySet<string>>> {
        const [lead, deal, company] = await Promise.all([
            this.portalLead.findWithFieldsByPortalId(portalId),
            this.portalDeal.findWithFieldsByPortalId(portalId),
            this.portalCompany.findWithFieldsByPortalId(portalId),
        ]);
        const codes = (
            full: { fields: Array<{ code: string }> } | null,
        ): ReadonlySet<string> =>
            new Set((full?.fields ?? []).map(field => field.code));
        return {
            lead: codes(lead),
            deal: codes(deal),
            company: codes(company),
            // Контакты и задачи в требованиях хуков не участвуют: снимка нет.
            contact: new Set<string>(),
            task: new Set<string>(),
        };
    }

    /**
     * Сопоставленные стадии лида: лид-якорь портала → категория группы
     * sales (или единственная legacy-категория без группы) → её стадии.
     * Логика поиска якоря повторяет EnsureLeadCategoryService.find.
     */
    private async loadLeadStages(
        portalId: number,
    ): Promise<ReadonlySet<string>> {
        const lead = await this.portalLead.findByPortalId(portalId);
        if (!lead) return new Set();
        const categories = await this.categories.findByEntity(
            PbxEntityType.LEAD,
            lead.id,
        );
        const matched =
            categories.find(c => c.group === LEAD_STAGES_GROUP) ??
            categories.find(c => c.code === `lead_${LEAD_STAGES_GROUP}`) ??
            (categories.length === 1 && !categories[0]?.group
                ? categories[0]
                : undefined);
        if (!matched) return new Set();
        const stages = (await this.stages.findByCategoryId(matched.id)) ?? [];
        return new Set(
            stages.filter(s => s.bitrixId !== '').map(stage => stage.code),
        );
    }

    /** Стадии воронки ОП (категория sales_base сущности «сделка» портала). */
    private async loadDealStages(
        portalId: number,
    ): Promise<ReadonlySet<string>> {
        const deal = await this.portalDeal.findByPortalId(portalId);
        if (!deal) return new Set();
        const categories = await this.categories.findByEntity(
            PbxEntityType.DEAL,
            Number(deal.id),
        );
        const base = categories.find(c => c.code === SALES_BASE_CATEGORY_CODE);
        if (!base) return new Set();
        const stages = (await this.stages.findByCategoryId(base.id)) ?? [];
        const known = new Set<string>(
            PBX_DEAL_SALES_BASE_STAGES.map(stage => stage.code),
        );
        return new Set(
            stages.map(stage => stage.code).filter(code => known.has(code)),
        );
    }

    private async loadSettings(domain: string): Promise<{
        settings: Record<string, Record<string, unknown>>;
        storedKeys: Record<string, ReadonlySet<string>>;
    }> {
        const settings: Record<string, Record<string, unknown>> = {};
        const storedKeys: Record<string, ReadonlySet<string>> = {};
        // Хуки читают только event-sales; остальные приложения добавятся
        // сюда, когда появятся в каталоге.
        for (const app of [EnumPortalAppCode.eventSales]) {
            try {
                const resolved = await this.appSettings.resolveWithStored(
                    domain,
                    app,
                );
                settings[app] = resolved.values as Record<string, unknown>;
                storedKeys[app] = new Set(resolved.storedKeys);
            } catch (error) {
                this.logger.warn(
                    `Настройки ${app} для ${domain} не прочитаны: ${String(error)}`,
                );
                settings[app] = {};
                storedKeys[app] = new Set();
            }
        }
        return { settings, storedKeys };
    }
}
