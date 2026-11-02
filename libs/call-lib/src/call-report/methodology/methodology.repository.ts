import type { MethodologyScope } from './methodology.types';

/** Строка таблицы `ai_methodologies` в доменном виде. */
export interface MethodologyRow {
    /** uuid строки (char(36)); генерирует Nest при создании. */
    id: string;
    code: string;
    title: string;
    version: string;
    scope: MethodologyScope;
    /** Домен портала у своей методики; null у общего слоя. */
    portalDomain: string | null;
    /** JSON конфига как есть — проверяет `parseMethodology`. */
    config: unknown;
    isActive: boolean;
    updatedBy: string | null;
    updatedAt: Date | null;
}

/** Данные для создания или правки строки; id null — создать с новым uuid. */
export interface MethodologyUpsert {
    id: string | null;
    code: string;
    title: string;
    version: string;
    scope: MethodologyScope;
    portalDomain: string | null;
    config: unknown;
    isActive: boolean;
    updatedBy: string | null;
}

/**
 * Хранилище методик. Абстрактный класс — токен DI (как у AiRepository):
 * Prisma-реализация в соседнем файле, в тестах — заглушка.
 */
export abstract class MethodologyRepository {
    /**
     * Активная методика кода для домена: своя строка портала важнее строки
     * общего слоя. Таблицы ещё нет или она недоступна — null (реестр
     * возьмёт встроенный конфиг).
     */
    abstract findActive(
        code: string,
        domain: string,
    ): Promise<MethodologyRow | null>;

    /** Активные методики, доступные домену: общий слой плюс свои. */
    abstract listAvailable(domain: string): Promise<MethodologyRow[]>;

    /** Строка по uuid; нет — null. */
    abstract findById(id: string): Promise<MethodologyRow | null>;

    /** Все строки для админки: общий слой и свои методики домена (включая выключенные); без домена — только общий слой. */
    abstract listRows(domain: string | null): Promise<MethodologyRow[]>;

    /** Создать (id null → новый uuid) или обновить строку; дубль кода в слое — ConflictException. */
    abstract upsert(input: MethodologyUpsert): Promise<MethodologyRow>;
}
