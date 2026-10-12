import {
    ValidationArguments,
    ValidationOptions,
    registerDecorator,
} from 'class-validator';
import {
    SUPPLY_REPORT_FIELD_CODES,
    findUnknownFieldCodes,
} from '../lib/supply-report-field-codes';

/**
 * Проверка кодов полей формы отчёта о поставке НА ЗАПИСИ.
 *
 * Почему это обязательно, а не «на всякий случай»: разбор списков из
 * LongText (`parseTemplateList*`) устроен fail-open — неизвестный код
 * молча отбрасывается, а пустой результат означает «годится любому».
 * Без валидации на входе опечатка администратора («sale_dat») дала бы
 * шаблон с пустым списком полей, то есть МОЛЧА расширила бы его область
 * применения вместо ошибки. Поэтому мусор режется здесь, а fail-open в
 * резолвере остаётся только для легаси-строк.
 */
export function IsSupplyReportFieldCodeArray(
    validationOptions?: ValidationOptions,
) {
    return function (object: object, propertyName: string): void {
        registerDecorator({
            name: 'isSupplyReportFieldCodeArray',
            target: object.constructor,
            propertyName,
            options: validationOptions,
            validator: {
                validate(value: unknown): boolean {
                    if (!Array.isArray(value)) {
                        return false;
                    }
                    if (value.some(item => typeof item !== 'string')) {
                        return false;
                    }
                    return (
                        findUnknownFieldCodes(value as string[]).length === 0
                    );
                },
                defaultMessage(args: ValidationArguments): string {
                    const value: unknown = args.value;
                    if (!Array.isArray(value)) {
                        return `${args.property} должен быть массивом кодов полей формы отчёта`;
                    }
                    const unknown = findUnknownFieldCodes(
                        value.filter(
                            (item): item is string => typeof item === 'string',
                        ),
                    );
                    const listed = unknown.length > 0 ? unknown.join(', ') : '';
                    return (
                        `${args.property}: неизвестные коды полей формы отчёта` +
                        (listed ? ` (${listed})` : '') +
                        `. Допустимы: ${SUPPLY_REPORT_FIELD_CODES.join(', ')}`
                    );
                },
            },
        });
    };
}
