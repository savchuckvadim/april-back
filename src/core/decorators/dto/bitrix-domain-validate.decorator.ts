import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
} from 'class-validator';

export function IsBitrixDomain(validationOptions?: ValidationOptions) {
    return function (object: any, propertyName: string) {
        registerDecorator({
            name: 'IsBitrixDomain',
            target: object.constructor,
            propertyName,
            options: validationOptions,
            validator: {
                validate(value: any) {
                    const regex = /^[a-z0-9-]+\.bitrix24\.ru$/i;
                    return typeof value === 'string' && regex.test(value.trim());
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} must be a Bitrix24 domain like "example.bitrix24.ru" (no https/www).`;
                },
            },
        });
    };
}
