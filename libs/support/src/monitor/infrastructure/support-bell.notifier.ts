import { Logger } from '@nestjs/common';
import type { BitrixService } from '@lib/bitrix';

/**
 * Колокольчик (im.notify.system.add) сотрудникам портала оповещений.
 *
 * Не Injectable: создаётся на такт с инстансом Битрикса портала
 * оповещений (april-garant), который отличается от портала линии.
 * Уведомления штучные — пачка не нужна (как у BxImNotifyService).
 */
export class SupportBellNotifier {
    private readonly logger = new Logger(SupportBellNotifier.name);

    constructor(private readonly bitrix: BitrixService) {}

    /** @returns скольким сотрудникам колокольчик доставлен. */
    async notify(
        userIds: readonly number[],
        message: string,
        tag: string,
    ): Promise<number> {
        let delivered = 0;
        for (const userId of userIds) {
            try {
                await this.bitrix.imNotify.systemAdd({
                    USER_ID: userId,
                    MESSAGE: message,
                    TAG: tag,
                });
                delivered += 1;
            } catch (error) {
                this.logger.warn(
                    `Колокольчик сотруднику ${userId} не доставлен: ${(error as Error).message}`,
                );
            }
        }
        return delivered;
    }
}
