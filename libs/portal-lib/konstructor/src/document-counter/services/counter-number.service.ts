import { Injectable } from '@nestjs/common';
import { CounterRepository } from '../repository/counter.repository';
import { CounterType } from '../lib/counter-type.enum';
import {
    formatDocumentNumber,
    fallbackDocumentNumber,
    nextCounterValue,
} from '../lib/counter-format.util';

@Injectable()
export class CounterNumberService {
    constructor(private readonly repo: CounterRepository) {}

    /**
     * Atomically increments the counter and returns the next document number.
     * Uses a DB transaction — two concurrent calls are guaranteed
     * to receive different sequential numbers.
     */
    async getNextNumber(rqId: number, type: CounterType): Promise<string> {
        const pivot = await this.repo.findPivot(rqId, type);

        if (!pivot) {
            return fallbackDocumentNumber(rqId);
        }

        const newCount = await this.repo.incrementAndGet(
            pivot.rq_id,
            pivot.counter_id,
            pivot.size,
        );

        return formatDocumentNumber(pivot, newCount);
    }

    /**
     * Returns the current counter value formatted as a document number,
     * without incrementing.
     */
    async peekCurrentNumber(rqId: number, type: CounterType): Promise<string> {
        const pivot = await this.repo.findPivot(rqId, type);

        if (!pivot) {
            return fallbackDocumentNumber(rqId);
        }

        return formatDocumentNumber(pivot, pivot.count);
    }

    /**
     * Возвращает номер, который выдаст следующий getNextNumber, без записи
     * в базу: счётчик остаётся прежним. Шаг считается той же функцией
     * nextCounterValue, что и инкремент в репозитории. Если между просмотром
     * и выдачей номер возьмёт другой документ, выданное число окажется больше.
     */
    async previewNextNumber(rqId: number, type: CounterType): Promise<string> {
        const pivot = await this.repo.findPivot(rqId, type);

        if (!pivot) {
            return fallbackDocumentNumber(rqId);
        }

        return formatDocumentNumber(
            pivot,
            nextCounterValue(pivot.count, pivot.size),
        );
    }

    /**
     * Set cirrent value
     * почти админский ендпоинт при котором задается значение от которого будет отсчитываться
     *
     *
     */
    async setCurrent(
        rqId: number,
        type: CounterType,
        value: number,
    ): Promise<string> {
        // ищем существующую pivot таблицу
        const pivot = await this.repo.findPivot(rqId, type);

        if (!pivot) {
            //если не находим -
            return fallbackDocumentNumber(rqId);
        }

        const newCount = await this.repo.setCurrent(
            pivot.rq_id,
            pivot.counter_id,
            value,
        );

        return formatDocumentNumber(pivot, newCount);
    }
}
