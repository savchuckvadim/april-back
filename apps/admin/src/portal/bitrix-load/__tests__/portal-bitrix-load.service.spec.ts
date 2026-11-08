import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core/prisma';
import {
    PromSample,
    PrometheusClient,
    PrometheusUnavailableError,
} from '../prometheus.client';
import { PortalBitrixLoadService } from '../portal-bitrix-load.service';

const sample = (labels: Record<string, string>, value: number): PromSample => ({
    labels,
    value,
});

function setup(domain: string | null = 'April-Garant.bitrix24.ru') {
    const prisma = {
        portal: {
            findUnique: jest
                .fn()
                .mockResolvedValue(domain === null ? null : { domain }),
        },
    };
    const query = jest.fn((promql: string): Promise<PromSample[]> => {
        if (promql.includes('by (result)')) {
            return Promise.resolve([
                sample({ result: 'ok' }, 2380.4),
                sample({ result: 'error' }, 15),
                sample({ result: 'timeout' }, 4.6),
            ]);
        }
        if (promql.includes('by (call_class)')) {
            return Promise.resolve([
                sample({ call_class: 'interactive' }, 400),
                sample({ call_class: 'background' }, 2000),
            ]);
        }
        if (promql.includes('by (method)')) {
            return Promise.resolve([
                sample({ method: 'crm.item.list' }, 900),
                sample({ method: 'batch' }, 1200),
                sample({ method: 'user.get' }, 0),
            ]);
        }
        if (promql.includes('by (outcome)')) {
            return Promise.resolve([
                sample({ outcome: 'granted' }, 2390),
                sample({ outcome: 'passed' }, 3),
            ]);
        }
        if (promql.includes('histogram_quantile')) {
            return Promise.resolve([sample({}, 0.834)]);
        }
        return Promise.resolve([]);
    });
    const queryRange = jest.fn().mockResolvedValue([
        {
            labels: {},
            points: [
                { at: 1794150000, value: 100 },
                { at: 1794153600, value: 420.2 },
                { at: 1794157200, value: NaN },
            ],
        },
    ]);
    const service = new PortalBitrixLoadService(
        prisma as unknown as PrismaService,
        { query, queryRange } as unknown as PrometheusClient,
    );
    return { service, query, queryRange };
}

describe('PortalBitrixLoadService', () => {
    it('сводка за окно: исходы, класс, методы, ограничитель, p95, пиковый час', async () => {
        const { service, query } = setup();
        const load = await service.load(1, 24);

        expect(load).toMatchObject({
            domain: 'april-garant.bitrix24.ru',
            hours: 24,
            available: true,
            total: 2400,
            ok: 2380,
            errors: 15,
            timeouts: 5,
            rateLimit: { granted: 2390, passed: 3, rejected: 0 },
            p95Seconds: 0.83,
            peakHour: {
                at: new Date(1794153600 * 1000).toISOString(),
                calls: 420,
            },
        });
        expect(load.byClass[0]).toEqual({
            callClass: 'background',
            calls: 2000,
        });
        expect(load.topMethods).toEqual([
            { method: 'batch', calls: 1200 },
            { method: 'crm.item.list', calls: 900 },
        ]);
        // все запросы — с фильтром по домену и окном в часах
        for (const [promql] of query.mock.calls) {
            expect(promql).toContain('{domain="april-garant.bitrix24.ru"}');
            expect(promql).toContain('[24h]');
        }
    });

    it('Prometheus не ответил — available=false с причиной, страница не падает', async () => {
        const { service, query } = setup();
        query.mockRejectedValue(
            new PrometheusUnavailableError(
                'Prometheus (x) не ответил: ECONNREFUSED',
            ),
        );
        const load = await service.load(1, 24);
        expect(load.available).toBe(false);
        expect(load.reason).toContain('ECONNREFUSED');
        expect(load.total).toBe(0);
    });

    it('портала нет — 404; странный домен в PromQL не попадает', async () => {
        await expect(setup(null).service.load(1, 24)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        const { service, query } = setup('a.ru"} or vector(1) #');
        const load = await service.load(1, 24);
        expect(load.available).toBe(false);
        expect(query).not.toHaveBeenCalled();
    });
});
