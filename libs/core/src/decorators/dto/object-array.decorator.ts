import { applyDecorators } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
    buildMessage,
    IsArray,
    IsObject,
    isObject,
    ValidateBy,
    ValidationOptions,
} from 'class-validator';

export interface IsObjectArrayOptions extends ValidationOptions {
    /**
     * Пропускать `null`-элементы. Нужно для транзитных массивов фронта:
     * массив с «дырами» (`arr[13] = …` без 0–12 или `delete arr[i]`) JSON
     * отдаёт как `null`. Включать, только если сервис не разбирает элементы.
     */
    allowNullItems?: boolean;
}

/**
 * Массив объектов свободной формы: элементы проверяются на «объект» и
 * доходят до сервиса как есть, без приведения к классу.
 *
 * Почему нельзя просто `@IsArray() @IsObject({ each: true })`:
 * глобальный ValidationPipe работает с `enableImplicitConversion: true`
 * (libs/core/src/bootstrap/global-validation-pipe.ts). Без `@Type`
 * class-transformer берёт тип из `design:type`, а у любого массива это
 * `Array`, — и каждый элемент-объект пересоздаёт как `new Array()` с теми же
 * ключами. Дальше:
 *  - `@IsObject({ each: true })` отвергает такой элемент → 400
 *    («each value in value must be an object») на корректном теле;
 *  - без проверки элементов поля читаются, но `JSON.stringify` даёт `[[]]`,
 *    то есть данные молча теряются в очереди, логе, ответе.
 * `@Type(() => Object)` отключает догадку по `design:type` для элементов.
 *
 * Если элемент — настоящий DTO-класс, нужен не этот декоратор, а
 * `@ValidateNested({ each: true }) @Type(() => ItemDto)`.
 * Регрессию ловит libs/core/src/bootstrap/__tests__/dto-array-item-type.guard.spec.ts.
 */
export function IsObjectArray(options: IsObjectArrayOptions = {}) {
    const { allowNullItems, ...validationOptions } = options;
    const itemCheck = allowNullItems
        ? ValidateBy(
              {
                  name: 'isObjectOrNull',
                  validator: {
                      validate: value => value === null || isObject(value),
                      defaultMessage: buildMessage(
                          eachPrefix =>
                              `${eachPrefix}$property must be an object or null`,
                          { ...validationOptions, each: true },
                      ),
                  },
              },
              { ...validationOptions, each: true },
          )
        : IsObject({ ...validationOptions, each: true });

    return applyDecorators(
        IsArray(validationOptions),
        itemCheck,
        Type(() => Object),
    );
}
