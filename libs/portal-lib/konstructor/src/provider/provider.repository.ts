import {
    CreateProviderWithRqInput,
    ProviderEntityWithRq,
    RqEntity,
    RqUpdateInput,
} from './provider.entity';

export abstract class ProviderRepository {
    // ---- Read ----
    abstract findById(id: number): Promise<RqEntity | null>;
    abstract findByDomain(code: string): Promise<ProviderEntityWithRq[] | null>;
    abstract findMany(): Promise<RqEntity[] | null>;

    // ---- Create ----
    /** Создаёт поставщика (agents) вместе с его реквизитами (rqs). */
    abstract createWithRq(
        input: CreateProviderWithRqInput,
    ): Promise<ProviderEntityWithRq>;

    // ---- Update ----
    /**
     * Обновляет реквизиты (rqs) по id и, если передан `withTax`, признак
     * работы с НДС поставщика (agents) одной транзакцией. Возвращает null,
     * если запись не найдена.
     */
    abstract updateRq(
        id: number,
        data: RqUpdateInput,
    ): Promise<RqEntity | null>;

    // ---- Delete ----
    /** Удаляет поставщика вместе с его реквизитами. true — если что-то удалено. */
    abstract delete(id: number): Promise<boolean>;
}
