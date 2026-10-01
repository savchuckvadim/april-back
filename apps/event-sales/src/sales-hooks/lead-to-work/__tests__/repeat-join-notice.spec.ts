import {
    IRepeatJoinNotice,
    joinedRepeatNotices,
    MAX_REPEAT_NOTICE_OTHERS,
    NOTICE_TITLE_LIMIT,
    repeatJoinNoticeOf,
} from '../lib/repeat-join-notice';
import { dryRunNoteLines } from '../lib/repeat-join-notice.texts';
import {
    IRepeatDealInfo,
    IRepeatResolution,
} from '../lib/repeat-work.resolver';

const DOMAIN = 'garantservisvoronezh.bitrix24.ru';

const deal = (
    dealId: number,
    responsibleId: number | null,
    title = `Сделка ${dealId}`,
): IRepeatDealInfo => ({
    dealId,
    closed: false,
    stageId: 'C3:WARM',
    responsibleId,
    companyId: null,
    title,
    modifiedAt: null,
    row: { ID: String(dealId) },
});

const ambiguous: IRepeatResolution = {
    kind: 'ambiguous',
    signal: 'inn',
    value: '4826006839',
    mainDeal: deal(72000, 433),
    openDeals: [deal(72000, 433), deal(71000, 500)],
};

const source = (
    resolution: IRepeatResolution,
    lead: Record<string, unknown> = { TITLE: 'Андреева (3260882)' },
) => ({
    item: { leadId: 348391 },
    leadContext: { lead },
    assignee: { responsible: 455 },
    join: { outcome: { resolution } },
});

describe('repeatJoinNoticeOf', () => {
    it('несколько открытых: выбранная, остальные, владельцы, новый ответственный', () => {
        const notice = repeatJoinNoticeOf(source(ambiguous))!;

        expect(notice.leadId).toBe(348391);
        expect(notice.mainDeal.dealId).toBe(72000);
        expect(notice.otherDeals.map(item => item.dealId)).toEqual([71000]);
        expect(notice.moreCount).toBe(0);
        expect(notice.ownerIds).toEqual([433, 500]);
        expect(notice.responsibleId).toBe(455);
    });

    /*
     * Название заявки — последним: у формы сайта это «Заявка с сайта», то
     * есть заявка, а не клиент. Название сделки дают по клиенту.
     */
    it('клиент в тексте: компания → имя человека → название сделки → название заявки', () => {
        const titleOf = (
            lead: Record<string, unknown>,
            res: IRepeatResolution = ambiguous,
        ) => repeatJoinNoticeOf(source(res, lead))!.clientTitle;

        expect(
            titleOf({
                COMPANY_TITLE: ' ООО Ромашка ',
                NAME: 'Ирина',
                TITLE: 'x',
            }),
        ).toBe('ООО Ромашка');
        expect(
            titleOf({
                NAME: 'Ирина',
                LAST_NAME: 'Андреева',
                TITLE: 'Заявка с сайта',
            }),
        ).toBe('Ирина Андреева');
        expect(titleOf({ LAST_NAME: 'Андреева' })).toBe('Андреева');
        expect(titleOf({ TITLE: 'Заявка с сайта' })).toBe('Сделка 72000');
        // У сделки нет названия (заглушка файндера) — название заявки.
        const untitled: IRepeatResolution = {
            ...ambiguous,
            mainDeal: deal(72000, 433, '#72000'),
        };
        expect(titleOf({ TITLE: 'Заявка с сайта' }, untitled)).toBe(
            'Заявка с сайта',
        );
        expect(titleOf({ TITLE: '  ' }, untitled)).toBe('#72000');
    });

    it('длинное название клиента обрезается с многоточием', () => {
        const long = 'Ромашка'.repeat(20);
        const title = repeatJoinNoticeOf(
            source(ambiguous, { COMPANY_TITLE: long }),
        )!.clientTitle;

        expect(title).toHaveLength(NOTICE_TITLE_LIMIT);
        expect(title.endsWith('…')).toBe(true);
    });

    /*
     * Общий сигнал (домен почты госоргана) даёт десятки открытых сделок:
     * комментарии и сообщения менеджерам — по самым свежим в лимите, а
     * руководители — всех владельцев.
     */
    it('открытых больше лимита: самые свежие в лимите, остальные числом, владельцы — все', () => {
        const open = Array.from(
            { length: MAX_REPEAT_NOTICE_OTHERS + 3 },
            (_, i) => deal(80000 - i, 100 + i),
        );
        const notice = repeatJoinNoticeOf(
            source({ ...ambiguous, mainDeal: open[0], openDeals: open }),
        )!;

        expect(notice.otherDeals).toHaveLength(MAX_REPEAT_NOTICE_OTHERS);
        expect(notice.otherDeals[0].dealId).toBe(79999);
        expect(notice.moreCount).toBe(2);
        expect(notice.ownerIds).toHaveLength(MAX_REPEAT_NOTICE_OTHERS + 3);
        expect(notice.ownerIds).toContain(100 + MAX_REPEAT_NOTICE_OTHERS + 2);
    });

    it('одна открытая сделка — оповещать не о чем', () => {
        expect(
            repeatJoinNoticeOf(
                source({ kind: 'join', mainDeal: deal(42423, 387) }),
            ),
        ).toBeNull();
    });
});

