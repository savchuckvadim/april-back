import { LeadToWorkRepeatNoticeService } from '../services/lead-to-work-repeat-notice.service';
import { IRepeatJoinNotice } from '../lib/repeat-join-notice';
import { IRepeatDealInfo } from '../lib/repeat-work.resolver';

const DOMAIN = 'garantservisvoronezh.bitrix24.ru';

const users = (...ids: number[]) => ids.map(ID => ({ ID }));

/**
 * Снимок отдела продаж: ОП 63 (РОП 11) с группой 67 без руководителя,
 * ОП 37 (РОП 413) и их предки.
 */
const SNAPSHOT = {
    department: {
        department: 0,
        generalDepartment: [
            { ID: 63, PARENT: 79, HEADS: [11], USERS: users(11, 433, 455) },
            { ID: 37, PARENT: 81, HEADS: [413], USERS: users(413, 500) },
        ],
        childrenDepartments: [{ ID: 67, PARENT: 63, USERS: users(323) }],
        parentDepartments: [
            { ID: 79, PARENT: 1, HEADS: [309], USERS: users(309) },
            { ID: 81, PARENT: 1, HEADS: [], USERS: [] },
        ],
        allUsers: [],
    },
};

const NAMES: Record<number, string> = {
    433: 'Иван Петров',
    455: 'Пётр Новиков',
    500: 'Анна Смирнова',
    323: 'Олег Ким',
    413: 'Мария Орлова',
};

const deal = (
    dealId: number,
    responsibleId: number | null,
    title = `Ромашка ${dealId}`,
): IRepeatDealInfo => ({
    dealId,
    closed: false,
    stageId: 'C3:WARM',
    responsibleId,
    companyId: 91429,
    title,
    modifiedAt: null,
    row: { ID: String(dealId) },
});

/** Владельцы по умолчанию — выбранной и перечисленных сделок (без лимита). */
const notice = (over: Partial<IRepeatJoinNotice> = {}): IRepeatJoinNotice => {
    const base = {
        leadId: 348391,
        clientTitle: 'ООО Ромашка',
        mainDeal: deal(72000, 433),
        otherDeals: [deal(71000, 500), deal(70000, 323), deal(69000, 500)],
        moreCount: 0,
        responsibleId: 433,
        ...over,
    };
    const owners = [base.mainDeal, ...base.otherDeals]
        .map(item => item.responsibleId)
        .filter((id): id is number => !!id);
    return { ...base, ownerIds: over.ownerIds ?? [...new Set(owners)] };
};

const setup = (
    loadSnapshot: () => Promise<unknown> = () => Promise.resolve(SNAPSHOT),
) => {
    const getFullDepartment = jest.fn(loadSnapshot);
    const addTimelineComment = jest.fn<Promise<unknown>, [unknown]>(() =>
        Promise.resolve({}),
    );
    const systemAdd = jest.fn<Promise<unknown>, [unknown]>(() =>
        Promise.resolve({}),
    );
    const service = new LeadToWorkRepeatNoticeService({
        getFullDepartment,
    } as never);
    const ctx = {
        domain: DOMAIN,
        bitrix: { timeline: { addTimelineComment }, imNotify: { systemAdd } },
    };
    /** Кому что ушло: id → текст. */
    const sent = (): Map<number, string> =>
        new Map(
            (
                systemAdd.mock.calls as unknown as [
                    { USER_ID: number; MESSAGE: string },
                ][]
            ).map(([arg]) => [arg.USER_ID, arg.MESSAGE]),
        );
    /** Комментарии таймлайна: «тип:id» → текст. */
    const comments = (): Map<string, string> =>
        new Map(
            (
                addTimelineComment.mock.calls as unknown as [
                    { ENTITY_TYPE: string; ENTITY_ID: number; COMMENT: string },
                ][]
            ).map(([arg]) => [
                `${arg.ENTITY_TYPE}:${arg.ENTITY_ID}`,
                arg.COMMENT,
            ]),
        );
    return {
        service,
        ctx: ctx as never,
        getFullDepartment,
        addTimelineComment,
        systemAdd,
        sent,
        comments,
    };
};

