import { CALL_CLASS, CallContext } from '@/core/call-context/call-context';
import {
    callContextSnapshot,
    describeCallPlace,
    signBitrixAlert,
} from '../bitrix-call-place.util';
import { parseBatchCommand } from '../bitrix-batch-commands.util';
import {
    batchFailureOf,
    callFailureOf,
    commandFailureOf,
    describeBitrixCommandError,
    describeBitrixError,
    isBitrixFailureReported,
    markBitrixFailureReported,
} from '../bitrix-failure-record.util';

const FULL: CallContext = {
    callClass: CALL_CLASS.interactive,
    source: 'POST /api/event-sales/flow',
    operation: 'Отчёт «Звонки»',
    domain: 'garant.bitrix24.ru',
    entity: { type: 'deal', id: '26735' },
    actor: { userId: 325, name: 'Иванов' },
};

describe('describeCallPlace — строка «Где»', () => {
    it('все части по порядку: приложение, операция, карточка, сотрудник, source', () => {
        expect(describeCallPlace(FULL, 'event-sales')).toBe(
            'event-sales · Отчёт «Звонки» · сделка 26735 · сотрудник 325 (Иванов) · POST /api/event-sales/flow',
        );
    });

    it('пустые части пропускаются', () => {
        expect(
            describeCallPlace(
                { callClass: CALL_CLASS.background, source: 'cron:x' },
                '',
            ),
        ).toBe('cron:x');
    });

    it.each([
        ['company', 'компания 1'],
        ['lead', 'лид 1'],
        ['contact', 'контакт 1'],
        ['task', 'задача 1'],
        ['smart', 'элемент смарт-процесса 1'],
    ] as const)('карточка %s → «%s»', (type, text) => {
        expect(
            describeCallPlace(
                { ...FULL, entity: { type, id: '1' }, actor: undefined },
                '',
            ),
        ).toContain(text);
    });

    it('подпись тревоги — вторая строка и дополнительные', () => {
        expect(signBitrixAlert('ошибка', 'где-то', ['Команды (1)'])).toBe(
            'ошибка\nГде: где-то\nКоманды (1)',
        );
    });
});

describe('callContextSnapshot — контекст в meta журнала', () => {
    it('только заполненные поля, без портала (он на верхнем уровне meta)', () => {
        expect(
            callContextSnapshot(
                { callClass: CALL_CLASS.background, source: 'cron:x' },
                '',
            ),
        ).toEqual({ source: 'cron:x', callClass: 'background', app: '' });
        expect(callContextSnapshot(FULL, 'event-sales')).toEqual({
            source: 'POST /api/event-sales/flow',
            callClass: 'interactive',
            operation: 'Отчёт «Звонки»',
            entity: { type: 'deal', id: '26735' },
            actor: { userId: 325, name: 'Иванов' },
            app: 'event-sales',
        });
    });

    it('длинный source обрезается', () => {
        const snapshot = callContextSnapshot(
            { callClass: CALL_CLASS.background, source: 'x'.repeat(500) },
            '',
        );

        expect(snapshot.source).toHaveLength(200);
    });
});

describe('записи о сбое', () => {
    const http400 = Object.assign(
        new Error('Request failed with status code 400'),
        {
            code: 'ERR_BAD_REQUEST',
            config: {
                url: 'https://garant.bitrix24.ru/rest/1/SECRET/crm.deal.update',
            },
            response: {
                status: 400,
                data: { error: 'ACCESS_DENIED', error_description: 'нет прав' },
            },
        },
    );

    it('суть ошибки без адреса вебхука', () => {
        const text = describeBitrixError(http400);

        expect(text).toBe(
            'Request failed with status code 400 · код ERR_BAD_REQUEST · HTTP 400 · ACCESS_DENIED · нет прав',
        );
        expect(text).not.toContain('SECRET');
        expect(describeBitrixError(null)).toBe('неизвестная ошибка');
    });

    it('одиночный вызов: kind=call, запись, сущность из параметров, статус', () => {
        expect(callFailureOf('crm.deal.update', { id: 5 }, http400)).toEqual({
            kind: 'call',
            method: 'crm.deal.update',
            write: true,
            entity: { label: 'сделка', id: '5' },
            status: 400,
            error: describeBitrixError(http400),
        });
    });

    it('чтение без id и без HTTP-ответа — без сущности и статуса', () => {
        expect(
            callFailureOf(
                'crm.deal.list',
                {},
                new Error('timeout of 30000ms exceeded'),
            ),
        ).toEqual({
            kind: 'call',
            method: 'crm.deal.list',
            write: false,
            error: 'timeout of 30000ms exceeded',
        });
    });

    it('упавший чанк: kind=batch, запись, если в пачке есть запись', () => {
        const failure = batchFailureOf(
            [
                parseBatchCommand('r', 'crm.deal.get?id=1'),
                parseBatchCommand('w', 'tasks.task.add?x=1'),
            ],
            new TypeError(
                "Cannot read properties of undefined (reading 'result')",
            ),
        );

        expect(failure).toMatchObject({
            kind: 'batch',
            method: 'batch',
            write: true,
            commands: { total: 2, writes: 1, summary: 'сделка ×1, задача ×1' },
        });
    });

    it('команда пачки: kind=command, код и описание Битрикса', () => {
        const failure = commandFailureOf(
            parseBatchCommand('kpi_1', 'lists.element.add?IBLOCK_ID=5'),
            {
                error: 'ERROR_ELEMENT_ALREADY_EXISTS',
                error_description: 'Элемент с таким кодом уже существует',
            },
        );

        expect(failure).toEqual({
            kind: 'command',
            method: 'lists.element.add',
            write: true,
            commands: {
                total: 1,
                writes: 1,
                summary: 'строка списка ×1',
                keys: ['kpi_1'],
            },
            error: 'ERROR_ELEMENT_ALREADY_EXISTS · Элемент с таким кодом уже существует',
        });
    });

    it('описание ошибки команды: строка как есть, непонятное — JSON, длинное обрезается', () => {
        expect(describeBitrixCommandError('boom')).toBe('boom');
        expect(describeBitrixCommandError({ code: 1 })).toBe('{"code":1}');
        expect(describeBitrixCommandError('x'.repeat(900))).toHaveLength(500);
    });

    it('пометка «записано»: только объекты, повторная проверка видит пометку', () => {
        const error = new Error('x');

        expect(isBitrixFailureReported(error)).toBe(false);
        markBitrixFailureReported(error);
        markBitrixFailureReported('строка');
        expect(isBitrixFailureReported(error)).toBe(true);
        expect(isBitrixFailureReported('строка')).toBe(false);
    });
});
