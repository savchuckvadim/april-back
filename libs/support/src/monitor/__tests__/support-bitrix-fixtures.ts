import type { IBXImOpenlinesV2Session } from '@lib/bitrix';
import type {
    IBXImV2ChatMessage,
    IBXImV2ChatMessageTailResponse,
    IBXImV2ChatUser,
} from '@lib/bitrix/domain/chat/im-v2-chat-message';

/** Сессия, как её отдал april-dev 26.10.2026 (диалог №71, линия 9). */
export const liveSession = (
    overrides: Partial<IBXImOpenlinesV2Session> = {},
): IBXImOpenlinesV2Session => ({
    id: 71,
    configId: 9,
    source: 'network',
    operatorId: 135,
    userId: 123,
    userCode: 'network|x|y|z',
    chatId: 769,
    dateCreate: '2026-10-26T07:58:59+03:00',
    dateClose: null,
    dateFirstAnswer: null,
    dateOperatorAnswer: null,
    status: 'answered',
    closeReason: null,
    vote: null,
    voteHead: null,
    commentHead: null,
    crmEntityType: 'deal',
    crmEntityId: 16867,
    queueTransfers: 1,
    waitAnswer: null,
    waitClose: null,
    kpiFirstAnswer: null,
    messageCount: 1,
    ...overrides,
});

export const liveMessage = (
    id: number,
    authorId: number,
    text: string,
    isSystem = authorId === 0,
): IBXImV2ChatMessage => ({
    id,
    chatId: 769,
    authorId,
    date: '2026-10-26T07:59:01+03:00',
    text,
    isSystem,
    params: [],
});

/** Участники чата №769: клиент-коннектор, два сотрудника и бот. */
export const LIVE_USERS: IBXImV2ChatUser[] = [
    {
        id: 123,
        name: 'Савчук Вадим',
        type: 'extranet',
        connector: true,
        extranet: true,
        externalAuthId: 'imconnector',
        website: 'https://alfacentr.bitrix24.ru',
    },
    { id: 1, name: 'Вадим Савчук', type: 'user', connector: false },
    { id: 135, name: 'Муравьева Юлия', type: 'user', connector: false },
    { id: 900, name: 'Бот линии', type: 'bot', bot: true },
];

/** Хвост чата №769: от новых к старым, как отдаёт im.v2.Chat.Message.tail. */
export const liveTail = (
    messages: IBXImV2ChatMessage[] = [
        liveMessage(
            27093,
            0,
            '[USER=1 REPLACE]Вадим Савчук[/USER] переадресовал диалог',
        ),
        liveMessage(27081, 0, 'Добро пожаловать в Открытую линию'),
        liveMessage(27079, 123, 'Добрый день! Это проверка связи.'),
        liveMessage(27065, 0, 'Начат новый диалог'),
    ],
): IBXImV2ChatMessageTailResponse => ({
    messages,
    users: LIVE_USERS,
    hasNextPage: false,
});
