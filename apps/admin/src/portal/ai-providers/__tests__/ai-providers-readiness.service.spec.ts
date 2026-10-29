import { NotFoundException } from '@nestjs/common';
import { PortalAiProvidersReadinessService } from '../services/ai-providers-readiness.service';

const ENV: Record<string, string> = {
    TRANSCRIPTION_PROVIDER: 'auto',
    YA_FOLDER_ID: 'folder',
    YA_ACCESS_KEY_KEY_ID: 'key-id',
    YA_ACCESS_KEY_SECRET: 'secret',
};

/** Портал со своим ключом OpenAI в LLM и Groq Whisper как принудительным транскрибатором. */
const RECORD = {
    llmProviderOrder: ['openai-compatible', 'vibecode'],
    transcriptionMode: 'whisper',
    whisperBaseUrl: 'https://api.groq.com/openai/v1/',
    whisperModel: 'whisper-large-v3-turbo',
    whisperApiKey: 'gk',
};

const OPENAI_ENDPOINT = {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'k',
    model: 'gpt-4.1',
    source: 'portal',
};

interface SetupOptions {
    env?: Record<string, string | undefined>;
    record?: Record<string, unknown> | null;
    vibeKeyIssue?: string;
    portal?: Record<string, unknown> | null;
    /** Значения из админки (настройки вендора) поверх env. */
    admin?: Record<string, string>;
}

const setup = (options: SetupOptions = {}) => {
    const env = { ...ENV, ...options.env };
    const config = { get: jest.fn((key: string) => env[key]) };
    const portalStore = {
        getPortalById: jest
            .fn()
            .mockResolvedValue(
                options.portal === undefined
                    ? { id: 5, domain: 'test.bitrix24.ru' }
                    : options.portal,
            ),
    };
    const aiSettings = {
        get: jest
            .fn()
            .mockResolvedValue(
                options.record === undefined ? RECORD : options.record,
            ),
    };
    const gateway = {
        availability: jest.fn().mockResolvedValue([
            { code: 'openai-compatible', issue: null },
            { code: 'vibecode', issue: 'VibeCode-ключ не заведён' },
        ]),
    };
    const endpoints = { resolve: jest.fn().mockResolvedValue(OPENAI_ENDPOINT) };
    const vibeKeys = {
        resolve: options.vibeKeyIssue
            ? jest.fn().mockRejectedValue(new Error(options.vibeKeyIssue))
            : jest.fn().mockResolvedValue('vibe-key'),
    };
    const egress = {
        isProxied: jest.fn(
            (url: string) =>
                url.includes('openai.com') || url.includes('groq.com'),
        ),
        status: jest.fn().mockReturnValue({
            enabled: true,
            proxyHost: 'eu-proxy.example.com',
            hosts: ['api.openai.com', 'api.groq.com'],
        }),
    };
    const probe = {
        models: jest.fn().mockResolvedValue({
            ok: true,
            message: 'отвечает',
            durationMs: 10,
        }),
    };
    const read = (key: string): string | null =>
        options.admin?.[key] ?? env[key] ?? null;
    const settings = options.admin
        ? {
              get: (key: string) => Promise.resolve(read(key)),
              getMany: (keys: readonly string[]) =>
                  Promise.resolve(
                      Object.fromEntries(keys.map(key => [key, read(key)])),
                  ),
          }
        : undefined;
    const service = new PortalAiProvidersReadinessService(
        config as never,
        portalStore as never,
        aiSettings as never,
        gateway as never,
        endpoints as never,
        vibeKeys as never,
        egress as never,
        probe as never,
        settings,
    );
    return { service, gateway, endpoints, probe, portalStore };
};

const byCode = <T extends { code: string }>(items: T[], code: string): T => {
    const found = items.find(item => item.code === code);
    if (!found) throw new Error(`нет строки ${code}`);
    return found;
};

