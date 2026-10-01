import {
    DEAL_AUDIT_FIELDS_MISSING_WARNING,
    hasDigestRecipients,
    resolveDealAuditRunMode,
} from '../lib/deal-audit-run-mode';
import { DealAuditService } from '../services/deal-audit.service';
import { DealAuditSnapshot } from '../types/deal-audit.types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Сделка без задач и без движения два месяца — забыта по любому порогу. */
const FORGOTTEN_DEAL: DealAuditSnapshot = {
    dealId: 77,
    title: 'ООО Ромашка',
    stageCode: null,
    stageName: 'Новая',
    assignedById: 231,
    companyId: 5,
    lastActivityAt: Date.now() - 60 * DAY_MS,
    stageMovedAt: Date.now() - 60 * DAY_MS,
    nextCallAt: null,
    openTasks: [],
    previousStatus: null,
};

// Ридеры ходят в Битрикс: подменяем их целиком, сеть в тесте не нужна.
jest.mock('../services/deal-audit-tasks.reader', () => ({
    DealAuditTasksReader: jest.fn().mockImplementation(() => ({
        load: jest.fn().mockResolvedValue({}),
    })),
}));
jest.mock('../services/deal-audit-deals.reader', () => ({
    DealAuditDealsReader: jest.fn().mockImplementation(() => ({
        load: jest
            .fn()
            .mockImplementation(() => Promise.resolve([FORGOTTEN_DEAL])),
    })),
}));

/**
 * РЕЖИМ ПРОГОНА АУДИТА: разметка карточек и рассылка сводок независимы.
 *
 * Разбор 28.09.2026: оповещения о забытых сделках не приходили бы даже при
 * включённых настройках — рассылка шла только вместе с записью в карточки,
 * а поля аудита на портале не установлены.
 */
describe('resolveDealAuditRunMode', () => {
    it('«только считать»: ни записи, ни рассылки', () => {
        const idle = { canWrite: false, canNotify: false, warning: null };
        expect(resolveDealAuditRunMode(true, true)).toEqual(idle);
        expect(resolveDealAuditRunMode(true, false)).toEqual(idle);
    });

    it('поля установлены: и запись, и рассылка, без предупреждений', () => {
        expect(resolveDealAuditRunMode(false, true)).toEqual({
            canWrite: true,
            canNotify: true,
            warning: null,
        });
    });

    it('полей нет: запись пропущена, рассылка идёт, есть предупреждение', () => {
        expect(resolveDealAuditRunMode(false, false)).toEqual({
            canWrite: false,
            canNotify: true,
            warning: DEAL_AUDIT_FIELDS_MISSING_WARNING,
        });
    });
});

describe('hasDigestRecipients', () => {
    const none = {
        toManager: false,
        toHead: false,
        userIds: [],
        departmentUserIds: [],
    };

    it('ни одного адресата — сводку слать некому', () => {
        expect(hasDigestRecipients(none)).toBe(false);
    });

    it('достаточно любого из четырёх адресатов', () => {
        expect(hasDigestRecipients({ ...none, toManager: true })).toBe(true);
        expect(hasDigestRecipients({ ...none, toHead: true })).toBe(true);
        expect(hasDigestRecipients({ ...none, userIds: [1] })).toBe(true);
        expect(hasDigestRecipients({ ...none, departmentUserIds: [447] })).toBe(
            true,
        );
    });
});

describe('DealAuditService: сводки без установленных полей', () => {
    /** Портал без единого поля аудита. */
    const portal = {
        getTimezone: () => 'Europe/Moscow',
        getEntityFieldByCode: () => null,
        getFieldBitrixId: () => null,
    };

    const options = (dryRun: boolean) => ({
        dryRun,
        maxPerRun: 500,
        idleDays: 14,
        overdueHours: 24,
        stageStuckDays: 30,
        forgotCloseDays: 21,
        digest: {
            toManager: true,
            toHead: false,
            userIds: [],
            departmentUserIds: [],
            excludeUserIds: [],
            limit: 20,
        },
    });

    const makeService = () => {
        const send = jest.fn().mockResolvedValue(3);
        const service = new DealAuditService(
            {
                init: jest
                    .fn()
                    .mockResolvedValue({ bitrix: {}, PortalModel: portal }),
            } as never,
            { send } as never,
        );
        return { service, send };
    };

    it('рабочий прогон без полей: карточки не пишутся, сводки уходят', async () => {
        const { service, send } = makeService();

        const result = await service.runForDomain(
            'example.bitrix24.ru',
            options(false),
        );

        expect(result.flagged).toBe(1);
        expect(send).toHaveBeenCalledTimes(1);
        expect(result.written).toBe(0);
        expect(result.digestSent).toBe(3);
        expect(result.warnings).toContain(DEAL_AUDIT_FIELDS_MISSING_WARNING);
    });

    it('«только считать»: сводки не уходят', async () => {
        const { service, send } = makeService();

        const result = await service.runForDomain(
            'example.bitrix24.ru',
            options(true),
        );

        expect(result.flagged).toBe(1);
        expect(send).not.toHaveBeenCalled();
        expect(result.digestSent).toBe(0);
        expect(result.warnings).not.toContain(
            DEAL_AUDIT_FIELDS_MISSING_WARNING,
        );
    });
});
