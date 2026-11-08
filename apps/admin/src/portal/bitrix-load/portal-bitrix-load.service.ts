import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core/prisma';
import {
    BITRIX_RATE_LIMIT_WAIT_SECONDS,
    BITRIX_REQUEST_DURATION_SECONDS,
    BITRIX_REQUESTS_TOTAL,
} from '@lib/bitrix/core/metrics/bitrix-metrics';
import {
    PromSample,
    PrometheusClient,
    PrometheusUnavailableError,
} from './prometheus.client';

const TOP_METHODS = 8;
/** Домен в селекторе PromQL — только безопасные символы. */
const DOMAIN_RE = /^[a-z0-9.-]+$/i;

export interface PortalBitrixLoad {
    domain: string;
    hours: number;
    /** false — Prometheus недоступен (reason — почему); цифры нулевые. */
    available: boolean;
    reason: string | null;
    total: number;
    ok: number;
    errors: number;
    timeouts: number;
    /** interactive — человек ждёт; background — кроны, очереди, AI. */
    byClass: Array<{ callClass: string; calls: number }>;
    topMethods: Array<{ method: string; calls: number }>;
    /** Ожидание в ограничителе: выдано / ушло без слота / отказано фону. */
    rateLimit: { granted: number; passed: number; rejected: number };
    /** 95-й перцентиль длительности обращения, секунды; null — нет данных. */
    p95Seconds: number | null;
    /** Самый нагруженный час окна. */
    peakHour: { at: string; calls: number } | null;
}

const round = (value: number): number =>
    Number.isFinite(value) ? Math.round(value) : 0;

const byLabel = (samples: PromSample[], label: string): Map<string, number> =>
    new Map(
        samples.map(sample => [
            sample.labels[label] ?? '',
            round(sample.value),
        ]),
    );

/**
 * Нагрузка портала на Битрикс за окно — из Prometheus, куда все приложения
 * April пишут каждое обращение (bitrix_requests_total и гистограммы
 * длительности и ожидания в ограничителе). Ничего нового не пишем —
 * только читаем собранное.
 */
@Injectable()
export class PortalBitrixLoadService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly prometheus: PrometheusClient,
    ) {}

    async load(portalId: number, hours: number): Promise<PortalBitrixLoad> {
        const portal = await this.prisma.portal.findUnique({
            where: { id: BigInt(portalId) },
            select: { domain: true },
        });
        const domain = (portal?.domain ?? '').trim().toLowerCase();
        if (!portal || !domain) {
            throw new NotFoundException(
                'Портал не найден или у него нет домена',
            );
        }
        const empty = emptyLoad(domain, hours);
        if (!DOMAIN_RE.test(domain)) {
            return {
                ...empty,
                available: false,
                reason: `Странный домен: ${domain}`,
            };
        }
        try {
            return await this.collect(domain, hours);
        } catch (error) {
            if (error instanceof PrometheusUnavailableError) {
                return { ...empty, available: false, reason: error.message };
            }
            throw error;
        }
    }

    private async collect(
        domain: string,
        hours: number,
    ): Promise<PortalBitrixLoad> {
        const sel = `{domain="${domain}"}`;
        const win = `[${hours}h]`;
        const increase = (metric: string) => `increase(${metric}${sel}${win})`;
        const now = Math.floor(Date.now() / 1000);

        const [results, classes, methods, waits, p95, hourly] =
            await Promise.all([
                this.prometheus.query(
                    `sum by (result) (${increase(BITRIX_REQUESTS_TOTAL)})`,
                ),
                this.prometheus.query(
                    `sum by (call_class) (${increase(BITRIX_REQUESTS_TOTAL)})`,
                ),
                this.prometheus.query(
                    `topk(${TOP_METHODS}, sum by (method) (${increase(BITRIX_REQUESTS_TOTAL)}))`,
                ),
                this.prometheus.query(
                    `sum by (outcome) (${increase(`${BITRIX_RATE_LIMIT_WAIT_SECONDS}_count`)})`,
                ),
                this.prometheus.query(
                    `histogram_quantile(0.95, sum by (le) (${increase(`${BITRIX_REQUEST_DURATION_SECONDS}_bucket`)}))`,
                ),
                this.prometheus.queryRange(
                    `sum(increase(${BITRIX_REQUESTS_TOTAL}${sel}[1h]))`,
                    now - hours * 3600,
                    now,
                    3600,
                ),
            ]);

        const result = byLabel(results, 'result');
        const wait = byLabel(waits, 'outcome');
        const p95Value = p95[0]?.value;
        const peak = (hourly[0]?.points ?? [])
            .filter(point => Number.isFinite(point.value))
            .reduce<{
                at: number;
                value: number;
            } | null>(
                (best, point) =>
                    !best || point.value > best.value ? point : best,
                null,
            );

        return {
            domain,
            hours,
            available: true,
            reason: null,
            total: [...result.values()].reduce((sum, value) => sum + value, 0),
            ok: result.get('ok') ?? 0,
            errors: result.get('error') ?? 0,
            timeouts: result.get('timeout') ?? 0,
            byClass: classes
                .map(sample => ({
                    callClass: sample.labels.call_class ?? '',
                    calls: round(sample.value),
                }))
                .sort((a, b) => b.calls - a.calls),
            topMethods: methods
                .map(sample => ({
                    method: sample.labels.method ?? '',
                    calls: round(sample.value),
                }))
                .filter(item => item.calls > 0)
                .sort((a, b) => b.calls - a.calls),
            rateLimit: {
                granted: wait.get('granted') ?? 0,
                passed: wait.get('passed') ?? 0,
                rejected: wait.get('rejected') ?? 0,
            },
            p95Seconds:
                p95Value !== undefined && Number.isFinite(p95Value)
                    ? Math.round(p95Value * 100) / 100
                    : null,
            peakHour:
                peak && peak.value > 0
                    ? {
                          at: new Date(peak.at * 1000).toISOString(),
                          calls: round(peak.value),
                      }
                    : null,
        };
    }
}

function emptyLoad(domain: string, hours: number): PortalBitrixLoad {
    return {
        domain,
        hours,
        available: true,
        reason: null,
        total: 0,
        ok: 0,
        errors: 0,
        timeouts: 0,
        byClass: [],
        topMethods: [],
        rateLimit: { granted: 0, passed: 0, rejected: 0 },
        p95Seconds: null,
        peakHour: null,
    };
}
