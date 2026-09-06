import { DigestItem } from '@lib/sales-ai-analytics';
import { AiAnalyticsDeliveryService } from '../delivery/ai-analytics-delivery.service';
import {
    AGENDA_MESSAGE_TITLE,
    buildAgendaMessage,
    buildDigestMessage,
    callTypeTitle,
    DIGEST_MESSAGE_TITLE,
    formatCallTime,
    sectionTitle,
    truncateQuote,
} from '../delivery/ai-analytics-message.util';
import { AiAgendaDto } from '../dto/ai-agenda.dto';

const LINK = 'https://april.bitrix24.ru/crm/type/1054/details/77/';

const agenda: AiAgendaDto = {
    weekKey: '2026-W36',
    items: [
        {
            transcriptionId: 'r1',
            managerId: '10',
            callType: 'presentation',
            kind: 'risk',
            reason: 'Риск-флаги: promise',
            quote: 'Мы вам точно перезвоним завтра',
            charOffset: null,
            link: LINK,
            score: 40,
        },
        {
            transcriptionId: 'o1',
            managerId: '20',
            callType: null,
            kind: 'objection',
            reason: 'Спорное возражение (price): не отработано',
            quote: 'Дорого для нас',
            charOffset: null,
            link: null,
            score: null,
        },
    ],
    disagreements: [{ managerId: '20', object: 'call:o1', reason: 'не так' }],
};

const digestItems: DigestItem[] = [
    {
        transcriptionId: 'a1',
        callStartedAt: new Date('2026-09-04T08:20:00Z'),
        section: 'NEEDS',
        asWas: 'Мы вам перезвоним',
        alternatives: ['Давайте назначим дату', 'Когда удобно?', 'Третья'],
    },
];

interface NotifyArgs {
    USER_ID: number | string;
    MESSAGE: string;
    TAG: string;
}

function makeBitrix(failFor: number[] = []) {
    const systemAdd = jest.fn(
        ({ USER_ID }: NotifyArgs): Promise<unknown> =>
            failFor.includes(Number(USER_ID))
                ? Promise.reject(new Error('ACCESS_DENIED'))
                : Promise.resolve({ result: true }),
    );
    const get = jest.fn(({ ID }: { ID: string }) =>
        Promise.resolve({
            result: [
                ID === '10'
                    ? { LAST_NAME: 'Иванов', NAME: 'Иван' }
                    : { LAST_NAME: '', NAME: '' },
            ],
        }),
    );
    return {
        bitrix: { imNotify: { systemAdd }, user: { get } },
        systemAdd,
        get,
    };
}

describe('Тексты push-уведомлений (ai-analytics-message.util)', () => {
    it('повестка: заголовок, менеджер, тип, причина, цитата, ссылка и несогласия', () => {
        const text = buildAgendaMessage({
            weekKey: '2026-W36',
            items: agenda.items,
            disagreements: agenda.disagreements,
            managerNames: new Map([['10', 'Иванов Иван']]),
        });
        expect(text).toContain(`[B]${AGENDA_MESSAGE_TITLE} 2026-W36[/B]`);
        expect(text).toContain('1. Иванов Иван — Презентация');
        expect(text).toContain('Цитата: «Мы вам точно перезвоним завтра»');
        expect(text).toContain(`Разбор: ${LINK}`);
        expect(text).toContain('2. #20 — тип не определён');
        expect(text).toContain(
            'Причина: Спорное возражение (price): не отработано',
        );
        expect(text).toContain('Несогласия недели: 1');
        expect(text).toContain('— #20 · call:o1: не так');
        expect(text.split('Разбор:')).toHaveLength(2); // без ссылки — строки нет
    });

    it('повестка без несогласий — пункт «нет»', () => {
        const text = buildAgendaMessage({
            weekKey: '2026-W36',
            items: [],
            disagreements: [],
            managerNames: new Map(),
        });
        expect(text).toContain('Несогласия недели: нет');
    });

    it('дайджест: заголовок с датой, раздел, «было», три фразы дословно и ссылка', () => {
        const text = buildDigestMessage({
            day: '2026-09-04',
            timeZone: 'Europe/Moscow',
            items: digestItems,
            links: new Map([['a1', LINK]]),
        });
        expect(text).toContain(`[B]${DIGEST_MESSAGE_TITLE}[/B] (04.09.2026)`);
        expect(text).toContain('1. 04.09, 11:20 · Выявление потребностей');
        expect(text).toContain('Было: «Мы вам перезвоним»');
        expect(text).toContain('— Давайте назначим дату');
        expect(text).toContain('— Когда удобно?');
        expect(text).toContain('— Третья');
        expect(text).toContain(`Разбор: ${LINK}`);
        expect(text).not.toContain('Менеджер:');
    });

    it('дайджест при ручной отправке подписывает менеджера', () => {
        const text = buildDigestMessage({
            day: '2026-09-04',
            timeZone: 'Europe/Moscow',
            items: digestItems,
            links: new Map(),
            managerName: 'Иванов Иван',
        });
        expect(text).toContain('Менеджер: Иванов Иван');
        expect(text).not.toContain('Разбор:');
    });

    it('справочники и обрезка: типы/разделы из смарта, цитата ≤ 300 символов', () => {
        expect(callTypeTitle('cold')).toBe('Холодный (выход на ЛПР)');
        expect(callTypeTitle('custom_x')).toBe('custom_x');
        expect(sectionTitle('CLOSING')).toBe('Закрытие разговора');
        expect(sectionTitle('X')).toBe('X');
        expect(truncateQuote('a'.repeat(400))).toHaveLength(300);
        expect(truncateQuote('a'.repeat(400)).endsWith('…')).toBe(true);
        expect(
            formatCallTime(new Date('2026-09-04T21:30:00Z'), 'Europe/Moscow'),
        ).toBe('05.09, 00:30');
    });
});