describe('LeadToWorkRepeatNoticeService', () => {
    it('комментарии: в выбранную сделку, в каждую другую открытую и в лид', async () => {
        const { service, ctx, comments } = setup();

        const warnings = await service.send(ctx, [notice()], NAMES);

        expect(warnings).toEqual([]);
        const byEntity = comments();
        expect([...byEntity.keys()]).toEqual([
            'deal:72000',
            'deal:71000',
            'deal:70000',
            'deal:69000',
            'lead:348391',
        ]);

        const chosen = byEntity.get('deal:72000')!;
        expect(chosen).toContain('Повторная заявка присоединена к этой сделке');
        expect(chosen).toContain(
            `<a href="https://${DOMAIN}/crm/lead/details/348391/" target="_blank">#348391</a>`,
        );
        expect(chosen).toContain('самая свежая из открытых сделок клиента');
        expect(chosen).toContain(
            `<a href="https://${DOMAIN}/crm/deal/details/71000/" target="_blank">#71000</a> «Ромашка 71000» — Анна Смирнова`,
        );
        expect(chosen).toContain('#70000');
        expect(chosen).toContain('Олег Ким');
        expect(chosen).toContain('«Звонках»');

        const other = byEntity.get('deal:71000')!;
        expect(other).toContain('По клиенту пришла повторная заявка');
        expect(other).toContain(
            `<a href="https://${DOMAIN}/crm/deal/details/72000/" target="_blank">#72000</a> «Ромашка 72000» (Иван Петров)`,
        );
        expect(other).toContain('возможный дубль');

        const lead = byEntity.get('lead:348391')!;
        expect(lead).toContain('присоединена к самой свежей сделке клиента');
        expect(lead).toContain('#71000');
        expect(lead).not.toContain('нужен выбор');
        // BB-код в таймлайне не рендерится — его там быть не должно.
        expect([...byEntity.values()].join('\n')).not.toContain('[URL=');
    });

    it('менеджерам дублей — по одному сообщению; ответственный выбранной сделки не получает', async () => {
        const { service, ctx, sent } = setup();

        await service.send(
            ctx,
            [
                notice({
                    // Ответственный выбранной ведёт и один из дублей.
                    otherDeals: [
                        deal(71000, 500),
                        deal(69000, 500),
                        deal(68000, 433),
                    ],
                }),
            ],
            NAMES,
        );

        const messages = sent();
        expect(messages.has(433)).toBe(false);
        const toAnna = messages.get(500)!;
        expect(toAnna).toContain('По вашему клиенту «ООО Ромашка»');
        expect(toAnna).toContain(
            `[URL=https://${DOMAIN}/crm/deal/details/72000/]#72000[/URL] (Иван Петров)`,
        );
        expect(toAnna).toContain(
            `Ваши сделки [URL=https://${DOMAIN}/crm/deal/details/71000/]#71000[/URL], ` +
                `[URL=https://${DOMAIN}/crm/deal/details/69000/]#69000[/URL]`,
        );
        expect(toAnna).toContain('руководитель решит, объединять ли');
    });

    it('руководители отделов ВСЕХ владельцев, без повторов; группа без РОПа — РОП родителя', async () => {
        const { service, ctx, sent } = setup();

        await service.send(ctx, [notice()], NAMES);

        const messages = sent();
        // 433 и 323 (группа 67 → ОП 63) → РОП 11; 500 (ОП 37) → РОП 413.
        expect([...messages.keys()].sort((a, b) => a - b)).toEqual([
            11, 323, 413, 500,
        ]);
        const toHead = messages.get(11)!;
        expect(toHead).toBe(messages.get(413));
        expect(toHead).toContain(
            `Повторная заявка ([URL=https://${DOMAIN}/crm/lead/details/348391/]лид #348391[/URL]) по клиенту «ООО Ромашка»`,
        );
        expect(toHead).toContain('у клиента 4 открытые сделки');
        expect(toHead).toContain(
            `[URL=https://${DOMAIN}/crm/deal/details/72000/]#72000[/URL] — Иван Петров`,
        );
        expect(toHead).toContain('#70000[/URL] — Олег Ким');
        expect(toHead).toContain('присоединена к самой свежей');
        expect(toHead).toContain('«Звонках»');
        const toManager = messages.get(323)!;
        expect(toManager).toContain('Ваша сделка');
        expect(toManager).toContain('тоже открыта');
    });

    it('человек и владелец дубля, и руководитель — одно сообщение, руководителя', async () => {
        const { service, ctx, systemAdd, sent } = setup();

        await service.send(
            ctx,
            [notice({ otherDeals: [deal(71000, 500), deal(66000, 413)] })],
            NAMES,
        );

        const toBoth = systemAdd.mock.calls.filter(
            call =>
                (call as unknown as [{ USER_ID: number }])[0].USER_ID === 413,
        );
        expect(toBoth).toHaveLength(1);
        expect(sent().get(413)).toContain('у клиента 3 открытые сделки');
    });

    it('владелец уволен: в текстах — новый ответственный, руководители — и его отдела', async () => {
        const { service, ctx, sent, comments } = setup();

        await service.send(
            ctx,
            [
                notice({
                    // Прежний владелец 999 вне структуры, сделку взял 455.
                    mainDeal: deal(72000, 999),
                    otherDeals: [deal(71000, 500)],
                    responsibleId: 455,
                }),
            ],
            NAMES,
        );

        const messages = sent();
        expect(messages.get(500)).toContain('#72000[/URL] (Пётр Новиков)');
        expect(messages.get(11)).toContain('#72000[/URL] — Пётр Новиков');
        expect(messages.has(413)).toBe(true);
        expect(comments().get('deal:71000')).toContain('(Пётр Новиков)');
    });

    /*
     * Лимит оповещений: комментарии и сообщения менеджерам — только по
     * перечисленным сделкам, остальные — числом; руководители — всех
     * владельцев, в том числе сделок сверх лимита.
     */
    it('сделки сверх лимита: тексты «и ещё N», руководители всех владельцев, предупреждение', async () => {
        const { service, ctx, sent, comments } = setup();

        const warnings = await service.send(
            ctx,
            [
                notice({
                    otherDeals: [deal(71000, 323)],
                    moreCount: 3,
                    // 500 ведёт сделку сверх лимита — её в списке нет.
                    ownerIds: [433, 323, 500],
                }),
            ],
            NAMES,
        );

        expect([...comments().keys()]).toEqual([
            'deal:72000',
            'deal:71000',
            'lead:348391',
        ]);
        expect(comments().get('deal:72000')).toContain('Олег Ким и ещё 3.');
        expect(comments().get('lead:348391')).toContain(' и ещё 3.');
        const messages = sent();
        // Менеджер сделки сверх лимита сообщения не получает…
        expect(messages.has(500)).toBe(false);
        expect(messages.has(323)).toBe(true);
        // …а его руководитель — получает.
        expect(messages.has(413)).toBe(true);
        expect(messages.get(11)).toContain('у клиента 5 открытых сделок');
        expect(messages.get(11)).toContain('Олег Ким и ещё 3)');
        expect(warnings).toEqual([
            expect.stringContaining('ушли по 1 самым свежим, ещё 3'),
        ]);
    });

    it('руководитель владельца не найден в структуре — предупреждение с его именем', async () => {
        const { service, ctx, sent } = setup();

        const warnings = await service.send(
            ctx,
            [notice({ otherDeals: [deal(71000, 500), deal(70000, 999)] })],
            NAMES,
        );

        // Остальным руководителям сообщено.
        expect(sent().has(11)).toBe(true);
        expect(sent().has(413)).toBe(true);
        expect(warnings).toEqual([
            expect.stringContaining('руководитель не найден'),
        ]);
        expect(warnings[0]).toContain('сотрудник 999');
        expect(warnings[0]).not.toContain('Анна Смирнова');
    });

    it('структура не прочитана — менеджеры уведомлены, руководителям нет, одно предупреждение', async () => {
        const { service, ctx, sent } = setup(() =>
            Promise.reject(new Error('redis down')),
        );

        const warnings = await service.send(ctx, [notice()], NAMES);

        expect([...sent().keys()].sort((a, b) => a - b)).toEqual([323, 500]);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('структура отдела продаж не прочитана');
    });

    it('сбой одного адресата и одного комментария не мешает остальным — уходит в предупреждения', async () => {
        const { service, ctx, systemAdd, addTimelineComment } = setup();
        systemAdd.mockImplementation(arg =>
            (arg as { USER_ID: number }).USER_ID === 500
                ? Promise.reject(new Error('timeout'))
                : Promise.resolve({}),
        );
        addTimelineComment.mockImplementationOnce(() =>
            Promise.reject(new Error('access denied')),
        );

        const warnings = await service.send(ctx, [notice()], NAMES);

        expect(addTimelineComment).toHaveBeenCalledTimes(5);
        expect(systemAdd).toHaveBeenCalledTimes(4);
        expect(warnings).toEqual([
            expect.stringContaining('deal 72000'),
            expect.stringContaining('сотруднику 500'),
        ]);
    });

    it('оповещать некого (холостой ход, одна открытая) — ни одного вызова', async () => {
        const {
            service,
            ctx,
            getFullDepartment,
            addTimelineComment,
            systemAdd,
        } = setup();

        expect(await service.send(ctx, [], NAMES)).toEqual([]);
        expect(getFullDepartment).not.toHaveBeenCalled();
        expect(addTimelineComment).not.toHaveBeenCalled();
        expect(systemAdd).not.toHaveBeenCalled();
    });
});
