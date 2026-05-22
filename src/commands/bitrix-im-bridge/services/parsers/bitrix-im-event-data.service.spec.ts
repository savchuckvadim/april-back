import { BitrixImEventDataService } from './bitrix-im-event-data.service';
import { ImV2EventPayload } from '../../interfaces/bridge.types';

describe('BitrixImEventDataService', () => {
    let service: BitrixImEventDataService;

    beforeEach(() => {
        service = new BitrixImEventDataService();
    });

    describe('isPrivateDialog', () => {
        it('возвращает true когда chat.type === user', () => {
            const data: ImV2EventPayload = { chat: { type: 'user', dialogId: '42' } };
            expect(service.isPrivateDialog(data)).toBe(true);
        });

        it('возвращает true когда chat.messageType === P', () => {
            const data: ImV2EventPayload = { chat: { messageType: 'P', dialogId: '42' } };
            expect(service.isPrivateDialog(data)).toBe(true);
        });

        it('возвращает true когда dialogId числовой (без префикса)', () => {
            const data: ImV2EventPayload = { chat: { dialogId: '123' } };
            expect(service.isPrivateDialog(data)).toBe(true);
        });

        it('возвращает false когда chat.type === chat', () => {
            const data: ImV2EventPayload = { chat: { type: 'chat', dialogId: 'chat5' } };
            expect(service.isPrivateDialog(data)).toBe(false);
        });

        it('возвращает false когда dialogId начинается с chat', () => {
            const data: ImV2EventPayload = { chat: { dialogId: 'chat5' } };
            expect(service.isPrivateDialog(data)).toBe(false);
        });

        it('возвращает false для open-линии', () => {
            const data: ImV2EventPayload = { chat: { type: 'open', dialogId: 'chat99' } };
            expect(service.isPrivateDialog(data)).toBe(false);
        });

        it('возвращает false для пустых данных', () => {
            expect(service.isPrivateDialog({})).toBe(false);
        });
    });

    describe('extractDialogId', () => {
        it('берёт dialogId из chat', () => {
            const data: ImV2EventPayload = { chat: { dialogId: '42' } };
            expect(service.extractDialogId(data)).toBe('42');
        });

        it('строит dialogId из chatId когда chat.dialogId отсутствует', () => {
            const data: ImV2EventPayload = { message: { chatId: 7 } };
            expect(service.extractDialogId(data)).toBe('chat7');
        });

        it('возвращает undefined когда данных нет', () => {
            expect(service.extractDialogId({})).toBeUndefined();
        });
    });

    describe('extractAuthorId', () => {
        it('берёт authorId из message', () => {
            const data: ImV2EventPayload = { message: { authorId: 55 } };
            expect(service.extractAuthorId(data)).toBe('55');
        });

        it('берёт id из user как fallback', () => {
            const data: ImV2EventPayload = { user: { id: 10 } };
            expect(service.extractAuthorId(data)).toBe('10');
        });

        it('возвращает undefined когда данных нет', () => {
            expect(service.extractAuthorId({})).toBeUndefined();
        });
    });

    describe('extractText', () => {
        it('возвращает текст сообщения', () => {
            const data: ImV2EventPayload = { message: { text: 'Привет' } };
            expect(service.extractText(data)).toBe('Привет');
        });

        it('возвращает undefined для пустой строки', () => {
            const data: ImV2EventPayload = { message: { text: '   ' } };
            expect(service.extractText(data)).toBeUndefined();
        });
    });

    describe('isSystemMessage', () => {
        it('возвращает true когда authorId === 0', () => {
            expect(service.isSystemMessage({}, '0')).toBe(true);
        });

        it('возвращает true когда authorId отсутствует', () => {
            expect(service.isSystemMessage({})).toBe(true);
        });

        it('возвращает true когда message.isSystem === true', () => {
            const data: ImV2EventPayload = { message: { isSystem: true } };
            expect(service.isSystemMessage(data, '5')).toBe(true);
        });

        it('возвращает false для обычного сообщения', () => {
            const data: ImV2EventPayload = { message: { isSystem: false } };
            expect(service.isSystemMessage(data, '5')).toBe(false);
        });
    });

    describe('isBotMessage', () => {
        it('возвращает true когда user.bot === true', () => {
            const data: ImV2EventPayload = { user: { bot: true } };
            expect(service.isBotMessage(data)).toBe(true);
        });

        it('возвращает true когда user.type === bot', () => {
            const data: ImV2EventPayload = { user: { bot: false, type: 'bot' } };
            expect(service.isBotMessage(data)).toBe(true);
        });

        it('возвращает false для обычного пользователя', () => {
            const data: ImV2EventPayload = { user: { bot: false, type: 'employee' } };
            expect(service.isBotMessage(data)).toBe(false);
        });
    });
});
