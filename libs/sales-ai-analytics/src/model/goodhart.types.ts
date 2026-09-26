/**
 * Типы детектора Гудхарта (план Фазы 3, поток П9 `p3-goodhart`): пара
 * «метрика давления ↔ противовес» и флаг расхождения их сглаженных
 * рядов за окно месяцев.
 *
 * Формулировки нейтральные по замыслу: детектор описывает расхождение
 * рядов («метрика растёт, результат — нет»), а не намерение человека.
 *
 * Чистые типы: без DI, Bitrix и Prisma.
 */
import type { TrendSeriesPoint } from './trend/trend.types';

/**
 * Пара метрик: по `pressure` руководитель давит (звонки, балл, доля
 * ребра), `counter` — противовес, который при честном росте не падает
 * (оценка, доля следующего ребра). Коды метрик — приложения.
 */
export interface GoodhartPair {
    readonly code: string;
    readonly pressure: string;
    readonly counter: string;
}

/** Месячный ряд метрики после нормализации (ключи 'YYYY-MM'). */
export interface GoodhartSeriesInput {
    readonly metric: string;
    readonly points: readonly TrendSeriesPoint[];
}

/** Параметры детектора (коды реестра в скобках). */
export interface GoodhartOptions {
    /** Окно расхождения в месяцах (`goodhart_window_months`). */
    readonly windowMonths: number;
    /** Относительное падение противовеса, доля 0..1 (`goodhart_drop`). */
    readonly drop: number;
    /** α EWMA сглаживания рядов (`trend_ewma_long`). */
    readonly alpha: number;
    /** Минимальный относительный рост давления, доля; по умолчанию 0,05. */
    readonly minRise?: number;
}

/** Флаг пары: за окно давление выросло, противовес упал. */
export interface GoodhartFlag {
    readonly pair: string;
    readonly pressure: string;
    readonly counter: string;
    /** Первый и последний месяц окна 'YYYY-MM'. */
    readonly fromKey: string;
    readonly toKey: string;
    /** Относительное изменение сглаженного давления за окно, доля (> 0). */
    readonly pressureChange: number;
    /** Относительное изменение сглаженного противовеса за окно, доля (< 0). */
    readonly counterChange: number;
    /** Общих точек окна у обоих рядов. */
    readonly points: number;
}

/**
 * Итог детектора: `null` — ни у одной пары нет `windowMonths` общих
 * месяцев (окно короче — детектор молчит, а не выдумывает); пустой
 * список — данных хватило, расхождений нет.
 */
export type GoodhartResult = GoodhartFlag[] | null;
