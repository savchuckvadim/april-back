import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
} from 'class-validator';

// Кастомный валидатор для поля которое может быть числом или строкой
export function IsNumberOrString(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isNumberOrString',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any, args: ValidationArguments) {
                    return (
                        typeof value === 'string' || typeof value === 'number'
                    );
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} must be a string or number, or null`;
                },
            },
        });
    };
}
