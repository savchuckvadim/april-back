import { Transform } from 'class-transformer';
import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
} from 'class-validator';

/**
 * Валидатор для Decimal значений (Prisma Decimal)
 * Принимает строку или число, валидирует и преобразует в строку
 * Prisma автоматически конвертирует строку в Decimal при сохранении
 *
 * @param validationOptions - Опции валидации
 * @example
 * @IsDecimal()
 * own_abs?: string | null;
 */
export function IsDecimal(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        // Регистрируем кастомный валидатор
        registerDecorator({
            name: 'isDecimal',
            target: object.constructor,
            propertyName: propertyName,
            options: {
                message:
                    validationOptions?.message ||
                    'Value must be a valid decimal number (string or number)',
                ...validationOptions,
            },
            validator: {
                validate(value: any, args: ValidationArguments) {
                    // null разрешен для опциональных полей
                    if (value === null || value === undefined) {
                        return true;
                    }

                    // Проверяем, что это строка или число
                    if (typeof value === 'string') {
                        const trimmed = value.trim();
                        if (trimmed === '') return false;
                        const num = Number(trimmed);
                        return !Number.isNaN(num) && Number.isFinite(num);
                    }

                    if (typeof value === 'number') {
                        return Number.isFinite(value) && !Number.isNaN(value);
                    }

                    return false;
                },
                defaultMessage(args: ValidationArguments) {
                    return (
                        (validationOptions?.message as string) ||
                        `${args.property} must be a valid decimal number (string or number)`
                    );
                },
            },
        });
    };
}

/**
 * Декоратор для трансформации значения в строку для Decimal
 * Используется вместе с @IsDecimal()
 */
export function TransformToDecimalString() {
    return Transform(({ value }) => {
        // Если null, undefined или пустая строка - возвращаем null
        if (value === null || value === undefined || value === '') {
            return null;
        }

        // Если уже строка - проверяем, что это валидное число и возвращаем как есть
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed === '') return null;
            // Проверяем, что строка представляет валидное число
            const num = Number(trimmed);
            if (Number.isNaN(num) || !Number.isFinite(num)) {
                return value; // Вернем как есть, валидатор отклонит
            }
            return trimmed;
        }

        // Если число - преобразуем в строку
        if (typeof value === 'number') {
            if (Number.isNaN(value) || !Number.isFinite(value)) {
                return value; // Вернем как есть, валидатор отклонит
            }
            return value.toString();
        }

        return value;
    });
}
