import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { BtxStageRepository } from '@lib/portal-lib/pbx-domain';
import { PortalOnlineCacheService } from '@lib/portal-lib/store/portal-online-cache.service';
import {
    InstallLeadStagesDto,
    InstallLeadStagesResponseDto,
} from '../../dto/install-lead-stages.dto';
import { getLeadStageTemplate } from '../../services/stages/lead-stage-template.constants';
import { EnsureLeadCategoryService } from '../../services/stages/ensure-lead-category.service';
import { InstallLeadStageSyncService } from '../../services/stages/install-lead-stage-sync.service';

/**
 * Установка стадий лида: аддитивный синк в Bitrix (только installMode='create')
 * + upsert строк `btx_stages` под якорной категорией группы + сброс
 * 10-часового кэша портала (иначе рантайм не увидит новые стадии).
 */
@Injectable()
export class InstallLeadStagesUseCase {
    private readonly logger = new Logger(InstallLeadStagesUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly ensureLeadCategory: EnsureLeadCategoryService,
        private readonly syncService: InstallLeadStageSyncService,
        private readonly stageRepository: BtxStageRepository,
        private readonly portalCache: PortalOnlineCacheService,
    ) {}

    async execute(
        dto: InstallLeadStagesDto,
    ): Promise<InstallLeadStagesResponseDto> {
        const template = getLeadStageTemplate(dto.group);
        const { bitrix } = await this.pbxService.init(dto.domain);

        const items = await this.syncService.sync(bitrix, template, dto.codes);

        const { leadId, categoryId } = await this.ensureLeadCategory.ensure(
            dto.domain,
            dto.group,
        );
        const existing =
            (await this.stageRepository.findByCategoryId(categoryId)) ?? [];

        for (const item of items) {
            const tpl = template.find(stage => stage.code === item.code);
            if (!tpl) continue;
            const found = existing.find(stage => stage.code === tpl.code);
            const payload = {
                btx_category_id: BigInt(categoryId),
                name: tpl.name,
                title: tpl.title,
                code: tpl.code,
                bitrixId: item.bitrixStatusId,
                color: tpl.color,
                isActive: tpl.isActive,
            };
            if (found) {
                await this.stageRepository.update(found.id, payload);
            } else {
                await this.stageRepository.create(payload);
            }
        }

        // Без сброса кэша установка «не сработает» ещё до 10 часов —
        // рантайм-портал (getportal) закэширован в Redis.
        await this.portalCache.invalidate(dto.domain);

        this.logger.log(
            `Стадии лида установлены: ${dto.domain}/${dto.group} — ${items
                .map(item => `${item.code}:${item.action}`)
                .join(', ')}`,
        );
        return { leadId, categoryId, items };
    }
}
