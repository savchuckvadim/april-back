import type { SupportMonitorOptions } from '@lib/support';

/** Портал с включённым монитором глазами отчёта при старте. */
export interface SupportRosterEntry {
    domain: string;
    options: SupportMonitorOptions;
}

const lineOf = (lineId: number): string =>
    lineId > 0 ? `линия ${lineId}` : 'все линии';

const recipientsOf = (options: SupportMonitorOptions): string =>
    options.notifyUserIds.length
        ? `колокольчик ${options.notifyUserIds.length} сотр. на ${options.notifyDomain}`
        : 'колокольчик выключен (нет получателей)';

/**
 * Сообщение при старте bot: где монитор включён и в каком режиме.
 * Крон без работы молчит, и без этого отчёта «настроил, но не работает»
 * снаружи не проверить (тот же приём, что у аудита сделок).
 */
export function formatSupportRoster(
    entries: readonly SupportRosterEntry[],
    telegramConfigured: boolean,
): string {
    if (!entries.length) {
        return 'Мониторинг поддержки: не включён ни на одном портале';
    }
    const lines = entries.map(({ domain, options }) => {
        const mode = options.dryRun ? 'только считать' : 'оповещает';
        const telegram = !options.telegramEnabled
            ? 'Telegram выключен'
            : telegramConfigured
              ? 'Telegram-чат поддержки'
              : 'Telegram не настроен на сервере';
        return (
            `• ${domain}: ${lineOf(options.lineId)}, ${mode}, ` +
            `${recipientsOf(options)}, ${telegram}, ` +
            `просмотр раз в ${options.pollMinutes} мин, ` +
            `напоминание ${options.thresholds.remindMinutes} / ` +
            `${options.thresholds.escalateMinutes} мин`
        );
    });
    return ['Мониторинг поддержки включён:', ...lines].join('\n');
}
