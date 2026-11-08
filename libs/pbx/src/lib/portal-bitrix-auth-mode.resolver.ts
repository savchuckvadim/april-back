import { Logger } from '@nestjs/common';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { TimedCache } from '@lib/shared';

/**
 * Чем бэкенд ходит в Битрикс портала — настройка `bitrix_auth_mode`:
 * - `webhook` — всегда вебхук портала;
 * - `app` — токен установленного приложения (если установка активна);
 * - `auto` — как было до 07.11.2026: токен приложения, если оно
 *   установлено, иначе вебхук.
 */
export const BITRIX_AUTH_MODES = ['webhook', 'app', 'auto'] as const;
export type BitrixAuthMode = (typeof BITRIX_AUTH_MODES)[number];

/**
 * Без настройки и при сбое чтения — `auto`, то есть ровно прежнее
 * поведение: порталы, которые уже работают через приложение (созданы
 * установкой, вебхука у них нет), не должны уйти на несуществующий вебхук.
 * Действующие порталы защищены не умолчанием, а явной записью `webhook`
 * при установке приложения (MarketplaceLocalAppService).
 */
export const BITRIX_AUTH_MODE_DEFAULT: BitrixAuthMode = 'auto';

/** Режим живёт в памяти процесса минуту — как лимит запросов. */
const AUTH_MODE_TTL_MS = 60_000;

export function parseBitrixAuthMode(raw: unknown): BitrixAuthMode {
    return typeof raw === 'string' &&
        (BITRIX_AUTH_MODES as readonly string[]).includes(raw)
        ? (raw as BitrixAuthMode)
        : BITRIX_AUTH_MODE_DEFAULT;
}

/**
 * Режим авторизации бэкенда для портала — из его «Общих настроек».
 * Читается на каждый `PBXService.init`, поэтому держится в памяти минуту.
 * Сбой чтения не ломает init. Не `@Injectable` — создаётся сервисом PBX,
 * как резолвер лимита запросов.
 */
export class PortalBitrixAuthModeResolver {
    private readonly cache = new TimedCache<BitrixAuthMode>(AUTH_MODE_TTL_MS);

    constructor(
        private readonly settings: PortalAppSettingsService | undefined,
        private readonly logger: Logger,
    ) {}

    async resolve(domain: string): Promise<BitrixAuthMode> {
        const settings = this.settings;
        if (!settings) return BITRIX_AUTH_MODE_DEFAULT;
        try {
            const mode = await this.cache.get(domain, async () =>
                parseBitrixAuthMode(
                    (await settings.resolve(domain, EnumPortalAppCode.portal))
                        .bitrixAuthMode,
                ),
            );
            return mode ?? BITRIX_AUTH_MODE_DEFAULT;
        } catch (error) {
            this.logger.warn(
                `[${domain}] режим авторизации бэкенда не прочитан — ` +
                    `как раньше (auto): ${(error as Error).message}`,
            );
            return BITRIX_AUTH_MODE_DEFAULT;
        }
    }
}
