import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GROQ_BASE_URL, groqPresetOf } from '@lib/ai-presets';
import { EgressProxyService } from '@lib/egress-proxy';
import {
    VENDOR_SETTINGS_READER,
    envOnlyReader,
    type VendorSettingsReader,
} from '@lib/vendor-settings';

/** Текст и сырые сегменты verbose_json; segments null — сервер их не дал. */
export interface WhisperTranscriptionDetailed {
    text: string;
    segments: unknown;
}

/** Куда слать запись: адрес без хвостового слэша, ключ (null — без авторизации), модель. */
export interface WhisperEndpoint {
    baseUrl: string;
    apiKey: string | null;
    model: string;
}

interface WhisperResponse {
    text?: string;
    segments?: unknown;
}

const DEFAULT_MODEL = 'Systran/faster-whisper-large-v3';
const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_LANGUAGE = 'ru';

/** Ответ 4xx на verbose_json — формат не поддержан, повторяем без него (как у VibeCode). */
const isClientError = (error: unknown): boolean =>
    /\[4\d\d\]/.test((error as Error)?.message ?? '');

/** Общий Whisper-совместимый endpoint приложения из env и модель по умолчанию. */
export interface WhisperEnvSettings {
    /** null — нет ни TRANSCRIPTION_WHISPER_BASE_URL, ни GROQ_API_KEY. */
    endpoint: WhisperEndpoint | null;
    defaultModel: string;
}

/** Переменные общего endpoint'а; ключ Groq среди них можно задать и в админке. */
export const WHISPER_ENV_KEYS = [
    'TRANSCRIPTION_WHISPER_BASE_URL',
    'TRANSCRIPTION_WHISPER_API_KEY',
    'TRANSCRIPTION_WHISPER_MODEL',
    'GROQ_API_KEY',
    'GROQ_WHISPER_MODEL',
] as const;

/**
 * Разбор env TRANSCRIPTION_WHISPER_* — одна функция на сервис и чек-лист
 * готовности в админке (он не поднимает Yandex-модули ради этих трёх строк).
 * Явного адреса нет, но есть GROQ_API_KEY — общий резерв становится Groq
 * (@lib/ai-presets): тот же ключ, что у запасного LLM.
 */
export function whisperEnvSettingsOf(
    get: (key: string) => string | undefined,
): WhisperEnvSettings {
    const read = (key: string): string => (get(key) ?? '').trim();
    const defaultModel = read('TRANSCRIPTION_WHISPER_MODEL') || DEFAULT_MODEL;
    const baseUrl = read('TRANSCRIPTION_WHISPER_BASE_URL').replace(/\/+$/, '');
    if (baseUrl) {
        return {
            endpoint: {
                baseUrl,
                apiKey: read('TRANSCRIPTION_WHISPER_API_KEY') || null,
                model: defaultModel,
            },
            defaultModel,
        };
    }
    const groq = groqPresetOf(get);
    return {
        endpoint: groq
            ? {
                  baseUrl: GROQ_BASE_URL,
                  apiKey: groq.apiKey,
                  model: groq.whisperModel,
              }
            : null,
        defaultModel,
    };
}

/**
 * Третий транскрибатор: любой OpenAI-совместимый `/audio/transcriptions` —
 * свой сервер (faster-whisper-server, speaches, vLLM-whisper на GPU) или
 * облако по ключу (OpenAI `whisper-1`, Groq `whisper-large-v3-turbo`;
 * зарубежные хосты идут через исходящий прокси @lib/egress-proxy). Общий
 * endpoint приложения — env TRANSCRIPTION_WHISPER_BASE_URL, иначе Groq по
 * GROQ_API_KEY (без них роутер провайдера не видит); у портала может быть
 * свой — роутер передаёт его
 * параметром (настройки AI портала: whisperBaseUrl / whisperModel /
 * whisperApiKey). Последний резерв, когда Яндекс и VibeCode отказали оба,
 * либо основной при режиме whisper (план устойчивости к провайдерам,
 * 28–29.10.2026).
 */
@Injectable()
export class WhisperCompatibleTranscriptionService {
    private readonly logger = new Logger(
        WhisperCompatibleTranscriptionService.name,
    );
    /** Модель по умолчанию — для портала, задавшего только адрес (только env). */
    readonly defaultModel: string;
    private readonly language: string;
    private readonly timeoutMs: number;
    private readonly settings: VendorSettingsReader;

