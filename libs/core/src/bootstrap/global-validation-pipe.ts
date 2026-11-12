import { ValidationPipe, ValidationPipeOptions } from '@nestjs/common';

/**
 * Настройки глобального ValidationPipe всех приложений монорепо.
 *
 * Вынесены отдельно, чтобы тесты DTO проверяли тела ровно теми же правилами,
 * что и прод. Две настройки с подвохом:
 *  - `whitelist` молча срезает свойства без декораторов class-validator
 *    (вложенные классы — только при `@ValidateNested`);
 *  - `enableImplicitConversion` приводит значения к `design:type`; у массива
 *    это `Array`, поэтому массив объектов без `@Type` превращается в массив
 *    массивов — см. `IsObjectArray` в decorators/dto/object-array.decorator.ts.
 */
export const GLOBAL_VALIDATION_PIPE_OPTIONS: Readonly<ValidationPipeOptions> =
    Object.freeze({
        whitelist: true,
        forbidNonWhitelisted: false,
        forbidUnknownValues: false,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    });

export const createGlobalValidationPipe = (): ValidationPipe =>
    new ValidationPipe({ ...GLOBAL_VALIDATION_PIPE_OPTIONS });
