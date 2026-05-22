export type {
    IBXImV2ChatType as ImV2ChatType,
    IBXImV2ChatData as ImV2ChatData,
    IBXImV2MessageData as ImV2MessageData,
    IBXImV2UserData as ImV2UserData,
    IBXImV2EventPayload as ImV2EventPayload,
    IBXImV2Event as ImV2Event,
    IBXImV2EventGetResponse as ImV2EventGetResponse,
} from '@/modules/bitrix/domain/chat/im-v2-event/interface/bx-im-v2-event.interface';

export type {
    IBXDialogMessage as DialogMessage,
    IBXDialogMessagesGetResponse as DialogMessagesGetResponse,
} from '@/modules/bitrix/domain/chat/dialog-message/interface/bx-dialog-message.interface';

export type BridgeReplyContext = {
    domain: string;
    dialogId: string;
    bitrixMessageId?: number;
};
