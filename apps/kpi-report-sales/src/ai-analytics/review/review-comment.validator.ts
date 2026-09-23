import { ValidateBy, ValidationOptions } from 'class-validator';
import { AI_REVIEW_MESSAGES } from '../constants/ai-review.const';

/** Объект отзыва, как его видит валидатор: нужен только вердикт. */
interface ReviewLike {
    verdict?: unknown;
}

/**
 * Комментарий обязателен при частичном согласии и несогласии; при полном
 * согласии может отсутствовать. Отдельный валидатор, а не второй
 * `@ValidateIf`: class-validator объединяет все `@ValidateIf` свойства
 * через И, и условие «обязателен только при несогласии» второй пометкой
 * не выразить, не отключив заодно проверку типа и длины при согласии.
 */
export function IsCommentRequiredUnlessAgreed(
    options?: ValidationOptions,
): PropertyDecorator {
    return ValidateBy(
        {
            name: 'isCommentRequiredUnlessAgreed',
            validator: {
                validate: (value: unknown, args): boolean =>
                    (args?.object as ReviewLike | undefined)?.verdict ===
                        'agree' ||
                    (typeof value === 'string' && value.trim().length > 0),
                defaultMessage: (): string =>
                    AI_REVIEW_MESSAGES.commentRequired,
            },
        },
        options,
    );
}
