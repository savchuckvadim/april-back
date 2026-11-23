import {
    PROVIDER_IMAGE_MAX_BYTES,
    PROVIDER_IMAGE_MAX_SIDE,
} from './lib/provider-image-file.util';
import {
    PROVIDER_IMAGE_ROLE_LABELS,
    PROVIDER_IMAGE_ROLES,
    ProviderImageRole,
} from './provider-image.role';

const MEGABYTES = PROVIDER_IMAGE_MAX_BYTES / (1024 * 1024);

/** Тексты ошибок для админки: по-русски, с тем, что исправить. */
export const PROVIDER_IMAGE_MESSAGES = {
    badRq: 'Реквизиты указаны неверно.',
    rqNotFound: (rqId: number) => `Реквизиты ${rqId} не найдены.`,
    unknownRole: (role: string) =>
        `Неизвестная роль картинки «${role}». Допустимые роли: ${PROVIDER_IMAGE_ROLES.join(', ')}.`,
    noFile: 'Файл не передан: приложите картинку в поле «file».',
    badUpload:
        'Запрос загрузки не разобран: приложите один файл в поле «file».',
    unsupportedFormat:
        'Формат файла не подходит: нужна картинка PNG или JPG. Формат определяется по содержимому файла, имя и расширение не учитываются.',
    unreadable:
        'Файл не читается как картинка: проверьте, что он не повреждён, и загрузите снова.',
    tooLarge: `Файл больше ${MEGABYTES} МБ: уменьшите картинку и загрузите снова.`,
    tooBig: `Картинка больше ${PROVIDER_IMAGE_MAX_SIDE} пикселей по стороне: уменьшите её и загрузите снова.`,
    imageNotFound: (rqId: number, role: ProviderImageRole) =>
        `У реквизитов ${rqId} нет картинки «${PROVIDER_IMAGE_ROLE_LABELS[role]}».`,
    fileMissing: (rqId: number, role: ProviderImageRole) =>
        `Файл картинки «${PROVIDER_IMAGE_ROLE_LABELS[role]}» реквизитов ${rqId} не найден на сервере: загрузите её заново.`,
} as const;
