import type { BitrixService } from '@lib/bitrix';
import { SupportChatReader } from '../infrastructure/support-chat.reader';
import {
    liveMessage,
    liveTail,
} from '../../monitor/__tests__/support-bitrix-fixtures';

function setup(tailResult: unknown) {
    const tail = jest.fn().mockResolvedValue({ result: tailResult });
    const bitrix = { imV2ChatMessage: { tail } } as unknown as BitrixService;
    return {
        reader: new SupportChatReader(bitrix, 'april-dev.bitrix24.ru'),
        tail,
    };
}

describe('SupportChatReader', () => {
    it('переписка чата №769: роли, клиент и его портал, участники', async () => {
        const { reader, tail } = setup(
            liveTail([
                liveMessage(27100, 135, 'Здравствуйте! Смотрим.'),
                liveMessage(27079, 123, 'Добрый день! Это проверка связи.'),
                liveMessage(27065, 0, 'Начат новый диалог'),
            ]),
        );
        const view = await reader.read(769, 30);

        expect(tail).toHaveBeenCalledWith({ dialogId: 'chat769', limit: 30 });
        expect(view.url).toBe(
            'https://april-dev.bitrix24.ru/online/?IM_DIALOG=chat769',
        );
        expect(view.client).toEqual({
            userId: 123,
            name: 'Савчук Вадим',
            portal: 'alfacentr.bitrix24.ru',
        });
        expect(view.messages.map(m => [m.id, m.role])).toEqual([
            [27065, 'other'],
            [27079, 'client'],
            [27100, 'staff'],
        ]);
        expect(view.participants).toEqual(
            expect.arrayContaining([
                { id: 123, name: 'Савчук Вадим', role: 'client' },
                { id: 135, name: 'Муравьева Юлия', role: 'staff' },
                { id: 900, name: 'Бот линии', role: 'other' },
            ]),
        );
        expect(view.hasMore).toBe(false);
    });

    it('лимит ограничивается 1–50', async () => {
        const { reader, tail } = setup(liveTail([]));
        await reader.read(769, 500);
        expect(tail).toHaveBeenLastCalledWith({
            dialogId: 'chat769',
            limit: 50,
        });
        await reader.read(769, 0);
        expect(tail).toHaveBeenLastCalledWith({
            dialogId: 'chat769',
            limit: 1,
        });
    });

    it('пустой ответ портала — пустая переписка без клиента', async () => {
        const { reader } = setup(undefined);
        const view = await reader.read(769, 10);
        expect(view.messages).toEqual([]);
        expect(view.client).toBeNull();
    });
});
