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
 * Булев флаг, пришедший из query-строки или multipart/form-data.
 *
 * ОДНО определение на все модули шаблонов (договор, отчёт о поставке,
 * счёт): глобальный пайп у них общий, значит и проблема общая, и
 * расходиться двум копиям этого разбора нельзя.
 *
 * ПОЧЕМУ НЕ `@Type(() => Boolean)`: этот декоратор вызывает конструктор
 * `Boolean(value)`, то есть обычную проверку на truthy. Для непустой
 * строки она ВСЕГДА даёт `true`, поэтому `Boolean('false') === true`.
 * А из HTTP булевы значения приходят именно строками: в query-строке
 * (`?is_archived=false`) и в multipart/form-data (там вообще нет типов).
 *
 * Последствия были реальными и зафиксированы регрессионными тестами:
 *  - `PATCH /:id/active` с `is_active='false'` ВКЛЮЧАЛ шаблон, то есть
 *    выключить его через multipart было невозможно;
 *  - `PATCH /:id/default` с `is_default='false'` СТАВИЛ флаг умолчания и
 *    снимал его у остальных шаблонов области;
 *  - `GET ?is_archived=false` отдавал РОВНО архивные;
 *  - `GET /:id/download?demo=0` отдавал демо-файл вместо шаблона.
 * Валидация при этом молчала: к моменту `@IsBoolean()` значение уже было
 * настоящим булевым, просто не тем.
 *
 * ПОЧЕМУ НЕДОСТАТОЧНО одного `@Transform`: глобальный `ValidationPipe` в
 * `bootstrapApp` включает `transformOptions.enableImplicitConversion`, и
 * неявное приведение по `design:type` выигрывает у пользовательского
 * трансформера — `'false'` снова стало бы `true`. `@Type(() => Object)`
 * убирает примитивную цель приведения, после чего авторитетным остаётся
 * `parseBooleanish`.
 */
export function IsBooleanFlag(): PropertyDecorator {
    return applyDecorators(
        Type(() => Object),
        Transform(parseBooleanish),
        IsBoolean(),
    );
}
