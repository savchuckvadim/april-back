/**
 * Булев флаг из query / multipart для модулей шаблонов документов.
 *
 * Определение переехало в @lib/core (одно на все приложения: тот же
 * приём нужен админке и сайту); здесь — реэкспорт, чтобы импорты шаблонов
 * не менялись. Почему не `@Type(() => Boolean)` — см. описание там.
 */
export {
    IsBooleanFlag,
    parseBooleanish,
} from '@lib/core/decorators/dto/boolean-flag.decorator';
