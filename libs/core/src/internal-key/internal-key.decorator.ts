import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse, ApiSecurity } from '@nestjs/swagger';
import {
    APRIL_INTERNAL_KEY_FORBIDDEN_DESCRIPTION,
    APRIL_INTERNAL_KEY_PROTECTED,
    APRIL_INTERNAL_KEY_SECURITY,
} from './internal-key.const';
import { InternalKeyGuard } from './internal-key.guard';

/**
 * Одна пометка на ручку (или на весь контроллер) «только для служебных
 * вызовов»: guard служебного ключа, схема безопасности и ответ 403 в
 * Swagger. Ставится на ручки, которыми пользуется только наша команда, —
 * фронты и роботы Битрикса их не вызывают. Блокирует только в режиме
 * APRIL_INTERNAL_GUARD_MODE=enforce; по умолчанию (report) пропускает и
 * пишет обращение без ключа в журнал.
 */
export function InternalKeyProtected(): MethodDecorator & ClassDecorator {
    return applyDecorators(
        SetMetadata(APRIL_INTERNAL_KEY_PROTECTED, true),
        UseGuards(InternalKeyGuard),
        ApiSecurity(APRIL_INTERNAL_KEY_SECURITY),
        ApiForbiddenResponse({
            description: APRIL_INTERNAL_KEY_FORBIDDEN_DESCRIPTION,
        }),
    );
}
