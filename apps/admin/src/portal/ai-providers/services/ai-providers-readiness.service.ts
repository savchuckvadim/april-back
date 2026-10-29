import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    forcedProviderOf,
    parseTranscriptionRouterMode,
    type TranscriptionProvider,
} from '@lib/call-lib/transcription/provider/transcription-provider.types';
import {
    resolveTranscriptionPrefs,
    type TranscriptionEnvPrefs,
    type TranscriptionPrefs,
} from '@lib/call-lib/transcription/provider/transcription-prefs.util';
import { whisperEnvSettingsOf } from '@lib/call-lib/transcription/services/whisper-compatible-transcription.service';
import { EgressProxyService } from '@lib/egress-proxy';
import {
    LlmEndpointResolverService,
    StructuredLlmGateway,
    type LlmProviderCode,
} from '@lib/llm-gateway';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { VIBECODE_BASE_URL, VibeKeyResolverService } from '@lib/vibecode';
import {
    LLM_PROVIDER_TITLES,
    TRANSCRIPTION_PROVIDER_TITLES,
    YANDEX_STT_ENV_KEYS,
    YANDEX_STT_HOST,
    hostOf,
} from '../ai-providers.const';
import type {
    AiProviderReadiness,
    PortalAiProvidersReadiness,
} from '../ai-providers.types';
import { AiEndpointProbeService } from './ai-endpoint-probe.service';

/** Строка чек-листа с типизированным кодом провайдера. */
type Readiness<C extends string> = AiProviderReadiness & { code: C };

/**
 * Чек-лист готовности провайдеров AI портала: кто считает разборы и кто
 * транскрибирует, чей ключ (портала или приложения), пойдёт ли вызов через
 * исходящий прокси и — по запросу — отвечает ли endpoint. «Что действует»
 * считается теми же функциями, что у шлюза LLM и роутера транскрибации,
 * но без Yandex-модулей: админке нужны только настройки портала и env.
 */
@Injectable()
export class PortalAiProvidersReadinessService {
    constructor(
        private readonly configService: ConfigService,
        private readonly portalStore: PortalStoreService,
        private readonly aiSettings: PortalAiSettingsService,
        private readonly gateway: StructuredLlmGateway,
        private readonly endpoints: LlmEndpointResolverService,
        private readonly vibeKeys: VibeKeyResolverService,
        private readonly egress: EgressProxyService,
        private readonly probe: AiEndpointProbeService,
    ) {}

    async build(
        portalId: number,
        withProbe: boolean,
    ): Promise<PortalAiProvidersReadiness> {
        const domain = await this.requireDomain(portalId);
        const record = await this.aiSettings.get(portalId);
        const prefs = resolveTranscriptionPrefs(record, this.envPrefs());
        const [llmOrder, transcription] = await Promise.all([
            this.llmReadiness(domain, withProbe),
            this.transcriptionReadiness(domain, prefs, withProbe),
        ]);
        return {
            domain,
            llmOrder,
            llmOrderSource: record?.llmProviderOrder?.length ? 'portal' : 'env',
            transcriptionMode: prefs.mode,
            transcriptionModeSource: prefs.modeSource,
            transcription,
            egressProxy: this.egress.status(),
            checkedAt: new Date().toISOString(),
        };
    }

    private async requireDomain(portalId: number): Promise<string> {
        const portal = await this.portalStore.getPortalById(portalId);
        if (!portal?.domain) {
            throw new NotFoundException(
                `Портал с id=${portalId} не найден или у него не задан домен`,
            );
        }
        return portal.domain;
    }

    /** Общие значения транскрибации из env — те же переменные, что читает роутер. */
    private envPrefs(): TranscriptionEnvPrefs {
        const get = (key: string): string | undefined =>
            this.configService.get<string>(key);
        const whisper = whisperEnvSettingsOf(get);
        return {
            mode: parseTranscriptionRouterMode(get('TRANSCRIPTION_PROVIDER')),
            whisper: whisper.endpoint,
            defaultWhisperModel: whisper.defaultModel,
        };
    }

    /** LLM в порядке портала: настроенность — от шлюза, детали endpoint'а — от резолвера. */
    private async llmReadiness(
        domain: string,
        withProbe: boolean,
    ): Promise<AiProviderReadiness[]> {
        const availability = await this.gateway.availability(domain);
        return Promise.all(
            availability.map(({ code, issue }) =>
                this.llmEntry(domain, code, issue, withProbe),
            ),
        );
    }

