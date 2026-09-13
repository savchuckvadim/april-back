import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { BitrixOwnerType } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import { DealSendJobDto } from '../dto/deal-send-job.dto';

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
}
