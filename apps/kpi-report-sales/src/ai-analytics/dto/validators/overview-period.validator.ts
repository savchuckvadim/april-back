import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import { AI_ANALYTICS_OVERVIEW_MAX_MONTHS } from '../../constants/ai-overview.const';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Последний допустимый день периода: from + maxMonths месяцев − 1 день. */
export function maxPeriodEnd(
    from: string,
    maxMonths = AI_ANALYTICS_OVERVIEW_MAX_MONTHS,
): string {
    const [year, month, day] = from.split('-').map(Number);
    const end = new Date(Date.UTC(year, month - 1 + maxMonths, day - 1));
    return end.toISOString().slice(0, 10);
}

/** from ≤ to и период не длиннее maxMonths месяцев (план 6.2: ≤ 3 мес.). */
export function isOverviewPeriodValid(
    from: unknown,
    to: unknown,
    maxMonths = AI_ANALYTICS_OVERVIEW_MAX_MONTHS,
): boolean {
    if (typeof from !== 'string' || typeof to !== 'string') return false;
    if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) return false;
    return from <= to && to <= maxPeriodEnd(from, maxMonths);
}

/**
 * Валидатор поля `to`: читает `from` из того же объекта. Формат дат
 * проверяют @Matches на самих полях — здесь только порядок и длина.
 */
@ValidatorConstraint({ name: 'overviewPeriod', async: false })
export class OverviewPeriodConstraint implements ValidatorConstraintInterface {
    validate(to: unknown, args: ValidationArguments): boolean {
        const from = (args.object as { from?: unknown }).from;
        return isOverviewPeriodValid(from, to);
    }

    defaultMessage(): string {
        return `период должен быть не длиннее ${AI_ANALYTICS_OVERVIEW_MAX_MONTHS} мес. и from ≤ to`;
    }
}

export function IsOverviewPeriod(
    options?: ValidationOptions,
): PropertyDecorator {
    return (target: object, propertyName: string | symbol): void => {
        registerDecorator({
            target: target.constructor,
            propertyName: String(propertyName),
            options,
            validator: OverviewPeriodConstraint,
        });
    };
}