    private async llmEntry(
        domain: string,
        code: LlmProviderCode,
        issue: string | null,
        withProbe: boolean,
    ): Promise<AiProviderReadiness> {
        const base = this.entry(code, LLM_PROVIDER_TITLES[code], issue);
        if (code === 'vibecode') {
            return {
                ...base,
                source: 'portal',
                ...this.endpointInfo(VIBECODE_BASE_URL),
            };
        }
        if (code === 'openai-compatible') {
            const endpoint = await this.endpoints.resolve(domain);
            if (!endpoint) return base;
            return {
                ...base,
                source: endpoint.source,
                ...this.endpointInfo(endpoint.baseUrl),
                probe: withProbe
                    ? await this.probe.models(endpoint.baseUrl, endpoint.apiKey)
                    : null,
            };
        }
        return { ...base, source: 'env' };
    }

    /** Три транскрибатора всегда; `inUse` — по режиму портала. */
    private async transcriptionReadiness(
        domain: string,
        prefs: TranscriptionPrefs,
        withProbe: boolean,
    ): Promise<AiProviderReadiness[]> {
        const forced = forcedProviderOf(prefs.mode);
        const inUse = (code: TranscriptionProvider): boolean =>
            forced
                ? code === forced
                : code !== 'local-whisper' || prefs.whisper !== null;
        const entries = await Promise.all([
            Promise.resolve(this.yandexEntry()),
            this.vibecodeEntry(domain),
            this.whisperEntry(prefs, withProbe),
        ]);
        return entries.map(entry => ({ ...entry, inUse: inUse(entry.code) }));
    }

    private yandexEntry(): Readiness<'yandex'> {
        const missing = YANDEX_STT_ENV_KEYS.filter(
            key => !this.configService.get<string>(key)?.trim(),
        );
        return this.entry(
            'yandex',
            TRANSCRIPTION_PROVIDER_TITLES.yandex,
            missing.length
                ? `в env приложения не заданы ${missing.join(', ')}`
                : null,
            { source: 'env', endpointHost: YANDEX_STT_HOST },
        );
    }

    private async vibecodeEntry(
        domain: string,
    ): Promise<Readiness<'bitrix-vibecode'>> {
        let issue: string | null = null;
        try {
            await this.vibeKeys.resolve(domain);
        } catch (error) {
            issue = (error as Error).message;
        }
        return this.entry(
            'bitrix-vibecode',
            TRANSCRIPTION_PROVIDER_TITLES['bitrix-vibecode'],
            issue,
            { source: 'portal', ...this.endpointInfo(VIBECODE_BASE_URL) },
        );
    }

    private async whisperEntry(
        prefs: TranscriptionPrefs,
        withProbe: boolean,
    ): Promise<Readiness<'local-whisper'>> {
        const title = TRANSCRIPTION_PROVIDER_TITLES['local-whisper'];
        if (!prefs.whisper) {
            return this.entry(
                'local-whisper',
                title,
                'адрес не задан ни в настройках портала, ни в env (TRANSCRIPTION_WHISPER_BASE_URL или GROQ_API_KEY)',
            );
        }
        return this.entry('local-whisper', title, null, {
            source: prefs.whisperSource,
            ...this.endpointInfo(prefs.whisper.baseUrl),
            probe: withProbe
                ? await this.probe.models(
                      prefs.whisper.baseUrl,
                      prefs.whisper.apiKey,
                  )
                : null,
        });
    }

    private endpointInfo(
        baseUrl: string,
    ): Pick<AiProviderReadiness, 'endpointHost' | 'viaProxy'> {
        return {
            endpointHost: hostOf(baseUrl),
            viaProxy: this.egress.isProxied(baseUrl),
        };
    }

    private entry<C extends string>(
        code: C,
        title: string,
        issue: string | null,
        over: Partial<Omit<AiProviderReadiness, 'code'>> = {},
    ): Readiness<C> {
        return {
            title,
            inUse: true,
            configured: issue === null,
            issue,
            source: null,
            endpointHost: null,
            viaProxy: false,
            probe: null,
            ...over,
            code,
        };
    }
}
