import { ApiProperty } from '@nestjs/swagger';
import {
    TRANSCRIPTION_ROUTER_MODES,
    type TranscriptionRouterMode,
} from '@lib/call-lib/transcription/provider/transcription-provider.types';
import type { EgressProxyStatus } from '@lib/egress-proxy';
import {
    AI_PROVIDER_SOURCES,
    type AiEndpointProbe,
    type AiProviderReadiness,
    type AiProviderSource,
    type PortalAiProvidersReadiness,
} from '../ai-providers.types';

/** Итог живой проверки endpoint'а (GET /models). */
export class AiEndpointProbeDto implements AiEndpointProbe {
    constructor(source: AiEndpointProbe) {
        this.ok = source.ok;
        this.message = source.message;
        this.durationMs = source.durationMs;
    }

    @ApiProperty({
        description: 'Endpoint ответил на GET /models кодом 2xx.',
        type: Boolean,
        example: true,
    })
    ok: boolean;

    @ApiProperty({
        description:
            'Итог проверки по-русски: «отвечает», «HTTP 401 — ключ не ' +
            'принят», «нет связи: …».',
        type: String,
        example: 'отвечает',
    })
    message: string;

    @ApiProperty({
        description: 'Длительность проверки, мс.',
        type: Number,
        example: 412,
    })
    durationMs: number;
}

/** Одна строка чек-листа: провайдер LLM или транскрибатор. */
export class AiProviderReadinessDto implements AiProviderReadiness {
    constructor(source: AiProviderReadiness) {
        this.code = source.code;
        this.title = source.title;
        this.inUse = source.inUse;
        this.configured = source.configured;
        this.issue = source.issue;
        this.source = source.source;
        this.endpointHost = source.endpointHost;
        this.viaProxy = source.viaProxy;
        this.probe = source.probe ? new AiEndpointProbeDto(source.probe) : null;
    }

    @ApiProperty({
        description:
            'Код провайдера: для LLM — vibecode, openai-compatible, ai-rag; ' +
            'для транскрибации — yandex, bitrix-vibecode, local-whisper.',
        type: String,
        example: 'openai-compatible',
    })
    code: string;

    @ApiProperty({
        description: 'Название провайдера для интерфейса, по-русски.',
        type: String,
        example:
            'OpenAI-совместимый сервис (ключ клиента или запасной приложения)',
    })
    title: string;

    @ApiProperty({
        description:
            'Участвует ли провайдер в работе при текущем порядке LLM или ' +
            'режиме транскрибации портала.',
        type: Boolean,
        example: true,
    })
    inUse: boolean;

    @ApiProperty({
        description: 'Настроен ли провайдер (есть ключ и адрес).',
        type: Boolean,
        example: true,
    })
    configured: boolean;

    @ApiProperty({
        description: 'Почему провайдер не сработает; null — настроен.',
        type: String,
        example: 'VibeCode-ключ не заведён для example.bitrix24.ru',
        nullable: true,
    })
    issue: string | null;

    @ApiProperty({
        description:
            'Чей ключ или настройка действует: portal — из БД портала ' +
            '(клиент платит сам), env — общая настройка приложения; null — ' +
            'не применимо.',
        enum: AI_PROVIDER_SOURCES,
        example: 'portal',
        nullable: true,
    })
    source: AiProviderSource | null;

    @ApiProperty({
        description: "Хост endpoint'а, куда пойдёт вызов; null — неизвестен.",
        type: String,
        example: 'api.openai.com',
        nullable: true,
    })
    endpointHost: string | null;

    @ApiProperty({
        description:
            'Пойдёт ли вызов через исходящий прокси за рубеж (хост в ' +
            'EGRESS_PROXY_HOSTS).',
        type: Boolean,
        example: true,
    })
    viaProxy: boolean;

    @ApiProperty({
        description:
            "Живая проверка endpoint'а (GET /models); null — не " +
            'запрашивалась (probe=false) или неприменима.',
        type: AiEndpointProbeDto,
        nullable: true,
    })
    probe: AiEndpointProbeDto | null;
}

/** Исходящий прокси: включён ли и какие хосты через него идут. */
export class EgressProxyStatusDto implements EgressProxyStatus {
    constructor(source: EgressProxyStatus) {
        this.enabled = source.enabled;
        this.proxyHost = source.proxyHost;
        this.hosts = [...source.hosts];
    }

    @ApiProperty({
        description: 'Прокси настроен в env приложения (EGRESS_PROXY_*).',
        type: Boolean,
        example: true,
    })
    enabled: boolean;

    @ApiProperty({
        description: 'Хост прокси без пути и токена; null — выключен.',
        type: String,
        example: 'eu-proxy.example.com',
        nullable: true,
    })
    proxyHost: string | null;

    @ApiProperty({
        description: 'Хосты, вызовы к которым идут через прокси.',
        type: [String],
        example: ['api.telegram.org', 'api.openai.com'],
    })
    hosts: string[];
}

/** Готовность провайдеров AI портала целиком. */
export class PortalAiProvidersReadinessDto
    implements PortalAiProvidersReadiness
{
    constructor(source: PortalAiProvidersReadiness) {
        this.domain = source.domain;
        this.llmOrder = source.llmOrder.map(e => new AiProviderReadinessDto(e));
        this.llmOrderSource = source.llmOrderSource;
        this.transcriptionMode = source.transcriptionMode;
        this.transcriptionModeSource = source.transcriptionModeSource;
        this.transcription = source.transcription.map(
            e => new AiProviderReadinessDto(e),
        );
        this.egressProxy = new EgressProxyStatusDto(source.egressProxy);
        this.checkedAt = source.checkedAt;
    }

    @ApiProperty({
        description: 'Домен портала Битрикс24.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({
        description:
            'Провайдеры LLM в действующем порядке: первый — основной, ' +
            'остальные — запасные.',
        type: [AiProviderReadinessDto],
    })
    llmOrder: AiProviderReadinessDto[];

    @ApiProperty({
        description:
            'Откуда порядок LLM: portal — настройка портала, env — ' +
            'LLM_PROVIDER_ORDER приложения.',
        enum: AI_PROVIDER_SOURCES,
        example: 'env',
    })
    llmOrderSource: AiProviderSource;

    @ApiProperty({
        description:
            'Действующий режим транскрибации: auto — по длительности, иначе ' +
            'принудительно один провайдер.',
        enum: TRANSCRIPTION_ROUTER_MODES,
        example: 'auto',
    })
    transcriptionMode: TranscriptionRouterMode;

    @ApiProperty({
        description:
            'Откуда режим: portal — настройка портала, env — ' +
            'TRANSCRIPTION_PROVIDER приложения.',
        enum: AI_PROVIDER_SOURCES,
        example: 'env',
    })
    transcriptionModeSource: AiProviderSource;

    @ApiProperty({
        description:
            'Транскрибаторы: Яндекс, VibeCode, Whisper-совместимый сервис.',
        type: [AiProviderReadinessDto],
    })
    transcription: AiProviderReadinessDto[];

    @ApiProperty({
        description: 'Исходящий прокси за рубеж.',
        type: EgressProxyStatusDto,
    })
    egressProxy: EgressProxyStatusDto;

    @ApiProperty({
        description: 'Когда собран чек-лист (ISO 8601).',
        type: String,
        example: '2026-10-29T12:00:00.000Z',
    })
    checkedAt: string;
}
