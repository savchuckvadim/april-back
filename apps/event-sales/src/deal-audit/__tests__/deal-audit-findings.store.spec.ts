import {
    buildDealAuditFindingsKey,
    DEAL_AUDIT_FINDINGS_TTL_SEC,
    DEAL_AUDIT_FLAG,
    DEAL_AUDIT_STATUS,
} from '../constants/deal-audit.const';
import {
    decodeDealAuditFinding,
    DealAuditFindingsStore,
} from '../services/deal-audit-findings.store';
import { DealAuditVerdict } from '../types/deal-audit.types';

const DOMAIN = 'garant.bitrix24.ru';
const AT = '2026-11-16T22:30:00.000Z';
const KEY = buildDealAuditFindingsKey(DOMAIN);

const verdict = (
    dealId: number,
    status: DealAuditVerdict['status'],
    flags: DealAuditVerdict['flags'] = [],
): DealAuditVerdict => ({
    dealId,
    title: `Сделка ${dealId}`,
    assignedById: 7,
    status,
    flags,
    idleDays: 18,
    overdueDays: 0,
    stageDays: 40,
    openTasks: 0,
    comment: '',
});

const build = (fields: Record<string, unknown> = {}) => {
    const redis = {
        hset: jest.fn().mockResolvedValue(1),
        hdel: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
        hgetall: jest.fn().mockResolvedValue({}),
        ...fields,
    };
    const store = new DealAuditFindingsStore({
        getClient: () => redis,
    } as never);
    return { store, redis };
};

describe('находки аудита для «Движения сделок»', () => {
    it('забытые пишутся в хеш портала со сроком 35 суток, «норма» не пишется', async () => {
        const { store, redis } = build();
        const warnings: string[] = [];

        await store.save(
            DOMAIN,
            [
                verdict(20, DEAL_AUDIT_STATUS.noTask, [
                    DEAL_AUDIT_FLAG.noTask,
                    DEAL_AUDIT_FLAG.idle,
                ]),
                verdict(10, DEAL_AUDIT_STATUS.ok),
            ],
            AT,
            warnings,
        );

        expect(redis.hset).toHaveBeenCalledTimes(1);
        const [key, fields] = redis.hset.mock.calls[0] as [
            string,
            Record<string, string>,
        ];
        expect(key).toBe(KEY);
        expect(Object.keys(fields)).toEqual(['20']);
        expect(decodeDealAuditFinding(fields['20'] ?? '')).toEqual({
            status: DEAL_AUDIT_STATUS.noTask,
            flags: [DEAL_AUDIT_FLAG.noTask, DEAL_AUDIT_FLAG.idle],
            idleDays: 18,
            overdueDays: 0,
            at: AT,
        });
        expect(redis.expire).toHaveBeenCalledWith(
            KEY,
            DEAL_AUDIT_FINDINGS_TTL_SEC,
        );
        expect(DEAL_AUDIT_FINDINGS_TTL_SEC).toBe(35 * 24 * 60 * 60);
        expect(warnings).toEqual([]);
    });

    it('сделка, ставшая «нормой», из хеша удаляется — пометка не висит до конца срока', async () => {
        const { store, redis } = build();

        await store.save(
            DOMAIN,
            [
                verdict(20, DEAL_AUDIT_STATUS.ok),
                verdict(30, DEAL_AUDIT_STATUS.ok),
            ],
            AT,
            [],
        );

        expect(redis.hdel).toHaveBeenCalledWith(KEY, '20', '30');
        expect(redis.hset).not.toHaveBeenCalled();
    });

    it('сбой Redis прогон не роняет — предупреждение в итог', async () => {
        const { store } = build({
            hset: jest.fn().mockRejectedValue(new Error('Redis недоступен')),
        });
        const warnings: string[] = [];

        await expect(
            store.save(
                DOMAIN,
                [verdict(20, DEAL_AUDIT_STATUS.idle, [DEAL_AUDIT_FLAG.idle])],
                AT,
                warnings,
            ),
        ).resolves.toBeUndefined();

        expect(warnings).toEqual([
            'находки аудита для сводки «Движение сделок» не сохранены: Redis недоступен',
        ]);
    });

    it('чтение: битые и чужие записи пропускаются, незнакомые признаки отбрасываются', async () => {
        const { store } = build({
            hgetall: jest.fn().mockResolvedValue({
                '20': JSON.stringify({
                    status: DEAL_AUDIT_STATUS.idle,
                    flags: [DEAL_AUDIT_FLAG.idle, 'чужое'],
                    idleDays: 18,
                    overdueDays: 0,
                    at: AT,
                }),
                '21': '{битое',
                '22': JSON.stringify({ status: 'ok', flags: [], at: AT }),
            }),
        });

        const findings = await store.load(DOMAIN);

        expect([...findings.keys()]).toEqual(['20']);
        expect(findings.get('20')?.flags).toEqual([DEAL_AUDIT_FLAG.idle]);
    });
});
