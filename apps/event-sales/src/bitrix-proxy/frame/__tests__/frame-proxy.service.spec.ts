import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PBXService } from '@lib/pbx';
import { PortalSessionGuard } from '@lib/auth';
import { PORTAL_SESSION_ENFORCE_KEY } from '@lib/auth/portal-session/portal-session.const';
import { FrameProxyController } from '../frame-proxy.controller';
import { FrameProxyService } from '../frame-proxy.service';

const BASE = { domain: 'garant.bitrix24.ru', requesterUserId: '459' };

const makeService = (call: jest.Mock) => {
    const pbx = {
        init: jest.fn(() => Promise.resolve({ bitrix: { api: { call } } })),
    } as unknown as PBXService;
    return new FrameProxyService(pbx);
};

describe('FrameProxyService', () => {
    it('вызов выполняется вебхуком портала, ответ Битрикса — как есть', async () => {
        const call = jest.fn(() => Promise.resolve({ result: true }));
        const response = await makeService(call).call({
            ...BASE,
            method: 'crm.company.update',
            params: { id: 1, fields: { ASSIGNED_BY_ID: 459 } },
        });
        expect(call).toHaveBeenCalledWith('crm.company.update', {
            id: 1,
            fields: { ASSIGNED_BY_ID: 459 },
        });
        expect(response).toEqual({ ok: true, answer: { result: true } });
    });

    it('ошибка Битрикса — ok=false с кодом, без исключения', async () => {
        // Как ошибка axios: Error с телом Битрикса в response.data.
        const failure = Object.assign(new Error('Request failed'), {
            response: {
                data: { error: 'NOT_FOUND', error_description: 'Not found' },
            },
        });
        const call = jest.fn(() => Promise.reject(failure));
        const response = await makeService(call).call({
            ...BASE,
            method: 'crm.deal.get',
            params: { id: 1 },
        });
        expect(response).toEqual({
            ok: false,
            error: 'NOT_FOUND',
            errorDescription: 'Not found',
        });
    });

    it('запрещённый метод — 403, в Битрикс не идём', async () => {
        const call = jest.fn();
        await expect(
            makeService(call).call({ ...BASE, method: 'crm.deal.delete' }),
        ).rejects.toThrow(ForbiddenException);
        expect(call).not.toHaveBeenCalled();
    });

    it('пакет: одна запрещённая команда — отклоняется весь', async () => {
        const call = jest.fn();
        await expect(
            makeService(call).batch({
                ...BASE,
                commands: {
                    a: { method: 'crm.deal.get', params: { id: 1 } },
                    b: { method: 'user.update', params: { ID: 1 } },
                },
            }),
        ).rejects.toThrow(ForbiddenException);
        expect(call).not.toHaveBeenCalled();
    });

    it('пакет: batch Битрикса со строками cmd, результат по ключам', async () => {
        const call = jest.fn(() =>
            Promise.resolve({
                result: {
                    result: { contact: 501 },
                    result_error: {
                        bind: {
                            error: '',
                            error_description: 'Access denied.',
                        },
                    },
                    result_total: [],
                    result_next: [],
                },
            }),
        );
        const response = await makeService(call).batch({
            ...BASE,
            commands: {
                contact: {
                    method: 'crm.contact.add',
                    params: { fields: { NAME: 'Ирина' } },
                },
                bind: {
                    method: 'crm.deal.contact.add',
                    params: {
                        id: 7,
                        fields: { CONTACT_ID: '$result[contact]' },
                    },
                },
            },
        });
        expect(call).toHaveBeenCalledWith('batch', {
            halt: 0,
            cmd: {
                contact:
                    'crm.contact.add?fields[NAME]=%D0%98%D1%80%D0%B8%D0%BD%D0%B0',
                bind: 'crm.deal.contact.add?id=7&fields[CONTACT_ID]=$result[contact]',
            },
        });
        expect(response.result).toEqual({ contact: 501 });
        expect(response.errors).toEqual({
            bind: { error: '', error_description: 'Access denied.' },
        });
    });

    it('batch Битрикса упал целиком — ошибка у каждой команды пачки', async () => {
        const call = jest.fn(() => Promise.reject(new Error('timeout')));
        const response = await makeService(call).batch({
            ...BASE,
            commands: { a: { method: 'crm.deal.get', params: { id: 1 } } },
        });
        expect(response.errors).toEqual({
            a: { error: 'PROXY_CALL_FAILED', error_description: 'timeout' },
        });
    });
});

describe('FrameProxyController', () => {
    it('сессия проверяется всегда: guard и пометка enforce на классе', () => {
        const guards = Reflect.getMetadata(
            GUARDS_METADATA,
            FrameProxyController,
        ) as unknown[];
        expect(guards).toContain(PortalSessionGuard);
        expect(
            Reflect.getMetadata(
                PORTAL_SESSION_ENFORCE_KEY,
                FrameProxyController,
            ),
        ).toBe(true);
    });
});
