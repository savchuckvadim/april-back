import { Logger } from '@nestjs/common';
import type { VendorSettingsReader } from '@lib/vendor-settings';
import { LlmGatewaySettingsService } from '../llm-gateway-settings.service';
import {
    circuitOptionsOf,
    fallbackCallOf,
    vibecodeConcurrencyOf,
} from '../llm-gateway-settings.util';

/**
 * Настройки шлюза переехали из env в админку (11.11.2026, решение
 * владельца): значения приходят строками из «Настроек приложения» или из env
 * с тем же именем, здесь — разбор в числа и режимы.
 */
describe('llm-gateway-settings.util — разбор значений', () => {
    it('ничего не задано — значения по умолчанию', () => {
        expect(circuitOptionsOf({})).toEqual({
            failures: 5,
            windowSec: 600,
            cooldownSec: 300,
        });
        expect(vibecodeConcurrencyOf({})).toEqual({ perKey: 6, total: 12 });
        expect(fallbackCallOf({})).toEqual({
            jsonMode: 'json_schema',
            timeoutMs: 180_000,
        });
    });

    it('заданные значения читаются; пробелы между разрядами допустимы', () => {
        expect(
            circuitOptionsOf({
                LLM_CIRCUIT_FAILURES: '3',
                LLM_CIRCUIT_WINDOW_SEC: '60',
                LLM_CIRCUIT_COOLDOWN_SEC: '120',
            }),
        ).toEqual({ failures: 3, windowSec: 60, cooldownSec: 120 });
        expect(
            vibecodeConcurrencyOf({
                LLM_VIBECODE_KEY_CONCURRENCY: '2',
                LLM_VIBECODE_CONCURRENCY: '20',
            }),
        ).toEqual({ perKey: 2, total: 20 });
        expect(
            fallbackCallOf({
                LLM_FALLBACK_JSON_MODE: ' json_object ',
                LLM_FALLBACK_TIMEOUT_MS: '120 000',
            }),
        ).toEqual({ jsonMode: 'json_object', timeoutMs: 120_000 });
    });

    it.each(['abc', '', '-3', '1.5', null])(
        'мусор %p — значение по умолчанию',
        raw => {
            expect(
                vibecodeConcurrencyOf({
                    LLM_VIBECODE_KEY_CONCURRENCY: raw,
                    LLM_VIBECODE_CONCURRENCY: raw,
                }),
            ).toEqual({ perKey: 6, total: 12 });
        },
    );

    it('число вне диапазона (старое значение env) — ближайшая граница, а не дефолт', () => {
        expect(
            vibecodeConcurrencyOf({
                LLM_VIBECODE_KEY_CONCURRENCY: '0',
                LLM_VIBECODE_CONCURRENCY: '5000',
            }),
        ).toEqual({ perKey: 1, total: 200 });
        // 600 000 у таймаута — потолок 300 000: выше fetch Node всё равно не ждёт.
        expect(
            fallbackCallOf({ LLM_FALLBACK_TIMEOUT_MS: '600000' }).timeoutMs,
        ).toBe(300_000);
    });

    it('незнакомый режим JSON — json_schema', () => {
        expect(
            fallbackCallOf({ LLM_FALLBACK_JSON_MODE: 'json' }).jsonMode,
        ).toBe('json_schema');
    });
});

/** Читатель «из админки» над изменяемым словарём. */
const readerOf = (values: Record<string, string>): VendorSettingsReader => ({
    get: key => Promise.resolve(values[key] ?? null),
    getMany: keys =>
        Promise.resolve(
            Object.fromEntries(keys.map(key => [key, values[key] ?? null])),
        ),
});

describe('LlmGatewaySettingsService — откуда берутся значения', () => {
    afterEach(() => jest.restoreAllMocks());

    it('есть читатель настроек (админка) — значения из него и перечитываются на каждом вызове', async () => {
        const values: Record<string, string> = {
            LLM_VIBECODE_KEY_CONCURRENCY: '4',
        };
        const env = { get: () => '9' };
        const settings = new LlmGatewaySettingsService(
            env as never,
            readerOf(values),
        );

        expect((await settings.vibecodeConcurrency()).perKey).toBe(4);
        values.LLM_VIBECODE_KEY_CONCURRENCY = '8';
        expect((await settings.vibecodeConcurrency()).perKey).toBe(8);
    });

    it('без модуля настроек в приложении — env с тем же именем', async () => {
        const env: Record<string, string> = { LLM_CIRCUIT_FAILURES: '7' };
        const settings = new LlmGatewaySettingsService({
            get: (key: string) => env[key],
        } as never);

        expect((await settings.circuit()).failures).toBe(7);
    });

    it('читатель упал — значения по умолчанию и предупреждение, вызов модели не падает', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const broken: VendorSettingsReader = {
            get: () => Promise.reject(new Error('db down')),
            getMany: () => Promise.reject(new Error('db down')),
        };
        const settings = new LlmGatewaySettingsService(
            { get: () => undefined } as never,
            broken,
        );

        await expect(settings.fallbackCall()).resolves.toEqual({
            jsonMode: 'json_schema',
            timeoutMs: 180_000,
        });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('db down'));
    });
});
