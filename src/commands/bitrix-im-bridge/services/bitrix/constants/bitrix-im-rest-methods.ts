/**
 * Enables messenger event recording for the current Bitrix user context.
 */
export const BX_IM_V2_EVENT_SUBSCRIBE_METHOD = 'im.v2.Event.subscribe';

/**
 * Returns accumulated messenger events in polling mode.
 */
export const BX_IM_V2_EVENT_GET_METHOD = 'im.v2.Event.get';

/**
 * Loads dialog message history to enrich event payloads.
 */
export const BX_IM_DIALOG_MESSAGES_GET_METHOD = 'im.dialog.messages.get';

/**
 * Sends a message to user/chat dialog in Bitrix messenger.
 */
export const BX_IM_MESSAGE_ADD_METHOD = 'im.message.add';
