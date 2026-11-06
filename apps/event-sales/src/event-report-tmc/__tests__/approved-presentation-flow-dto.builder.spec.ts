import { BadRequestException } from '@nestjs/common';
import {
    approvedPresentationComment,
    approvedPresentationOperationId,
    deadlineOperationKey,
    buildApprovedPresentationFlowDto,
    normalizeApprovedPresentation,
    parseBpUserId,
} from '../lib/approved-presentation-flow-dto.builder';
import { TmcPresentationApprovedDto } from '../dto/tmc-presentation-approved.dto';

/**
 * Согласованная заявка ТМЦ → отчёт отдела продаж «запланирована
 * презентация» от имени менеджера ОП — то, что собирала легаси-ручка
 * `/initpres/success`: режим sales, ТМЦ-сделка в `tmcDealId`, `plan.tmc`.
 */
const raw = (
    over: Partial<TmcPresentationApprovedDto> = {},
): TmcPresentationApprovedDto => ({
    auth: { domain: 'gsr.bitrix24.ru' },
    tmcDealId: 213065,
    companyId: 48210,
    contactId: 91022,
    ownerId: 'user_1',
    managerId: 'user_187',
    tmcId: 'user_251',
    deadline: '15.11.2026 14:30:00',
    name: 'Заявка Демо СПС Иванов от 02.11.2026 10:00:00',
    commentOwner: 'Согласовано',
    commentTMC: 'Директор ждёт показ',
    commentManager: '',
    ...over,
});

describe('parseBpUserId', () => {
    it('формат бизнес-процесса user_N и голый id → число; мусор → 0', () => {
        expect(parseBpUserId('user_187')).toBe(187);
        expect(parseBpUserId('USER_12')).toBe(12);
        expect(parseBpUserId('42')).toBe(42);
        expect(parseBpUserId(42)).toBe(42);
        expect(parseBpUserId('')).toBe(0);
        expect(parseBpUserId('user_')).toBe(0);
        expect(parseBpUserId(undefined)).toBe(0);
    });
});

describe('normalizeApprovedPresentation', () => {
    it('домен из auth[domain], пользователи из user_N, дефолты имени и руководителя', () => {
        const input = normalizeApprovedPresentation(
            raw({ ownerId: undefined, name: '  ' }),
        );

        expect(input).toMatchObject({
            domain: 'gsr.bitrix24.ru',
            tmcDealId: 213065,
            companyId: 48210,
            contactId: 91022,
            managerId: 187,
            // Руководитель не указан — план ставит сам менеджер.
            ownerId: 187,
            tmcId: 251,
            name: 'Презентация',
            commentTmc: 'Директор ждёт показ',
            commentOwner: 'Согласовано',
            commentManager: '',
        });
    });

    it('домен отдельным параметром — тоже принимается', () => {
        expect(
            normalizeApprovedPresentation(
                raw({ auth: undefined, domain: 'gsirk.bitrix24.ru' }),
            ).domain,
        ).toBe('gsirk.bitrix24.ru');
    });

    it('без домена, сделки, компании, менеджера или даты — 400 с понятным текстом', () => {
        const cases: Array<[Partial<TmcPresentationApprovedDto>, RegExp]> = [
            [{ auth: undefined }, /домен/],
            [{ tmcDealId: undefined }, /ТМЦ-сделка/],
            [{ companyId: 0 }, /компания/],
            [{ managerId: 'user_' }, /менеджер/],
            [{ deadline: '' }, /дата/],
        ];
        for (const [over, pattern] of cases) {
            expect(() => normalizeApprovedPresentation(raw(over))).toThrow(
                BadRequestException,
            );
            expect(() => normalizeApprovedPresentation(raw(over))).toThrow(
                pattern,
            );
        }
    });
});

