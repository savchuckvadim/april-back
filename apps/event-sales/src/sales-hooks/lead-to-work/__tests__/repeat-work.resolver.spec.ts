import { BatchApiService } from '@lib/bitrix/core/base/batch-api.service';
import {
    describeRepeatResolution,
    IRepeatDealInfo,
    IRepeatSignalCandidates,
    isRepeatCandidate,
    otherOpenDeals,
    repeatJoinHistoryText,
    resolveRepeatWork,
    sortByFreshness,
} from '../lib/repeat-work.resolver';

const deal = (
    dealId: number,
    over: Partial<IRepeatDealInfo> = {},
): IRepeatDealInfo => ({
    dealId,
    closed: false,
    stageId: 'C31:WARM',
    responsibleId: 387,
    companyId: null,
    title: `Сделка ${dealId}`,
    modifiedAt: null,
    row: { ID: String(dealId) },
    ...over,
});

const bucket = (
    over: Partial<IRepeatSignalCandidates> &
        Pick<IRepeatSignalCandidates, 'signal'>,
): IRepeatSignalCandidates => ({
    value: 'v',
    deals: [],
    contactIds: [],
    companyIds: [],
    ...over,
});

describe('resolveRepeatWork', () => {
    it('одна открытая основная по номеру заявки → join', () => {
        const res = resolveRepeatWork([
            bucket({ signal: 'order', value: '3260882', deals: [deal(84663)] }),
        ]);
        expect(res.kind).toBe('join');
        expect(res.mainDeal?.dealId).toBe(84663);
        expect(res.signal).toBe('order');
    });

    it('сильный сигнал решает: номер заявки важнее телефона с другой сделкой', () => {
        const res = resolveRepeatWork([
            bucket({ signal: 'phone', deals: [deal(1), deal(2)] }),
            bucket({ signal: 'order', deals: [deal(42423)] }),
        ]);
        expect(res.kind).toBe('join');
        expect(res.mainDeal?.dealId).toBe(42423);
    });

    /*
     * Решение владельца 01.10.2026: из нескольких открытых сделок клиента
     * заявка идёт в самую свежую (по DATE_MODIFY), остальные — дубли.
     */
    it('несколько открытых → ambiguous: выбрана самая свежая по дате изменения', () => {
        const res = resolveRepeatWork([
            bucket({
                signal: 'inn',
                value: '4826006839',
                deals: [
                    deal(1, { modifiedAt: '2026-09-30T10:00:00+03:00' }),
                    deal(2, { modifiedAt: '2026-09-01T10:00:00+03:00' }),
                    deal(3, { modifiedAt: '2026-08-15T10:00:00+03:00' }),
                ],
            }),
        ]);
        expect(res.kind).toBe('ambiguous');
        expect(res.mainDeal?.dealId).toBe(1);
        expect(res.openDeals?.map(item => item.dealId)).toEqual([1, 2, 3]);
        expect(otherOpenDeals(res).map(item => item.dealId)).toEqual([2, 3]);
        const text = describeRepeatResolution(res);
        expect(text).toContain('самая свежая из открытых сделок клиента #1');
        expect(text).toContain('ещё открыты: #2, #3');
        expect(text).toContain('ИНН 4826006839');
    });

    it('одинаковая дата изменения → свежей считается сделка с большим ID', () => {
        const at = '2026-09-30T10:00:00+03:00';
        const res = resolveRepeatWork([
            bucket({
                signal: 'phone',
                deals: [
                    deal(500, { modifiedAt: at }),
                    deal(700, { modifiedAt: at }),
                ],
            }),
        ]);
        expect(res.mainDeal?.dealId).toBe(700);
    });

    it('сделка без даты изменения уступает датированной; обе без даты — больший ID', () => {
        expect(
            sortByFreshness([
                deal(900),
                deal(10, { modifiedAt: '2026-01-01T00:00:00+03:00' }),
            ]).map(item => item.dealId),
        ).toEqual([10, 900]);
        expect(
            sortByFreshness([deal(5), deal(9), deal(7)]).map(
                item => item.dealId,
            ),
        ).toEqual([9, 7, 5]);
    });

    it('открытые сделки разных компаний — всё равно самая свежая (владелец: «там может быть что угодно»)', () => {
        const res = resolveRepeatWork([
            bucket({
                signal: 'email',
                deals: [
                    deal(11, {
                        companyId: 100,
                        modifiedAt: '2026-09-01T09:00:00+03:00',
                    }),
                    deal(12, {
                        companyId: 200,
                        modifiedAt: '2026-09-29T09:00:00+03:00',
                    }),
                    deal(13, { closed: true, companyId: 100 }),
                ],
            }),
        ]);
        expect(res).toMatchObject({ kind: 'ambiguous', signal: 'email' });
        expect(res.mainDeal?.dealId).toBe(12);
        expect(res.mainDeal?.companyId).toBe(200);
        expect(res.closedDealIds).toEqual([13]);
    });

    it('одна открытая — по-прежнему join, без списка «ещё открыты»', () => {
        const res = resolveRepeatWork([
            bucket({ signal: 'order', deals: [deal(42423)] }),
        ]);
        expect(res.kind).toBe('join');
        expect(res.openDeals).toBeUndefined();
        expect(otherOpenDeals(res)).toEqual([]);
    });

    it('закрытые сделки не мешают: одна открытая + закрытая → join', () => {
        const res = resolveRepeatWork([
            bucket({
                signal: 'email',
                deals: [deal(10, { closed: true }), deal(11)],
            }),
        ]);
        expect(res.kind).toBe('join');
        expect(res.mainDeal?.dealId).toBe(11);
        expect(res.closedDealIds).toEqual([10]);
    });

    it('открытых нет, одна компания → reuse-client (компания)', () => {
        const res = resolveRepeatWork([
            bucket({
                signal: 'phone',
                deals: [deal(10, { closed: true })],
                companyIds: [91429],
            }),
        ]);
        expect(res).toMatchObject({ kind: 'reuse-client', companyId: 91429 });
    });

    it('открытых нет, компаний нет, один контакт → reuse-client (контакт)', () => {
        const res = resolveRepeatWork([
            bucket({ signal: 'email', contactIds: [288609] }),
        ]);
        expect(res).toMatchObject({ kind: 'reuse-client', contactId: 288609 });
    });

    it('несколько клиентов без работы → none (не гадаем)', () => {
        const res = resolveRepeatWork([
            bucket({ signal: 'phone', contactIds: [1, 2] }),
        ]);
        expect(res.kind).toBe('none');
        expect(res.signal).toBe('phone');
    });

    it('два телефона лида ведут к одной сделке — это одно попадание', () => {
        const res = resolveRepeatWork([
            bucket({ signal: 'phone', value: '1', deals: [deal(5)] }),
            bucket({ signal: 'phone', value: '2', deals: [deal(5)] }),
        ]);
        expect(res.kind).toBe('join');
        expect(res.value).toBe('1, 2');
    });

    it('пустые находки → none без сигнала', () => {
        expect(resolveRepeatWork([bucket({ signal: 'order' })])).toEqual({
            kind: 'none',
        });
        expect(resolveRepeatWork([])).toEqual({ kind: 'none' });
    });
});

