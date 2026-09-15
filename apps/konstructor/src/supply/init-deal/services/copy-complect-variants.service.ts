import { Logger } from '@nestjs/common';
import { BitrixService, IBXItem } from '@lib/bitrix';
import { BitrixOwnerType } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { COMPLECT_VARIANT_SMART_TYPE } from '@lib/portal-lib/pbx/pbx-complect-variant-smart';
import { ListProductRowDto } from '@lib/bitrix/domain/crm/product-row/dto/list-product-row.sto';
import { InnerDealService } from '../../../modules/inner-deal/services/inner-deal.service';
import {
    isFinalVariantStage,
    selectVariantsToCopy,
} from '../lib/select-variants-to-copy';

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
    /**
     * ИСХОДНЫЕ элементы, которые реально уехали в поставку. Нужны роботу, чтобы
     * закрыть их «Успехом»: судьба варианта видна только здесь — дальше по коду
     * источник уже не фигурирует.
     */
    movedSourceIds: number[];
    /**
     * ИСХОДНЫЕ элементы, которые остались на старой сделке и ещё не закрыты:
     * неучастники отбора. Их робот помечает «Не состоялся». Уже финальные
     * (успех / отклонён / не состоялся) сюда не попадают — переписывать ручное
     * решение менеджера нельзя.
     */
    notMovedSourceIds: number[];
}

/** Перенос не состоялся: смарта нет, вариантов нет или робот идёт повторно. */
const emptyResult = (
    found: number,
    selected = 0,
): CopyComplectVariantsResult => ({
    found,
    selected,
    copied: 0,
    movedSourceIds: [],
    notMovedSourceIds: [],
});

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
            return emptyResult(0);
        }

        const variants = await this.innerDealService.listVariants(
            domain,
            sourceDealId,
        );
        if (!variants.length) {
            return emptyResult(0);
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
            return emptyResult(variants.length);
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
        const movedSourceIds: number[] = [];
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
            // копия создана — вариант физически уехал в поставку; слепок
            // может не доехать, но судьбу исходника это уже не меняет
            movedSourceIds.push(candidate.sourceItemId);

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

        const moved = new Set(movedSourceIds);
        // Остались на старой сделке и ещё не закрыты: их робот пометит
        // «Не состоялся». Финальные стадии не трогаем — там уже есть итог.
        const notMovedSourceIds = candidates
            .filter(
                candidate =>
                    !moved.has(candidate.sourceItemId) &&
                    !isFinalVariantStage(candidate.stageId),
            )
            .map(candidate => candidate.sourceItemId);

        this.logger.log(
            `${domain}: вариантов ${variants.length}, отобрано ${selected.length}, перенесено ${copied} (сделка ${sourceDealId} → ${targetDealId})`,
        );
        return {
            found: variants.length,
            selected: selected.length,
            copied,
            movedSourceIds,
            notMovedSourceIds,
        };
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
