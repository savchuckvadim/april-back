import type { BitrixService } from '@lib/bitrix';
import {
    SupportReplySender,
    toMessageId,
} from '../infrastructure/support-reply.sender';
import {
    bitrixErrorCode,
    isBitrixAccessError,
} from '../infrastructure/bitrix-error.util';

const bitrixError = (code: string) =>
    Object.assign(new Error('Request failed with status code 400'), {
        response: { data: { error: code, error_description: 'x' } },
    });

function setup() {
    const add = jest.fn();
    const join = jest.fn().mockResolvedValue({ result: true });
    const bitrix = {
        message: { add },
        imOpenlinesOperatorSession: { join },
    } as unknown as BitrixService;
    return { sender: new SupportReplySender(bitrix), add, join };
}

describe('SupportReplySender', () => {
    it('ключ — участник диалога: одно сообщение, без присоединения', async () => {
        const { sender, add, join } = setup();
        add.mockResolvedValue({ result: 27101 });
        expect(await sender.send(769, 'Здравствуйте!')).toEqual({
            messageId: 27101,
            joined: false,
        });
        expect(add).toHaveBeenCalledWith({
            DIALOG_ID: 'chat769',
            MESSAGE: 'Здравствуйте!',
        });
        expect(join).not.toHaveBeenCalled();
    });

    it('диалог ведёт другой оператор: присоединиться и повторить один раз', async () => {
        const { sender, add, join } = setup();
        add.mockRejectedValueOnce(
            bitrixError('ACCESS_ERROR'),
        ).mockResolvedValueOnce({ result: 27102 });
        expect(await sender.send(769, 'Ответ')).toEqual({
            messageId: 27102,
            joined: true,
        });
        expect(join).toHaveBeenCalledWith({ CHAT_ID: 769 });
        expect(add).toHaveBeenCalledTimes(2);
    });

    it('другая ошибка — без присоединения, наверх', async () => {
        const { sender, add, join } = setup();
        add.mockRejectedValue(bitrixError('MESSAGE_EMPTY'));
        await expect(sender.send(769, 'x')).rejects.toThrow('400');
        expect(join).not.toHaveBeenCalled();
    });

    it('после присоединения снова отказ — наверх, третьей попытки нет', async () => {
        const { sender, add } = setup();
        add.mockRejectedValue(bitrixError('ACCESS_ERROR'));
        await expect(sender.send(769, 'x')).rejects.toThrow();
        expect(add).toHaveBeenCalledTimes(2);
    });

    it('Битрикс не вернул номер сообщения — ошибка, а не «отправлено»', async () => {
        const { sender, add } = setup();
        add.mockResolvedValue({ result: false });
        await expect(sender.send(769, 'x')).rejects.toThrow('не вернул номер');
    });
});

describe('toMessageId и коды ошибок', () => {
    it('номер сообщения в обеих формах ответа', () => {
        expect(toMessageId(27101)).toBe(27101);
        expect(toMessageId('27101')).toBe(27101);
        expect(toMessageId({ result: 27101 })).toBe(27101);
        expect(toMessageId(false)).toBeNull();
        expect(toMessageId(undefined)).toBeNull();
    });

    it('код ошибки только из ответа Битрикса', () => {
        expect(bitrixErrorCode(bitrixError('ACCESS_DENIED'))).toBe(
            'ACCESS_DENIED',
        );
        expect(bitrixErrorCode(new Error('timeout'))).toBeNull();
        expect(bitrixErrorCode(null)).toBeNull();
        expect(isBitrixAccessError(bitrixError('ACCESS_DENIED'))).toBe(true);
        expect(isBitrixAccessError(bitrixError('CHAT_ID'))).toBe(false);
    });
});
