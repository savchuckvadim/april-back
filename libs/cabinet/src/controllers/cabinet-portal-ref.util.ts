import { ForbiddenException } from '@nestjs/common';
import type { LocalAppPortalRef } from '@lib/marketplace-core';
import type { CabinetContext } from '../domain/cabinet-context';

/**
 * Портал запроса для подключения Битрикс24: домен и member_id. Портал
 * гарантирует гард кабинета (`:portalId`); его нет — доступ запрещён.
 */
export function portalRefOf(ctx: CabinetContext): LocalAppPortalRef {
    if (!ctx.portal) {
        throw new ForbiddenException('Портал не определён');
    }
    return { domain: ctx.portal.domain, memberId: ctx.portal.memberId };
}
