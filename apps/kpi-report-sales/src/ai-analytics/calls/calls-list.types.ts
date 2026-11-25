/**
 * Выборка периода раздела «Разборы звонков» — то, что лежит в кэше на
 * (портал, период) и из чего каждый запрос собирает свою страницу. Только
 * JSON-значения: запись проходит через кэш витрины как есть.
 */
import type {
    CallBadgeFamily,
    CallBadgeId,
    CallBadgeTone,
} from '@lib/sales-ai-analytics';
import type {
    CallsListPointState,
    CallsListReviewFilter,
    CallsListSort,
} from './calls-list.const';

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
    /** Общие бейджи звонка с ответом «да» (идентификаторы справочника). */
    badges: CallBadgeId[];
    /**
     * Статусы пунктов методики: по символу на код из `CallListIndex.pointCodes`
     * (та же позиция): d — исполнено, m — не исполнено, n — не относится,
     * «-» — пункт у звонка не проверялся.
     */
    points: string;
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
    /**
     * Коды пунктов методики, встретившиеся в звонках периода, по алфавиту:
     * позиция кода — позиция символа в `CallListRow.points`.
     */
    pointCodes: string[];
    /** Номер расшифровки → актуальные отзывы (по одному на автора). */
    reviews: Record<string, CallListReview[]>;
    /** Bitrix-id → «Фамилия Имя»; кого нет — имя не прочитано. */
    managerNames: Record<string, string>;
}

/** Бейдж пункта методики в фильтре: код пункта и нужное состояние. */
export interface CallListPointFilter {
    code: string;
    state: CallsListPointState;
}

/** Фильтры, порядок и страница запроса (после значений по умолчанию). */
export interface CallListQuery {
    managerIds: readonly string[];
    callTypes: readonly string[];
    scoreMin: number | null;
    scoreMax: number | null;
    review: CallsListReviewFilter;
    /** Общие бейджи без повторов. */
    badges: readonly CallBadgeId[];
    /** Бейджи пунктов методики: на код один, побеждает последний. */
    points: readonly CallListPointFilter[];
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

/** Пункт методики портала для фильтров. */
export interface CallListPointDef {
    code: string;
    /** Короткая подпись плашки (до 28 знаков). */
    label: string;
    /** Полная формулировка пункта. */
    title: string;
    /** Коды типов звонка, к которым относится пункт. */
    callTypes: readonly string[];
    /** Показывается в строке фильтров сразу. */
    main: boolean;
}

/** Методика портала для списка: действующая методика и её пункты. */
export interface CallListPointsView {
    /** Код и имя для людей; null — методика на портале не включена. */
    methodology: { code: string; title: string } | null;
    defs: CallListPointDef[];
}

/** Что нужно фильтрам по бейджам, кроме самих строк. */
export interface CallListBadgeContext {
    /** Код пункта → позиция символа в `CallListRow.points`. */
    pointIndex: ReadonlyMap<string, number>;
    pointDefs: readonly CallListPointDef[];
}

/** Значение фасета общих бейджей: сколько звонков останется при добавлении бейджа. */
export interface CallListBadgeFacet {
    id: CallBadgeId;
    title: string;
    hint: string;
    tone: CallBadgeTone;
    family: CallBadgeFamily | null;
    main: boolean;
    since: string | null;
    count: number;
}

/** Значение фасета пунктов методики: сколько звонков останется по каждому состоянию. */
export interface CallListPointFacet {
    code: string;
    label: string;
    title: string;
    callTypes: string[];
    main: boolean;
    done: number;
    missed: number;
}
