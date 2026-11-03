import {
    classifyInstallFieldError,
    fieldLimitSummary,
    type InstallFieldFailure,
} from '../use-cases/install-field-failure.util';

/**
 * Причины отказов создания полей смарта (02.11.2026, gsr): лимит полей
 * портала узнаётся и в теле AxiosError, и в тексте; обрыв сети — отдельно;
 * прочее — как раньше.
 */
describe('classifyInstallFieldError', () => {
    const LIMIT_BODY = {
        error: 'MAIN_USER_FIELD_LIMIT_EXCEEDED',
        error_description:
            'Достигнут лимит пользовательских полей, новое поле не создано. ' +
            'Удалите неиспользуемые пользовательские поля и попробуйте ещё раз',
    };

    it('лимит полей в теле ответа AxiosError — field_limit с описанием Битрикса', () => {
        const error = Object.assign(
            new Error('Request failed with status code 400'),
            { response: { data: LIMIT_BODY } },
        );
        expect(classifyInstallFieldError(error)).toEqual({
            reason: 'field_limit',
            message: LIMIT_BODY.error_description,
        });
    });

    it('лимит полей в тексте исключения — тоже field_limit', () => {
        const error = new Error(
            `Bitrix API error (userfieldconfig.add): ${JSON.stringify(LIMIT_BODY)}`,
        );
        expect(classifyInstallFieldError(error).reason).toBe('field_limit');
    });

    it.each([
        'socket hang up',
        'read ECONNRESET',
        'timeout of 30000ms exceeded',
    ])('«%s» — network', text => {
        expect(classifyInstallFieldError(new Error(text))).toEqual({
            reason: 'network',
            message: text,
        });
    });

    it('прочая ошибка — other, строка тела как описание', () => {
        expect(classifyInstallFieldError(new Error('bitrix error'))).toEqual({
            reason: 'other',
            message: 'bitrix error',
        });
        const denied = Object.assign(
            new Error('Request failed with status code 403'),
            {
                response: { data: 'ACCESS_DENIED' },
            },
        );
        expect(classifyInstallFieldError(denied)).toEqual({
            reason: 'other',
            message: 'ACCESS_DENIED',
        });
        expect(classifyInstallFieldError('строка')).toEqual({
            reason: 'other',
            message: 'строка',
        });
    });
});

describe('fieldLimitSummary', () => {
    it('перечисляет русские названия только полей, упёршихся в лимит', () => {
        const failures: InstallFieldFailure[] = [
            {
                fieldName: 'UF_CRM_7_A',
                title: 'Продвижение сделки по звонку (1-5)',
                reason: 'field_limit',
                message: 'лимит',
            },
            {
                fieldName: 'UF_CRM_7_B',
                title: 'Полных спиралей презентации',
                reason: 'network',
                message: 'socket hang up',
            },
        ];
        const text = fieldLimitSummary('gsr.bitrix24.ru', failures);
        expect(text).toContain('gsr.bitrix24.ru');
        expect(text).toContain('«Продвижение сделки по звонку (1-5)»');
        expect(text).not.toContain('спиралей');
        // Без английских кодов (домен портала — единственная латиница).
        expect(text.replace('gsr.bitrix24.ru', '')).not.toMatch(/[a-z_]{6,}/);
    });
});