describe('joinedRepeatNotices', () => {
    const notice = repeatJoinNoticeOf(source(ambiguous)) as IRepeatJoinNotice;
    const byCmd = new Map<string, unknown>([
        ['lw_deal_join_1', true],
        ['lw_lead_1', true],
        ['lw_deal_join_3', true],
    ]);
    const written = { dealCmd: 'lw_deal_join_1', leadCmd: 'lw_lead_1' };

    it('только записанные: без ошибки, с ответами на обновление сделки и лида', () => {
        const picked = joinedRepeatNotices(
            [
                { plan: written, repeat: { notice } },
                // Обновление сделки не прошло — «присоединена» было бы ложью.
                {
                    plan: { dealCmd: 'lw_deal_join_2', leadCmd: 'lw_lead_1' },
                    repeat: { notice },
                },
                { error: 'Лид не прочитан', plan: written, repeat: { notice } },
                // Одна открытая сделка — оповещения нет.
                { plan: written, repeat: { notice: null } },
                // Обычный путь без присоединения.
                { plan: { dealCmd: 'lw_deal_1' } },
            ],
            byCmd,
        );

        expect(picked).toEqual([notice]);
    });

    /*
     * Привязка лида не записалась — страховка входа прогонит лид снова, он
     * опять присоединится и разошлёт всё повторно. Оповещаем только тогда,
     * когда повторный прогон пойдёт мимо (лид уже указывает на сделку).
     */
    it('привязка лида не записалась (или не ставилась) — оповещения нет', () => {
        expect(
            joinedRepeatNotices(
                [
                    {
                        plan: {
                            dealCmd: 'lw_deal_join_3',
                            leadCmd: 'lw_lead_3',
                        },
                        repeat: { notice },
                    },
                    {
                        plan: { dealCmd: 'lw_deal_join_3' },
                        repeat: { notice },
                    },
                ],
                byCmd,
            ),
        ).toEqual([]);
    });
});

describe('dryRunNoteLines', () => {
    it('несколько открытых: «присоединил бы к самой свежей», остальные и имена', () => {
        const text = dryRunNoteLines(DOMAIN, ambiguous, {
            433: 'Иван Петров',
            500: 'Анна Смирнова',
        }).join('\n');

        expect(text).toContain('Повторная заявка — холостой ход');
        expect(text).toContain(
            'Присоединил бы к самой свежей из открытых сделок клиента: ' +
                `<a href="https://${DOMAIN}/crm/deal/details/72000/" target="_blank">#72000</a> «Сделка 72000» (Иван Петров)`,
        );
        expect(text).toContain('#71000</a> «Сделка 71000» (Анна Смирнова)');
        expect(text).toContain('холостой ход» в настройках портала');
        expect(text).not.toContain('нужен выбор');
    });

    it('одна открытая — прежний текст со ссылкой на сделку', () => {
        const text = dryRunNoteLines(
            DOMAIN,
            {
                kind: 'join',
                signal: 'order',
                value: '3260882',
                mainDeal: deal(42423, 387),
            },
            {},
        ).join('\n');

        expect(text).toContain(
            'Присоединил бы к работе клиента: открытая сделка #42423 (сигнал: номер заявки 3260882).',
        );
        expect(text).toContain(
            `Сделка: <a href="https://${DOMAIN}/crm/deal/details/42423/" target="_blank">#42423</a>`,
        );
    });

    it('имени нет в карте — «сотрудник N», названия нет — без кавычек', () => {
        const text = dryRunNoteLines(
            DOMAIN,
            {
                ...ambiguous,
                mainDeal: deal(72000, 433, '#72000'),
                openDeals: [deal(72000, 433, '#72000'), deal(71000, null)],
            },
            {},
        ).join('\n');

        expect(text).toContain('#72000</a> (сотрудник 433)');
        expect(text).toContain('#71000</a> «Сделка 71000».');
    });

    it('решения без сделки — без комментария', () => {
        expect(dryRunNoteLines(DOMAIN, { kind: 'none' }, {})).toEqual([]);
    });

    it('открытых больше лимита — самые свежие в лимите и «и ещё N»', () => {
        const open = Array.from(
            { length: MAX_REPEAT_NOTICE_OTHERS + 3 },
            (_, i) => deal(80000 - i, null),
        );
        const text = dryRunNoteLines(
            DOMAIN,
            { ...ambiguous, mainDeal: open[0], openDeals: open },
            {},
        ).join('\n');

        expect(text).toContain('#79990</a>');
        expect(text).not.toContain('#79989</a>');
        expect(text).toContain(' и ещё 2.');
    });
});
