import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { PortalSessionGuard } from './portal-session.guard';

export const PORTAL_SESSION_UNAUTHORIZED_DESCRIPTION =
    'Нет или просрочен portal-context токен (Bearer) — получите его через ' +
    'POST auth/portal-session. В режиме PORTAL_SESSION_GUARD_MODE=report ' +
    'запрос пропускается с записью в лог, в enforce — отклоняется.';

export const PORTAL_SESSION_FORBIDDEN_DESCRIPTION =
    'Токен другого портала или пользователя: domain или requesterUserId ' +
    'запроса не совпадают с сессией.';

/**
 * Одна пометка на мутирующую ручку: guard portal-context сессии плюс
 * описания 401/403 в Swagger. Ставится на метод контроллера (или на
 * класс, если защищены все ручки).
 */
export function PortalSessionProtected(): MethodDecorator & ClassDecorator {
    return applyDecorators(
        UseGuards(PortalSessionGuard),
        ApiUnauthorizedResponse({
            description: PORTAL_SESSION_UNAUTHORIZED_DESCRIPTION,
        }),
        ApiForbiddenResponse({
            description: PORTAL_SESSION_FORBIDDEN_DESCRIPTION,
        }),
    );
}
