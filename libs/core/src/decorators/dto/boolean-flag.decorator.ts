import { applyDecorators } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsBoolean } from 'class-validator';

/** Строки, которые считаются «да» / «нет» в query и multipart. */
const TRUE_VALUES = ['1', 'true', 'yes', 'on'];
const FALSE_VALUES = ['0', 'false', 'no', 'off', ''];

/**
 * Разбор булева флага, пришедшего строкой (query, multipart/form-data).
 *
 * Нераспознанное значение возвращается как есть: решение «400 или нет»
 * принимает `@IsBoolean()`, а не трансформер — иначе мусор вроде `'ага'`
 * молча стал бы `true`.
 */
export const parseBooleanish = ({ value }: { value: unknown }): unknown => {
    if (typeof value === 'boolean' || value == null) {
        return value;
    }
    if (typeof value === 'number') {
        if (value === 1) {
            return true;
        }
        if (value === 0) {
            return false;
        }
        return value;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (TRUE_VALUES.includes(normalized)) {
            return true;
        }
        if (FALSE_VALUES.includes(normalized)) {
            return false;
        }
    }
    return value;
};

/**
 * Булев флаг, пришедший из query-строки, multipart/form-data или JSON.
 *
 * ОДНО определение на все приложения монорепо (раньше жило в шаблонах
 * документов konstructor, там остался реэкспорт): глобальный пайп у всех
 * общий, значит и проблема общая.
 *
 * ПОЧЕМУ НЕ `@Type(() => Boolean)` и не `@IsBoolean()` без разбора: оба
 * пути приводят значение конструктором `Boolean(value)`, то есть проверкой
 * на truthy. Для непустой строки она ВСЕГДА даёт `true`:
 * `Boolean('false') === true`. А из HTTP булевы значения приходят именно
 * строками — в query-строке (`?flag=false`) и в multipart/form-data.
 *
 * ПОЧЕМУ НЕДОСТАТОЧНО одного `@Transform(({ value }) => …)`: глобальный
 * `ValidationPipe` в `bootstrapApp` включает
 * `transformOptions.enableImplicitConversion`, и class-transformer СНАЧАЛА
 * приводит значение по `design:type` (Boolean), а уже потом зовёт
 * пользовательский трансформер — тот получает готовое `true` вместо
 * `'false'`. `@Type(() => Object)` убирает примитивную цель приведения,
 * после чего авторитетным остаётся `parseBooleanish`.
 *
 * Последствия ошибки были реальными: в шаблонах документов `'false'`
 * включал шаблон и ставил флаг умолчания; в ручках AI-аналитики админки
 * строка `'false'` в `forceRefresh` / `dryRun` становилась `true`.
 */
export function IsBooleanFlag(): PropertyDecorator {
    return applyDecorators(
        Type(() => Object),
        Transform(parseBooleanish),
        IsBoolean(),
    );
}
