import {
    authorRoleOf,
    portalHostOf,
    toSupportDialog,
} from '../infrastructure/support-dialog.mapper';
import {
    LIVE_USERS,
    liveMessage as msg,
    liveSession,
    liveTail,
} from './support-bitrix-fixtures';

describe('authorRoleOf', () => {
    const users = new Map(LIVE_USERS.map(user => [user.id, user]));

    it('система, клиент, коннектор, бот и сотрудник', () => {
        expect(authorRoleOf(msg(1, 0, 'x'), 123, users)).toBe('other');
        expect(authorRoleOf(msg(2, 1, 'x', true), 123, users)).toBe('other');
        expect(authorRoleOf(msg(3, 123, 'x'), 123, users)).toBe('client');
        expect(authorRoleOf(msg(4, 123, 'x'), 777, users)).toBe('client');
        expect(authorRoleOf(msg(5, 900, 'x'), 123, users)).toBe('other');
        expect(authorRoleOf(msg(6, 135, 'x'), 123, users)).toBe('staff');
        expect(authorRoleOf(msg(7, 555, 'x'), 123, users)).toBe('staff');
    });
});

describe('portalHostOf', () => {
    it('хост из website участника Network', () => {
        expect(portalHostOf('https://alfacentr.bitrix24.ru')).toBe(
            'alfacentr.bitrix24.ru',
        );
        expect(portalHostOf('gsr.bitrix24.ru/')).toBe('gsr.bitrix24.ru');
        expect(portalHostOf('')).toBeNull();
        expect(portalHostOf(undefined)).toBeNull();
    });
});

describe('toSupportDialog', () => {
    it('живой диалог №71: клиент ждёт, ответа сотрудника нет', () => {
        const result = toSupportDialog(liveSession(), liveTail());
        expect(result).not.toBeNull();
        expect(result?.client).toEqual({
            userId: 123,
            name: 'Савчук Вадим',
            portal: 'alfacentr.bitrix24.ru',
        });
        expect(result?.operatorName).toBe('Муравьева Юлия');
        expect(result?.crm).toEqual({ entityType: 'deal', entityId: 16867 });
        expect(result?.messages.map(m => [m.id, m.role])).toEqual([
            [27065, 'other'],
            [27079, 'client'],
            [27081, 'other'],
            [27093, 'other'],
        ]);
        expect(result?.messages[3]?.text).toBe(
            'Вадим Савчук переадресовал диалог',
        );
    });

    it('закрытые и отложенные диалоги не смотрим', () => {
        expect(
            toSupportDialog(liveSession({ status: 'closed' }), liveTail()),
        ).toBeNull();
        expect(
            toSupportDialog(liveSession({ status: 'paused' }), liveTail()),
        ).toBeNull();
    });

    it('без переписки — диалог с пустыми сообщениями и именем-заглушкой', () => {
        const result = toSupportDialog(
            liveSession({ operatorId: 0, crmEntityId: null }),
            null,
        );
        expect(result?.messages).toEqual([]);
        expect(result?.client.name).toBe('клиент №123');
        expect(result?.operatorId).toBe(0);
        expect(result?.crm).toBeNull();
    });

    it('сообщения прошлых сессий того же чата отсекаются', () => {
        const old = {
            ...msg(100, 123, 'старый вопрос'),
            date: '2026-10-20T10:00:00+03:00',
        };
        const oldAnswer = {
            ...msg(101, 135, 'старый ответ'),
            date: '2026-10-20T10:05:00+03:00',
        };
        const opening = {
            ...msg(200, 123, 'новый вопрос'),
            date: '2026-10-26T07:58:30+03:00',
        };
        const result = toSupportDialog(
            liveSession(),
            liveTail([opening, oldAnswer, old]),
        );
        expect(result?.messages.map(m => m.id)).toEqual([200]);
    });

    it('сессия с испорченной датой начала — сообщения не отсекаются', () => {
        const old = {
            ...msg(100, 123, 'x'),
            date: '2026-10-20T10:00:00+03:00',
        };
        const result = toSupportDialog(
            liveSession({ dateCreate: 'не дата' }),
            liveTail([old]),
        );
        expect(result?.messages.map(m => m.id)).toEqual([100]);
    });

    it('сообщение с испорченной датой пропускается', () => {
        const broken = { ...msg(1, 123, 'x'), date: 'не дата' };
        const result = toSupportDialog(liveSession(), liveTail([broken]));
        expect(result?.messages).toEqual([]);
    });
});
