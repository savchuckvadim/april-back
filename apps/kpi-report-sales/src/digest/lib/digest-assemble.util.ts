/**
 * Сборка ответа дайджеста из партиций дня: строки по запрошенным
 * сотрудникам + сводка по ВСЕМ ответственным портала (база «Ø все»).
 * Чистая функция — покрывается тестами без Битрикса.
 */
import type { IsoDate } from '../../shared/lib/month-segments.util';
import type { BXUserDto } from '../../shared/dto/bx-user.dto';
import type {
    KpiDigestCallsDto,
    KpiDigestCatalogDto,
    KpiDigestCountersDto,
    KpiDigestEmployeeDto,
    KpiDigestReportDto,
    KpiDigestSummaryDto,
} from '../dto/digest-response.dto';
import type {
    DigestCallsPartition,
    DigestDayPartition,
    DigestPlannedPartition,
} from '../types/digest-partition.type';
import { addCalls, emptyCalls } from './digest-calls.util';
import { assemblePresentations } from './digest-presentations-assemble.util';
import type { DigestPresentationsPartition } from '../types/digest-presentations.type';
import { addCount, addCounters, emptyCount, emptyCounters } from './digest-reduce.util';

export interface AssembleDigestInput {
    date: IsoDate;
    departament: readonly BXUserDto[];
    day: DigestDayPartition;
    planned: DigestPlannedPartition;
    /** null — статистика звонков недоступна (warning уже добавлен). */
    calls: DigestCallsPartition | null;
    /** null — выборка сделок недоступна (warning уже добавлен). */
    presentations: DigestPresentationsPartition | null;
    catalog: KpiDigestCatalogDto;
    listId: string;
    warnings: readonly string[];
    generatedAt: string;
}

interface RequestedUser {
    id: number;
    name: string;
}

/** Числовые id > 0, дедуп с сохранением порядка; имя — «Имя Фамилия». */
export function requestedUsers(departament: readonly BXUserDto[]): RequestedUser[] {
    const seen = new Set<number>();
    const users: RequestedUser[] = [];
    for (const user of departament) {
        const id = Number(String(user?.ID ?? '').trim());
        if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
        seen.add(id);
        const name = [user.NAME, user.LAST_NAME]
            .map(part => String(part ?? '').trim())
            .filter(Boolean)
            .join(' ');
        users.push({ id, name: name || `#${id}` });
    }
    return users;
}

/** Счётчики сотрудника: события дня + план на начало дня. */
function countersFor(
    userId: number,
    day: DigestDayPartition,
    planned: DigestPlannedPartition,
): KpiDigestCountersDto {
    const counters = emptyCounters();
    const dayUser = day.byUser[String(userId)];
    if (dayUser) addCounters(counters, dayUser.counters);
    const plannedUser = planned.byUser[String(userId)];
    counters.plannedAtStart = plannedUser
        ? { total: plannedUser.count.total, byType: { ...plannedUser.count.byType } }
        : emptyCount();
    return counters;
}

function buildSummary(
    day: DigestDayPartition,
    planned: DigestPlannedPartition,
    calls: DigestCallsPartition | null,
): KpiDigestSummaryDto {
    const userIds = new Set<string>([
        ...Object.keys(day.byUser),
        ...Object.keys(planned.byUser),
    ]);
    const totals = emptyCounters();
    for (const id of userIds) {
        addCounters(totals, countersFor(Number(id), day, planned));
    }

    let callsTotal: KpiDigestCallsDto | null = null;
    let callsUsersCount = 0;
    if (calls) {
        callsTotal = emptyCalls();
        for (const cell of Object.values(calls.byUser)) {
            addCalls(callsTotal, cell);
            callsUsersCount += 1;
        }
    }

    return {
        usersCount: userIds.size,
        totals,
        calls: callsTotal,
        callsUsersCount,
    };
}

export function assembleDigest(input: AssembleDigestInput): KpiDigestReportDto {
    const { date, day, planned, calls } = input;

    const employees: KpiDigestEmployeeDto[] = requestedUsers(input.departament).map(
        user => {
            const key = String(user.id);
            const dayUser = day.byUser[key];
            const plannedUser = planned.byUser[key];
            return {
                userId: user.id,
                name: user.name,
                ...countersFor(user.id, day, planned),
                calls: calls ? (calls.byUser[key] ?? emptyCalls()) : null,
                records: dayUser?.records ?? [],
                plannedAtStartRecords: plannedUser?.records ?? [],
            };
        },
    );

    return {
        period: { kind: 'day', from: date, to: date },
        generatedAt: input.generatedAt,
        catalog: input.catalog,
        listId: input.listId,
        employees,
        summary: buildSummary(day, planned, calls),
        warnings: [...input.warnings, ...(input.presentations?.warnings ?? [])],
        truncated:
            day.truncated ||
            planned.truncated ||
            !!calls?.truncated ||
            !!input.presentations?.truncated,
        presentations: input.presentations
            ? assemblePresentations({
                  partition: input.presentations,
                  day,
                  planned,
                  userIds: new Set(requestedUsers(input.departament).map(user => user.id)),
              })
            : null,
    };
}
