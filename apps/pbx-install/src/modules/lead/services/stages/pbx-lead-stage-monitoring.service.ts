import { Injectable } from '@nestjs/common';
import { IBXStatus } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import {
    BtxStageRepository,
    PortalStageEntity,
} from '@lib/portal-lib/pbx-domain';
import { normalizeStatusListResult } from '../../../shared/utils/bitrix-category-stage.utils';
import { PbxEntityGroupEnum } from '../../../shared/entity/field/parse-entity-field.service';
import {
    getLeadStageTemplate,
    LeadStageTemplateItem,
} from './lead-stage-template.constants';
import { EnsureLeadCategoryService } from './ensure-lead-category.service';

/** ENTITY_ID статусов лида в Bitrix (`crm.status.list`). */
export const LEAD_STATUS_ENTITY_ID = 'STATUS';

/** Экран сопоставления: шаблон стадий + реальные статусы лида из Bitrix + текущее сопоставление из PortalDB. */
export interface LeadStageMappingScreen {
    templateStages: LeadStageTemplateItem[];
    bitrixStatuses: IBXStatus[];
    portalStages: PortalStageEntity[];
}

@Injectable()
export class PbxLeadStageMonitoringService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly ensureLeadCategory: EnsureLeadCategoryService,
        private readonly stageRepository: BtxStageRepository,
    ) {}

    /**
     * Данные для экрана сопоставления стадий лида.
     * Стадии в Bitrix НЕ создаются — статусы только читаются (`crm.status.list`, `ENTITY_ID='STATUS'`).
     */
    async getStageMappingScreen(
        domain: string,
        group: PbxEntityGroupEnum,
    ): Promise<LeadStageMappingScreen> {
        const { bitrix } = await this.pbxService.init(domain);
        const list = await bitrix.status.getList({
            ENTITY_ID: LEAD_STATUS_ENTITY_ID,
        });
        const bitrixStatuses = normalizeStatusListResult(list.result);
        const templateStages = getLeadStageTemplate(group);

        const anchor = await this.ensureLeadCategory.find(domain);
        const portalStages =
            anchor != null
                ? ((await this.stageRepository.findByCategoryId(
                      anchor.categoryId,
                  )) ?? [])
                : [];

        return { templateStages, bitrixStatuses, portalStages };
    }
}
