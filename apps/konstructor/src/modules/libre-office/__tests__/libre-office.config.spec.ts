import {
    LIBRE_OFFICE_DEFAULTS,
    buildLibreOfficeConfig,
    parseEndpoints,
} from '../config/libre-office.config';

function env(values: Record<string, string>): {
    get<T>(key: string): T | undefined;
} {
    return {
        get<T>(key: string): T | undefined {
            return values[key] as T | undefined;
        },
    };
}

describe('parseEndpoints', () => {
    it('разбирает список URL через запятую и режет хвостовые слеши', () => {
        expect(
            parseEndpoints('http://gotenberg:3000/, http://gotenberg-2:3000'),
        ).toEqual(['http://gotenberg:3000', 'http://gotenberg-2:3000']);
    });

    it('поддерживает одиночный URL (обратная совместимость)', () => {
        expect(parseEndpoints('http://gotenberg:3000')).toEqual([
            'http://gotenberg:3000',
        ]);
    });

    it('отбрасывает дубли, чтобы не завысить размер пула', () => {
        expect(
            parseEndpoints('http://a:3000,http://a:3000/,http://b:3000'),
        ).toEqual(['http://a:3000', 'http://b:3000']);
    });

    it('на пустое значение отдаёт дефолтный endpoint', () => {
        expect(parseEndpoints(undefined)).toEqual([
            LIBRE_OFFICE_DEFAULTS.endpoint,
        ]);
        expect(parseEndpoints(' , ')).toEqual([LIBRE_OFFICE_DEFAULTS.endpoint]);
    });
});

describe('buildLibreOfficeConfig', () => {
    it('без env отдаёт безопасные дефолты (exec, static, 1 слот)', () => {
        const config = buildLibreOfficeConfig(env({}));

        expect(config.mode).toBe('exec');
        expect(config.discovery).toBe('static');
        expect(config.discoveryTtlMs).toBe(
            LIBRE_OFFICE_DEFAULTS.discoveryTtlMs,
        );
        expect(config.failureCooldownMs).toBe(
            LIBRE_OFFICE_DEFAULTS.failureCooldownMs,
        );
        expect(config.slotsPerEndpoint).toBe(1);
        expect(config.timeoutMs).toBe(LIBRE_OFFICE_DEFAULTS.timeoutMs);
        expect(config.retries).toBe(LIBRE_OFFICE_DEFAULTS.retries);
        expect(config.maxQueue).toBe(LIBRE_OFFICE_DEFAULTS.maxQueue);
        expect(config.pdf.reduceImageResolution).toBe(false);
    });

    it('читает http-режим и список инстансов', () => {
        const config = buildLibreOfficeConfig(
            env({
                LIBREOFFICE_MODE: ' HTTP ',
                LIBREOFFICE_HTTP_URL:
                    'http://gotenberg:3000,http://gotenberg-2:3000',
                LIBREOFFICE_HTTP_TIMEOUT_MS: '120000',
                LIBREOFFICE_HTTP_RETRIES: '0',
                LIBREOFFICE_MAX_QUEUE: '5',
                LIBREOFFICE_SLOTS_PER_URL: '2',
            }),
        );

        expect(config.mode).toBe('http');
        expect(config.endpoints).toHaveLength(2);
        expect(config.timeoutMs).toBe(120000);
        expect(config.retries).toBe(0);
        expect(config.maxQueue).toBe(5);
        expect(config.slotsPerEndpoint).toBe(2);
    });

    it('включает dns-дискавери и его настройки', () => {
        const config = buildLibreOfficeConfig(
            env({
                LIBREOFFICE_DISCOVERY: ' DNS ',
                LIBREOFFICE_DISCOVERY_TTL_MS: '10000',
                LIBREOFFICE_FAILURE_COOLDOWN_MS: '0',
            }),
        );

        expect(config.discovery).toBe('dns');
        expect(config.discoveryTtlMs).toBe(10000);
        expect(config.failureCooldownMs).toBe(0);
    });

    it('неизвестный режим дискавери трактует как static', () => {
        expect(
            buildLibreOfficeConfig(env({ LIBREOFFICE_DISCOVERY: 'consul' }))
                .discovery,
        ).toBe('static');
    });

    it('игнорирует мусор и слишком малые значения', () => {
        const config = buildLibreOfficeConfig(
            env({
                LIBREOFFICE_HTTP_TIMEOUT_MS: '10',
                LIBREOFFICE_HTTP_RETRIES: 'abc',
                LIBREOFFICE_SLOTS_PER_URL: '0',
                LIBREOFFICE_MAX_QUEUE: '-3',
            }),
        );

        expect(config.timeoutMs).toBe(LIBRE_OFFICE_DEFAULTS.timeoutMs);
        expect(config.retries).toBe(LIBRE_OFFICE_DEFAULTS.retries);
        expect(config.slotsPerEndpoint).toBe(1);
        expect(config.maxQueue).toBe(LIBRE_OFFICE_DEFAULTS.maxQueue);
    });

    it('pdf-опции включаются только явным env', () => {
        const config = buildLibreOfficeConfig(
            env({
                LIBREOFFICE_PDF_REDUCE_IMAGE_RESOLUTION: 'true',
                LIBREOFFICE_PDF_MAX_IMAGE_RESOLUTION: '300',
                LIBREOFFICE_PDF_QUALITY: '90',
            }),
        );

        expect(config.pdf).toEqual({
            reduceImageResolution: true,
            maxImageResolution: 300,
            quality: 90,
        });
    });

    it('отбрасывает quality вне диапазона 1..100', () => {
        const config = buildLibreOfficeConfig(
            env({ LIBREOFFICE_PDF_QUALITY: '400' }),
        );

        expect(config.pdf.quality).toBeUndefined();
    });
});
