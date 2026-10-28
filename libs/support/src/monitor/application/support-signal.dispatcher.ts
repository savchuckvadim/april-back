import { Injectable } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import { SupportSignal } from '../domain/support-dialog.types';
import {
    formatSupportBell,
    formatSupportTelegram,
    supportBellTag,
} from '../domain/support-signal.formatter';
import { SupportBellNotifier } from '../infrastructure/support-bell.notifier';
import { SupportTelegramNotifier } from '../infrastructure/support-telegram.notifier';
import { SupportMonitorOptions } from './support-monitor-options';
import { SupportSignalReport } from './support-monitor.report';
import { bellRecipientsFor } from './support-recipients';

/** Каналы одного просмотра линии: колокольчик готов, Telegram настроен. */
export interface SupportChannels {
    bell: SupportBellNotifier | null;
    telegram: boolean;
}

const NOT_SENT = { bellDelivered: 0, telegramDelivered: false } as const;

/**
 * Рассылка оповещений: колокольчик на портале оповещений и Telegram-чат
 * поддержки. Решения «что слать» здесь нет — только «куда и как».
 */
@Injectable()
export class SupportSignalDispatcher {
    constructor(
        private readonly pbx: PBXService,
        private readonly telegram: SupportTelegramNotifier,
    ) {}

    /**
     * Каналы на просмотр. Колокольчик нужен, только если есть кому; портал
     * оповещений обычно другой (april-garant) — свой инстанс Битрикса.
     * @param warnings сюда — почему канал недоступен
     */
    async openChannels(
        options: SupportMonitorOptions,
        warnings: string[],
    ): Promise<SupportChannels> {
        const telegram =
            options.telegramEnabled && this.telegram.isConfigured();
        let bell: SupportBellNotifier | null = null;
        if (options.notifyUserIds.length) {
            try {
                const { bitrix } = await this.pbx.initWebhook(
                    options.notifyDomain,
                );
                bell = new SupportBellNotifier(bitrix);
            } catch (error) {
                warnings.push(
                    `портал колокольчика ${options.notifyDomain} недоступен: ${(error as Error).message}`,
                );
            }
        }
        if (!bell && !telegram) {
            warnings.push(
                'оповещения некуда отправить: нет получателей колокольчика и Telegram-чата поддержки',
            );
        }
        return { bell, telegram };
    }

    /**
     * Разослать оповещение. Хоть один канал принял — событие считается
     * разосланным и запоминается; ни один — не запоминаем, следующий
     * просмотр повторит.
     */
    async dispatch(
        signal: SupportSignal,
        lineDomain: string,
        options: SupportMonitorOptions,
        channels: SupportChannels,
    ): Promise<SupportSignalReport> {
        const bellDelivered = channels.bell
            ? await channels.bell.notify(
                  bellRecipientsFor(signal, options),
                  formatSupportBell(signal, lineDomain),
                  supportBellTag(lineDomain, signal.dialog.sessionId),
              )
            : 0;
        const telegramDelivered = channels.telegram
            ? await this.telegram.send(
                  formatSupportTelegram(signal, lineDomain),
              )
            : false;
        return toSignalReport(signal, lineDomain, {
            bellDelivered,
            telegramDelivered,
            remembered: bellDelivered > 0 || telegramDelivered,
        });
    }
}

/**
 * Оповещение в отчёте. Без доставки (`NOT_SENT`) — пробный прогон или
 * предпросмотр; `remembered` решает вызывающий.
 */
export function toSignalReport(
    signal: SupportSignal,
    lineDomain: string,
    delivery: Pick<
        SupportSignalReport,
        'bellDelivered' | 'telegramDelivered' | 'remembered'
    > = { ...NOT_SENT, remembered: false },
): SupportSignalReport {
    return {
        kind: signal.kind,
        sessionId: signal.dialog.sessionId,
        clientName: signal.dialog.client.name,
        waitedMinutes: signal.waitedMinutes,
        bellText: formatSupportBell(signal, lineDomain),
        telegramText: formatSupportTelegram(signal, lineDomain),
        ...delivery,
    };
}

export const SUPPORT_NOT_SENT = NOT_SENT;
