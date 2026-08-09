import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, ValidationOptions } from 'class-validator';
import { IsBxHookUserId } from './bx-hook-user-id.decorator';

/**
 * Готовое поле DTO «пользователь Bitrix из хука» (`user_123`).
 *
 * Собирает документацию и валидацию разом, чтобы поле нельзя было
 * объявить неправильно:
 *  - Swagger `type: String` и пример `user_123` — робот шлёт строку;
 *  - `@IsBxHookUserId()` извлекает из неё число и валидирует.
 *
 * ПОЧЕМУ строка, а не число: глобальный ValidationPipe работает с
 * `enableImplicitConversion: true`. Если объявить поле как `number`,
 * class-transformer приведёт `'user_447'` к NaN ДО нашей трансформации,
 * и запрос упадёт валидацией. Поэтому в DTO поле типизируется `string`,
 * а в доменный контракт значение переводится числом на сборке item'а.
 *
 * @example
 * export class SomeHookQueryDto {
 *     \@ApiBxHookUserId({ description: 'Ответственный за звонок.' })
 *     responsible: string;
 * }
 */
export function ApiBxHookUserId(options?: {
    /** Описание поля для Swagger (на русском). */
    description?: string;
    /** Поле необязательное — тогда пустое значение пропускается. */
    optional?: boolean;
    validation?: ValidationOptions;
}) {
    const description =
        options?.description ??
        'Идентификатор пользователя Bitrix в формате хука (user_<id>).';
    const apiProperty = options?.optional
        ? ApiPropertyOptional({
              description,
              example: 'user_123',
              type: String,
          })
        : ApiProperty({ description, example: 'user_123', type: String });

    return applyDecorators(
        apiProperty,
        ...(options?.optional ? [IsOptional()] : []),
        IsBxHookUserId(options?.validation),
    );
}
