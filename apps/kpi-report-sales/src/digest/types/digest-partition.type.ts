/**
 * Партиции дня дайджеста в кэше. Каждая собирается по ВСЕМУ порталу и не
 * зависит от выборки сотрудников: любой фильтр отчёта собирается из тех же
 * трёх записей (события дня, план на день, звонки дня).
 */
import type { IsoDate } from '../../shared/lib/month-segments.util';
import type {
    KpiDigestCallsDto,
    KpiDigestCountDto,
    KpiDigestCountersDto,
    KpiDigestRecordDto,
} from '../dto/digest-response.dto';

export interface DigestDayUserPartition {
    counters: KpiDigestCountersDto;
    /** Все записи сотрудника за день в хронологическом порядке. */
    records: KpiDigestRecordDto[];
}

/** События дня (записи sales_kpi с event_date внутри дня). */
export interface DigestDayPartition {
    date: IsoDate;
    byUser: Record<string, DigestDayUserPartition>;
    usersCount: number;
    /** Сколько элементов вернул Битрикс (до отсева клонов). */
    elements: number;
    /** Выгрузка остановлена по лимиту — данные неполные. */
    truncated: boolean;
    builtAt: string;
}

export interface DigestPlannedUserPartition {
    count: KpiDigestCountDto;
    records: KpiDigestRecordDto[];
}

/** «Запланировано на начало дня»: план/перенос с дедлайном в день, созданные раньше. */
export interface DigestPlannedPartition {
    date: IsoDate;
    byUser: Record<string, DigestPlannedUserPartition>;
    elements: number;
    truncated: boolean;
    builtAt: string;
}

/** Фактические звонки дня по сотрудникам (voximplant). */
export interface DigestCallsPartition {
    date: IsoDate;
    byUser: Record<string, KpiDigestCallsDto>;
    rowsFetched: number;
    truncated: boolean;
    builtAt: string;
}
