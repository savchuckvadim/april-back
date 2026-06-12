import { UnprocessableEntityException } from '@nestjs/common';

/**
 * Маркеры ответа Bitrix, означающие что управление пользовательскими полями
 * задач недоступно: на портале не инициализирована подсистема прав доступа
 * к полям задач (UserFieldAccess) модуля «Задачи».
 *
 * - `Action not allowed` — легаси-методы `task.item.userfield.*`;
 * - `UserFieldAccess`     — современный `userfieldconfig.*` для moduleId=tasks.
 */
const TASK_UF_ACCESS_MARKERS = [
    'Action not allowed',
    'UserFieldAccess',
] as const;

interface BxAxiosErrorShape {
    response?: { data?: { error?: string; error_description?: string } };
}

/** Достаёт `error_description` из ответа Bitrix (axios-ошибки), если он есть. */
function extractBxDescription(error: unknown): string {
    return (
        (error as BxAxiosErrorShape)?.response?.data?.error_description ?? ''
    );
}

/**
 * Если ошибка — это отказ Bitrix в доступе к пользовательским полям задач,
 * бросает понятный `422` с инструкцией для администратора портала; иначе
 * пробрасывает исходную ошибку без изменений.
 *
 * Возвращаемый тип `never` — функция всегда завершает выполнение броском.
 */
export function rethrowTaskUserFieldError(error: unknown): never {
    const description = extractBxDescription(error);
    const isAccessError = TASK_UF_ACCESS_MARKERS.some(marker =>
        description.includes(marker),
    );
    if (isAccessError) {
        throw new UnprocessableEntityException(
            'Bitrix отклонил операцию с пользовательскими полями задач: на ' +
                'портале не настроена подсистема прав доступа к полям задач ' +
                '(UserFieldAccess) модуля «Задачи». Откройте на портале ' +
                '«Задачи → Настройки → Права доступа» и сконфигурируйте роли, ' +
                'либо создайте поле задачи вручную в интерфейсе. ' +
                `Ответ Bitrix: «${description}».`,
        );
    }
    throw error;
}
