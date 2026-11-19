import { GoneException, NotFoundException } from '@nestjs/common';
import type { CallPageLeadPayload, CallPageLeadService } from '@lib/call-lib';
import { CallPageLeadAccess, canReviewCall } from '../call-page-lead.access';
import type { CallPageCallResolver } from '../call-page-call.resolver';

const LEAD: CallPageLeadPayload = {
    v: 1,
    d: 'gsr.bitrix24.ru',
    u: '10',
    r: 'leader',
    t: '10245',
    e: 1_790_000_000,
};

function harness(
    check: ReturnType<CallPageLeadService['verify']>,
    resolved: { domain: string } | Error = { domain: LEAD.d },
) {
    const leads = { verify: jest.fn(() => check) };
    const calls = {
        resolve: jest.fn(() =>
            resolved instanceof Error
                ? Promise.reject(resolved)
                : Promise.resolve({ ...resolved, row: {}, records: [] }),
        ),
    };
    const access = new CallPageLeadAccess(
        leads as unknown as CallPageLeadService,
        calls as unknown as CallPageCallResolver,
    );
    return { access, leads, calls };
}

describe('CallPageLeadAccess', () => {
    it('верный ключ — звонок и чей ключ', async () => {
        const { access, calls } = harness({ status: 'ok', payload: LEAD });
        const context = await access.open('call', 'lead');
        expect(context.lead).toEqual(LEAD);
        expect(context.call.domain).toBe(LEAD.d);
        expect(calls.resolve).toHaveBeenCalledWith('call');
    });

    it('подделка или чужой звонок — 404 без чтения звонка', async () => {
        const { access, calls } = harness({ status: 'invalid' });
        await expect(access.open('call', 'lead')).rejects.toThrow(
            new NotFoundException('Ссылка недействительна'),
        );
        expect(calls.resolve).not.toHaveBeenCalled();
    });

    it('срок вышел — 410 с подсказкой', async () => {
        const { access } = harness({ status: 'expired', payload: LEAD });
        await expect(access.open('call', 'lead')).rejects.toThrow(
            new GoneException(
                'Срок ссылки истёк — откройте разбор из отчёта KPI заново',
            ),
        );
    });

    it('ссылка звонка отозвана — личная тоже не работает (404)', async () => {
        const { access } = harness(
            { status: 'ok', payload: LEAD },
            new NotFoundException('Ссылка недействительна или отозвана'),
        );
        await expect(access.open('call', 'lead')).rejects.toThrow(
            new NotFoundException('Ссылка недействительна'),
        );
    });

    it('ключ другого портала — 404', async () => {
        const { access } = harness(
            { status: 'ok', payload: LEAD },
            { domain: 'other.bitrix24.ru' },
        );
        await expect(access.open('call', 'lead')).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('сбой базы не выдаётся за «недействительна»', async () => {
        const { access } = harness(
            { status: 'ok', payload: LEAD },
            new Error('база недоступна'),
        );
        await expect(access.open('call', 'lead')).rejects.toThrow(
            'база недоступна',
        );
    });
});

describe('canReviewCall', () => {
    it('руководитель своего сотрудника — да; чужого — нет', () => {
        const op = { role: 'op' as const, visibleManagerIds: ['447'] };
        expect(canReviewCall(op, '447')).toBe(true);
        expect(canReviewCall(op, '512')).toBe(false);
        expect(canReviewCall(op, null)).toBe(false);
    });

    it('суперпользователь — да; менеджер — нет даже по своему звонку', () => {
        expect(
            canReviewCall(
                { role: 'cup', visibleManagerIds: null, isSuperUser: true },
                null,
            ),
        ).toBe(true);
        expect(
            canReviewCall(
                { role: 'manager', visibleManagerIds: ['447'] },
                '447',
            ),
        ).toBe(false);
    });
});