describe('approvedPresentationComment / approvedPresentationOperationId', () => {
    it('комментарий — только заполненные строки, в порядке ТМЦ → руководитель → менеджер', () => {
        expect(
            approvedPresentationComment({
                commentTmc: 'Показ бухгалтеру',
                commentOwner: '',
                commentManager: 'Подтвердил время',
            }),
        ).toBe('ТМЦ: Показ бухгалтеру\nМенеджер: Подтвердил время');
        expect(
            approvedPresentationComment({
                commentTmc: '',
                commentOwner: '',
                commentManager: '',
            }),
        ).toBe('');
    });

    it('id операции детерминирован по сделке, менеджеру и дате — повтор робота не плодит презентации', () => {
        const input = normalizeApprovedPresentation(raw());
        expect(approvedPresentationOperationId(input)).toBe(
            'tmc-approve-213065-187-202611151430',
        );
        expect(approvedPresentationOperationId(input)).toBe(
            approvedPresentationOperationId(
                normalizeApprovedPresentation(raw()),
            ),
        );
    });
});

describe('buildApprovedPresentationFlowDto', () => {
    it('отчёт sales-режима: план презентации менеджеру, руководитель — постановщик, ТМЦ-менеджер в plan.tmc, ТМЦ-сделка в tmcDealId', () => {
        const input = normalizeApprovedPresentation(raw());
        const dto = buildApprovedPresentationFlowDto(input, 'op-1');

        expect(dto.domain).toBe('gsr.bitrix24.ru');
        expect(dto.operationId).toBe('op-1');
        expect(dto.tmcDealId).toBe(213065);
        expect(dto.departament?.mode?.code).toBe('sales');
        expect(dto.context).toEqual({ from: 'company', companyId: 48210 });
        expect(dto.placement?.options?.ID).toBe(48210);
        expect(dto.plan).toMatchObject({
            responsibility: { ID: 187 },
            createdBy: { ID: 1 },
            tmc: { ID: 251 },
            type: { current: { code: 'presentation', name: 'Презентация' } },
            name: 'Заявка Демо СПС Иванов от 02.11.2026 10:00:00',
            deadline: '15.11.2026 14:30:00',
            isPlanned: true,
            isActive: true,
            contact: { ID: 91022 },
        });
        expect(dto.report).toMatchObject({
            resultStatus: 'new',
            description: 'ТМЦ: Директор ждёт показ\nРуководитель: Согласовано',
            workStatus: { current: { code: 'inJob', isActive: true } },
            failType: { current: { code: 'failure', isActive: false } },
            isNoCall: false,
            contact: null,
        });
        expect(dto.presentation).toEqual({
            count: { company: 0, smart: 0, deal: 0 },
            isPresentationDone: false,
            isUnplannedPresentation: false,
        });
    });

    it('без контакта и ТМЦ-менеджера — контакт null, plan.tmc не передаётся', () => {
        const dto = buildApprovedPresentationFlowDto(
            normalizeApprovedPresentation(
                raw({ contactId: undefined, tmcId: undefined }),
            ),
            'op-2',
        );
        expect(dto.plan.contact).toBeNull();
        expect(dto.plan.tmc).toBeUndefined();
    });
});

describe('deadlineOperationKey', () => {
    it('одна минута в любом написании — один ключ: робот, подстраховка по крону, REST', () => {
        const expected = '202611151430';
        expect(deadlineOperationKey('15.11.2026 14:30:00')).toBe(expected);
        expect(deadlineOperationKey('15.11.2026 14:30')).toBe(expected);
        expect(deadlineOperationKey('2026-11-15T14:30:00+03:00')).toBe(
            expected,
        );
        expect(deadlineOperationKey('2026-11-15 14:30:17')).toBe(expected);
        expect(deadlineOperationKey(' 15.11.2026 14:30:00 ')).toBe(expected);
    });

    it('дата без времени — полночь; непонятное написание — цифры как есть', () => {
        expect(deadlineOperationKey('15.11.2026')).toBe('202611150000');
        expect(deadlineOperationKey('через неделю 2')).toBe('2');
    });
});

describe('normalizeApprovedPresentation — привязки CRM с префиксом', () => {
    it('робот печатает crm-поле привязкой (D_, CO_, C_) — id разбираются как голые', () => {
        const input = normalizeApprovedPresentation(
            raw({
                tmcDealId: 'D_213065' as never,
                companyId: 'CO_48210' as never,
                contactId: 'C_91022' as never,
            }),
        );

        expect(input).toMatchObject({
            tmcDealId: 213065,
            companyId: 48210,
            contactId: 91022,
        });
    });
});