/*
 * Запись истории уходит значением batch-команды: Битрикс разбирает команду
 * как url и режет всё от первого `#` — запись сохранялась как «лид ».
 */
describe('repeatJoinHistoryText', () => {
    const ambiguous = resolveRepeatWork([
        bucket({
            signal: 'inn',
            value: '4826006839',
            deals: [
                deal(72000, { modifiedAt: '2026-09-30T10:00:00+03:00' }),
                deal(71000, { modifiedAt: '2026-09-01T10:00:00+03:00' }),
            ],
        }),
    ]);

    it('номера голыми числами, без `#`', () => {
        const text = repeatJoinHistoryText(348391, ambiguous);

        expect(text).toBe(
            'Повторная заявка: лид 348391 присоединён (самая свежая из ' +
                'открытых сделок клиента 72000, ещё открыты: 71000 (сигнал: ИНН 4826006839))',
        );
        expect(
            repeatJoinHistoryText(
                42,
                resolveRepeatWork([
                    bucket({ signal: 'order', value: '7', deals: [deal(5)] }),
                ]),
            ),
        ).toBe(
            'Повторная заявка: лид 42 присоединён (открытая сделка 5 (сигнал: номер заявки 7))',
        );
    });

    it('в batch-команде обновления сделки запись доезжает целиком', () => {
        const text = repeatJoinHistoryText(348391, ambiguous);
        const api = new BatchApiService({} as never, {} as never);

        api.addCmdBatch('lw_deal_join_348391', 'crm.deal.update', {
            id: 72000,
            fields: { UF_CRM_OP_MHISTORY: ['01.09.2026 — старое', text] },
        });
        const cmd = api.getCmdBatch().lw_deal_join_348391;

        expect(cmd).not.toContain('#');
        expect(cmd.endsWith(`[]=${text}`)).toBe(true);
    });
});

describe('isRepeatCandidate', () => {
    const base = {
        isXo: 'Y' as const,
        hasOwnDeal: false,
        isConverted: false,
        explicitActive: false,
    };

    it('ХО-заявка без своей сделки, распределяемая кругом, — кандидат', () => {
        expect(isRepeatCandidate(base)).toBe(true);
    });

    it('конвертация (isXo=N) не затрагивается никогда', () => {
        expect(isRepeatCandidate({ ...base, isXo: 'N' })).toBe(false);
    });

    it('своя сделка уже есть (повторный прогон/SLA) — мимо', () => {
        expect(isRepeatCandidate({ ...base, hasOwnDeal: true })).toBe(false);
    });

    it('адресный ХО с работающим сотрудником — мимо; с уволенным — кандидат', () => {
        expect(
            isRepeatCandidate({
                ...base,
                explicitResponsible: 323,
                explicitActive: true,
            }),
        ).toBe(false);
        expect(
            isRepeatCandidate({
                ...base,
                explicitResponsible: 171,
                explicitActive: false,
            }),
        ).toBe(true);
    });

    it('конвертированный штатно лид — мимо', () => {
        expect(isRepeatCandidate({ ...base, isConverted: true })).toBe(false);
    });
});
