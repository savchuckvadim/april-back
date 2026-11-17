import { ETimeZone } from '@lib/shared/lib/date';
import {
    DEAL_AUDIT_FLAG,
    DEAL_AUDIT_STATUS,
} from '../../deal-audit/constants/deal-audit.const';
import { DealAuditDigestDelivery } from '../../deal-audit/services/deal-audit-digest-delivery';
import type { DealAuditFinding } from '../../deal-audit/services/deal-audit-findings.store';
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
    audit: null,
    ...fields,
});

const NEW_STUCK = { status: 'stuck', newFrom: 'moving' } as const;

const OPTIONS: DealMovementDigestOptions = {
    enabled: true,
    mode: 'new_only',
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
    };
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
        counters as never,
        findings as never,
    );
    return { service, bitrix, departments, counters };
};

/** Ночь движения сделок: 18.11 02:27 МСК. */
const NOW = new Date('2026-11-17T23:27:00.000Z');

const request = (deals: DealMovementDigestDeal[]) => ({
    domain: DOMAIN,
    day: DAY,
    now: NOW,
    options: OPTIONS,
    deals,
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
            'Движется — 1 · Застряла — 1 · Откатилась — 0 · Под риском — 0',
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
