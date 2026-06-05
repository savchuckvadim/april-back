// Типы метода imbot.v2.Event.get — по документации Bitrix
// api-reference/chat-bots/chat-bots-v2/imbot.v2/events

export interface IBXImBotV2EventGetRequest {
    botId: number;
    botToken?: string;
    offset?: number; // Подтверждает все события с id меньше указанного
    limit?: number; // 1–1000, по умолчанию 100
    withUserEvents?: boolean; // Включить ONIMV2* (требует scope im)
}

export interface IBXImBotV2EventItem {
    id?: number;
    event?: string; // напр. ONIMBOTV2MESSAGEADD
    data?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface IBXImBotV2EventGetResponse {
    result: {
        events?: IBXImBotV2EventItem[];
        lastId?: number;
        [key: string]: unknown;
    };
}
