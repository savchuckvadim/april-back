/**
 * Выборка периода раздела «Разборы звонков» — то, что лежит в кэше на
 * (портал, период) и из чего каждый запрос собирает свою страницу. Только
 * JSON-значения: запись проходит через кэш витрины как есть.
 */
import type { CallsListReviewFilter, CallsListSort } from './calls-list.const';

/** Звонок с разбором. */
export interface CallListRow {
    transcriptionId: string;
    /** Bitrix-id менеджера; null — звонок без менеджера. */
    managerId: string | null;
    /** Начало звонка, ISO (UTC). */
    startedAt: string;
    durationSec: number | null;
    /** Код типа звонка; null — не определён. */
    callType: string | null;
    /** Оценка AI по шкале витрины (до 10); null — оценки нет. */
    aiScore: number | null;
}

/** Актуальный отзыв руководителя — то, что нужно колонке списка. */
export interface CallListReview {
    /** Bitrix-id автора. */
    authorId: string;
    agree: boolean;
    leaderScore: number | null;
    /** Когда оставлен, ISO (UTC). */
    createdAt: string;
}

/** Выборка периода: звонки, отзывы по звонкам и имена менеджеров. */
export interface CallListIndex {
    rows: CallListRow[];
    /** Номер расшифровки → актуальные отзывы (по одному на автора). */
    reviews: Record<string, CallListReview[]>;
    /** Bitrix-id → «Фамилия Имя»; кого нет — имя не прочитано. */
    managerNames: Record<string, string>;
}

/** Фильтры, порядок и страница запроса (после значений по умолчанию). */
export interface CallListQuery {
    managerIds: readonly string[];
    callTypes: readonly string[];
    scoreMin: number | null;
    scoreMax: number | null;
    review: CallsListReviewFilter;
    sort: CallsListSort;
    page: number;
    pageSize: number;
}

/** Сводка отзывов по звонку для строки списка. */
export interface CallListReviewsSummary {
    count: number;
    disagreeCount: number;
    /** Средняя оценка руководителей, один знак; null — оценок нет. */
    avgLeaderScore: number | null;
    /** Мой отзыв; null — я не оставлял. */
    mine: { leaderScore: number | null; agree: boolean } | null;
    /** Когда оставлен последний отзыв, ISO; null — отзывов нет. */
    lastAt: string | null;
}

/** Значение фасета менеджеров. */
export interface CallListManagerFacet {
    id: string;
    name: string | null;
    count: number;
}

/** Значение фасета типов звонка. */
export interface CallListCallTypeFacet {
    code: string;
    title: string | null;
    count: number;
}
