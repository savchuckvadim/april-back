import { BadGatewayException, ConflictException } from '@nestjs/common';
import { Field } from '../../../parse-field-excel';
import {
    describeTypedFieldInstallFailure,
    typedFieldInstallFailure,
} from '../typed-entity-field-failure';
import { IBxTypedFieldInstallError } from '../typed-entity-field.types';

const FIELDS = [
    { code: 'CHECKPOINTS_DONE', name: 'Пунктов методики выполнено' },
    { code: 'SPIRALS_FULL', name: 'Полных спиралей' },
] as unknown as Field[];

/** Ответ Битрикса с прода gsr 03.11.2026 (userfieldconfig.add в пачке). */
const LIMIT: IBxTypedFieldInstallError = {
    code: 'CHECKPOINTS_DONE',
    op: 'add',
    error: 'MAIN_USER_FIELD_LIMIT_EXCEEDED',
    description:
        'Достигнут лимит пользовательских полей, новое поле не создано. ' +
        'Удалите неиспользуемые пользовательские поля и попробуйте ещё раз',
};

const OTHER: IBxTypedFieldInstallError = {
    code: 'SPIRALS_FULL',
    op: 'update',
    error: 'ACCESS_DENIED',
    description: 'Доступ запрещён',
};

describe('describeTypedFieldInstallFailure', () => {
    it('лимит полей смарта: называет поле по-русски, объясняет, что лимит на сущность, а не на портал', () => {
        const { message, entityFieldLimit } = describeTypedFieldInstallFailure(
            { errorDetails: [LIMIT] },
            FIELDS,
            'smart',
        );
        expect(entityFieldLimit).toBe(true);
        expect(message).toContain(
            '«Пунктов методики выполнено» (CHECKPOINTS_DONE)',
        );
        expect(message).toContain(
            'лимит пользовательских полей для этого смарта',
        );
        expect(message).toContain('на одну сущность, а не на портал');
        expect(message).toContain(
            'удалите неиспользуемые поля в самом этом смарте',
        );
        expect(message).not.toContain('MAIN_USER_FIELD_LIMIT_EXCEEDED');
    });

    it('другая ошибка Битрикса: операция и описание по каждому полю', () => {
        const { message, entityFieldLimit } = describeTypedFieldInstallFailure(
            { errorDetails: [OTHER] },
            FIELDS,
            'rpa',
        );
        expect(entityFieldLimit).toBe(false);
        expect(message).toContain('ни одного поля RPA');
        expect(message).toContain(
            '«Полных спиралей» (SPIRALS_FULL) не обновлено: Доступ запрещён',
        );
    });

    it('смесь лимита и другой ошибки — не считается чистым лимитом, но обе причины названы', () => {
        const { message, entityFieldLimit } = describeTypedFieldInstallFailure(
            { errorDetails: [LIMIT, OTHER] },
            FIELDS,
            'smart',
        );
        expect(entityFieldLimit).toBe(false);
        expect(message).toContain(
            'лимит пользовательских полей для этого смарта',
        );
        expect(message).toContain('Доступ запрещён');
    });

    it('без причин от Битрикса — отсылает к журналу, незнакомый код поля остаётся кодом', () => {
        const { message } = describeTypedFieldInstallFailure(
            { errorDetails: [] },
            FIELDS,
            'smart',
        );
        expect(message).toContain('не вернул причину');

        const unknown = describeTypedFieldInstallFailure(
            { errorDetails: [{ ...OTHER, code: 'UNKNOWN_CODE' }] },
            FIELDS,
            'smart',
        );
        expect(unknown.message).toContain('UNKNOWN_CODE не обновлено');
    });
});

describe('typedFieldInstallFailure', () => {
    it('лимит полей сущности — 409, прочее — 502, текст тот же', () => {
        const limit = typedFieldInstallFailure(
            { errorDetails: [LIMIT] },
            FIELDS,
            'smart',
        );
        expect(limit).toBeInstanceOf(ConflictException);
        expect(limit.message).toContain(
            'лимит пользовательских полей для этого смарта',
        );

        const other = typedFieldInstallFailure(
            { errorDetails: [OTHER] },
            FIELDS,
            'smart',
        );
        expect(other).toBeInstanceOf(BadGatewayException);
        expect(other.message).toContain('Доступ запрещён');
    });
});
