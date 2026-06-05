// Тип метода imbot.v2.revision.get — по документации Bitrix
// api-reference/chat-bots/chat-bots-v2/imbot.v2/revision-get

export type IBXImBotV2RevisionGetRequest = Record<string, never>;

export interface IBXImBotV2RevisionGetResponse {
    result: { rest?: number; mobile?: number; [key: string]: unknown };
}
