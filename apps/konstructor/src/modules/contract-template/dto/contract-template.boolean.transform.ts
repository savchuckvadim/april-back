/**
 * Булев флаг из query / multipart.
 *
 * Реализация ОДНА на все модули шаблонов и живёт в общей библиотеке
 * (`@lib/portal-lib/konstructor/document-template`): глобальный
 * `ValidationPipe` у них общий, значит и проблема `Boolean('false') === true`
 * общая. Две копии этого разбора неизбежно разошлись бы, поэтому здесь
 * только реэкспорт — ради привычного пути импорта внутри модуля.
 */
export {
    IsBooleanFlag,
    parseBooleanish,
} from '@lib/portal-lib/konstructor/document-template';
