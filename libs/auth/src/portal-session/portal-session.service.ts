import { Injectable, Logger } from '@nestjs/common';
import { AuthTokenService } from '../services/auth-token.service';
import { AuthUser } from '../types/auth-user.interface';
import { Role } from '../types/role.enum';
import { BitrixProfileClient } from './bitrix-profile.client';
import { normalizePortalDomain } from './portal-session.const';
import {
    PortalSessionOpenInput,
    PortalSessionOpenResult,
} from './portal-session.types';

/**
 * Открытие portal-context сессии для приложений во фрейме Bitrix24
 * (kpi-sales и другие витрины): фронт присылает AUTH_ID из BX24.getAuth(),
 * сервис проверяет его живым REST-вызовом `profile` на портале и выпускает
 * JWT на общем секрете (`AuthTokenService`, role=CLIENT) с доменом,
 * Bitrix-id и признаком администратора. Подделать нельзя: без живого
 * токена фрейма портал профиль не отдаст.
 *
 * Отличие от сессии маркетплейса (apps/pbx): одноразовый код не нужен —
 * фронт держит AUTH_ID сам (его даёт SDK фрейма), а не получает через
 * redirect-URL роутера. Токен живёт в памяти фронта и ходит Bearer'ом
 * (без cookies → нет проблем SameSite/CHIPS в iframe).
 */
@Injectable()
export class PortalSessionService {
    private readonly logger = new Logger(PortalSessionService.name);

    constructor(
        private readonly profiles: BitrixProfileClient,
        private readonly tokens: AuthTokenService,
    ) {}

    async open(
        input: PortalSessionOpenInput,
    ): Promise<PortalSessionOpenResult> {
        const domain = normalizePortalDomain(input.domain);
        if (!domain) {
            return {
                ok: false,
                reason: 'bad_domain',
                message:
                    'Домен портала должен быть именем хоста, например april.bitrix24.ru',
            };
        }
        const verified = await this.profiles.getProfile(
            domain,
            input.accessToken,
        );
        if (!verified.ok) {
            this.logger.warn(
                `Сессия портала ${domain} отклонена: ${verified.error}` +
                    (input.memberId ? ` (member_id=${input.memberId})` : ''),
            );
            return {
                ok: false,
                reason: 'rest_verify_failed',
                message:
                    'Битрикс24 не подтвердил токен фрейма — переоткройте приложение из Битрикс24',
            };
        }
        const { profile } = verified;
        const user: AuthUser = {
            sub: `portal:${domain}:${profile.id}`,
            login: `${profile.id}@${domain}`,
            role: Role.CLIENT,
            domain,
            bitrixUserId: profile.id,
            isAdmin: profile.isAdmin,
        };
        const token = this.tokens.sign(user);
        const { exp } = this.tokens.verify(token);
        return {
            ok: true,
            session: {
                token,
                expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
                domain,
                user: {
                    id: profile.id,
                    name: profile.name,
                    lastName: profile.lastName,
                    isAdmin: profile.isAdmin,
                },
            },
        };
    }
}
