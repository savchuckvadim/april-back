import { Prisma } from 'generated/prisma';
import {
    AI_LLM_PROVIDER_CODES,
    AI_TRANSCRIPTION_MODES,
    AiLlmProviderCode,
    AiTranscriptionMode,
    PRESENTATION_STRICTNESS_LEVELS,
    PresentationStrictnessLevel,
    WEEKLY_REPORT_DELIVERY_MODES,
    WeeklyReportDeliveryMode,
} from './portal-ai-settings.types';
import {
    normalizeTranscriptionRoute,
    type PortalTranscriptionRoute,
} from './portal-transcription-route.types';

/**
 * Разбор JSON-колонки `settings` настроек AI портала — чистые функции без
 * Prisma-клиента и шифрования: параметры, которые добавляются без миграции,
 * читаются отсюда. Мусор из БД (её пишет и Laravel) не роняет чтение —
 * незнакомое значение считается незаданным.
 */

/** Минимальная длина названия организации: «А» отфильтровало бы полразговора. */
const MIN_ORG_NAME_LENGTH = 2;
/** Потолок списка названий — защита промпта от свалки. */
const MAX_ORG_NAMES = 20;

/** Порядок провайдеров LLM: только известные коды, без дублей; пусто — null. */
export function toProviderOrder(
    value: Prisma.JsonValue,
): AiLlmProviderCode[] | null {
    if (!Array.isArray(value)) return null;
    const codes = value.filter(
        (item): item is AiLlmProviderCode =>
            typeof item === 'string' &&
            (AI_LLM_PROVIDER_CODES as readonly string[]).includes(item),
    );
    const unique = [...new Set(codes)];
    return unique.length ? unique : null;
}

/** JSON-колонка `settings` → объект (мусор из БД не роняет чтение). */
export function parseAiSettingsJson(value: Prisma.JsonValue | undefined): {
    irrelevantConfidence?: number;
    revisorEnabled?: boolean;
    presentationAuditEnabled?: boolean;
    presentationStrictness?: PresentationStrictnessLevel;
    methodologyCode?: string;
    weeklyReportEnabled?: boolean;
    weeklyReportRecipients?: number[];
    weeklyReportFolderId?: number;
    weeklyReportDelivery?: WeeklyReportDeliveryMode;
    complianceReviewEnabled?: boolean;
    ownOrgNames?: string[];
    llmProviderOrder?: AiLlmProviderCode[];
    transcriptionMode?: AiTranscriptionMode;
    whisperBaseUrl?: string;
    whisperModel?: string;
    whisperApiKeyEncrypted?: string;
    vibecodeTranscriptionModel?: string;
    factsCatchupNightlyBudgetRub?: number;
    transcriptionRoute?: PortalTranscriptionRoute;
} {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    const raw = value as Record<string, unknown>;
    const confidence = Number(raw.irrelevantConfidence);
    const folderId = Number(raw.weeklyReportFolderId);
    return {
        weeklyReportEnabled:
            typeof raw.weeklyReportEnabled === 'boolean'
                ? raw.weeklyReportEnabled
                : undefined,
        // Получатели вводятся строкой «12, 25, 7» — принимаем и массив,
        // и строку (в БД могло лечь и то, и другое).
        weeklyReportRecipients:
            toUserIds(raw.weeklyReportRecipients as Prisma.JsonValue) ??
            undefined,
        weeklyReportFolderId:
            Number.isFinite(folderId) && folderId > 0 ? folderId : undefined,
        complianceReviewEnabled:
            typeof raw.complianceReviewEnabled === 'boolean'
                ? raw.complianceReviewEnabled
                : undefined,
        // Названия своих организаций вводятся строкой «Альфа-центр,
        // Апрель» либо массивом — принимаем оба вида (в БД лежит и то,
        // и другое, как у получателей отчёта).
        ownOrgNames:
            toOrgNames(raw.ownOrgNames as Prisma.JsonValue) ?? undefined,
        llmProviderOrder:
            toProviderOrder(raw.llmProviderOrder as Prisma.JsonValue) ??
            undefined,
        transcriptionMode: (
            AI_TRANSCRIPTION_MODES as readonly string[]
        ).includes(String(raw.transcriptionMode))
            ? (raw.transcriptionMode as AiTranscriptionMode)
            : undefined,
        whisperBaseUrl: nonEmptyString(raw.whisperBaseUrl),
        whisperModel: nonEmptyString(raw.whisperModel),
        whisperApiKeyEncrypted: nonEmptyString(raw.whisperApiKeyEncrypted),
        vibecodeTranscriptionModel: nonEmptyString(
            raw.vibecodeTranscriptionModel,
        ),
        transcriptionRoute:
            normalizeTranscriptionRoute(raw.transcriptionRoute) ?? undefined,
        factsCatchupNightlyBudgetRub:
            Number.isFinite(Number(raw.factsCatchupNightlyBudgetRub)) &&
            Number(raw.factsCatchupNightlyBudgetRub) > 0
                ? Number(raw.factsCatchupNightlyBudgetRub)
                : undefined,
        methodologyCode: nonEmptyString(raw.methodologyCode),
        weeklyReportDelivery: (
            WEEKLY_REPORT_DELIVERY_MODES as readonly string[]
        ).includes(String(raw.weeklyReportDelivery))
            ? (raw.weeklyReportDelivery as WeeklyReportDeliveryMode)
            : undefined,
        irrelevantConfidence:
            Number.isFinite(confidence) && confidence > 0 && confidence <= 1
                ? confidence
                : undefined,
        revisorEnabled:
            typeof raw.revisorEnabled === 'boolean'
                ? raw.revisorEnabled
                : undefined,
        presentationAuditEnabled:
            typeof raw.presentationAuditEnabled === 'boolean'
                ? raw.presentationAuditEnabled
                : undefined,
        presentationStrictness: (
            PRESENTATION_STRICTNESS_LEVELS as readonly string[]
        ).includes(String(raw.presentationStrictness))
            ? (raw.presentationStrictness as PresentationStrictnessLevel)
            : undefined,
    };
}

/** Непустая строка из JSON; иначе undefined. */
export function nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Названия своих организаций: массив либо строка через запятую/перенос
 * строки. Пустые и слишком короткие имена отбрасываются — одна буква в
 * списке превратила бы в «наше название» половину разговора.
 */
export function toOrgNames(value: Prisma.JsonValue): string[] | null {
    const source: unknown[] = Array.isArray(value)
        ? value
        : typeof value === 'string'
          ? value.split(/[,;\n]+/)
          : [];
    const names = source
        .map(item => (typeof item === 'string' ? item.trim() : ''))
        .filter(name => name.length >= MIN_ORG_NAME_LENGTH);
    // Дубликаты без учёта регистра: «Апрель» и «апрель» — одно имя.
    const seen = new Set<string>();
    const unique = names.filter(name => {
        const key = name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return unique.length ? unique.slice(0, MAX_ORG_NAMES) : null;
}

/**
 * Json из БД мог быть записан чем угодно (в том числе Laravel-ом),
 * поэтому массив фильтруется до конечных положительных чисел.
 */
export function toUserIds(value: Prisma.JsonValue): number[] | null {
    // Получатели отчёта в админке вводятся строкой через запятую —
    // принимаем и «12, 25, 7», и массив (в БД лежит и то, и другое).
    const source: unknown[] = Array.isArray(value)
        ? value
        : typeof value === 'string'
          ? value.split(/[,;\s]+/)
          : [];
    const ids = source
        .map(item => Number(item))
        .filter(id => Number.isFinite(id) && id > 0);
    return ids.length ? ids : null;
}
