/* enums.ts */
import {
    IsEnum,
    IsString,
    IsNumber,
    IsBoolean,
    IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested, IsArray } from 'class-validator';
/** Тип содержимого поля */
export enum FieldInputType {
    STRING = 'string',
    TEXT = 'text',
}

/** Все code для provider1 */
export enum Provider1FieldCode {
    SHORTNAME = 'provider1_shortname',
    ADDRESS = 'provider1_address',
    INN = 'provider1_inn',
    PHONE = 'provider1_phone',
    EMAIL = 'provider1_email',
    DIRECTOR = 'provider1_director',
    POSITION = 'provider1_position',
    LETTER_TEXT = 'provider1_letter_text',
    PRICE_COEFFICIENT = 'provider1_price_coefficient',
}

/** Все code для provider2 */
export enum Provider2FieldCode {
    SHORTNAME = 'provider2_shortname',
    ADDRESS = 'provider2_address',
    INN = 'provider2_inn',
    PHONE = 'provider2_phone',
    EMAIL = 'provider2_email',
    DIRECTOR = 'provider2_director',
    POSITION = 'provider2_position',
    LETTER_TEXT = 'provider2_letter_text',
    PRICE_COEFFICIENT = 'provider2_price_coefficient',
}

/* field.dto.ts */
export class ProviderOtherFieldDto<TCode extends string> {
    /** ID поля (порядковый) */
    @IsNumber()
    id: number;

    /** Человеко-читаемое название поля */
    @IsString()
    name: string;

    /** Placeholder для UI */
    @IsString()
    placeholder: string;

    /** Код (enum) */
    // @IsEnum(Object)
    @IsString()
    code: TCode | string;

    /** Значение (string | number | null) */
    @IsOptional()
    value: string | number | null;

    /** Тип ввода */
    @IsEnum(FieldInputType)
    type: FieldInputType;

    /** Обязательность */
    @IsBoolean()
    isRequired: boolean;
}

/* provider.dto.ts */

/** Массив полей provider2 */
// export class ProviderOtherDto {
//     @IsArray()
//     @ValidateNested({ each: true })
//     @Type(() => ProviderOtherFieldDto)
//     fields: ProviderOtherFieldDto<ProviderOtherFieldCode>[];
// }

/** Итоговый DTO для тела запроса */
export class OtherProvidersDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProviderOtherFieldDto)
    provider1: ProviderOtherFieldDto<Provider1FieldCode>[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProviderOtherFieldDto)
    provider2: ProviderOtherFieldDto<Provider2FieldCode>[];
}
