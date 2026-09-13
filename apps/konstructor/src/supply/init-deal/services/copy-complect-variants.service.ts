import { Logger } from '@nestjs/common';
import { BitrixService, IBXItem } from '@lib/bitrix';
import { BitrixOwnerType } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { COMPLECT_VARIANT_SMART_TYPE } from '@lib/portal-lib/pbx/pbx-complect-variant-smart';
import { ListProductRowDto } from '@lib/bitrix/domain/crm/product-row/dto/list-product-row.sto';
import { InnerDealService } from '../../../modules/inner-deal/services/inner-deal.service';
import { selectVariantsToCopy } from '../lib/select-variants-to-copy';

/** Вариант исходной сделки вместе с прочитанным элементом смарта. */
interface SourceVariant {
    sourceItemId: number;
    item: IBXItem;
    stageId: string | null;
}

/** Что удалось перенести. */
export interface CopyComplectVariantsResult {
    /** Сколько вариантов было у исходной сделки. */
    found: number;
    /** Сколько из них отобрано к переносу (участники, см. selectVariantsToCopy). */
    selected: number;
    /** Сколько перенесено целиком (элемент + товарные строки + слепок). */
    copied: number;
}

/**
 * Поля элемента смарта, которые не переносятся: их задаёт новая сделка.
 *
 * `stageId` здесь НЕТ намеренно: стадия — это признак участия варианта
 * («Текущий», «Отклонён»), и потеряв её при переезде, отдел сервиса получил бы
 * кучу одинаковых черновиков без следов выбора менеджера.
 */
const SKIPPED_ITEM_FIELDS = new Set([
    'id',
    'xmlId',
    'createdTime',
    'updatedTime',
    'movedTime',
    'createdBy',
    'updatedBy',
    'movedBy',
    'entityTypeId',
    'parentId2',
    'previousStageId',
]);

/**
 * Перенос вариантов комплекта с исходной сделки на созданную роботом.
 *
 * Когда поставка (или перезаключение) доезжает до отдела сервиса, вместе с ней
 * обязаны переехать ВСЕ собранные наборы, а не один: на сделке их может быть
 * несколько, и у каждого свой договор — в том числе разного типа.
 *
 * На каждый вариант создаётся свой элемент смарта на новой сделке, к нему
 * копируются товарные строки и слепок конструктора.
 *
 * Не @Injectable: внутри per-domain инстанс Bitrix (CLAUDE.md — race condition).
 */
export class CopyComplectVariantsService {
    private readonly logger = new Logger(CopyComplectVariantsService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portalModel: PortalModel,
        private readonly innerDealService: InnerDealService,
    ) {}

    async copy(
        domain: string,
        sourceDealId: number,
        targetDealId: number,
        userId: number | null,
    ): Promise<CopyComplectVariantsResult> {
        const portalSmart = this.portalModel.getSmartByType(
            COMPLECT_VARIANT_SMART_TYPE,
        );
        if (!portalSmart?.entityTypeId) {
            // смарт на портале не установлен — сделки живут по-старому
            return { found: 0, selected: 0, copied: 0 };
        }

        const variants = await this.innerDealService.listVariants(
            domain,
            sourceDealId,
        );
        if (!variants.length) {
            return { found: 0, selected: 0, copied: 0 };
        }

        // Повторный прогон робота не должен плодить копии. Элемент смарта
        // каждый раз создаётся заново (новый id), поэтому связать копию с
        // источником нечем — единственный надёжный признак «уже переносили»
        // это наличие вариантов в целевой сделке.
        const alreadyInTarget = await this.innerDealService.listVariants(
            domain,
            targetDealId,
        );
        if (alreadyInTarget.length) {
            this.logger.log(
                `${domain}: в сделке ${targetDealId} уже ${alreadyInTarget.length} вариант(ов) — перенос пропущен`,
            );
            return { found: variants.length, selected: 0, copied: 0 };
        }

        const entityTypeId = Number(portalSmart.entityTypeId);

        // Элементы читаем до переноса: стадия решает, кто из вариантов вообще
        // едет, а она лежит в элементе, а не в слепке.
        const candidates: SourceVariant[] = [];
        for (const variant of variants) {
            const sourceItemId = variant.smartId;
            if (!sourceItemId) {
                continue;
            }
            const item = await this.readItem(entityTypeId, sourceItemId);
            if (!item) {
                continue;
            }
            candidates.push({
                sourceItemId,
                item,
                stageId: typeof item.stageId === 'string' ? item.stageId : null,
            });
        }

        const selected = selectVariantsToCopy(candidates);
        let copied = 0;

        for (const candidate of selected) {
            const newItemId = await this.createItemCopy(
                entityTypeId,
                candidate.item,
                targetDealId,
            );
            if (!newItemId) {
                this.logger.warn(
                    `Вариант ${candidate.sourceItemId} не скопирован`,
                );
                continue;
            }

            await this.copyProductRows(
                portalSmart.crm,
                candidate.sourceItemId,
                entityTypeId,
                newItemId,
            );

            const result = await this.innerDealService.copySnapshot({
                domain,
                source: {
                    kind: 'variant',
                    dealId: sourceDealId,
                    variantSmartId: candidate.sourceItemId,
                },
                targetDealId,
                variantSmartId: newItemId,
                userId,
                department: 'service',
                force: true,
            });
            if (result.copied) {
                copied += 1;
            }
        }

        this.logger.log(
            `${domain}: вариантов ${variants.length}, отобрано ${selected.length}, перенесено ${copied} (сделка ${sourceDealId} → ${targetDealId})`,
        );
        return { found: variants.length, selected: selected.length, copied };
    }

