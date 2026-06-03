import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNumber, ValidationOptions } from 'class-validator';

export function IsNumeric(validationOptions?: ValidationOptions) {
    return applyDecorators(
        Transform(({ value }) => {
            if (value === null || value === undefined || value === '') {
                return value;
            }

            const num = Number(value);
            return Number.isNaN(num) ? value : num;
        }),
        IsNumber({}, validationOptions),
    );
}
