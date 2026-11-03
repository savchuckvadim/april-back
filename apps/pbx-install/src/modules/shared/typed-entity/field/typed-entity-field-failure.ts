import {
    BadGatewayException,
    ConflictException,
    HttpException,
} from '@nestjs/common';
import { BITRIX_USER_FIELD_LIMIT_CODE } from '@lib/bitrix/core/base/bitrix-benign-error.util';
import { Field } from '../../parse-field-excel';
import {
    IBxTypedEntityFieldsInstallResult,
    IBxTypedFieldInstallError,
} from './typed-entity-field.types';

/**
 * Текст отказа установки полей смарта/RPA, когда Битрикс не принял ни одной
 * команды. До 03.11.2026 наружу уходило голое «не удалось изменить ни одного
 * поля» с HTTP 500: владелец на gsr полчаса искал причину в журналах, а это
 * был лимит пользовательских полей НА ОДНУ СУЩНОСТЬ (AI-смарт со 112 полями
 * новых не принимает, пустой смарт того же портала — принимает; проверено
 * пробой 03.11.2026). Ошибки команд пачки ядро библиотеки не алертит (они
 * ожидаемые), поэтому причину обязана назвать сама ручка.
 */

/** Как называть сущность в тексте: родительный падеж и указательная форма. */
export const TYPED_ENTITY_KIND_TEXT = {
    smart: {
        of: 'смарта',
        this: 'этого смарта',
        inside: 'в самом этом смарте',
    },
    rpa: {
        of: 'RPA',
        this: 'этого RPA-процесса',
        inside: 'в самом этом RPA-процессе',
    },
} as const;

export type TypedEntityKind = keyof typeof TYPED_ENTITY_KIND_TEXT;

export interface TypedFieldInstallFailureText {
    message: string;
    /** Все отказы — лимит полей сущности (повтор без удаления полей бесполезен). */
    entityFieldLimit: boolean;
}

function fieldLabel(fields: readonly Field[], code: string): string {
    const field = fields.find(item => item.code === code);
    return field ? `«${field.name}» (${code})` : code;
}

function opText(detail: IBxTypedFieldInstallError): string {
    return detail.op === 'update' ? 'не обновлено' : 'не создано';
}

export function describeTypedFieldInstallFailure(
    result: Pick<IBxTypedEntityFieldsInstallResult, 'errorDetails'>,
    fields: readonly Field[],
    kind: TypedEntityKind,
): TypedFieldInstallFailureText {
    const text = TYPED_ENTITY_KIND_TEXT[kind];
    const details = result.errorDetails ?? [];
    const limit = details.filter(
        detail => detail.error === BITRIX_USER_FIELD_LIMIT_CODE,
    );
    const other = details.filter(
        detail => detail.error !== BITRIX_USER_FIELD_LIMIT_CODE,
    );

    const parts: string[] = [
        `В Битриксе не удалось изменить ни одного поля ${text.of}`,
    ];
    if (limit.length > 0) {
        const names = limit
            .map(detail => fieldLabel(fields, detail.code))
            .join(', ');
        parts.push(
            `Не создано: ${names} — достигнут лимит пользовательских полей для ${text.this}`,
            'Лимит считается на одну сущность, а не на портал: ' +
                `удалите неиспользуемые поля ${text.inside} и повторите`,
        );
    }
    if (other.length > 0) {
        parts.push(
            other
                .map(
                    detail =>
                        `${fieldLabel(fields, detail.code)} ${opText(detail)}: ` +
                        (detail.description || detail.error || 'без описания'),
                )
                .join('; '),
        );
    }
    if (details.length === 0) {
        parts.push(
            'Битрикс не вернул причину — смотрите журнал запросов портала',
        );
    }
    return {
        message: `${parts.join('. ')}.`,
        entityFieldLimit: limit.length > 0 && other.length === 0,
    };
}

/**
 * Исключение для ручек установки: лимит полей сущности — 409 (состояние
 * портала, повтор без действий владельца бесполезен), прочие отказы — 502.
 */
export function typedFieldInstallFailure(
    result: Pick<IBxTypedEntityFieldsInstallResult, 'errorDetails'>,
    fields: readonly Field[],
    kind: TypedEntityKind,
): HttpException {
    const { message, entityFieldLimit } = describeTypedFieldInstallFailure(
        result,
        fields,
        kind,
    );
    return entityFieldLimit
        ? new ConflictException(message)
        : new BadGatewayException(message);
}
