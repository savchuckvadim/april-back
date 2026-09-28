import {
    describeRepeatResolution,
    IRepeatDealInfo,
    IRepeatSignalCandidates,
    isRepeatCandidate,
    resolveRepeatWork,
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

    it('несколько открытых сделок у клиента → ambiguous, автоматики нет', () => {
        const res = resolveRepeatWork([
            bucket({
                signal: 'inn',
                value: '4826006839',
                deals: [deal(1), deal(2)],
            }),
        ]);
        expect(res.kind).toBe('ambiguous');
        expect(res.openDealIds).toEqual([1, 2]);
        expect(describeRepeatResolution(res)).toContain('#1, #2');
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
