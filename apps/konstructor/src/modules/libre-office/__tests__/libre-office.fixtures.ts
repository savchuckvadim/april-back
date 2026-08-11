import { LibreOfficeConfig } from '../config/libre-office.config';
import { LibreOfficeEndpointResolver } from '../services/libre-office-endpoint-resolver.service';
import { LibreOfficeMetricsService } from '../services/libre-office-metrics.service';

/** Общие фикстуры для тестов модуля — чтобы не плодить копии конфига. */
export function libreOfficeConfig(
    overrides: Partial<LibreOfficeConfig> = {},
): LibreOfficeConfig {
    return {
        mode: 'http',
        discovery: 'static',
        discoveryTtlMs: 30_000,
        failureCooldownMs: 15_000,
        endpoints: ['http://a:3000', 'http://b:3000'],
        slotsPerEndpoint: 1,
        timeoutMs: 5_000,
        retries: 1,
        maxQueue: 10,
        cacheEnabled: true,
        cacheTtlHours: 168,
        pdf: { reduceImageResolution: false },
        ...overrides,
    };
}

export type PdfCacheStub = {
    keyFor: jest.Mock;
    get: jest.Mock;
    put: jest.Mock;
};

/** По умолчанию — кэш работает, но всегда промахивается. */
export function stubPdfCache(
    overrides: Partial<PdfCacheStub> = {},
): PdfCacheStub {
    return {
        keyFor: jest.fn().mockResolvedValue('cache-key'),
        get: jest.fn().mockResolvedValue(false),
        put: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

export function stubResolver(
    resolve: () => Promise<string[]>,
): LibreOfficeEndpointResolver {
    return { resolve } as unknown as LibreOfficeEndpointResolver;
}

export type MetricsStub = {
    observeConversion: jest.Mock;
    countError: jest.Mock;
    countCache: jest.Mock;
    syncPool: jest.Mock;
};

export function stubMetrics(): MetricsStub {
    return {
        observeConversion: jest.fn(),
        countError: jest.fn(),
        countCache: jest.fn(),
        syncPool: jest.fn(),
    };
}

export function asMetrics(stub: MetricsStub): LibreOfficeMetricsService {
    return stub as unknown as LibreOfficeMetricsService;
}

/** Управляемая задача: резолвится вручную, чтобы держать слот занятым. */
export function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>(res => {
        resolve = res;
    });
    return { promise, resolve };
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
