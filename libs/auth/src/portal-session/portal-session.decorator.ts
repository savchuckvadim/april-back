import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { PORTAL_SESSION_ENFORCE_KEY } from './portal-session.const';
import { PortalSessionGuard } from './portal-session.guard';

export const PORTAL_SESSION_UNAUTHORIZED_DESCRIPTION =
    'Нет или просрочен portal-context токен (Bearer) — получите его через ' +
    'POST auth/portal-session. В режиме PORTAL_SESSION_GUARD_MODE=report ' +
    'запрос пропускается с записью в лог, в enforce — отклоняется.';

export const PORTAL_SESSION_ENFORCED_UNAUTHORIZED_DESCRIPTION =
    'Нет или просрочен portal-context токен (Bearer) — получите его через ' +
    'POST auth/portal-session. Ручка проверяется всегда, независимо от ' +
    'PORTAL_SESSION_GUARD_MODE.';

export const PORTAL_SESSION_FORBIDDEN_DESCRIPTION =
    'Токен другого портала или пользователя: domain или requesterUserId ' +
    'запроса не совпадают с сессией.';

export interface PortalSessionProtectedOptions {
    /** Проверять всегда, даже в режиме off/report (ручки без права на дыру). */
    enforce?: boolean;
}

/**
 * Одна пометка на мутирующую ручку: guard portal-context сессии плюс
 * описания 401/403 в Swagger. Ставится на метод контроллера (или на
 * класс, если защищены все ручки).
 */
export function PortalSessionProtected(
    options: PortalSessionProtectedOptions = {},
): MethodDecorator & ClassDecorator {
    const enforce = options.enforce === true;
    return applyDecorators(
        ...(enforce ? [SetMetadata(PORTAL_SESSION_ENFORCE_KEY, true)] : []),
        UseGuards(PortalSessionGuard),
        ApiUnauthorizedResponse({
            description: enforce
                ? PORTAL_SESSION_ENFORCED_UNAUTHORIZED_DESCRIPTION
                : PORTAL_SESSION_UNAUTHORIZED_DESCRIPTION,
        }),
        ApiForbiddenResponse({
            description: PORTAL_SESSION_FORBIDDEN_DESCRIPTION,
        }),
    );
}
