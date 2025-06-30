import { registerDecorator, ValidationArguments, ValidationOptions } from "class-validator";

// Кастомный валидатор для поля которое может быть объектом, строкой или null
export function IsObjectOrStringOrNull(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isObjectOrStringOrNull',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (value === null || value === undefined) {
                        return true;
                    }
                    return typeof value === 'string' || typeof value === 'object';
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} must be a string, object, or null`;
                }
            }
        });
    };
}