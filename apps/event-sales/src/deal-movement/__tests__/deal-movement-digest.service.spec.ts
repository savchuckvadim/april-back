import { ETimeZone } from '@lib/shared/lib/date';
import {
    DEAL_AUDIT_FLAG,
    DEAL_AUDIT_STATUS,
} from '../../deal-audit/constants/deal-audit.const';
import { DealAuditDigestDelivery } from '../../deal-audit/services/deal-audit-digest-delivery';
import type { DealAuditFinding } from '../../deal-audit/services/deal-audit-findings.store';
import type { DealMovementStateEntry } from '@lib/sales-ai-analytics';
import type { DealMovementPeriodDigestMark } from '../lib/deal-movement-digest.schedule';
import { DealMovementDigestSchedule } from '../services/deal-movement-digest.schedule';
import { DealMovementDigestService } from '../services/deal-movement-digest.service';
import type {
    DealMovementDigestDeal,
    DealMovementDigestOptions,
} from '../types/deal-movement.types';

const DOMAIN = 'garant.bitrix24.ru';
const DAY = '2026-11-18';
const TZ = ETimeZone.EUROPE_MOSCOW;

/** Отдел продаж: РОП 30, менеджеры 7 и 8. */
const DEPARTMENT = {
    ID: 1,
    PARENT: null,
    UF_HEAD: 30,
    USERS: [
        { ID: 7, NAME: 'Пётр', LAST_NAME: 'Иванов' },
        { ID: 8, NAME: 'Анна', LAST_NAME: 'Петрова' },
        { ID: 30, NAME: 'Олег', LAST_NAME: 'Сидоров' },
    ],
};

const deal = (
    dealId: string,
    assignedById: number,
    fields: Partial<DealMovementDigestDeal> = {},
): DealMovementDigestDeal => ({
    dealId,
    title: `Сделка ${dealId}`,
    assignedById,
    amount: 100_000,
    status: 'moving',
    newFrom: null,
    reasons: 'тревожных признаков нет',
    daysInStage: 3,
    limit: { stageLimitDays: 21, stageLimitSource: 'default' },
    changedAt: null,
    remindStep: null,
    audit: null,
    ...fields,
});

const NEW_STUCK = { status: 'stuck', newFrom: 'moving' } as const;

const OPTIONS: DealMovementDigestOptions = {
    enabled: true,
    mode: 'new_only',
    weekday: 1,
    top: 15,
};

interface Setup {
    toHead?: boolean;
    userIds?: number[];
    excludeUserIds?: number[];
    channels?: { notify: boolean; message: boolean; task: boolean };
    claimed?: boolean;
    active?: number[];
    /** Находки аудита в Redis; Error — хранилище не прочиталось. */
    findings?: Map<string, DealAuditFinding> | Error;
    frequency?: 'weekly' | 'monthly';
    /** Прошлая сводка за период; нет — не было. */
    lastPeriod?: DealMovementPeriodDigestMark | null;
}

const build = (setup: Setup = {}) => {
    const bitrix = {
        imNotify: { systemAdd: jest.fn().mockResolvedValue({ result: 1 }) },
        message: { add: jest.fn().mockResolvedValue({ result: 1 }) },
        task: {
            getList: jest.fn().mockResolvedValue({ result: { tasks: [] } }),
            add: jest.fn().mockResolvedValue({ result: { task: { id: 501 } } }),
            complete: jest.fn(),
        },
    };
    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix,
            PortalModel: { getTimezone: () => TZ },
        }),
    };
    const departments = {
        getFullDepartment: jest.fn().mockResolvedValue({
            department: {
                generalDepartment: [DEPARTMENT],
                childrenDepartments: [],
                parentDepartments: [],
            },
        }),
    };
    const staff = {
        activeUserIds: jest.fn(
            (_domain: string, _bitrix: unknown, ids: number[]) =>
                Promise.resolve(
                    new Set(
                        ids.filter(id =>
                            (setup.active ?? [7, 8, 30]).includes(id),
                        ),
                    ),
                ),
        ),
    };
    const auditSettings = {
        resolveOptions: jest.fn().mockResolvedValue({
            digest: {
                toManager: false,
                toHead: setup.toHead ?? true,
                userIds: setup.userIds ?? [],
                departmentUserIds: [],
                excludeUserIds: setup.excludeUserIds ?? [],
                limit: 20,
                channels: setup.channels ?? {
                    notify: false,
                    message: true,
                    task: false,
                },
            },
            frequency: setup.frequency ?? 'weekly',
        }),
    };
    const counters = {
        claimDigest: jest.fn().mockResolvedValue(setup.claimed ?? true),
        periodDigestMark: jest.fn().mockResolvedValue(setup.lastPeriod ?? null),
        markPeriodDigest: jest.fn().mockResolvedValue(undefined),
    };
    const stateStore = { saveEntries: jest.fn().mockResolvedValue(undefined) };
    const findings = {
        load:
            setup.findings instanceof Error
                ? jest.fn().mockRejectedValue(setup.findings)
                : jest.fn().mockResolvedValue(setup.findings ?? new Map()),
    };
    const service = new DealMovementDigestService(
        pbx as never,
        departments as never,
        staff as never,
        auditSettings as never,
        findings as never,
        new DealMovementDigestSchedule(counters as never, stateStore as never),
    );
    return { service, bitrix, departments, counters, stateStore };
};

