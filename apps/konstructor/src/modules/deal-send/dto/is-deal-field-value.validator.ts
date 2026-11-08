import {
    ValidationArguments,
    ValidationOptions,
    registerDecorator,
} from 'class-validator';

/** Значение поля сделки: строка, число, флаг или массив строк (множественное поле). */
export const isDealFieldValue = (value: unknown): boolean => {
    if (Array.isArray(value)) {
        return value.every(item => typeof item === 'string');
    }
    return (
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))
    );
};

/**
 * Валидатор значения поля сделки.
 *
 * Он нужен не только для проверки: глобальный ValidationPipe работает с
 * `whitelist: true` и вырезает свойства без декораторов class-validator.
 * Пока у `value` был только `@ApiProperty`, значение терялось на входе,
 * а в Bitrix уходил пустой `crm.deal.update` («полей 0»).
 */
export function IsDealFieldValue(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string): void {
        registerDecorator({
            name: 'isDealFieldValue',
            target: object.constructor,
            propertyName,
            options: validationOptions,
            validator: {
                validate: (value: unknown): boolean => isDealFieldValue(value),
                defaultMessage: (args: ValidationArguments): string =>
                    `${args.property} — строка, число, флаг или массив строк`,
            },
        });
    };
}
