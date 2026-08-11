/** Локальный soffice или HTTP-сервис (Gotenberg с LibreOffice внутри). */
export type LibreOfficeMode = 'exec' | 'http';

/**
 * Опции PDF-экспорта Gotenberg. По умолчанию ВЫКЛЮЧЕНЫ: включение меняет
 * внешний вид готовых документов (картинки пережимаются), поэтому это
 * осознанное решение через env, а не дефолт.
 * Имена полей — из route /forms/libreoffice/convert.
 */
export type LibreOfficePdfOptions = {
    /** Понижать разрешение картинок до maxImageResolution. */
    reduceImageResolution: boolean;
    /** 75 | 150 | 300 | 600 | 1200 dpi. Работает только вместе с reduceImageResolution. */
    maxImageResolution?: number;
    /** Качество JPEG 1..100 (меньше — быстрее и легче PDF). */
    quality?: number;
};

/**
 * Как узнаём список инстансов:
 * - static — ровно то, что перечислено в LIBREOFFICE_HTTP_URL;
 * - dns — каждый хост из LIBREOFFICE_HTTP_URL резолвится во ВСЕ адреса.
 *   В docker имя сервиса резолвится во все его реплики, поэтому
 *   `deploy.replicas: 4` + один URL = пул из 4 инстансов без правки env.
 */
export type LibreOfficeDiscovery = 'static' | 'dns';

export type LibreOfficeConfig = {
    mode: LibreOfficeMode;
    discovery: LibreOfficeDiscovery;
    /** Как часто перепроверять список инстансов (ленивая проверка при конвертации). */
    discoveryTtlMs: number;
    /** На сколько инстанс уходит в «немилость» после транзиентной ошибки. */
    failureCooldownMs: number;
    /**
     * Base-url инстансов Gotenberg. LibreOffice не умеет параллельные
     * конверсии: один инстанс = одна конверсия за раз, поэтому реальный
     * параллелизм = endpoints.length * slotsPerEndpoint.
     */
    endpoints: string[];
    /**
     * Слотов на один endpoint. 1 — если за URL стоит один контейнер.
     * Больше 1 имеет смысл только когда URL — это балансировщик или
     * docker DNS round-robin поверх `--scale gotenberg=N`.
     */
    slotsPerEndpoint: number;
    /**
     * Таймаут одного HTTP-запроса. Должен быть чуть МЕНЬШЕ, чем
     * `--api-timeout` у Gotenberg, иначе вместо своей ошибки получим его 503.
     */
    timeoutMs: number;
    /** Повторов после первой попытки (только на транзиентных ошибках). */
    retries: number;
    /** Максимум задач, ждущих слот. Сверх лимита — сразу отказ, без ожидания. */
    maxQueue: number;
    /**
     * Кэш готовых PDF по содержимому DOCX. Главный выигрыш — превью и
     * последующая генерация того же документа конвертируются один раз.
     */
    cacheEnabled: boolean;
    cacheTtlHours: number;
    pdf: LibreOfficePdfOptions;
};

export const LIBRE_OFFICE_CONFIG = Symbol('LIBRE_OFFICE_CONFIG');

export const LIBRE_OFFICE_DEFAULTS = {
    endpoint: 'http://127.0.0.1:33030',
    slotsPerEndpoint: 1,
    timeoutMs: 240_000,
    retries: 2,
    maxQueue: 20,
    discoveryTtlMs: 30_000,
    failureCooldownMs: 15_000,
    cacheTtlHours: 168,
} as const;

type EnvReader = { get<T>(key: string): T | undefined };

function parseIntOrDefault(
    raw: string | undefined,
    defaultValue: number,
    min: number,
): number {
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= min ? parsed : defaultValue;
}

/** Список URL из строки: одиночный URL или через запятую. Пустые и дубли отбрасываются. */
export function parseEndpoints(raw: string | undefined): string[] {
    const parsed = (raw ?? '')
        .split(',')
        .map(url => url.trim().replace(/\/$/, ''))
        .filter(url => url.length > 0);
    const unique = [...new Set(parsed)];
    return unique.length > 0 ? unique : [LIBRE_OFFICE_DEFAULTS.endpoint];
}

function buildPdfOptions(env: EnvReader): LibreOfficePdfOptions {
    const reduce =
        env.get<string>('LIBREOFFICE_PDF_REDUCE_IMAGE_RESOLUTION') === 'true';
    const maxResolution = parseIntOrDefault(
        env.get<string>('LIBREOFFICE_PDF_MAX_IMAGE_RESOLUTION'),
        0,
        75,
    );
    const quality = parseIntOrDefault(
        env.get<string>('LIBREOFFICE_PDF_QUALITY'),
        0,
        1,
    );
    return {
        reduceImageResolution: reduce,
        maxImageResolution: maxResolution > 0 ? maxResolution : undefined,
        quality: quality > 0 && quality <= 100 ? quality : undefined,
    };
}

export function buildLibreOfficeConfig(env: EnvReader): LibreOfficeConfig {
    const mode = env.get<string>('LIBREOFFICE_MODE')?.trim().toLowerCase();
    const discovery = env
        .get<string>('LIBREOFFICE_DISCOVERY')
        ?.trim()
        .toLowerCase();
    return {
        mode: mode === 'http' ? 'http' : 'exec',
        discovery: discovery === 'dns' ? 'dns' : 'static',
        discoveryTtlMs: parseIntOrDefault(
            env.get<string>('LIBREOFFICE_DISCOVERY_TTL_MS'),
            LIBRE_OFFICE_DEFAULTS.discoveryTtlMs,
            1_000,
        ),
        failureCooldownMs: parseIntOrDefault(
            env.get<string>('LIBREOFFICE_FAILURE_COOLDOWN_MS'),
            LIBRE_OFFICE_DEFAULTS.failureCooldownMs,
            0,
        ),
        endpoints: parseEndpoints(env.get<string>('LIBREOFFICE_HTTP_URL')),
        slotsPerEndpoint: parseIntOrDefault(
            env.get<string>('LIBREOFFICE_SLOTS_PER_URL'),
            LIBRE_OFFICE_DEFAULTS.slotsPerEndpoint,
            1,
        ),
        timeoutMs: parseIntOrDefault(
            env.get<string>('LIBREOFFICE_HTTP_TIMEOUT_MS'),
            LIBRE_OFFICE_DEFAULTS.timeoutMs,
            1_000,
        ),
        retries: parseIntOrDefault(
            env.get<string>('LIBREOFFICE_HTTP_RETRIES'),
            LIBRE_OFFICE_DEFAULTS.retries,
            0,
        ),
        maxQueue: parseIntOrDefault(
            env.get<string>('LIBREOFFICE_MAX_QUEUE'),
            LIBRE_OFFICE_DEFAULTS.maxQueue,
            1,
        ),
        // Кэш включён по умолчанию: он не меняет результат, только экономит
        // повторную конвертацию того же документа.
        cacheEnabled: env.get<string>('LIBREOFFICE_CACHE_ENABLED') !== 'false',
        cacheTtlHours: parseIntOrDefault(
            env.get<string>('LIBREOFFICE_CACHE_TTL_HOURS'),
            LIBRE_OFFICE_DEFAULTS.cacheTtlHours,
            1,
        ),
        pdf: buildPdfOptions(env),
    };
}
