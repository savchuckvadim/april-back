import { Inject, Injectable, Logger } from '@nestjs/common';
import { lookup } from 'dns/promises';
import {
    LIBRE_OFFICE_CONFIG,
    LibreOfficeConfig,
} from '../config/libre-office.config';

/**
 * Отдаёт актуальный список инстансов конвертации.
 *
 * В режиме dns каждый хост из LIBREOFFICE_HTTP_URL резолвится во ВСЕ адреса:
 * docker DNS возвращает по имени сервиса адреса всех его реплик, поэтому
 * `deploy.replicas: 4` автоматически превращается в пул из 4 инстансов —
 * ни env, ни код менять не нужно, топология описана только в compose.
 */
@Injectable()
export class LibreOfficeEndpointResolver {
    private readonly logger = new Logger(LibreOfficeEndpointResolver.name);

    constructor(
        @Inject(LIBRE_OFFICE_CONFIG) private readonly config: LibreOfficeConfig,
    ) {}

    async resolve(): Promise<string[]> {
        if (this.config.discovery === 'static') {
            return this.config.endpoints;
        }

        const resolved = await Promise.all(
            this.config.endpoints.map(url => this.resolveOne(url)),
        );
        const endpoints = [...new Set(resolved.flat())];
        if (endpoints.length === 0) {
            throw new Error(
                `Ни один хост не разрешился в адреса: ${this.config.endpoints.join(', ')}`,
            );
        }
        return endpoints;
    }

    /**
     * Один URL → список URL по адресам его хоста. Берём только IPv4:
     * в docker-сетях IPv6 обычно выключен, а `localhost` иначе даёт два
     * адреса на один и тот же инстанс и завысил бы параллелизм вдвое.
     */
    private async resolveOne(baseUrl: string): Promise<string[]> {
        let parsed: URL;
        try {
            parsed = new URL(baseUrl);
        } catch {
            this.logger.warn(
                `Некорректный URL инстанса, пропускаю: ${baseUrl}`,
            );
            return [];
        }

        try {
            const addresses = await lookup(parsed.hostname, {
                all: true,
                family: 4,
            });
            if (addresses.length === 0) {
                return [baseUrl];
            }
            return addresses.map(({ address }) => {
                const withAddress = new URL(baseUrl);
                withAddress.hostname = address;
                return withAddress.origin;
            });
        } catch (error) {
            this.logger.warn(
                `Не удалось разрешить ${parsed.hostname}: ${(error as Error).message}. Оставляю ${baseUrl} как есть.`,
            );
            return [baseUrl];
        }
    }
}
