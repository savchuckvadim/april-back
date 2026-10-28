import { NotFoundException } from '@nestjs/common';
import { SupportAssistantService } from '../../assistant/application/support-assistant.service';
import { SupportDraftStore } from '../../assistant/infrastructure/support-draft.store';
import { SupportTelegramNotifier } from '../../monitor/infrastructure/support-telegram.notifier';
import { SupportTelegramBotService } from '../application/support-telegram-bot.service';
import {
    SupportTelegramMessage,
    SupportTelegramUpdate,
} from '../domain/support-telegram.update';
import {
    draft,
    LINE,
    MemoryDraftStore,
    report,
} from '../../assistant/__tests__/support-assistant-fixtures';

const SUPPORT_CHAT = -100500;
const VADIM = {
    id: 42,
    first_name: 'Вадим',
    last_name: 'Савчук',
    username: 'vadim',
};

const incoming = (
    text: string,
    overrides: Partial<SupportTelegramMessage> = {},
): SupportTelegramUpdate => ({
    update_id: 1,
    message: {
        message_id: 10,
        chat: { id: SUPPORT_CHAT, type: 'supergroup' },
        from: VADIM,
        text,
        ...overrides,
    },
});

const pressed = (
    data: string,
    chatId = SUPPORT_CHAT,
): SupportTelegramUpdate => ({
    update_id: 2,
    callback_query: {
        id: 'cb1',
        from: VADIM,
        message: { message_id: 77, chat: { id: chatId } },
        data,
    },
});

function setup() {
    const assistant = {
        listDialogs: jest.fn().mockResolvedValue({
            domain: LINE,
            dialogs: [report()],
            warnings: [],
        }),
        findDialog: jest.fn().mockResolvedValue({
            lineDomain: LINE,
            dialog: report(),
            candidates: [],
            dialogs: [report()],
        }),
        analyze: jest.fn().mockResolvedValue(draft()),
        revise: jest.fn().mockResolvedValue(draft({ replyText: 'Правленый' })),
        send: jest
            .fn()
            .mockResolvedValue({ draft: draft(), result: { messageId: 1 } }),
        createTask: jest.fn().mockResolvedValue({
            taskId: 120345,
            url: 'https://april-garant.bitrix24.ru/t/120345',
        }),
        discard: jest.fn().mockResolvedValue(undefined),
    };
    const telegram = {
        supportChatId: jest.fn().mockReturnValue(String(SUPPORT_CHAT)),
        sendTo: jest.fn().mockResolvedValue(77),
        answerCallback: jest.fn().mockResolvedValue(undefined),
        clearKeyboard: jest.fn().mockResolvedValue(undefined),
        isChatMember: jest.fn().mockResolvedValue(true),
    };
    const drafts = new MemoryDraftStore();
    const service = new SupportTelegramBotService(
        assistant as unknown as SupportAssistantService,
        telegram as unknown as SupportTelegramNotifier,
        drafts as unknown as SupportDraftStore,
    );
    return { service, assistant, telegram, drafts };
}

const sentText = (telegram: { sendTo: jest.Mock }, index: number): string =>
    (telegram.sendTo.mock.calls[index] as unknown[])[1] as string;

describe('SupportTelegramBotService — доступ', () => {
    it('чужой чат — молчим; личка участника чата поддержки — работает, членство кэшируется', async () => {
        const { service, telegram } = setup();
        await service.handle(incoming('/help', { chat: { id: -777 } }));
        expect(telegram.sendTo).not.toHaveBeenCalled();

        await service.handle(
            incoming('/help', { chat: { id: 42, type: 'private' } }),
        );
        await service.handle(
            incoming('/help', { chat: { id: 42, type: 'private' } }),
        );
        expect(telegram.isChatMember).toHaveBeenCalledTimes(1);
        expect(telegram.sendTo).toHaveBeenCalledTimes(2);
        expect(sentText(telegram, 0)).toContain('ИИ-помощник поддержки');
    });

    it('личка не участника — молчим', async () => {
        const { service, telegram } = setup();
        telegram.isChatMember.mockResolvedValue(false);
        await service.handle(
            incoming('/help', {
                chat: { id: 99, type: 'private' },
                from: { id: 99 },
            }),
        );
        expect(telegram.sendTo).not.toHaveBeenCalled();
    });
});

