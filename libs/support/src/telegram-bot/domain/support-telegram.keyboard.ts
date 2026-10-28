import { TelegramInlineKeyboard } from '../../monitor/infrastructure/support-telegram.notifier';
import { SupportDraft } from '../../assistant/domain/support-assistant.types';
import { buildSupportCallback } from './support-telegram.commands';

/**
 * Кнопки под черновиком. «Отправить клиенту» — то самое явное «да»
 * человека; «Задача разработчику» — только когда разбор его требует.
 */
export function buildDraftKeyboard(
    draft: SupportDraft,
): TelegramInlineKeyboard {
    const second = [
        ...(draft.analysis.needsDeveloper
            ? [
                  {
                      text: '🛠 Задача разработчику',
                      callback_data: buildSupportCallback('task', draft.id),
                  },
              ]
            : []),
        {
            text: '🗑 Убрать',
            callback_data: buildSupportCallback('discard', draft.id),
        },
    ];
    return [
        [
            {
                text: '✅ Отправить клиенту',
                callback_data: buildSupportCallback('send', draft.id),
            },
        ],
        second,
    ];
}
