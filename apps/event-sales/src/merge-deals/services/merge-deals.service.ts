import { Injectable } from '@nestjs/common';
import {
    MergeDealsHealthResponseDto,
    MergeDealsRequestDto,
    MergeDealsResponseDto,
} from '../dto/merge-deals.dto';

/** Имя модуля — единая точка правды для ответов и логов. */
export const MERGE_DEALS_MODULE_NAME = 'merge-deals';

/** Текст-пояснение заглушки, чтобы клиент не считал слияние выполненным. */
export const MERGE_DEALS_STUB_MESSAGE =
    'Модуль merge-deals подключён как заглушка: сделки в Битрикс не изменялись.';

/**
 * Сервис объединения сделок.
 *
 * Сейчас — заглушка: маршруты доступны и типизированы (в том числе в Swagger),
 * но доменная логика ещё не подключена, обращений к Bitrix нет. Когда логика
 * появится, инстанс Bitrix берётся здесь через `PBXService.init(domain)` —
 * инстанс не сохраняется в поля сервиса (иначе race condition между порталами).
 */
@Injectable()
export class MergeDealsService {
    /** Smoke-проверка: модуль поднят и его маршруты обслуживаются. */
    getHealth(): MergeDealsHealthResponseDto {
        return {
            status: 'ok',
            module: MERGE_DEALS_MODULE_NAME,
            implemented: false,
        };
    }

    /**
     * Заглушка объединения: валидированный запрос возвращается эхом
     * со статусом `not_implemented`, никакие сделки не изменяются.
     */
    merge(dto: MergeDealsRequestDto): MergeDealsResponseDto {
        return {
            status: 'not_implemented',
            domain: dto.domain,
            targetDealId: dto.targetDealId,
            sourceDealIds: [...dto.sourceDealIds],
            message: MERGE_DEALS_STUB_MESSAGE,
        };
    }
}
