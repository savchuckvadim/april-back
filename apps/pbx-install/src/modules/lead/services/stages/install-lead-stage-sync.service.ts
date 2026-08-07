import { Injectable, Logger } from '@nestjs/common';
import { BitrixService, IBXStatus } from '@/modules/bitrix';
import { PbxLeadStageTemplateItem } from '@lib/portal-lib/pbx-domain';
import {
    normalizeBitrixStageColor,
    normalizeStatusListResult,
} from '../../../shared/utils/bitrix-category-stage.utils';
import { LEAD_STATUS_ENTITY_ID } from './pbx-lead-stage-monitoring.service';

/** Итог синка одной стадии шаблона. */
export interface LeadStageSyncItemResult {
    code: string;
    bitrixStatusId: string;
    action: 'created' | 'updated' | 'skipped';
    /** Итоговый SORT (мог быть пересчитан относительно финальных статусов). */
    sort: number;
}

/**
 * АДДИТИВНАЯ установка стадий лида в Bitrix (crm.status, ENTITY_ID='STATUS').
 *
 * Ключевое отличие от InstallStageSyncService сделок: у лида ОДИН общий
 * справочник статусов портала, в нём живут клиентские статусы — здесь
 * НИЧЕГО НЕ УДАЛЯЕТСЯ, никогда. Создаются/обновляются только стадии
 * шаблона с installMode='create'; map-only стадии игнорируются (их
 * сопоставляют руками в админке).
 *
 * НЕ @Injectable-состояние bitrix: инстанс приходит параметром per-domain.
 */
@Injectable()
export class InstallLeadStageSyncService {
    private readonly logger = new Logger(InstallLeadStageSyncService.name);

    /**
     * @param onlyCodes сузить установку до конкретных кодов шаблона
     */
    async sync(
        bitrix: BitrixService,
        template: readonly PbxLeadStageTemplateItem[],
        onlyCodes?: string[],
    ): Promise<LeadStageSyncItemResult[]> {
        const list = await bitrix.status.getList({
            ENTITY_ID: LEAD_STATUS_ENTITY_ID,
        });
        const existing = normalizeStatusListResult(list.result);

        const installable = template.filter(
            stage =>
                stage.installMode === 'create' &&
                stage.bitrixStatusId &&
                (!onlyCodes?.length || onlyCodes.includes(stage.code)),
        );

        const results: LeadStageSyncItemResult[] = [];
        for (const stage of installable) {
            results.push(await this.syncOne(bitrix, stage, existing));
        }
        return results;
    }

    private async syncOne(
        bitrix: BitrixService,
        stage: PbxLeadStageTemplateItem,
        existing: IBXStatus[],
    ): Promise<LeadStageSyncItemResult> {
        const statusId = stage.bitrixStatusId as string;
        const sort = this.resolveSort(stage.order, existing);
        const fields: Partial<IBXStatus> = {
            ENTITY_ID: LEAD_STATUS_ENTITY_ID,
            STATUS_ID: statusId,
            NAME: stage.title,
            SORT: sort,
            COLOR: normalizeBitrixStageColor(stage.color, this.logger),
        };
        // SEMANTICS отправляем только непустую: '' — дефолт «В работе».
        if (stage.semantics) {
            fields.SEMANTICS = stage.semantics;
        }

        const found = existing.find(status => status.STATUS_ID === statusId);
        if (found) {
            // Обновляем только если что-то реально разошлось — лишние
            // update на живом справочнике портала ни к чему.
            const changed =
                found.NAME !== fields.NAME ||
                Number(found.SORT) !== sort ||
                (found.COLOR ?? '') !== fields.COLOR;
            if (!changed) {
                return {
                    code: stage.code,
                    bitrixStatusId: statusId,
                    action: 'skipped',
                    sort,
                };
            }
            await bitrix.status.update(String(found.ID), fields);
            return {
                code: stage.code,
                bitrixStatusId: statusId,
                action: 'updated',
                sort,
            };
        }

        try {
            await bitrix.status.add(fields);
        } catch (error) {
            // «Duplicate STATUS_ID» — статус появился между list и add
            // (или list его не отдал): считаем существующим, не падаем.
            const message =
                error instanceof Error ? error.message : String(error);
            if (!/duplicate/i.test(message)) throw error;
            this.logger.warn(
                `Статус лида ${statusId} уже существует (Duplicate STATUS_ID) — пропускаем создание`,
            );
            return {
                code: stage.code,
                bitrixStatusId: statusId,
                action: 'skipped',
                sort,
            };
        }
        return {
            code: stage.code,
            bitrixStatusId: statusId,
            action: 'created',
            sort,
        };
    }

    /**
     * SORT новой стадии обязан быть МЕНЬШЕ SORT финальных статусов
     * (CONVERTED/JUNK) — иначе «Взята в работу» окажется после «Успеха»
     * в воронке лида. Если желаемый order не влезает — вжимаемся под
     * минимальный финальный SORT.
     */
    private resolveSort(desired: number, existing: IBXStatus[]): number {
        const finalSorts = existing
            .filter(
                status => status.SEMANTICS === 'S' || status.SEMANTICS === 'F',
            )
            .map(status => Number(status.SORT))
            .filter(sort => Number.isFinite(sort) && sort > 0);
        if (!finalSorts.length) return desired;
        const minFinal = Math.min(...finalSorts);
        if (desired < minFinal) return desired;
        const squeezed = Math.max(1, minFinal - 1);
        this.logger.warn(
            `SORT ${desired} >= минимального финального ${minFinal} — вжимаем в ${squeezed}`,
        );
        return squeezed;
    }
}
