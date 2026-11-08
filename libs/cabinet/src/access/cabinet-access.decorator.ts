import {
    applyDecorators,
    createParamDecorator,
    ExecutionContext,
    InternalServerErrorException,
    SetMetadata,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CabinetAccessLevel } from '../domain/cabinet.constants';
import { CabinetContext, CabinetRequest } from '../domain/cabinet-context';
import { CabinetAccessGuard } from './cabinet-access.guard';
import { CABINET_ACCESS_KEY } from './cabinet-access.constants';

/**
 * Ручка кабинета клиента: Bearer-токен (вход с сайта, сессия фрейма или
 * админка April) + минимальный уровень доступа к порталу `:portalId`.
 */
export const CabinetAccess = (level: CabinetAccessLevel) =>
    applyDecorators(
        SetMetadata(CABINET_ACCESS_KEY, level),
        UseGuards(CabinetAccessGuard),
        ApiBearerAuth(),
        ApiUnauthorizedResponse({
            description: 'Нет токена кабинета или он истёк.',
        }),
        ApiForbiddenResponse({
            description:
                'Нет доступа к порталу, портал отключён или не хватает прав (нужен владелец).',
        }),
    );

/** Контекст кабинета, положенный гардом. */
export const CabinetCtx = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): CabinetContext => {
        const request = ctx.switchToHttp().getRequest<CabinetRequest>();
        if (!request.cabinet) {
            throw new InternalServerErrorException(
                'Ручка кабинета без @CabinetAccess',
            );
        }
        return request.cabinet;
    },
);