/** Ночь движения сделок: 18.11 02:27 МСК. */
const NOW = new Date('2026-11-17T23:27:00.000Z');

const request = (
    deals: DealMovementDigestDeal[],
    state: ReadonlyMap<string, DealMovementStateEntry> = new Map(),
) => ({
    domain: DOMAIN,
    day: DAY,
    now: NOW,
    options: OPTIONS,
    deals,
    state,
});

/** Свежая находка аудита: ночь на понедельник 16.11. */
const auditFinding = (
    fields: Partial<DealAuditFinding> = {},
): DealAuditFinding => ({
    status: DEAL_AUDIT_STATUS.noTask,
    flags: [DEAL_AUDIT_FLAG.noTask, DEAL_AUDIT_FLAG.idle],
    idleDays: 18,
    overdueDays: 0,
    at: '2026-11-15T22:30:00.000Z',
    ...fields,
});

describe('сводка «Движение сделок» руководителям: кому и чем', () => {
    it('РОПу — сделки его сотрудников; неработающему получателю общего списка — нет; имена из структуры', async () => {
        const { service, bitrix } = build({ userIds: [50] });
        const warnings: string[] = [];

        const summary = await service.send(
            request([deal('1', 7, NEW_STUCK), deal('2', 8)]),
            warnings,
        );

        expect(summary).toEqual({
            enabled: true,
            skipped: null,
            recipients: 1,
            sent: 1,
            failed: 0,
            auditForgotten: 0,
        });
        expect(bitrix.message.add).toHaveBeenCalledTimes(1);
        const [message] = bitrix.message.add.mock.calls[0] as unknown as [
            { DIALOG_ID: string; MESSAGE: string },
        ];
        expect(message.DIALOG_ID).toBe('30');
        expect(message.MESSAGE).toContain('Движение сделок за 18.11');
        expect(message.MESSAGE).toContain('Иванов Пётр');
        expect(message.MESSAGE).toContain(
            'Движется — 1 · Без продвижения — 1 · Без внимания — 0 · Вернулась назад — 0 · Под риском — 0',
        );
        expect(warnings.join(' ')).toContain('получатели не работают');
    });

    it('исключённые сотрудники — их сделок нет ни в одной сводке', async () => {
        const { service, bitrix } = build({ excludeUserIds: [7] });

        const summary = await service.send(
            request([deal('1', 7, NEW_STUCK), deal('2', 8)]),
            [],
        );

        // У РОПа остаётся только сделка 2, новых тревожных нет — не шлём.
        expect(summary.recipients).toBe(0);
        expect(bitrix.message.add).not.toHaveBeenCalled();
    });

    it('«только новые»: без новых тревожных — сводки нет; «каждое утро» — есть, если не всё движется', async () => {
        const old = [deal('1', 7, { status: 'at_risk' }), deal('2', 8)];

        const quiet = build();
        expect((await quiet.service.send(request(old), [])).recipients).toBe(0);

        const daily = build();
        const summary = await daily.service.send(
            { ...request(old), options: { ...OPTIONS, mode: 'daily' } },
            [],
        );
        expect(summary).toMatchObject({ recipients: 1, sent: 1 });
    });

    it('один раз за день портала; выключена; получателей нет — без рассылки', async () => {
        const again = build({ claimed: false });
        expect(
            await again.service.send(request([deal('1', 7, NEW_STUCK)]), []),
        ).toMatchObject({ skipped: 'already_sent' });
        expect(again.departments.getFullDepartment).not.toHaveBeenCalled();

        const off = build();
        expect(
            await off.service.send(
                {
                    ...request([deal('1', 7, NEW_STUCK)]),
                    options: { ...OPTIONS, enabled: false },
                },
                [],
            ),
        ).toMatchObject({ enabled: false, skipped: 'disabled' });
        expect(off.counters.claimDigest).not.toHaveBeenCalled();

        const nobody = build({ toHead: false });
        expect(
            await nobody.service.send(request([deal('1', 7, NEW_STUCK)]), []),
        ).toMatchObject({ skipped: 'no_recipients' });
    });

    it('свои тег уведомления и метка задачи — сводка аудита не замещается', async () => {
        const { service, bitrix } = build({
            channels: { notify: true, message: false, task: true },
        });

        await service.send(request([deal('1', 7, NEW_STUCK)]), []);

        expect(bitrix.imNotify.systemAdd).toHaveBeenCalledWith(
            expect.objectContaining({ TAG: 'event-sales-deal-movement' }),
        );
        const [task] = bitrix.task.add.mock.calls[0] as unknown as [
            { TITLE: string },
        ];
        expect(task.TITLE).toBe(
            'Движение сделок за 18.11 — 1 · сводка движения сделок',
        );
        expect(bitrix.task.getList).toHaveBeenCalledWith(
            expect.objectContaining({ '%TITLE': 'сводка движения сделок' }),
            ['ID', 'STATUS', 'TITLE'],
        );
    });
});

