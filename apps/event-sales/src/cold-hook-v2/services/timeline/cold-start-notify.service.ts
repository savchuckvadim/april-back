import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { ColdStartPush } from './cold-start-timeline.formatter';

/**
 * Push сотрудникам, у которых забрали или попытались забрать клиента —
 * `im.notify.system.add` напрямую: метод не батчится и подстановок
 * `$result[...]` не понимает. Сбой по одному адресату не мешает остальным
 * и не валит холодный старт: уведомление — не источник истины, им остаётся
 * таймлайн.
 */
export class ColdStartNotifyV2Service {
    private readonly logger = new Logger(ColdStartNotifyV2Service.name);

    constructor(private readonly bitrix: BitrixService) {}

    async send(pushes: ColdStartPush[]): Promise<number[]> {
        const delivered: number[] = [];
        for (const push of pushes) {
            try {
                await this.bitrix.imNotify.systemAdd({
                    USER_ID: push.userId,
                    MESSAGE: push.message,
                    TAG: push.tag,
                });
                delivered.push(push.userId);
            } catch (error) {
                this.logger.warn(
                    `[notify] push сотруднику ${push.userId} не доставлен: ${(error as Error).message}`,
                );
            }
        }
        return delivered;
    }
}
