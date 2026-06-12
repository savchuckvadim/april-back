import { UnprocessableEntityException } from '@nestjs/common';
import { rethrowTaskUserFieldError } from './task-userfield-access.util';

/** Собирает axios-подобную ошибку Bitrix с заданным error_description. */
const bxError = (description: string): unknown => ({
    response: { data: { error: 'ERROR_CORE', error_description: description } },
});

describe('rethrowTaskUserFieldError', () => {
    it('маппит легаси "Action not allowed" в 422 с инструкцией', () => {
        expect(() =>
            rethrowTaskUserFieldError(bxError('Action not allowed<br>')),
        ).toThrow(UnprocessableEntityException);
        try {
            rethrowTaskUserFieldError(bxError('Action not allowed<br>'));
        } catch (e) {
            expect((e as UnprocessableEntityException).message).toContain(
                'UserFieldAccess',
            );
            expect((e as UnprocessableEntityException).message).toContain(
                'Action not allowed',
            );
        }
    });

    it('маппит "No settings for UserFieldAccess" (userfieldconfig) в 422', () => {
        expect(() =>
            rethrowTaskUserFieldError(
                bxError('No settings for UserFieldAccess'),
            ),
        ).toThrow(UnprocessableEntityException);
    });

    it('пробрасывает прочие ошибки без изменений', () => {
        const original = new Error(
            'В битриксе не удалось изменить ни одного поля',
        );
        expect(() => rethrowTaskUserFieldError(original)).toThrow(original);
    });

    it('пробрасывает ошибку без response.data как есть', () => {
        const original = new Error('socket hang up');
        expect(() => rethrowTaskUserFieldError(original)).toThrow(original);
        expect(() => rethrowTaskUserFieldError(original)).not.toThrow(
            UnprocessableEntityException,
        );
    });
});
