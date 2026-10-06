import { Injectable } from '@nestjs/common';
import {
    DuplicateSearchService,
    RelatedEntitiesService,
    SignalFieldMapService,
} from '@lib/portal-lib/pbx-duplicate';
import { TimedCache } from '@lib/shared';
import {
    DuplicateDetailsRequestDto,
    DuplicateDetailsResponseDto,
    DuplicateFieldMapResponseDto,
    SearchDuplicatesRequestDto,
    SearchDuplicatesResponseDto,
} from '../dto/duplicates.dto';

/**
 * Сколько живёт ответ «связи клиента» в памяти процесса.
 *
 * Связи открывают сразу несколько блоков фрейма (история, контакты,
 * пересечения) и несколько менеджеров одного клиента — каждый такой
 * запрос стоил 8–9 обращений к Битриксу (разбор нагрузки 05.10.2026).
 * Срок короткий: новые сделки после отчёта доедут почти сразу.
 */
const DETAILS_TTL_MS = 15_000;

/** Потолок записей: ключ — клиент, клиентов за день сотни. */
const MAX_CACHED_CLIENTS = 300;

/**
 * Оркестрация поиска дублей для фрейма отдела продаж.
 *
 * Вся доменная логика живёт в `@lib/portal-lib/pbx-duplicate` — здесь только
 * перекладывание DTO, чтобы тот же поиск можно было выставить и в админке
 * со своей авторизацией.
 *
 * Одинаковые одновременные запросы склеиваются: второй ждёт ответ первого,
 * а не идёт в Битрикс заново. Ответ связей ещё и коротко помнится.
 */
@Injectable()
export class DuplicatesUseCase {
    private readonly details = new TimedCache<DuplicateDetailsResponseDto>(
        DETAILS_TTL_MS,
        Date.now,
        MAX_CACHED_CLIENTS,
    );
    /** Срок 0 — без кэша: поиск кэширует себя сам, здесь только склейка. */
    private readonly searches = new TimedCache<SearchDuplicatesResponseDto>(0);

    constructor(
        private readonly search: DuplicateSearchService,
        private readonly related: RelatedEntitiesService,
        private readonly fieldMap: SignalFieldMapService,
    ) {}

    async searchDuplicates(
        dto: SearchDuplicatesRequestDto,
    ): Promise<SearchDuplicatesResponseDto> {
        const key = JSON.stringify([
            dto.domain,
            dto.entityType,
            dto.entityId,
            dto.raw,
            dto.level ?? 1,
            dto.targetTypes,
            dto.force,
        ]);
        const result = await this.searches.get(key, async () => {
            const found = await this.search.search(dto.domain, {
                entityType: dto.entityType,
                entityId: dto.entityId,
                raw: dto.raw,
                level: dto.level ?? 1,
                targetTypes: dto.targetTypes,
                force: dto.force,
            });
            return found as SearchDuplicatesResponseDto;
        });
        // load всегда отдаёт значение — undefined здесь невозможен.
        return result as SearchDuplicatesResponseDto;
    }

    async getDetails(
        dto: DuplicateDetailsRequestDto,
    ): Promise<DuplicateDetailsResponseDto> {
        const key = [
            dto.domain,
            dto.entityType,
            dto.entityId,
            dto.includeClosed ? 1 : 0,
        ].join('|');
        const result = await this.details.get(key, async () => {
            const related = await this.related.getRelated(
                dto.domain,
                dto.entityType,
                dto.entityId,
                { includeClosed: dto.includeClosed },
            );
            return related as DuplicateDetailsResponseDto;
        });
        return result as DuplicateDetailsResponseDto;
    }

    async getFieldMap(domain: string): Promise<DuplicateFieldMapResponseDto> {
        const map = await this.fieldMap.getFieldMap(domain);
        return map as DuplicateFieldMapResponseDto;
    }

    async rescanFieldMap(
        domain: string,
    ): Promise<DuplicateFieldMapResponseDto> {
        const map = await this.fieldMap.rescan(domain);
        return map as DuplicateFieldMapResponseDto;
    }
}