describe('AiAnalyticsDeliveryService (Bitrix im.notify.system.add)', () => {
    it('sendAgenda: имя менеджера из user.get, TAG по неделе, текст с цитатой и ссылкой', async () => {
        const { bitrix, systemAdd, get } = makeBitrix();
        const delivery = new AiAnalyticsDeliveryService(bitrix as never);
        const delivered = await delivery.sendAgenda([447, 448], agenda);
        expect(delivered).toEqual([447, 448]);
        expect(get).toHaveBeenCalledTimes(2);
        expect(systemAdd).toHaveBeenCalledTimes(2);
        const [{ USER_ID, MESSAGE, TAG }] = systemAdd.mock.calls[0];
        expect(USER_ID).toBe(447);
        expect(TAG).toBe('ai-analytics:agenda:2026-W36');
        expect(MESSAGE).toContain('Иванов Иван — Презентация');
        expect(MESSAGE).toContain('«Мы вам точно перезвоним завтра»');
        expect(MESSAGE).toContain(LINK);
    });

    it('сбой одного получателя не мешает остальным', async () => {
        const { bitrix, systemAdd } = makeBitrix([447]);
        const delivery = new AiAnalyticsDeliveryService(bitrix as never);
        const delivered = await delivery.sendAgenda([447, 448, 449], agenda);
        expect(delivered).toEqual([448, 449]);
        expect(systemAdd).toHaveBeenCalledTimes(3);
    });

    it('sendDigest: TAG по дню и менеджеру, ссылки из карты', async () => {
        const { bitrix, systemAdd } = makeBitrix();
        const delivery = new AiAnalyticsDeliveryService(bitrix as never);
        const delivered = await delivery.sendDigest([10], digestItems, {
            day: '2026-09-04',
            timeZone: 'Europe/Moscow',
            managerId: '10',
            links: new Map([['a1', LINK]]),
        });
        expect(delivered).toEqual([10]);
        const [{ MESSAGE, TAG }] = systemAdd.mock.calls[0];
        expect(TAG).toBe('ai-analytics:digest:2026-09-04:10');
        expect(MESSAGE).toContain(DIGEST_MESSAGE_TITLE);
        expect(MESSAGE).toContain('— Давайте назначим дату');
        expect(MESSAGE).toContain(LINK);
    });

    it('resolveUserNames: ошибка user.get и пустое имя — fail-open, id не в карте', async () => {
        const { bitrix, get } = makeBitrix();
        get.mockRejectedValueOnce(new Error('boom'));
        const delivery = new AiAnalyticsDeliveryService(bitrix as never);
        const names = await delivery.resolveUserNames(['10', '20']);
        expect(names.size).toBe(0);
        const again = await delivery.resolveUserNames(['10', '20']);
        expect([...again.entries()]).toEqual([['10', 'Иванов Иван']]);
    });
});
