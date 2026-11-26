import {
    registerDecorator,
    type ValidationArguments,
    type ValidationOptions,
} from 'class-validator';
import { PORTAL_VIEW_MESSAGES } from '../portal-view.const';
import { reportViewLabelsProblem } from '../portal-view-labels.util';

/**
 * Свои названия показателей в теле запроса: объект «ключ → название»,
 * ключи по шаблону (`ev:`/`call:`/`plan:` и код), названия — строки не
 * длиннее предела после обрезки пробелов, записей — не больше предела.
 * Сообщение — по первой найденной причине. Есть ли ключ в каталоге
 * показателей портала, проверяет use-case.
 */
export function IsReportViewLabels(
    options?: ValidationOptions,
): PropertyDecorator {
    return (target: object, propertyName: string | symbol): void => {
        registerDecorator({
            name: 'reportViewLabels',
            target: target.constructor,
            propertyName: String(propertyName),
            options,
            validator: {
                validate(value: unknown): boolean {
                    return reportViewLabelsProblem(value) === null;
                },
                defaultMessage(args: ValidationArguments): string {
                    const problem = reportViewLabelsProblem(args.value);
                    return PORTAL_VIEW_MESSAGES[problem ?? 'labelsShape'];
                },
            },
        });
    };
}