describe('PortalAiProvidersReadinessService', () => {
    it('LLM: порядок портала, свой ключ OpenAI через прокси, VibeCode без ключа — причина от шлюза', async () => {
        const { service, probe, gateway } = setup();
        const result = await service.build(5, false);

        expect(result.domain).toBe('test.bitrix24.ru');
        expect(gateway.availability).toHaveBeenCalledWith('test.bitrix24.ru');
        expect(result.llmOrderSource).toBe('portal');
        expect(result.llmOrder.map(e => e.code)).toEqual([
            'openai-compatible',
            'vibecode',
        ]);
        expect(byCode(result.llmOrder, 'openai-compatible')).toMatchObject({
            configured: true,
            issue: null,
            source: 'portal',
            endpointHost: 'api.openai.com',
            viaProxy: true,
            probe: null,
            inUse: true,
        });
        expect(byCode(result.llmOrder, 'vibecode')).toMatchObject({
            configured: false,
            issue: 'VibeCode-ключ не заведён',
            source: 'portal',
            endpointHost: 'vibecode.bitrix24.tech',
            viaProxy: false,
        });
        expect(probe.models).not.toHaveBeenCalled();
        expect(result.egressProxy.proxyHost).toBe('eu-proxy.example.com');
        expect(Date.parse(result.checkedAt)).not.toBeNaN();
    });

    it('probe=true: живая проверка OpenAI-совместимого LLM и Whisper портала тем же ключом', async () => {
        const { service, probe } = setup();
        const result = await service.build(5, true);

        expect(probe.models).toHaveBeenCalledWith(
            'https://api.openai.com/v1',
            'k',
        );
        expect(probe.models).toHaveBeenCalledWith(
            'https://api.groq.com/openai/v1',
            'gk',
        );
        expect(byCode(result.llmOrder, 'openai-compatible').probe).toEqual({
            ok: true,
            message: 'отвечает',
            durationMs: 10,
        });
        expect(byCode(result.transcription, 'local-whisper').probe?.ok).toBe(
            true,
        );
    });

    it('транскрибация: принудительный Whisper портала — в работе только он, адрес без слэша, через прокси', async () => {
        const { service } = setup();
        const result = await service.build(5, false);

        expect(result.transcriptionMode).toBe('whisper');
        expect(result.transcriptionModeSource).toBe('portal');
        expect(byCode(result.transcription, 'local-whisper')).toMatchObject({
            inUse: true,
            configured: true,
            source: 'portal',
            endpointHost: 'api.groq.com',
            viaProxy: true,
        });
        expect(byCode(result.transcription, 'yandex')).toMatchObject({
            inUse: false,
            configured: true,
            source: 'env',
            endpointHost: 'transcribe.api.cloud.yandex.net',
        });
        expect(byCode(result.transcription, 'bitrix-vibecode')).toMatchObject({
            inUse: false,
            configured: true,
            source: 'portal',
            endpointHost: 'vibecode.bitrix24.tech',
        });
    });

    it('без строки настроек: auto из env, Whisper не задан, Яндекс без ключей называет переменные', async () => {
        const { service } = setup({
            record: null,
            env: { YA_ACCESS_KEY_SECRET: '', TRANSCRIPTION_PROVIDER: 'auto' },
        });
        const result = await service.build(5, false);

        expect(result.llmOrderSource).toBe('env');
        expect(result.transcriptionMode).toBe('auto');
        expect(result.transcriptionModeSource).toBe('env');
        expect(byCode(result.transcription, 'yandex')).toMatchObject({
            inUse: true,
            configured: false,
            issue: 'в env приложения не заданы YA_ACCESS_KEY_SECRET',
        });
        expect(byCode(result.transcription, 'bitrix-vibecode').inUse).toBe(
            true,
        );
        expect(byCode(result.transcription, 'local-whisper')).toMatchObject({
            inUse: false,
            configured: false,
            source: null,
            probe: null,
        });
    });

    it('общий Whisper из env в auto-режиме — участвует как резерв, источник env', async () => {
        const { service } = setup({
            record: null,
            env: { TRANSCRIPTION_WHISPER_BASE_URL: 'http://whisper:8000/v1/' },
        });
        const result = await service.build(5, false);
        expect(byCode(result.transcription, 'local-whisper')).toMatchObject({
            inUse: true,
            configured: true,
            source: 'env',
            endpointHost: 'whisper:8000',
            viaProxy: false,
        });
    });

    it('GROQ_API_KEY в env без явного адреса — резерв Groq через прокси, источник env', async () => {
        const { service } = setup({
            record: null,
            env: { GROQ_API_KEY: 'gsk' },
        });
        const result = await service.build(5, false);
        expect(byCode(result.transcription, 'local-whisper')).toMatchObject({
            inUse: true,
            configured: true,
            source: 'env',
            endpointHost: 'api.groq.com',
            viaProxy: true,
        });
    });

    it('ключ Groq из админки (настройки вендора) — резерв Whisper в чек-листе без env', async () => {
        const { service } = setup({
            record: null,
            admin: { GROQ_API_KEY: 'admin-gsk' },
        });
        const result = await service.build(5, false);
        expect(byCode(result.transcription, 'local-whisper')).toMatchObject({
            inUse: true,
            configured: true,
            source: 'env',
            endpointHost: 'api.groq.com',
            viaProxy: true,
        });
    });

    it('VibeCode-ключ не заведён — причина из резолвера ключей', async () => {
        const { service } = setup({
            vibeKeyIssue: 'VibeCode-ключ не заведён для test.bitrix24.ru',
        });
        const result = await service.build(5, false);
        expect(byCode(result.transcription, 'bitrix-vibecode')).toMatchObject({
            configured: false,
            issue: 'VibeCode-ключ не заведён для test.bitrix24.ru',
        });
    });

    it('портал не найден — 404, дальше не ходим', async () => {
        const { service, gateway } = setup({ portal: null });
        await expect(service.build(404, false)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(gateway.availability).not.toHaveBeenCalled();
    });
});