describe('сводка «Движение сделок»: находки аудита сделок', () => {
    it('свежая находка — пометкой у сделки и числом в шапке и итоге; старая — нет', async () => {
        const { service, bitrix } = build({
            findings: new Map([
                ['1', auditFinding()],
                // Прошлый понедельник — старше 8 суток при недельном аудите.
                ['2', auditFinding({ at: '2026-11-08T22:30:00.000Z' })],
            ]),
        });

        const summary = await service.send(
            request([deal('1', 7, NEW_STUCK), deal('2', 8)]),
            [],
        );

        expect(summary.auditForgotten).toBe(1);
        const [message] = bitrix.message.add.mock.calls[0] as unknown as [
            { MESSAGE: string },
        ];
        expect(message.MESSAGE).toContain('Из них забыты по аудиту: 1');
        expect(message.MESSAGE).toContain(
            '[i]ещё и по аудиту: без задач, нет работы 18 дней[/i]',
        );
    });

    it('аудит раз в месяц — находка трёхнедельной давности ещё свежая', async () => {
        const { service } = build({
            frequency: 'monthly',
            findings: new Map([
                ['1', auditFinding({ at: '2026-10-31T22:30:00.000Z' })],
            ]),
        });

        const summary = await service.send(
            request([deal('1', 7, NEW_STUCK)]),
            [],
        );

        expect(summary.auditForgotten).toBe(1);
    });

    it('хранилище находок не прочиталось — сводка уходит без пометок, причина в предупреждениях', async () => {
        const { service, bitrix } = build({
            findings: new Error('Redis недоступен'),
        });
        const warnings: string[] = [];

        const summary = await service.send(
            request([deal('1', 7, NEW_STUCK)]),
            warnings,
        );

        expect(summary).toMatchObject({ sent: 1, auditForgotten: 0 });
        expect(bitrix.message.add).toHaveBeenCalledTimes(1);
        expect(warnings).toContain(
            'находки аудита сделок не прочитаны — сводка без пометок: Redis недоступен',
        );
    });
});

describe('доставка аудита сделок без своих меток — как раньше', () => {
    it('тег «event-sales-deal-audit» и метка «аудит сделок» по умолчанию', async () => {
        const { bitrix } = build();
        const delivery = new DealAuditDigestDelivery(
            bitrix as never,
            { notify: true, message: false, task: true },
            TZ,
        );

        await delivery.deliver(
            30,
            {
                heading: 'Забытые сделки',
                count: 2,
                text: 'Текст',
                messages: [],
            },
            [],
        );

        expect(bitrix.imNotify.systemAdd).toHaveBeenCalledWith(
            expect.objectContaining({ TAG: 'event-sales-deal-audit' }),
        );
        const [task] = bitrix.task.add.mock.calls[0] as unknown as [
            { TITLE: string },
        ];
        expect(task.TITLE).toBe('Забытые сделки — 2 · аудит сделок');
    });
});

