import {
    DUPLICATE_ACTION,
    DUPLICATE_DECIDE_REASON,
    DUPLICATE_ORIGIN,
} from '../constants/duplicate-report.const';
import {
    classifyClient,
    classifyClients,
    dealOrigin,
    hasGoodTitle,
    hasOwnTitle,
} from '../lib/duplicate-classify';
import {
    CLASSIFY_OPTIONS,
    DAY,
    makeClientInput,
    makeDeal,
    makeLead,
    NOW,
} from './fixtures/duplicate-report.fixture';

const classify = (...deals: Parameters<typeof makeClientInput>[0]) =>
    classifyClient(makeClientInput(deals), CLASSIFY_OPTIONS);

describe('классификация клиентов с несколькими открытыми сделками', () => {
    describe('основная сделка', () => {
        it('у работающего ответственного, даже если сделка уволенного дальше по воронке', () => {
            const client = classify(
                makeDeal(1, { assignedById: 99, stageOrder: 8 }),
                makeDeal(2, { assignedById: 11, stageOrder: 2 }),
            );
            expect(client.mainDealId).toBe(2);
            expect(client.deals[0].deal.id).toBe(2);
            expect(client.deals[0].isMain).toBe(true);
        });

        it('при равных ответственных — дальше по воронке', () => {
            const client = classify(
                makeDeal(1, { stageOrder: 4 }),
                makeDeal(2, { stageOrder: 6 }),
            );
            expect(client.mainDealId).toBe(2);
        });

        it('на одной стадии — с суммой, потом с нормальным названием', () => {
            expect(
                classify(makeDeal(1), makeDeal(2, { opportunity: 55_000 }))
                    .mainDealId,
            ).toBe(2);
            expect(
                classify(makeDeal(1, { title: '3666123456' }), makeDeal(2))
                    .mainDealId,
            ).toBe(2);
        });

        it('при равенстве очков — самая свежая по дате изменения', () => {
            const client = classify(
                makeDeal(1, { modifiedAt: NOW - 20 * DAY }),
                makeDeal(2, { modifiedAt: NOW - 2 * DAY }),
            );
            expect(client.mainDealId).toBe(2);
        });

        it('остальные сделки идут после основной по дате создания', () => {
            const client = classify(
                makeDeal(3, { createdAt: NOW - 10 * DAY }),
                makeDeal(1, { createdAt: NOW - 90 * DAY }),
                makeDeal(2, { createdAt: NOW - 50 * DAY, stageOrder: 9 }),
            );
            expect(client.deals.map(item => item.deal.id)).toEqual([2, 1, 3]);
        });
    });

    it('самая свежая — по дате изменения, даже если основная другая', () => {
        const client = classify(
            makeDeal(1, { stageOrder: 8, modifiedAt: NOW - 40 * DAY }),
            makeDeal(2, { stageOrder: 2, modifiedAt: NOW - DAY }),
        );
        expect(client.mainDealId).toBe(1);
        expect(client.freshestDealId).toBe(2);
        expect(client.deals.find(item => item.isFreshest)?.deal.id).toBe(2);
    });

    describe('решить руководителю или присоединить', () => {
        it('двое работающих ответственных и каждый ведёт сам — решить руководителю', () => {
            const client = classify(
                makeDeal(1, { assignedById: 11, openTasks: 1 }),
                makeDeal(2, {
                    assignedById: 12,
                    lastActivityAt: NOW - 3 * DAY,
                    lastActivityById: 12,
                }),
            );
            expect(client.action).toBe(DUPLICATE_ACTION.decide);
            expect(client.decideReasons).toEqual([
                DUPLICATE_DECIDE_REASON.parallelWork,
            ]);
        });

        it('свежая правка карточки роботом или аудитом — не работа (дубль, а не спор)', () => {
            const client = classify(
                makeDeal(1, { assignedById: 11, openTasks: 1 }),
                makeDeal(2, { assignedById: 12, modifiedAt: NOW - DAY }),
            );
            expect(client.action).toBe(DUPLICATE_ACTION.join);
            expect(
                client.deals.find(item => item.deal.id === 2)?.recentWork,
            ).toBe(false);
        });

        it('дело владельца вебхука и чужая задача по сделке — не работа ответственного', () => {
            const client = classify(
                makeDeal(1, { assignedById: 11, openTasks: 1 }),
                makeDeal(2, {
                    assignedById: 12,
                    openTasks: 1,
                    ownOpenTasks: 0,
                    lastActivityAt: NOW - DAY,
                    lastActivityById: 447,
                }),
            );
            expect(client.action).toBe(DUPLICATE_ACTION.join);
        });

        it('общая открытая задача на две сделки — ведут как одного клиента, не спор', () => {
            const client = classify(
                makeDeal(1, {
                    assignedById: 11,
                    openTasks: 1,
                    openTaskIds: [700],
                }),
                makeDeal(2, {
                    assignedById: 12,
                    openTasks: 2,
                    openTaskIds: [700, 701],
                }),
            );
            expect(client.workedAsOne).toBe(true);
            expect(client.action).toBe(DUPLICATE_ACTION.join);
        });

        it('второй ответственный не работает — присоединить', () => {
            const client = classify(
                makeDeal(1, { assignedById: 11, openTasks: 1 }),
                makeDeal(2, { assignedById: 99, openTasks: 2 }),
            );
            expect(client.action).toBe(DUPLICATE_ACTION.join);
            expect(client.decideReasons).toEqual([]);
        });

        it('у второго нет своей работы: ни задач, ни своих дел за 30 дней — присоединить', () => {
            const client = classify(
                makeDeal(1, { assignedById: 11, openTasks: 1 }),
                makeDeal(2, {
                    assignedById: 12,
                    lastActivityAt: NOW - 31 * DAY,
                    lastActivityById: 12,
                }),
            );
            expect(client.action).toBe(DUPLICATE_ACTION.join);
        });

        it('обе сделки у одного менеджера — присоединить', () => {
            const client = classify(
                makeDeal(1, { openTasks: 1 }),
                makeDeal(2, { openTasks: 1 }),
            );
            expect(client.action).toBe(DUPLICATE_ACTION.join);
        });

        it('у сделок разные ИНН — решить руководителю, одинаковые — нет', () => {
            expect(
                classify(
                    makeDeal(1, { inn: '3666000001' }),
                    makeDeal(2, { inn: '3666000002' }),
                ).decideReasons,
            ).toEqual([DUPLICATE_DECIDE_REASON.differentInn]);
            expect(
                classify(
                    makeDeal(1, { inn: '3666000001' }),
                    makeDeal(2, { inn: '3666000001' }),
                ).action,
            ).toBe(DUPLICATE_ACTION.join);
        });
    });

    describe('как появилась сделка', () => {
        const first = makeDeal(1, { createdAt: NOW - 100 * DAY });
        const system = CLASSIFY_OPTIONS.systemUserIds;

        it('лид моложе первой сделки — новая заявка', () => {
            const deal = makeDeal(2, {
                sourceLeadId: 7,
                lead: makeLead(7, NOW - 10 * DAY),
            });
            expect(dealOrigin(deal, first, [first], system)).toBe(
                DUPLICATE_ORIGIN.newRequest,
            );
        });

        it('лид старше первой сделки — старый лид отправлен в работу', () => {
            const deal = makeDeal(2, {
                sourceLeadId: 7,
                lead: makeLead(7, NOW - 300 * DAY),
            });
            expect(dealOrigin(deal, first, [first], system)).toBe(
                DUPLICATE_ORIGIN.oldLead,
            );
        });

        it('старые лиды клиента стали сделками в один день — «несколько лидов разом»', () => {
            const created = NOW - 20 * DAY;
            const sibling = makeDeal(3, {
                createdAt: created - 60 * 60 * 1000,
                sourceLeadId: 8,
                lead: makeLead(8, NOW - 400 * DAY),
            });
            const deal = makeDeal(2, {
                createdAt: created,
                sourceLeadId: 7,
                lead: makeLead(7, NOW - 300 * DAY),
            });
            expect(
                dealOrigin(deal, first, [first, sibling, deal], system),
            ).toBe(DUPLICATE_ORIGIN.bulkConversion);
        });

        it('свежий лид (меньше суток до сделки) рядом с другой сделкой — всё равно новая заявка', () => {
            const created = NOW - 20 * DAY;
            const sibling = makeDeal(3, {
                createdAt: created,
                sourceLeadId: 8,
            });
            const deal = makeDeal(2, {
                createdAt: created,
                sourceLeadId: 7,
                lead: makeLead(7, created - 60 * 60 * 1000),
            });
            expect(
                dealOrigin(deal, first, [first, sibling, deal], system),
            ).toBe(DUPLICATE_ORIGIN.newRequest);
        });

        it('лид указан, но не прочитан — новая заявка', () => {
            const deal = makeDeal(2, { sourceLeadId: 7, lead: null });
            expect(dealOrigin(deal, first, [first], system)).toBe(
                DUPLICATE_ORIGIN.newRequest,
            );
        });

        it('без лида, создал сотрудник — заведена вручную', () => {
            expect(dealOrigin(makeDeal(2), first, [first], system)).toBe(
                DUPLICATE_ORIGIN.manual,
            );
        });

        it('без лида и без названия — автоматика', () => {
            expect(
                dealOrigin(
                    makeDeal(2, { title: 'Сделка #2' }),
                    first,
                    [first],
                    system,
                ),
            ).toBe(DUPLICATE_ORIGIN.automation);
            expect(
                dealOrigin(makeDeal(2, { title: ' ' }), first, [first], system),
            ).toBe(DUPLICATE_ORIGIN.automation);
        });

        it('без лида, создал владелец вебхука — автоматика', () => {
            expect(
                dealOrigin(
                    makeDeal(2, { createdById: 447 }),
                    first,
                    [first],
                    system,
                ),
            ).toBe(DUPLICATE_ORIGIN.automation);
        });

        it('у первой сделки клиента происхождения нет, у клиента — как появилась самая молодая', () => {
            const client = classify(
                makeDeal(1, { createdAt: NOW - 100 * DAY }),
                makeDeal(2, { createdAt: NOW - 50 * DAY, createdById: 447 }),
                makeDeal(3, { createdAt: NOW - 5 * DAY }),
            );
            const originOf = (id: number) =>
                client.deals.find(item => item.deal.id === id)?.origin;
            expect(originOf(1)).toBeNull();
            expect(originOf(2)).toBe(DUPLICATE_ORIGIN.automation);
            expect(originOf(3)).toBe(DUPLICATE_ORIGIN.manual);
            expect(client.origin).toBe(DUPLICATE_ORIGIN.manual);
        });
    });

    it('новое за неделю — самая молодая сделка создана в периоде отчёта', () => {
        expect(
            classify(makeDeal(1), makeDeal(2, { createdAt: NOW - 2 * DAY }))
                .newThisWeek,
        ).toBe(true);
        expect(
            classify(makeDeal(1), makeDeal(2, { createdAt: NOW - 8 * DAY }))
                .newThisWeek,
        ).toBe(false);
    });

    it('ночная сделка дня отчёта — «новое» следующей недели, не этой', () => {
        expect(
            classify(
                makeDeal(1),
                makeDeal(2, { createdAt: NOW - 2 * 60 * 60 * 1000 }),
            ).newThisWeek,
        ).toBe(false);
    });

    it('все ответственные не работают — пометка для назначения нового', () => {
        expect(
            classify(
                makeDeal(1, { assignedById: 99 }),
                makeDeal(2, { assignedById: null }),
            ).allResponsiblesGone,
        ).toBe(true);
        expect(
            classify(makeDeal(1, { assignedById: 99 }), makeDeal(2))
                .allResponsiblesGone,
        ).toBe(false);
    });

    it('порядок: решить руководителю первыми, внутри — новые за неделю, дальше по названию', () => {
        const join = (title: string, fresh: boolean) =>
            makeClientInput(
                [
                    makeDeal(1),
                    makeDeal(2, { createdAt: NOW - (fresh ? 1 : 30) * DAY }),
                ],
                { title },
            );
        const decide = makeClientInput(
            [
                makeDeal(1, { assignedById: 11, openTasks: 1 }),
                makeDeal(2, { assignedById: 12, openTasks: 1 }),
            ],
            { title: 'Яблоко' },
        );
        const titles = classifyClients(
            [
                join('Берёза', false),
                join('Ясень', true),
                decide,
                join('Абрикос', false),
            ],
            CLASSIFY_OPTIONS,
        ).map(client => client.title);
        expect(titles).toEqual(['Яблоко', 'Ясень', 'Абрикос', 'Берёза']);
    });

    it('название: своё — не пустое и не «Сделка #N»; нормальное — ещё и не ИНН', () => {
        expect(hasOwnTitle('Сделка #12')).toBe(false);
        expect(hasOwnTitle('ООО Ромашка')).toBe(true);
        expect(hasGoodTitle('3666123456')).toBe(false);
        expect(hasGoodTitle('ООО Ромашка')).toBe(true);
    });
});
