import { BadRequestException } from '@nestjs/common';
import {
    chunksOf,
    commandsOf,
    emptyBatchResult,
    mergeBatchAnswer,
} from '../lib/frame-batch-answer';
import { toBatchCommand } from '../lib/frame-batch-command';
import { isFrameMethodAllowed } from '../lib/frame-method-policy';
import { toFrameProxyError } from '../lib/frame-proxy-error';

describe('isFrameMethodAllowed — только методы «Звонков»', () => {
    it.each([
        'crm.company.update',
        'crm.deal.contact.items.set',
        'crm.contact.add',
        'crm.timeline.comment.add',
        'tasks.task.update',
        'task.commentitem.add',
        'lists.element.add',
        'im.notify.system.add',
        'user.get',
        'user.current',
        'department.get',
        'CRM.Deal.Get',
    ])('%s — можно', method => {
        expect(isFrameMethodAllowed(method)).toBe(true);
    });

    it.each([
        'crm.deal.delete',
        'crm.item.delete',
        'tasks.task.delete',
        'disk.folder.deletetree',
        'user.update',
        'user.add',
        'department.update',
        'crm.deal.userfield.add',
        'crm.status.update',
        'crm.category.add',
        'im.message.add',
        'placement.bind',
        'event.bind',
        'app.option.set',
        'disk.storage.getlist',
        'crm.deal.get?x=1',
        '',
    ])('%s — нельзя', method => {
        expect(isFrameMethodAllowed(method)).toBe(false);
    });
});

describe('toBatchCommand — строка cmd как http_build_query', () => {
    it('вложенные поля и кодирование текста', () => {
        expect(
            toBatchCommand('crm.company.update', {
                id: 177317,
                fields: { TITLE: 'ООО "А & Б" #1', ASSIGNED_BY_ID: 459 },
            }),
        ).toBe(
            'crm.company.update?id=177317' +
                '&fields[TITLE]=%D0%9E%D0%9E%D0%9E%20%22%D0%90%20%26%20%D0%91%22%20%231' +
                '&fields[ASSIGNED_BY_ID]=459',
        );
    });

    it('ссылка на соседнюю команду остаётся как есть', () => {
        expect(
            toBatchCommand('crm.deal.contact.add', {
                id: '$result[deal]',
                fields: { CONTACT_ID: '$result[contact][ID]' },
            }),
        ).toBe(
            'crm.deal.contact.add?id=$result[deal]' +
                '&fields[CONTACT_ID]=$result[contact][ID]',
        );
    });

    it('массивы по индексам, пустой массив опущен, null — пусто, булево 1/0', () => {
        expect(
            toBatchCommand('crm.deal.list', {
                select: ['ID', 'TITLE'],
                filter: { ID: [] },
                order: null,
                flag: true,
            }),
        ).toBe('crm.deal.list?select[0]=ID&select[1]=TITLE&order=&flag=1');
    });

    it('без параметров — только метод', () => {
        expect(toBatchCommand('user.current')).toBe('user.current');
    });
});

describe('ответ batch и команды пакета', () => {
    it('ответ Битрикса раскладывается по ключам, пустые [] — объекты', () => {
        const target = emptyBatchResult();
        mergeBatchAnswer(target, {
            result: {
                result: { a: true },
                result_error: { b: { error: 'ACCESS_DENIED' } },
                result_total: [],
                result_next: [],
            },
        });
        expect(target).toEqual({
            result: { a: true },
            errors: { b: { error: 'ACCESS_DENIED' } },
            total: {},
            next: {},
        });
    });

    it('кривая команда и пустой пакет — 400', () => {
        expect(() => commandsOf({})).toThrow(BadRequestException);
        expect(() => commandsOf({ a: { params: {} } })).toThrow(
            BadRequestException,
        );
        expect(() =>
            commandsOf({ a: { method: 'crm.deal.get', params: 'x' } }),
        ).toThrow(BadRequestException);
    });

    it('части по 50', () => {
        const items = Array.from({ length: 120 }, (_, i) => i);
        expect(chunksOf(items, 50).map(chunk => chunk.length)).toEqual([
            50, 50, 20,
        ]);
    });
});

describe('toFrameProxyError', () => {
    it('тело ошибки Битрикса — код и описание', () => {
        expect(
            toFrameProxyError({
                response: {
                    data: { error: '', error_description: 'Access denied.' },
                },
            }),
        ).toEqual({ error: '', errorDescription: 'Access denied.' });
    });

    it('сеть без тела — сообщение ошибки', () => {
        expect(toFrameProxyError(new Error('timeout'))).toEqual({
            error: 'PROXY_CALL_FAILED',
            errorDescription: 'timeout',
        });
    });
});