describe('сводка «Движение сделок» за период: раз в неделю и раз в две недели', () => {
    /** Понедельник 23.11.2026, ночной счёт 02:27 МСК. */
    const MONDAY = '2026-11-23';
    const MONDAY_NOW = new Date('2026-11-22T23:27:00.000Z');
    const weekly = (
        deals: DealMovementDigestDeal[],
        mode: 'weekly' | 'biweekly' = 'weekly',
        day = MONDAY,
        state: ReadonlyMap<string, DealMovementStateEntry> = new Map(),
    ) => ({
        ...request(deals, state),
        day,
        now: MONDAY_NOW,
        options: { ...OPTIONS, mode, weekday: 1 },
    });
    const mark = (day: string): DealMovementPeriodDigestMark => ({
        day,
        at: `${day}T00:00:00.000Z`,
    });
    const stateEntry = (
        fields: Partial<DealMovementStateEntry> = {},
    ): DealMovementStateEntry => ({
        status: 'stuck',
        notifiedStatus: 'stuck',
        reasons: ['stage_overdue'],
        stageCode: 'sales_pres',
        amount: 100_000,
        assignedById: 7,
        lastActivityAt: null,
        changedAt: null,
        notifiedAt: null,
        checkedAt: '2026-11-22T23:27:00.000Z',
        remindedStep: 0,
        ...fields,
    });

    it('неделя — только в выбранный день: в другой день сводки нет, отметка не ставится', async () => {
        const { service, counters, departments } = build();

        const summary = await service.send(
            weekly([deal('1', 7, { status: 'stuck' })], 'weekly', '2026-11-24'),
            [],
        );

        expect(summary).toMatchObject({ skipped: 'not_due', sent: 0 });
        expect(counters.markPeriodDigest).not.toHaveBeenCalled();
        expect(counters.claimDigest).not.toHaveBeenCalled();
        expect(departments.getFullDepartment).not.toHaveBeenCalled();
    });

    it('неделя — не чаще раза в 7 дней; отметка ставится до рассылки', async () => {
        const early = build({ lastPeriod: mark('2026-11-17') });
        expect(
            await early.service.send(
                weekly([deal('1', 7, { status: 'stuck' })]),
                [],
            ),
        ).toMatchObject({ skipped: 'not_due' });

        const due = build({ lastPeriod: mark('2026-11-16') });
        const summary = await due.service.send(
            weekly([deal('1', 7, { status: 'stuck' })]),
            [],
        );
        expect(summary).toMatchObject({ skipped: null, sent: 1, reminders: 0 });
        expect(due.counters.markPeriodDigest).toHaveBeenCalledWith(DOMAIN, {
            day: MONDAY,
            at: MONDAY_NOW.toISOString(),
        });
        const [message] = due.bitrix.message.add.mock.calls[0] as unknown as [
            { MESSAGE: string },
        ];
        expect(message.MESSAGE).toContain(
            'Движение сделок за неделю (с 16.11 по 23.11)',
        );
    });

    it('две недели — раз в 14 дней; первой сводки ждать не нужно', async () => {
        const week = build({ lastPeriod: mark('2026-11-16') });
        expect(
            await week.service.send(
                weekly([deal('1', 7, { status: 'stuck' })], 'biweekly'),
                [],
            ),
        ).toMatchObject({ skipped: 'not_due' });

        const twoWeeks = build({ lastPeriod: mark('2026-11-09') });
        expect(
            await twoWeeks.service.send(
                weekly([deal('1', 7, { status: 'stuck' })], 'biweekly'),
                [],
            ),
        ).toMatchObject({ skipped: null, sent: 1 });

        const first = build();
        expect(
            await first.service.send(
                weekly([deal('1', 7, { status: 'stuck' })], 'biweekly'),
                [],
            ),
        ).toMatchObject({ skipped: null, sent: 1 });
    });

    it('«Давно без продвижения»: показанная ступень запоминается в состоянии сделки', async () => {
        const { service, bitrix, stateStore } = build();
        const state = new Map([
            ['1', stateEntry()],
            ['2', stateEntry({ status: 'at_risk' })],
        ]);

        const summary = await service.send(
            weekly(
                [
                    deal('1', 7, {
                        status: 'stuck',
                        daysInStage: 63,
                        remindStep: 2,
                        reasons: 'звонок 20.11, стадия не меняется 63 дня',
                    }),
                    deal('2', 8, { status: 'at_risk' }),
                ],
                'weekly',
                MONDAY,
                state,
            ),
            [],
        );

        expect(summary.reminders).toBe(1);
        const [message] = bitrix.message.add.mock.calls[0] as unknown as [
            { MESSAGE: string },
        ];
        expect(message.MESSAGE).toContain(
            'Давно без продвижения — первые 1 по сумме',
        );
        expect(message.MESSAGE).toContain(
            'в стадии 63 дня при пороге 21 день — дольше срока больше чем в 2 раза',
        );
        expect(stateStore.saveEntries).toHaveBeenCalledWith(
            DOMAIN,
            new Map([['1', stateEntry({ remindedStep: 2 })]]),
        );
    });

    it('ежедневная сводка напоминаний не показывает и ступень не запоминает', async () => {
        const { service, bitrix, stateStore } = build();

        await service.send(
            {
                ...request(
                    [
                        deal('1', 7, {
                            ...NEW_STUCK,
                            daysInStage: 63,
                            remindStep: 2,
                        }),
                    ],
                    new Map([['1', stateEntry()]]),
                ),
                options: { ...OPTIONS, mode: 'daily' },
            },
            [],
        );

        const [message] = bitrix.message.add.mock.calls[0] as unknown as [
            { MESSAGE: string },
        ];
        expect(message.MESSAGE).not.toContain('Давно без продвижения');
        expect(stateStore.saveEntries).not.toHaveBeenCalled();
    });
});
