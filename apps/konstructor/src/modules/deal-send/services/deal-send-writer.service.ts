import { Logger } from '@nestjs/common';
import { BitrixService, IBXItem } from '@lib/bitrix';
import { BitrixOwnerType } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import { DealSendJobDto, DealSendSmartTarget } from '../dto/deal-send-job.dto';

/**
 * Пишет в Bitrix то, что собрал конструктор: поля сделки и товарные строки.
 *
 * Не @Injectable: внутри per-domain инстанс Bitrix, держать его в синглтоне
 * нельзя (CLAUDE.md — race condition).
 */
export class DealSendWriterService {
    private readonly logger = new Logger(DealSendWriterService.name);

    constructor(private readonly bitrix: BitrixService) {}

    async write(job: DealSendJobDto): Promise<void> {
        if (job.target?.kind === 'smart') {
            await this.writeSmart(job, job.target);
            return;
        }
        const fieldCount = Object.keys(job.fields).length;
        if (fieldCount) {
            await this.bitrix.deal.update(job.dealId, job.fields);
        }

        if (!job.productRows) {
            this.logger.log(
                `${job.domain} сделка ${job.dealId}: полей ${fieldCount}, товарные строки не переданы`,
            );
            return;
        }

        await this.bitrix.productRow.set({
            ownerType: BitrixOwnerType.DEAL,
            ownerId: job.dealId,
            productRows: job.productRows,
        });

        this.logger.log(
            `${job.domain} сделка ${job.dealId}: полей ${fieldCount}, строк ${job.productRows.length}`,
        );
    }

    /**
     * Элемент смарта (сервисный отдел, «предложение на будущий период»):
     * поля — crm.item.update, строки — crm.item.productrow.set с ownerType
     * динамического типа. Легаси делал это с фронта тремя вызовами.
     */
    private async writeSmart(
        job: DealSendJobDto,
        target: DealSendSmartTarget,
    ): Promise<void> {
        const fieldCount = Object.keys(job.fields).length;
        if (fieldCount) {
            await this.bitrix.item.update(
                target.smartId,
                // библиотека типизирует entityTypeId константой сделки; у смарта он свой
                target.entityTypeId as never,
                job.fields as Partial<IBXItem>,
            );
        }
        if (job.productRows) {
            await this.bitrix.productRow.set({
                ownerType: target.ownerType as BitrixOwnerType,
                ownerId: target.smartId,
                productRows: job.productRows,
            });
        }
        this.logger.log(
            `${job.domain} смарт ${target.entityTypeId}/${target.smartId}: полей ${fieldCount}, строк ${job.productRows?.length ?? 0}`,
        );
    }
}
