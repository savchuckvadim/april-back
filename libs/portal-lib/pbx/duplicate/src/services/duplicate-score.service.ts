import { Injectable } from '@nestjs/common';
import {
    DUPLICATE_ENTITY_TYPE_ID,
    DUPLICATE_MATCH_WEIGHTS,
    DUPLICATE_SCORE_THRESHOLD,
    DuplicateCandidate,
    DuplicateEntityType,
    DuplicateMatchReason,
    DuplicateRawHit,
    DuplicateSignalKind,
    SEARCH_VIA,
} from '../type/duplicate.type';

/** Сущности, которые исключаем из выдачи (источник поиска и его связи). */
export interface ExcludedRef {
    entityType: DuplicateEntityType;
    id: number;
}

/**
 * Схлопывание сырых попаданий в ранжированный список кандидатов.
 *
 * Чистая логика без сети: одна и та же компания приходит и из findbycomm по
 * телефону, и из поиска по ИНН — менеджеру нужна одна карточка с двумя
 * причинами и понятным «насколько это точно».
 */
@Injectable()
export class DuplicateScoreService {
    /**
     * @param minScore порог отсечки; `0` — отдать всё, что нашли
     *        (режим «показать все» в UI).
     */
    score(
        hits: DuplicateRawHit[],
        excluded: ExcludedRef[] = [],
        minScore = DUPLICATE_SCORE_THRESHOLD,
    ): DuplicateCandidate[] {
        const excludedKeys = new Set(
            excluded.map(ref => this.key(ref.entityType, ref.id)),
        );

        const byEntity = new Map<string, DuplicateCandidate>();
        // Причина учитывается один раз: два поля с одним и тем же ИНН — это
        // по-прежнему одно совпадение, а не двойной вес.
        const countedReasons = new Set<string>();

        for (const hit of hits) {
            const key = this.key(hit.entityType, hit.id);
            if (excludedKeys.has(key)) continue;

            const candidate = byEntity.get(key) ?? {
                entityType: hit.entityType,
                entityTypeId: DUPLICATE_ENTITY_TYPE_ID[hit.entityType],
                id: hit.id,
                title: hit.title,
                score: 0,
                reasons: [] as DuplicateMatchReason[],
            };

            // Название приходит только из list-команд — забираем первое непустое.
            if (!candidate.title && hit.title) candidate.title = hit.title;

            const reasonKey = `${key}|${hit.kind}|${hit.value}`;
            if (!countedReasons.has(reasonKey)) {
                countedReasons.add(reasonKey);
                const weight = this.weightOf(hit);
                candidate.reasons.push({
                    kind: hit.kind,
                    value: hit.value,
                    via: hit.via,
                    weight,
                });
                candidate.score = Math.min(100, candidate.score + weight);
            }

            byEntity.set(key, candidate);
        }

        return [...byEntity.values()]
            .filter(candidate => candidate.score >= minScore)
            .map(candidate => ({
                ...candidate,
                reasons: [...candidate.reasons].sort(
                    (a, b) => b.weight - a.weight,
                ),
            }))
            .sort(
                (a, b) =>
                    b.score - a.score ||
                    a.entityType.localeCompare(b.entityType) ||
                    a.id - b.id,
            );
    }

    /**
     * Вес попадания. ИНН из настоящего поля — почти достоверный дубль; тот же
     * ИНН, выковырянный из названия, слабее: там он мог оказаться случайно.
     */
    private weightOf(hit: DuplicateRawHit): number {
        if (hit.kind === DuplicateSignalKind.INN) {
            if (hit.via === SEARCH_VIA.RQ_INN) {
                return DUPLICATE_MATCH_WEIGHTS.innRequisite;
            }
            // Механизмы сравниваем через SEARCH_VIA: builder эмитит ключи
            // фильтра Битрикса (`%TITLE`), и литерал 'TITLE' здесь молча
            // давал бы ИНН-из-названия вес точного поля (100 вместо 40).
            if (
                hit.via === SEARCH_VIA.TITLE ||
                hit.via === SEARCH_VIA.COMPANY_TITLE
            ) {
                return DUPLICATE_MATCH_WEIGHTS.innInTitle;
            }
            return DUPLICATE_MATCH_WEIGHTS.innField;
        }
        if (hit.kind === DuplicateSignalKind.PHONE) {
            return DUPLICATE_MATCH_WEIGHTS.phone;
        }
        if (hit.kind === DuplicateSignalKind.EMAIL) {
            return DUPLICATE_MATCH_WEIGHTS.email;
        }
        return DUPLICATE_MATCH_WEIGHTS.title;
    }

    private key(entityType: DuplicateEntityType, id: number): string {
        return `${entityType}_${id}`;
    }
}
