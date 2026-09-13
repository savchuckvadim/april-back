import { Injectable } from '@nestjs/common';
import { TelegramService } from '@lib/telegram/telegram.service';
import { BxDocumentDeal } from 'generated/prisma';
import { InnerDealService } from '../../../modules/inner-deal/services/inner-deal.service';
import { InnerDealCopySource } from '../../../modules/inner-deal/lib/inner-deal-copy';

/** Слепок конструктора, который сервисная сделка наследует от продажи. */
interface RenewalSnapshotSource {
    /** Элемент смарта «предложение на будущий период». */
    serviceSmartId: number | null;
    /** Базовая сделка отдела продаж — фолбэк, если по смарту слепка нет. */
    baseDealId: number | null;
}

/**
 * Перенос состояния конструктора на сделку, созданную роботом.
 *
 * Само копирование живёт в InnerDealService — та же логика доступна вручную
 * через POST /api/konstructor/deal/copy, когда робот не смог перенести слепок.
 */
@Injectable()
export class CopyInnerDealService {
    constructor(
        private readonly innerDealService: InnerDealService,
        private readonly telegram: TelegramService,
    ) {}

    /**
     * Перезаключение: слепок берём из смарта «предложение на будущий период».
     * Если по смарту записи нет (смарт мог быть заведён не конструктором, либо
     * в RPA указан не тот элемент), откатываемся на слепок базовой сделки —
     * иначе менеджер получит пустой конструктор и восстанавливать будет нечего.
     */
    async copyFromServiceSmart(
        source: RenewalSnapshotSource,
        newDealId: number,
        domain: string,
        userId: number | null,
    ): Promise<BxDocumentDeal | null> {
        if (source.serviceSmartId) {
            const bySmart = await this.copy(
                { kind: 'serviceSmart', serviceSmartId: source.serviceSmartId },
                newDealId,
                domain,
                userId,
                `смарт ${source.serviceSmartId}`,
            );
            if (bySmart) {
                return bySmart;
            }
        }

        if (!source.baseDealId) {
            return null;
        }

        return await this.copy(
            { kind: 'deal', dealId: source.baseDealId, serviceSmartId: null },
            newDealId,
            domain,
            userId,
            `базовая сделка ${source.baseDealId} (фолбэк)`,
        );
    }

    /** Поставка: слепок берём из базовой сделки отдела продаж. */
    async copyFromBaseDeal(
        baseDealId: number,
        newDealId: number,
        domain: string,
        userId: number | null,
    ): Promise<BxDocumentDeal | null> {
        return await this.copy(
            { kind: 'deal', dealId: baseDealId, serviceSmartId: null },
            newDealId,
            domain,
            userId,
            `базовая сделка ${baseDealId}`,
        );
    }

    private async copy(
        source: InnerDealCopySource,
        newDealId: number,
        domain: string,
        userId: number | null,
        sourceLabel: string,
    ): Promise<BxDocumentDeal | null> {
        const result = await this.innerDealService.copySnapshot({
            domain,
            source,
            targetDealId: newDealId,
            // повторный прогон робота обновляет слепок, а не плодит копии
            force: true,
            userId,
            department: 'service',
        });

        if (!result.copied) {
            await this.telegram.sendMessage(
                `Слепок конструктора не скопирован (${result.reason}): ${domain} ${sourceLabel} → сделка ${newDealId}`,
            );
            return null;
        }

        await this.telegram.sendMessage(
            `Слепок конструктора скопирован: ${domain} ${sourceLabel} → сделка ${newDealId}`,
        );
        return result.deal;
    }
}
