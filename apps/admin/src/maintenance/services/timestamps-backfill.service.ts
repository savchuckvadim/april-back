import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/prisma';
import {
    TimestampsBackfillDto,
    TimestampsBackfillResponseDto,
    TimestampsBackfillTableEnum,
    TimestampsBackfillTableResultDto,
} from '../dto/timestamps-backfill.dto';

/** Строка, у которой нас интересуют только ключ и таймстампы. */
export interface TimestampRow {
    id: bigint;
    created_at: Date | null;
    updated_at: Date | null;
}

/**
 * Минимальный контракт Prisma-делегата, достаточный для починки.
 * Все таблицы из списка устроены одинаково: `id` + два nullable-таймстампа,
 * поэтому один интерфейс закрывает их все и обходится без `any`.
 */
export interface TimestampDelegate {
    findMany(args: {
        where: { OR: Array<{ created_at: null } | { updated_at: null }> };
        select: { id: true; created_at: true; updated_at: true };
        take: number;
    }): Promise<TimestampRow[]>;
    update(args: {
        where: { id: bigint };
        data: { created_at: Date; updated_at: Date };
    }): Promise<unknown>;
}

/** Потолок на одну таблицу за вызов — чтобы запрос не висел вечно. */
const MAX_ROWS_PER_TABLE = 5000;

/**
 * Значения, которыми чиним строку.
 *
 * Пустое берём из соседней колонки — так у строки сохраняется её настоящий
 * возраст, а не дата починки. Пусты обе — ставим `now`.
 *
 * Возвращаем ВСЕГДА обе даты, даже если пуста одна: расширение
 * `laravelTimestampsExtension` на любом `update` подставляет `updated_at`,
 * если его не передали, и иначе затёрло бы реальную дату изменения.
 */
export function resolveTimestamps(
    row: TimestampRow,
    now: Date,
): { created_at: Date; updated_at: Date } {
    const created = row.created_at ?? row.updated_at ?? now;
    const updated = row.updated_at ?? row.created_at ?? now;
    return { created_at: created, updated_at: updated };
}

/**
 * Починка пустых `created_at` / `updated_at` в общей с Laravel БД.
 *
 * Откуда берутся пустые: у этих колонок нет DB-дефолта — Laravel заполняет их
 * на уровне Eloquent. Nest делает то же через `laravelTimestampsExtension`
 * (libs/core/src/prisma), но строки, записанные ДО появления расширения, так
 * и остались с NULL. Переустановка портала их не лечит: существующую стадию
 * установщик проводит через `update`, а он проставляет только `updated_at`.
 *
 * Чем это било: python-сервис (event-service) читает портал из Laravel и
 * валидирует его pydantic-моделью, где таймстампы были обязательными. Одна
 * пустая колонка роняла разбор ВСЕЙ модели портала, и наружу это выглядело
 * как `get_rq -> {"result": false}` без единой подсказки, что сломалось.
 *
 * Работает только через ORM и только по закрытому списку портальных таблиц.
 * Строки без пустых таймстампов не читаются и не пишутся, поэтому повторный
 * запуск ничего не меняет.
 */
@Injectable()
export class TimestampsBackfillService {
    private readonly logger = new Logger(TimestampsBackfillService.name);

    constructor(private readonly prisma: PrismaService) {}

    async backfill(
        dto: TimestampsBackfillDto,
    ): Promise<TimestampsBackfillResponseDto> {
        // По умолчанию «сухой» запуск: случайный вызов ничего не изменит.
        const dryRun = dto.dryRun !== false;
        const requested = dto.tables?.length
            ? dto.tables
            : Object.values(TimestampsBackfillTableEnum);

        const rows: TimestampsBackfillTableResultDto[] = [];
        let totalBroken = 0;
        let totalRepaired = 0;

        for (const table of requested) {
            const broken = await this.findBroken(table);
            if (broken.length === 0) {
                continue;
            }

            const repaired = dryRun ? 0 : await this.repair(table, broken);
            totalBroken += broken.length;
            totalRepaired += repaired;
            rows.push({ table, broken: broken.length, repaired });

            if (!dryRun) {
                this.logger.log(
                    `Таймстампы восстановлены: ${table} — ${repaired} строк`,
                );
            }
        }

        return {
            dryRun,
            scannedTables: requested.length,
            totalBroken,
            totalRepaired,
            tables: rows,
        };
    }

    private async findBroken(
        table: TimestampsBackfillTableEnum,
    ): Promise<TimestampRow[]> {
        return this.delegate(table).findMany({
            where: { OR: [{ created_at: null }, { updated_at: null }] },
            select: { id: true, created_at: true, updated_at: true },
            take: MAX_ROWS_PER_TABLE,
        });
    }

    private async repair(
        table: TimestampsBackfillTableEnum,
        rows: readonly TimestampRow[],
    ): Promise<number> {
        const delegate = this.delegate(table);
        const now = new Date();
        let repaired = 0;
        for (const row of rows) {
            await delegate.update({
                where: { id: row.id },
                data: resolveTimestamps(row, now),
            });
            repaired += 1;
        }
        return repaired;
    }

    /**
     * Enum → делегат Prisma. Перечисление явное: имя таблицы из запроса
     * никогда не превращается в обращение к произвольной модели.
     */
    private delegate(table: TimestampsBackfillTableEnum): TimestampDelegate {
        const map: Record<TimestampsBackfillTableEnum, unknown> = {
            [TimestampsBackfillTableEnum.BTX_STAGES]: this.prisma.btx_stages,
            [TimestampsBackfillTableEnum.BTX_CATEGORIES]:
                this.prisma.btx_categories,
            [TimestampsBackfillTableEnum.BTX_RPAS]: this.prisma.btx_rpas,
            [TimestampsBackfillTableEnum.BTX_DEALS]: this.prisma.btx_deals,
            [TimestampsBackfillTableEnum.BTX_COMPANIES]:
                this.prisma.btx_companies,
            [TimestampsBackfillTableEnum.BTX_CONTACTS]:
                this.prisma.btx_contacts,
            [TimestampsBackfillTableEnum.BTX_LEADS]: this.prisma.btx_leads,
            [TimestampsBackfillTableEnum.BITRIXFIELDS]:
                this.prisma.bitrixfields,
            [TimestampsBackfillTableEnum.BITRIXFIELD_ITEMS]:
                this.prisma.bitrixfield_items,
            [TimestampsBackfillTableEnum.SMARTS]: this.prisma.smarts,
            [TimestampsBackfillTableEnum.BX_RQS]: this.prisma.bx_rqs,
        };
        return map[table] as TimestampDelegate;
    }
}
