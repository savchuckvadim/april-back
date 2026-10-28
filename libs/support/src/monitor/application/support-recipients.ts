import { SupportSignal } from '../domain/support-dialog.types';
import { SupportMonitorOptions } from './support-monitor-options';

/**
 * Кому колокольчик по оповещению.
 *
 * Новый диалог и срочный повтор — всем получателям: диалог ещё никто не
 * взял либо взявший молчит. Напоминание «клиент ждёт» — только оператору,
 * который взял диалог, если он сопоставлен с сотрудником портала
 * колокольчика (`support_monitor_operator_map`); иначе всем, как раньше.
 */
export function bellRecipientsFor(
    signal: SupportSignal,
    options: Pick<SupportMonitorOptions, 'notifyUserIds' | 'operatorMap'>,
): number[] {
    if (signal.kind !== 'waiting') return [...options.notifyUserIds];
    const recipient = options.operatorMap.get(signal.dialog.operatorId);
    return recipient ? [recipient] : [...options.notifyUserIds];
}
