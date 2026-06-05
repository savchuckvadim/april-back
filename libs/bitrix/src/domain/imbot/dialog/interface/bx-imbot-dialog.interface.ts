// Типы метода imbot.dialog.get — по документации Bitrix
// api-reference/chat-bots/outdated/chats/imbot-dialog-get

export interface IBXImBotDialogGetRequest {
    DIALOG_ID: string; // XXX (user) или chatXXX (group)
}

export interface IBXImBotDialogData {
    ID?: string;
    NAME?: string;
    TYPE?: string;
    [key: string]: unknown;
}

export interface IBXImBotDialogGetResponse {
    result: IBXImBotDialogData;
}
