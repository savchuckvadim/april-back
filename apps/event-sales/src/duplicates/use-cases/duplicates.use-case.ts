import { Injectable } from '@nestjs/common';
import {
    DuplicateSearchService,
    RelatedEntitiesService,
    SignalFieldMapService,
} from '@lib/portal-lib/pbx-duplicate';
import {
    DuplicateDetailsRequestDto,
    DuplicateDetailsResponseDto,
    DuplicateFieldMapResponseDto,
    SearchDuplicatesRequestDto,
    SearchDuplicatesResponseDto,
} from '../dto/duplicates.dto';

/**
 * Оркестрация поиска дублей для фрейма отдела продаж.
 *
 * Вся доменная логика живёт в `@lib/portal-lib/pbx-duplicate` — здесь только
 * перекладывание DTO, чтобы тот же поиск можно было выставить и в админке
 * со своей авторизацией.
 */
@Injectable()
export class DuplicatesUseCase {
    constructor(
        private readonly search: DuplicateSearchService,
        private readonly related: RelatedEntitiesService,
        private readonly fieldMap: SignalFieldMapService,
    ) {}

    async searchDuplicates(
        dto: SearchDuplicatesRequestDto,
    ): Promise<SearchDuplicatesResponseDto> {
        const result = await this.search.search(dto.domain, {
            entityType: dto.entityType,
            entityId: dto.entityId,
            raw: dto.raw,
            level: dto.level ?? 1,
            targetTypes: dto.targetTypes,
            force: dto.force,
        });
        return result as SearchDuplicatesResponseDto;
    }

    async getDetails(
        dto: DuplicateDetailsRequestDto,
    ): Promise<DuplicateDetailsResponseDto> {
        const result = await this.related.getRelated(
            dto.domain,
            dto.entityType,
            dto.entityId,
            { includeClosed: dto.includeClosed },
        );
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