describe('SupportTelegramBotService — команды', () => {
    it('обычная переписка в группе не трогается', async () => {
        const { service, telegram, assistant } = setup();
        await service.handle(incoming('Юля, глянь 769'));
        expect(telegram.sendTo).not.toHaveBeenCalled();
        expect(assistant.findDialog).not.toHaveBeenCalled();
    });

    it('«что в поддержке» — список открытых диалогов', async () => {
        const { service, telegram } = setup();
        await service.handle(incoming('что в поддержке'));
        expect(sentText(telegram, 0)).toContain('Открытые диалоги: 1');
    });

    it('«разбери …» — поиск, «разбираю», черновик с кнопками и привязка сообщения', async () => {
        const { service, telegram, assistant, drafts } = setup();
        await service.handle(incoming('разбери Соломатову'));
        expect(assistant.findDialog).toHaveBeenCalledWith('Соломатову');
        expect(assistant.analyze).toHaveBeenCalledWith(769, LINE);
        expect(sentText(telegram, 0)).toContain(
            'Разбираю диалог с Соломатова Анна',
        );
        expect(sentText(telegram, 1)).toContain(
            '<b>Черновик ответа клиенту:</b>',
        );
        const options = (telegram.sendTo.mock.calls[1] as unknown[])[2] as {
            replyMarkup: { callback_data: string }[][];
        };
        expect(options.replyMarkup[0]?.[0]?.callback_data).toBe(
            'sa:send:abc123',
        );
        expect(drafts.bindMessage).toHaveBeenCalledWith(
            SUPPORT_CHAT,
            77,
            'abc123',
        );
    });

    it('диалог не нашёлся — подсказка, модель не зовём', async () => {
        const { service, telegram, assistant } = setup();
        assistant.findDialog.mockResolvedValueOnce({
            lineDomain: LINE,
            dialog: null,
            candidates: [],
            dialogs: [report()],
        });
        await service.handle(incoming('/analyze Сидоров'));
        expect(assistant.analyze).not.toHaveBeenCalled();
        expect(sentText(telegram, 0)).toContain('«Сидоров» не нашёл');
    });

    it('ответ на сообщение с черновиком — правка и новый черновик с кнопками', async () => {
        const { service, telegram, assistant, drafts } = setup();
        drafts.bindings.set(`${SUPPORT_CHAT}:77`, 'abc123');
        await service.handle(
            incoming('Правленый', { reply_to_message: { message_id: 77 } }),
        );
        expect(assistant.revise).toHaveBeenCalledWith('abc123', 'Правленый');
        expect(sentText(telegram, 0)).toContain('✏️ Черновик поправлен.');
        expect(sentText(telegram, 0)).toContain(
            '<blockquote>Правленый</blockquote>',
        );
    });

    it('ошибка помощника — «Не получилось» в тот же чат', async () => {
        const { service, telegram, assistant } = setup();
        assistant.listDialogs.mockRejectedValueOnce(
            new Error('Битрикс недоступен'),
        );
        await service.handle(incoming('/dialogs'));
        expect(sentText(telegram, 0)).toBe(
            '⚠️ Не получилось: Битрикс недоступен',
        );
    });
});

describe('SupportTelegramBotService — кнопки', () => {
    it('«Отправить клиенту» — отправка с именем нажавшего, всплывашка, кнопки сняты', async () => {
        const { service, telegram, assistant } = setup();
        await service.handle(pressed('sa:send:abc123'));
        expect(assistant.send).toHaveBeenCalledWith(
            'abc123',
            'Вадим Савчук (@vadim) (кнопка в Telegram)',
        );
        expect(telegram.answerCallback).toHaveBeenCalledWith(
            'cb1',
            'Ответ отправлен клиенту',
        );
        expect(telegram.clearKeyboard).toHaveBeenCalledWith(SUPPORT_CHAT, 77);
    });

    it('«Задача разработчику» — задача и ссылка в чат; «Убрать» — черновик удалён', async () => {
        const { service, telegram, assistant } = setup();
        await service.handle(pressed('sa:task:abc123'));
        expect(assistant.createTask).toHaveBeenCalledWith('abc123');
        expect(sentText(telegram, 0)).toContain('Задача №120345 поставлена');

        await service.handle(pressed('sa:discard:abc123'));
        expect(assistant.discard).toHaveBeenCalledWith('abc123');
        expect(telegram.clearKeyboard).toHaveBeenCalledTimes(1);
    });

    it('черновик устарел — всплывашка «Не получилось» и причина в чат', async () => {
        const { service, telegram, assistant } = setup();
        assistant.send.mockRejectedValueOnce(
            new NotFoundException('Черновик не найден или устарел'),
        );
        await service.handle(pressed('sa:send:old'));
        expect(telegram.answerCallback).toHaveBeenCalledWith(
            'cb1',
            'Не получилось',
        );
        expect(sentText(telegram, 0)).toContain('Черновик не найден');
        expect(telegram.clearKeyboard).not.toHaveBeenCalled();
    });

    it('кнопка из чужого чата или с чужими данными — только закрыть «часики»', async () => {
        const { service, telegram, assistant } = setup();
        telegram.isChatMember.mockResolvedValue(false);
        await service.handle(pressed('sa:send:abc123', 555));
        expect(telegram.answerCallback).toHaveBeenCalledWith(
            'cb1',
            'Нет доступа',
        );
        await service.handle(pressed('weird'));
        expect(telegram.answerCallback).toHaveBeenLastCalledWith('cb1');
        expect(assistant.send).not.toHaveBeenCalled();
    });
});
