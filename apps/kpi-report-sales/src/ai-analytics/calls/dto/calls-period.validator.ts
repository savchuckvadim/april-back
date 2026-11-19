import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
} from 'class-validator';
import { CALLS_LIST_MAX_DAYS, CALLS_LIST_MESSAGES } from '../calls-list.const';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Дней в периоде [from; to] включительно; кривая дата — null. */
export function periodDays(from: string, to: string): number | null {
    if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) return null;
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    if (Number.isNaN(start) || Number.isNaN(end)) return null;
    return Math.round((end - start) / DAY_MS) + 1;
}

/** from ≤ to и период не длиннее maxDays дней. */
export function isPeriodWithinDays(
    from: unknown,
    to: unknown,
    maxDays: number = CALLS_LIST_MAX_DAYS,
): boolean {
    if (typeof from !== 'string' || typeof to !== 'string') return false;
    const days = periodDays(from, to);
    return days !== null && days >= 1 && days <= maxDays;
}

/**
 * Валидатор поля `to`: читает `from` из того же объекта. Формат дат
 * проверяют @Matches на самих полях — здесь только порядок и длина.
 */
export function IsCallsListPeriod(
    options?: ValidationOptions,
): PropertyDecorator {
    return (target: object, propertyName: string | symbol): void => {
        registerDecorator({
            name: 'callsListPeriod',
            target: target.constructor,
            propertyName: String(propertyName),
            options: { message: CALLS_LIST_MESSAGES.period, ...options },
            validator: {
                validate(to: unknown, args: ValidationArguments): boolean {
                    const from = (args.object as { from?: unknown }).from;
                    return isPeriodWithinDays(from, to);
                },
            },
        });
    };
}
