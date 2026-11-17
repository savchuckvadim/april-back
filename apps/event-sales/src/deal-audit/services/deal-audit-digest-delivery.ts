import { BitrixService } from '@/modules/bitrix';
import { ETimeZone } from '@lib/shared/lib/date';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import { DealAuditDigestChannels } from '../lib/deal-audit-digest-channels';
import {
    DEAL_AUDIT_TASK_MARK,
    DealAuditDigestTask,
} from './deal-audit-digest-task';

/** Тег уведомления: новая сводка ЗАМЕЩАЕТ вчерашнюю, а не копится. */
const DIGEST_TAG = 'event-sales-deal-audit';

/**
 * Чем сводка одного отчёта отличается от сводки другого в каналах: тег
 * уведомления (новое замещает прошлое того же тега) и метка в названии
 * задачи (по ней закрывается прошлая задача). По умолчанию — аудит сделок;
 * сводка «Движение сделок» передаёт свои, чтобы не замещать чужое.
 */
export interface DealAuditDigestLabels {
    readonly notifyTag: string;
    readonly taskMark: string;
}

export const DEAL_AUDIT_DIGEST_LABELS: DealAuditDigestLabels = {
    notifyTag: DIGEST_TAG,
    taskMark: DEAL_AUDIT_TASK_MARK,
};

/** Собранная сводка одного получателя — в виде для каждого канала. */
export interface DealAuditDigest {
    readonly heading: string;
    /** Сколько забытых сделок в сводке (до обрезки по лимиту). */
    readonly count: number;
    /** Один текст — для уведомления и описания задачи. */
    readonly text: string;
    /** Серия личных сообщений: итог и по сообщению на сотрудника. */
    readonly messages: readonly string[];
}

/**
 * Доставка сводки одному получателю по включённым каналам.
 *
 * Не `@Injectable`: инстанс Битрикса приходит параметром на один прогон
 * портала (CLAUDE.md — иначе гонка между порталами). Сбой канала —
 * предупреждение, остальные каналы и получатели не страдают.
 */
export class DealAuditDigestDelivery {
    private readonly tasks: DealAuditDigestTask | null;

    constructor(
        private readonly bitrix: BitrixService,
        private readonly channels: DealAuditDigestChannels,
        timezone: ETimeZone,
        private readonly labels: DealAuditDigestLabels = DEAL_AUDIT_DIGEST_LABELS,
    ) {
        this.tasks = channels.task
            ? new DealAuditDigestTask(bitrix, timezone, labels.taskMark)
            : null;
    }

    /** true — дошёл хотя бы один канал. */
    async deliver(
        userId: number,
        digest: DealAuditDigest,
        warnings: string[],
    ): Promise<boolean> {
        const outcomes = await Promise.all([
            this.channels.notify
                ? this.notify(userId, digest, warnings)
                : false,
            this.channels.message
                ? this.message(userId, digest, warnings)
                : false,
            this.tasks
                ? this.tasks
                      .replace(userId, digest, warnings)
                      .then(taskId => taskId !== null)
                : false,
        ]);
        return outcomes.some(Boolean);
    }

    private async notify(
        userId: number,
        digest: DealAuditDigest,
        warnings: string[],
    ): Promise<boolean> {
        try {
            await this.bitrix.imNotify.systemAdd({
                USER_ID: userId,
                MESSAGE: digest.text,
                TAG: this.labels.notifyTag,
            });
            return true;
        } catch (error) {
            warnings.push(
                `уведомление сотруднику ${userId} не отправлено: ${getErrorString(error)}`,
            );
            return false;
        }
    }

    /**
     * Серия личных сообщений по порядку: итог, потом сотрудники. Сбой —
     * серия обрывается (дальше тот же отказ), в предупреждении — сколько
     * успело уйти.
     */
    private async message(
        userId: number,
        digest: DealAuditDigest,
        warnings: string[],
    ): Promise<boolean> {
        let sent = 0;
        for (const text of digest.messages) {
            try {
                await this.bitrix.message.add({
                    DIALOG_ID: String(userId),
                    MESSAGE: text,
                    SYSTEM: 'N',
                    // Двадцать ссылок на карточки — двадцать превью; текста хватает.
                    URL_PREVIEW: 'N',
                });
                sent += 1;
            } catch (error) {
                warnings.push(
                    `сообщение сотруднику ${userId} не отправлено ` +
                        `(ушло ${sent} из ${digest.messages.length}): ${getErrorString(error)}`,
                );
                break;
            }
        }
        return sent > 0;
    }
}

export const describeDigestChannels = (
    channels: DealAuditDigestChannels,
): string =>
    [
        channels.notify ? 'уведомление' : null,
        channels.message ? 'сообщение' : null,
        channels.task ? 'задача' : null,
    ]
        .filter(Boolean)
        .join(', ') || 'нет';
