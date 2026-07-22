import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx';

/**
 * Прокси произвольных методов REST API Bitrix по домену портала
 * для внешних агентов (OpenClaw / claude-code).
 *
 * Единственная ответственность: проверить доменную изоляцию ключа агента,
 * получить per-call инстанс bitrix через PBXService.init(domain) и выполнить
 * переданный метод с переданными параметрами через универсальный
 * bitrix.api.call().
 *
 * Инстанс bitrix НЕ оседает в this (правило проекта: в @Injectable-сервисах
 * не хранить this.bitrix, иначе race condition между доменами) — инжектится
 * только PBXService, который отдаёт свежий инстанс на каждый вызов.
 */
@Injectable()
export class BitrixProxyService {
    private readonly logger = new Logger(BitrixProxyService.name);

    constructor(private readonly pbxService: PBXService) {}

    async call(
        domain: string,
        method: string,
        params: Record<string, unknown> = {},
        allowedDomains: string[] | null = null,
    ): Promise<unknown> {
        this.assertDomainAllowed(domain, allowedDomains);

        this.logger.log(`proxy ${method} → ${domain}`);
        const { bitrix } = await this.pbxService.init(domain);

        return bitrix.api.call(method, params);
    }

    /** Доменная изоляция ключа агента: null — без ограничений. */
    private assertDomainAllowed(
        domain: string,
        allowedDomains: string[] | null,
    ): void {
        if (!allowedDomains) return;
        if (!domain || !allowedDomains.includes(domain.toLowerCase())) {
            throw new ForbiddenException(
                'Домен вне разрешённых для этого ключа агента',
            );
        }
    }
}