    constructor(
        configService: ConfigService,
        private readonly egress: EgressProxyService,
        @Optional()
        @Inject(VENDOR_SETTINGS_READER)
        settings?: VendorSettingsReader,
    ) {
        const read = (key: string): string =>
            (configService.get<string>(key) ?? '').trim();
        this.settings =
            settings ?? envOnlyReader(key => configService.get<string>(key));
        this.defaultModel = whisperEnvSettingsOf(key =>
            configService.get<string>(key),
        ).defaultModel;
        this.language =
            read('TRANSCRIPTION_WHISPER_LANGUAGE') || DEFAULT_LANGUAGE;
        const timeout = Number(read('TRANSCRIPTION_WHISPER_TIMEOUT_MS') || NaN);
        this.timeoutMs =
            Number.isFinite(timeout) && timeout > 0
                ? timeout
                : DEFAULT_TIMEOUT_MS;
    }

    /**
     * Общий endpoint приложения: явный адрес TRANSCRIPTION_WHISPER_* или Groq
     * по ключу — из админки (настройки вендора) либо env; `endpoint` null —
     * не задан, провайдера в маршрутах нет. Читается при каждом звонке:
     * правка в админке действует в течение минуты.
     */
    async envSettings(): Promise<WhisperEnvSettings> {
        const values = await this.settings.getMany(WHISPER_ENV_KEYS);
        return whisperEnvSettingsOf(key => values[key] ?? undefined);
    }

    /**
     * Транскрибация с сегментами; сервер без verbose_json — повтор без них.
     * `endpoint` — свой Whisper портала; не передан — общий endpoint
     * приложения (envSettings).
     */
    async transcribeDetailed(
        buffer: Buffer,
        fileName: string,
        endpoint?: WhisperEndpoint | null,
    ): Promise<WhisperTranscriptionDetailed> {
        const target =
            endpoint === undefined
                ? (await this.envSettings()).endpoint
                : endpoint;
        if (!target) {
            throw new Error(
                'Whisper-совместимый сервис не настроен: нет TRANSCRIPTION_WHISPER_BASE_URL или GROQ_API_KEY (в админке или env) и адреса у портала',
            );
        }
        try {
            return await this.post(buffer, fileName, 'verbose_json', target);
        } catch (error) {
            if (!isClientError(error)) throw error;
            this.logger.warn(
                `verbose_json не принят (${(error as Error).message}) — повтор без сегментов`,
            );
            return this.post(buffer, fileName, null, target);
        }
    }

    private async post(
        buffer: Buffer,
        fileName: string,
        responseFormat: 'verbose_json' | null,
        endpoint: WhisperEndpoint,
    ): Promise<WhisperTranscriptionDetailed> {
        const where = `Whisper (${endpoint.model})`;
        const formData = new FormData();
        formData.append('model', endpoint.model);
        formData.append('language', this.language);
        if (responseFormat !== null) {
            formData.append('response_format', responseFormat);
        }
        formData.append(
            'file',
            new Blob([buffer], { type: 'audio/mpeg' }),
            fileName,
        );

        let response: Response;
        try {
            // Через исходящий прокси, если хост в списке EGRESS_PROXY_HOSTS
            // (облачный Whisper за рубежом); иначе напрямую.
            response = await this.egress.fetch(
                `${endpoint.baseUrl}/audio/transcriptions`,
                {
                    method: 'POST',
                    headers: endpoint.apiKey
                        ? { Authorization: `Bearer ${endpoint.apiKey}` }
                        : {},
                    body: formData,
                    signal: AbortSignal.timeout(this.timeoutMs),
                },
            );
        } catch (error) {
            throw new Error(
                `${where}: сеть или таймаут — ${(error as Error).message}`,
            );
        }
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(
                `${where} failed [${response.status}]: ${text.slice(0, 500)}`,
            );
        }
        const data = (await response.json()) as WhisperResponse;
        if (!data.text) throw new Error(`${where}: пустая расшифровка`);
        this.logger.log(`${where}: ${fileName} → ${data.text.length} знаков`);
        return { text: data.text, segments: data.segments ?? null };
    }
}
