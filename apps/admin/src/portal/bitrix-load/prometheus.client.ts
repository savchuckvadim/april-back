import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/** Адрес Prometheus изнутри сети compose (сервис prometheus). */
export const PROMETHEUS_URL_ENV = 'PROMETHEUS_URL';
const DEFAULT_PROMETHEUS_URL = 'http://prometheus:9090';
const TIMEOUT_MS = 5_000;

/** Точка ряда/вектора: метки и число. */
export interface PromSample {
    labels: Record<string, string>;
    value: number;
}

/** Ряд query_range: метки и точки [секунды unix, число]. */
export interface PromSeries {
    labels: Record<string, string>;
    points: Array<{ at: number; value: number }>;
}

interface PromResponse<T> {
    status: 'success' | 'error';
    data?: { resultType: string; result: T[] };
    error?: string;
}

interface PromVectorItem {
    metric: Record<string, string>;
    value: [number, string];
}

interface PromMatrixItem {
    metric: Record<string, string>;
    values: Array<[number, string]>;
}

/** Prometheus не ответил или вернул ошибку запроса. */
export class PrometheusUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PrometheusUnavailableError';
    }
}

const toNumber = (raw: string): number => {
    const value = Number(raw);
    return Number.isFinite(value) ? value : NaN;
};

/**
 * Чтение метрик из Prometheus по HTTP API (instant query и query_range).
 * Метрики Битрикса (bitrix_requests_total и др.) пишут все приложения, а
 * Prometheus их уже собирает — админке хватает спросить.
 */
@Injectable()
export class PrometheusClient {
    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService,
    ) {}

    async query(promql: string): Promise<PromSample[]> {
        const items = await this.get<PromVectorItem>('/api/v1/query', {
            query: promql,
        });
        return items.map(item => ({
            labels: item.metric,
            value: toNumber(item.value[1]),
        }));
    }

    async queryRange(
        promql: string,
        startSec: number,
        endSec: number,
        stepSec: number,
    ): Promise<PromSeries[]> {
        const items = await this.get<PromMatrixItem>('/api/v1/query_range', {
            query: promql,
            start: String(startSec),
            end: String(endSec),
            step: String(stepSec),
        });
        return items.map(item => ({
            labels: item.metric,
            points: item.values.map(([at, raw]) => ({
                at,
                value: toNumber(raw),
            })),
        }));
    }

    private async get<T>(
        path: string,
        params: Record<string, string>,
    ): Promise<T[]> {
        const base = (
            this.config.get<string>(PROMETHEUS_URL_ENV) ||
            DEFAULT_PROMETHEUS_URL
        ).replace(/\/+$/, '');
        let body: PromResponse<T>;
        try {
            const response = await firstValueFrom(
                this.http.get<PromResponse<T>>(`${base}${path}`, {
                    params,
                    timeout: TIMEOUT_MS,
                }),
            );
            body = response.data;
        } catch (error) {
            throw new PrometheusUnavailableError(
                `Prometheus (${base}) не ответил: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        if (body?.status !== 'success' || !body.data) {
            throw new PrometheusUnavailableError(
                `Prometheus вернул ошибку: ${body?.error ?? 'нет данных'}`,
            );
        }
        return body.data.result;
    }
}
