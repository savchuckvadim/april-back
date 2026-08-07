import { BadRequestException, Injectable } from '@nestjs/common';
import { BtxStageRepository } from '@lib/portal-lib/pbx-domain';
import { PortalOnlineCacheService } from '@lib/portal-lib/store/portal-online-cache.service';
import {
    MapLeadStageItemDto,
    MapLeadStagesDto,
} from '../../dto/map-lead-stages.dto';
import { EnsureLeadCategoryService } from '../../services/stages/ensure-lead-category.service';
import {
    getLeadStageTemplate,
    LeadStageTemplateItem,
} from '../../services/stages/lead-stage-template.constants';

/** Результат записи одной сопоставленной стадии в PortalDB. */
export interface LeadStageUpsertResult {
    templateStageCode: string;
    bitrixStatusId: string;
    stageId: number;
}

/** Итог сопоставления стадий лида. */
export interface LeadStageMapResult {
    leadId: number;
    categoryId: number;
    upserted: LeadStageUpsertResult[];
    /** Коды шаблонных стадий, чьё сопоставление снято (строки удалены). */
    removed: string[];
}

/**
 * Сопоставление стадий лида (template ↔ Bitrix) и запись в PortalDB.
 *
 * Стадии в Bitrix НЕ создаются и не меняются. В `btx_stages` пишутся только сопоставленные
 * пары: данные берутся из шаблона, `bitrixId` = выбранный STATUS_ID. Несопоставленные
 * шаблонные стадии в PortalDB не сохраняются.
 */
@Injectable()
export class MapLeadStagesUseCase {
    constructor(
        private readonly ensureLeadCategory: EnsureLeadCategoryService,
        private readonly stageRepository: BtxStageRepository,
        private readonly portalCache: PortalOnlineCacheService,
    ) {}

    async apply(dto: MapLeadStagesDto): Promise<LeadStageMapResult> {
        const template = getLeadStageTemplate(dto.group);
        this.validateOneToOne(dto.mappings, template);

        const { leadId, categoryId } = await this.ensureLeadCategory.ensure(
            dto.domain,
            dto.group,
        );
        const existing =
            (await this.stageRepository.findByCategoryId(categoryId)) ?? [];

        const upserted: LeadStageUpsertResult[] = [];
        for (const mapping of dto.mappings) {
            const tpl = template.find(
                t => t.code === mapping.templateStageCode,
            );
            if (!tpl) {
                continue;
            }
            const found = existing.find(s => s.code === tpl.code);
            const payload = {
                btx_category_id: BigInt(categoryId),
                name: tpl.name,
                title: tpl.title,
                code: tpl.code,
                bitrixId: mapping.bitrixStatusId,
                color: tpl.color,
                isActive: tpl.isActive,
            };
            const saved = found
                ? await this.stageRepository.update(found.id, payload)
                : await this.stageRepository.create(payload);
            if (saved) {
                upserted.push({
                    templateStageCode: tpl.code,
                    bitrixStatusId: mapping.bitrixStatusId,
                    stageId: saved.id,
                });
            }
        }

        // Сироты: строка кода шаблона есть в БД, но админ снял сопоставление —
        // удаляем, иначе рантайм резолвит стадию по устаревшему bitrixId.
        // Исключение: install-стадии (installMode='create') живут через
        // /install/ и снятием сопоставления не удаляются. Чужие коды
        // (не из шаблона) не трогаем.
        const mappedCodes = new Set(
            dto.mappings.map(mapping => mapping.templateStageCode),
        );
        const removableCodes = new Set(
            template
                .filter(tpl => tpl.installMode !== 'create')
                .map(tpl => tpl.code),
        );
        const removed: string[] = [];
        for (const stage of existing) {
            if (!removableCodes.has(stage.code)) continue;
            if (mappedCodes.has(stage.code)) continue;
            await this.stageRepository.delete(stage.id);
            removed.push(stage.code);
        }

        // Рантайм-портал кэширован на 10 часов — без сброса сопоставление
        // «не работает» до истечения TTL.
        await this.portalCache.invalidate(dto.domain);

        return { leadId, categoryId, upserted, removed };
    }

    /** Проверка «один-к-одному»: коды шаблона существуют и не дублируются; статусы Bitrix не дублируются. */
    private validateOneToOne(
        mappings: MapLeadStageItemDto[],
        template: LeadStageTemplateItem[],
    ): void {
        const templateCodes = new Set(template.map(t => t.code));
        const seenTemplateCodes = new Set<string>();
        const seenBitrixStatusIds = new Set<string>();
        for (const mapping of mappings) {
            if (!templateCodes.has(mapping.templateStageCode)) {
                throw new BadRequestException(
                    `Неизвестный templateStageCode: ${mapping.templateStageCode}`,
                );
            }
            if (seenTemplateCodes.has(mapping.templateStageCode)) {
                throw new BadRequestException(
                    `templateStageCode сопоставлен более одного раза: ${mapping.templateStageCode}`,
                );
            }
            if (seenBitrixStatusIds.has(mapping.bitrixStatusId)) {
                throw new BadRequestException(
                    `bitrixStatusId сопоставлен более одного раза: ${mapping.bitrixStatusId}`,
                );
            }
            seenTemplateCodes.add(mapping.templateStageCode);
            seenBitrixStatusIds.add(mapping.bitrixStatusId);
        }
    }
}
