import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BitrixOwnerTypeId } from '@/modules/bitrix';
import { Stage } from '@app/pbx-install/shared';
import {
    InstallStageSyncService,
    SyncSingleStageResult,
} from '@app/pbx-install/stage/install-stage-sync.service';
import { ParseCategoryService } from '../../services/categories/parse-category.service';
import { PbxDealPortalResolverService } from '../../services/categories/pbx-deal-portal-resolver.service';
import { DealCategoryStageStrategy } from '../../services/categories/deal-category-stage.strategy';
import { SyncDealCategoryStageDto } from '../../dto/manage-deal-category.dto';

/** Итог поштучной синхронизации стадии на одном портале. */
export interface PerPortalStageSyncResult {
    domain: string;
    portalId: number | null;
    ok: boolean;
    /** Русское объяснение, почему портал пропущен; заполняется только при `ok: false`. */
    error?: string;
    result?: SyncSingleStageResult;
}

/**
 * Поштучная синхронизация ОДНОЙ стадии воронки сделки из Excel-шаблона.
 *
 * Зачем отдельно от установки воронки: шаблон меняется по одной строке
 * (добавили «Не ЦА», переставили «Доработку»), а полный install перетряхивает
 * воронку целиком и сносит стадии, которых в шаблоне нет. Здесь операция
 * узкая: заводим/обновляем ровно одну стадию, ничего не удаляя.
 *
 * Источник правды — строка шаблона: название, цвет, `bitrixId`, семантика и
 * порядок берутся из Excel, а не из запроса. Иначе поштучная правка увела бы
 * портал от шаблона, и следующий полный install молча вернул бы всё назад.
 *
 * Поддерживает `domain: 'all'` — прогон по всем порталам; портал без
 * подготовленной сделки-якоря или без нужной воронки пропускается с
 * объяснением, а не рушит операцию по остальным.
 */
@Injectable()
export class PbxDealCategoryStageSyncUseCase {
    private readonly logger = new Logger(PbxDealCategoryStageSyncUseCase.name);
    private readonly entityTypeId = BitrixOwnerTypeId.DEAL;

    constructor(
        private readonly parseCategoryService: ParseCategoryService,
        private readonly resolver: PbxDealPortalResolverService,
        private readonly stageSync: InstallStageSyncService,
        private readonly strategy: DealCategoryStageStrategy,
    ) {}

    async syncStage(
        dto: SyncDealCategoryStageDto,
    ): Promise<PerPortalStageSyncResult[]> {
        // Шаблон читается ОДИН раз: он общий для всех порталов группы.
        const { stage, templateStages } = await this.resolveTemplateStage(dto);

        const domains = await this.resolver.resolveDomains(dto.domain);
        const results: PerPortalStageSyncResult[] = [];

        for (const domain of domains) {
            results.push(
                await this.syncOnPortal(domain, dto, stage, templateStages),
            );
        }
        return results;
    }

    /**
     * Строка стадии из шаблона + все стадии её воронки (нужны для пересчёта
     * SORT соседей).
     *
     * @throws NotFoundException если воронки или стадии нет в шаблоне —
     * это ошибка запроса, а не состояния портала, поэтому падаем сразу и не
     * прогоняем впустую все порталы.
     */
    private async resolveTemplateStage(
        dto: SyncDealCategoryStageDto,
    ): Promise<{ stage: Stage; templateStages: Stage[] }> {
        const { categories } = await this.parseCategoryService.getParsedData(
            dto.categoryCode,
            dto.group,
        );
        // `code` из Excel — обычная строка, сравниваем со значением enum'а.
        const categoryCode = String(dto.categoryCode);
        const category = categories.find(c => c.code === categoryCode);
        if (!category) {
            throw new NotFoundException(
                `Воронка «${dto.categoryCode}» не найдена в шаблоне группы «${dto.group}»`,
            );
        }
        const templateStages = category.stages ?? [];
        const stage = templateStages.find(s => s.code === dto.stageCode);
        if (!stage) {
            throw new NotFoundException(
                `Стадия «${dto.stageCode}» не найдена в шаблоне воронки «${dto.categoryCode}». ` +
                    'Сначала добавьте строку стадии в Excel-шаблон.',
            );
        }
        return { stage, templateStages };
    }

    private async syncOnPortal(
        domain: string,
        dto: SyncDealCategoryStageDto,
        stage: Stage,
        templateStages: Stage[],
    ): Promise<PerPortalStageSyncResult> {
        const portalDeal = await this.resolver.resolvePortalDeal(domain);
        if (!portalDeal) {
            return {
                domain,
                portalId: null,
                ok: false,
                error: 'Портал или сделка-якорь не найдены в PortalDB',
            };
        }
        const { portalId, dealId, bitrix } = portalDeal;

        const category = await this.resolver.findCategoryByCode(
            dealId,
            dto.categoryCode,
        );
        if (!category) {
            return {
                domain,
                portalId,
                ok: false,
                error:
                    `Воронка «${dto.categoryCode}» не установлена на портале. ` +
                    'Поштучная синхронизация стадии воронку не создаёт — ' +
                    'сначала установите воронку целиком.',
            };
        }

        try {
            const result = await this.stageSync.syncSingleStage({
                bitrix,
                entityTypeId: this.entityTypeId,
                bxCategoryId: Number(category.bitrixId),
                portalCategoryId: category.id,
                stage,
                templateStages,
                strategy: this.strategy,
                reorder: dto.reorder ?? true,
            });
            return { domain, portalId, ok: true, result };
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            this.logger.warn(
                `sync stage ${dto.stageCode} на ${domain} не удалась: ${error}`,
            );
            return { domain, portalId, ok: false, error };
        }
    }
}