    /** Элемент варианта из Битрикса. null — прочитать не удалось. */
    private async readItem(
        entityTypeId: number,
        sourceItemId: number,
    ): Promise<IBXItem | null> {
        const response = await this.bitrix.item.get(
            String(sourceItemId),
            String(entityTypeId),
        );
        const sourceItem = response?.result?.item;
        if (!sourceItem) {
            this.logger.warn(`Вариант ${sourceItemId} не прочитан`);
            return null;
        }
        return sourceItem;
    }

    /** Копия элемента смарта на новой сделке. null — создать не удалось. */
    private async createItemCopy(
        entityTypeId: number,
        sourceItem: IBXItem,
        targetDealId: number,
    ): Promise<number | null> {
        const fields: Partial<IBXItem> = this.buildItemFields(
            sourceItem,
            targetDealId,
        );
        const created = await this.bitrix.item.add(
            String(entityTypeId),
            fields,
        );
        const newItemId = Number(created?.result?.item?.id);
        if (!Number.isFinite(newItemId) || newItemId <= 0) {
            return null;
        }
        return newItemId;
    }

    /** Значения исходного элемента минус то, что принадлежит старой сделке. */
    private buildItemFields(
        sourceItem: IBXItem,
        targetDealId: number,
    ): Partial<IBXItem> {
        const fields: Partial<IBXItem> = {};
        const entries = Object.entries(sourceItem) as [string, unknown][];
        for (const [key, value] of entries) {
            if (SKIPPED_ITEM_FIELDS.has(key)) {
                continue;
            }
            if (value === null || value === undefined || value === '') {
                continue;
            }
            fields[key] = value;
        }
        fields.parentId2 = targetDealId;
        return fields;
    }

    /** Товарные строки варианта — из элемента в элемент. */
    private async copyProductRows(
        smartCrm: string,
        sourceItemId: number,
        entityTypeId: number,
        targetItemId: number,
    ): Promise<void> {
        // ownerType динамического типа: `T{hex(entityTypeId)}` — в портальной
        // схеме он лежит в smarts.crm с хвостовым подчёркиванием
        const ownerType = smartCrm
            ? smartCrm.replace(/_$/, '')
            : `T${entityTypeId.toString(16)}`;

        const listed = await this.bitrix.productRow.list({
            '=ownerType': ownerType,
            '=ownerId': sourceItemId,
        } as ListProductRowDto);

        const rows = listed?.result?.productRows ?? [];
        if (!rows.length) {
            return;
        }

        await this.bitrix.productRow.set({
            ownerType: ownerType as BitrixOwnerType,
            ownerId: targetItemId,
            productRows: rows.map(row => {
                const copy = { ...row };
                delete copy.id;
                return copy;
            }),
        });
    }
}
