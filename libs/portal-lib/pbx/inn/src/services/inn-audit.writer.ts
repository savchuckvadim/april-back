import { Logger } from '@nestjs/common';
import { formatInnAuditComment, IInnAuditRecord } from '../lib/inn-audit.codec';
import { IInnBitrix } from '../lib/inn-row.util';

/**
 * Запись об ИНН в ленту сделки — кто, когда и что выбрал или поставил.
 * Её отказ не отменяет саму запись полей: ошибка уходит в предупреждения.
 *
 * НЕ `@Injectable()`: инстанс Битрикса свой на каждый домен.
 */
export class InnAuditWriter {
    private readonly logger = new Logger(InnAuditWriter.name);

    constructor(
        private readonly bitrix: IInnBitrix,
        /** Домен портала — для сообщений в логе: инстансов много. */
        private readonly domain: string,
    ) {}

    async write(
        dealId: number,
        warnings: string[],
        record: IInnAuditRecord,
    ): Promise<void> {
        try {
            await this.bitrix.api.call('crm.timeline.comment.add', {
                fields: {
                    ENTITY_ID: dealId,
                    ENTITY_TYPE: 'deal',
                    COMMENT: formatInnAuditComment(record),
                },
            });
        } catch (error) {
            const message =
                `Запись об ИНН сделки ${dealId} не попала в таймлайн ` +
                `(${this.domain}): ${(error as Error).message}`;
            this.logger.warn(message);
            warnings.push(message);
        }
    }
}
