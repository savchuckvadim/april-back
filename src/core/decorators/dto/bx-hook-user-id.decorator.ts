import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsNumber, ValidationOptions, registerDecorator, ValidationArguments } from "class-validator";

/**
 * Декоратор для валидации Bitrix Hook User ID
 * Ожидает формат: "user_123" и извлекает число 123
 *
 * @param validationOptions - Опции валидации, включая кастомное сообщение
 * @example
 * @IsBxHookUserId({ message: 'Поле должно быть в формате user_123' })
 * userId: number;
 */
export function IsBxHookUserId(validationOptions?: ValidationOptions) {
    return applyDecorators(
        Transform(({ value }) => {
            if (value === null || value === undefined || value === '') {
                return value;
            }
            const splitedValue = value.split('_')[1];
            if (splitedValue === null || splitedValue === undefined || splitedValue === '') {
                return splitedValue;
            }
            const num = Number(splitedValue);
            return Number.isNaN(num) ? splitedValue : num;
        }),
        // Простой способ: передать кастомное сообщение через validationOptions
        IsNumber(
            {},
            {
                message: validationOptions?.message || 'Поле должно быть числом в формате user_123',
                ...validationOptions,
            }
        ),
    );
}

/**
 * Альтернативный вариант с полностью кастомным валидатором
 * Используйте этот вариант, если нужна более сложная логика валидации
 */
export function IsBxHookUserIdCustom(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: 'isBxHookUserId',
            target: object.constructor,
            propertyName: propertyName,
            options: {
                message: validationOptions?.message || 'Поле должно быть в формате user_123, где 123 - число',
                ...validationOptions,
            },
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (value === null || value === undefined || value === '') {
                        return true; // или false, в зависимости от требований
                    }

                    // Проверяем, что значение - число
                    if (typeof value === 'number') {
                        return !Number.isNaN(value) && Number.isFinite(value);
                    }

                    // Если строка, проверяем формат user_123
                    if (typeof value === 'string') {
                        const parts = value.split('_');
                        if (parts.length !== 2 || parts[0] !== 'user') {
                            return false;
                        }
                        const num = Number(parts[1]);
                        return !Number.isNaN(num) && Number.isFinite(num);
                    }

                    return false;
                },
                defaultMessage(args: ValidationArguments) {
                    return validationOptions?.message as string ||
                        `Поле ${args.property} должно быть в формате user_123`;
                },
            },
        });
    };
}
