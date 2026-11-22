import { findMissingModuleDependencies } from '@lib/core/testing/module-di';
import { LogQueryRepository } from '../../log-query.repository';
import { LogSql } from '../../log-query.sql';
import { LogsAdminModule } from '../../logs-admin.module';
import {
    buildBitrixFailureCountsSql,
    buildBitrixFailureRowsSql,
} from '../bitrix-failures.sql';
import {
    buildBitrixFailureSummary,
    toBitrixFailureCount,
    toBitrixFailureRow,
} from '../bitrix-failures.mapper';
import { BitrixFailureQueryService } from '../bitrix-failures.service';

describe('SQL журнала сбоев Битрикса', () => {
    it('строки: окно, есть запись о сбое, портал и приложение — параметрами', () => {
        const sql = buildBitrixFailureRowsSql(
            {
                hours: 6,
                app: "event-sales'; DROP",
                domain: 'april-garant.bitrix24.ru',
            },
            50,
        );

        expect(sql.params).toEqual({
            hours: 6,
            limit: 50,
            app: "event-sales'; DROP",
            domain: 'april-garant.bitrix24.ru',
        });
        expect(sql.query).not.toContain('DROP');
        expect(sql.query).not.toContain('april-garant');
        expect(sql.query).toContain(
            'timestamp >= now64(3) - toIntervalHour({hours:UInt32})',
        );
        expect(sql.query).toContain("JSONHas(meta, 'bitrixFailure')");
        // Общий фильтр журналов по порталу: meta.domain на верхнем уровне.
        expect(sql.query).toContain(
            "JSONExtractString(meta, 'domain') = {domain:String}",
        );
        expect(sql.query).toContain('app = {app:String}');
        expect(sql.query).toContain('ORDER BY timestamp DESC');
        expect(sql.query).toContain('LIMIT {limit:UInt32}');
        expect(sql.query).not.toContain("'write') = 1");
    });

    it('строки: «только запись» — условие на флаг записи', () => {
        const sql = buildBitrixFailureRowsSql(
            { hours: 24, writeOnly: true },
            100,
        );

        expect(sql.params).toEqual({ hours: 24, limit: 100 });
        expect(sql.query).toContain(
            "JSONExtractBool(meta, 'bitrixFailure', 'write') = 1",
        );
    });

    it('строки: читает поля сбоя и контекста по путям контракта', () => {
        const { query } = buildBitrixFailureRowsSql({ hours: 1 }, 1);

        for (const path of [
            "'bitrixFailure', 'kind'",
            "'bitrixFailure', 'method'",
            "'bitrixFailure', 'commands', 'summary'",
            "'bitrixFailure', 'entity', 'id'",
            "'bitrixFailure', 'status'",
            "'bitrixFailure', 'error'",
            "'callContext', 'operation'",
            "'callContext', 'source'",
            "'callContext', 'entity', 'type'",
            "'callContext', 'actor', 'userId'",
        ]) {
            expect(query).toContain(path);
        }
    });

    it('счёт для сводки: запись и чтение по приложению и операции, без «только запись»', () => {
        const sql = buildBitrixFailureCountsSql(
            { hours: 24, domain: 'gsr.bitrix24.ru', writeOnly: true },
            500,
        );

        expect(sql.params).toEqual({
            hours: 24,
            top: 500,
            domain: 'gsr.bitrix24.ru',
        });
        expect(sql.query).toContain('GROUP BY app, operation');
        expect(sql.query).toContain(
            "countIf(JSONExtractBool(meta, 'bitrixFailure', 'write') = 1) AS writes",
        );
        // Условие «только запись» в WHERE не попадает.
        expect(sql.query).not.toMatch(/WHERE[^]*'write'\) = 1/);
    });
});

describe('маппинг строк и сводка', () => {
    it('строка ClickHouse → строка журнала: числа строками, 0 — «не известно»', () => {
        expect(
            toBitrixFailureRow({
                at: '2026-11-20T06:43:05.123000Z',
                app: 'event-sales',
                domain: 'april-garant.bitrix24.ru',
                kind: 'batch',
                method: 'batch',
                write: 1,
                commands: 'строка списка ×2, сделка ×1',
                commandsTotal: '3',
                targetLabel: '',
                targetId: '',
                status: '500',
                error: 'HTTP 500',
                operation: 'Отчёт «Звонки»',
                source: 'queue:event-sales-flow',
                entityType: 'deal',
                entityId: '26735',
                actorId: '325',
                actorName: '',
            }),
        ).toEqual({
            at: '2026-11-20T06:43:05.123000Z',
            app: 'event-sales',
            domain: 'april-garant.bitrix24.ru',
            kind: 'batch',
            method: 'batch',
            write: true,
            commands: 'строка списка ×2, сделка ×1',
            commandsTotal: 3,
            target: '',
            status: 500,
            error: 'HTTP 500',
            operation: 'Отчёт «Звонки»',
            source: 'queue:event-sales-flow',
            entityType: 'deal',
            entityId: '26735',
            actorId: 325,
            actorName: '',
        });
    });

    it('одиночный вызов без статуса и сотрудника; сущность запроса — подписью', () => {
        const row = toBitrixFailureRow({
            kind: 'call',
            write: 0,
            targetLabel: 'сделка',
            targetId: '7',
            status: 0,
            actorId: 0,
        });

        expect(row).toMatchObject({
            kind: 'call',
            write: false,
            target: 'сделка 7',
            status: null,
            actorId: null,
            commandsTotal: 0,
        });
    });

    it('незнакомый вид сбоя — одиночный вызов', () => {
        expect(toBitrixFailureRow({ kind: 'weird' }).kind).toBe('call');
    });

    it('сводка: всего, запись/чтение, по приложениям и операциям — запись выше', () => {
        const counts = [
            {
                app: 'event-sales',
                operation: 'Отчёт «Звонки»',
                writes: '5',
                reads: '1',
            },
            {
                app: 'event-sales',
                operation: 'Крон: подстраховка ХО',
                writes: '0',
                reads: '4',
            },
            { app: 'konstructor', operation: '', writes: '2', reads: '0' },
        ].map(toBitrixFailureCount);
        const now = new Date('2026-11-20T12:00:00.000Z');

        const summary = buildBitrixFailureSummary(counts, 6, now);

        expect(summary).toEqual({
            hours: 6,
            from: '2026-11-20T06:00:00.000Z',
            to: '2026-11-20T12:00:00.000Z',
            total: 12,
            writes: 7,
            reads: 5,
            apps: [
                { name: 'event-sales', writes: 5, reads: 5, total: 10 },
                { name: 'konstructor', writes: 2, reads: 0, total: 2 },
            ],
            operations: [
                { name: 'Отчёт «Звонки»', writes: 5, reads: 1, total: 6 },
                { name: '', writes: 2, reads: 0, total: 2 },
                {
                    name: 'Крон: подстраховка ХО',
                    writes: 0,
                    reads: 4,
                    total: 4,
                },
            ],
        });
    });
});

describe('BitrixFailureQueryService', () => {
    it('нормализует фильтр и лимит, строки и сводка — двумя запросами', async () => {
        const calls: LogSql[] = [];
        const repository = {
            select: jest.fn((sql: LogSql) => {
                calls.push(sql);
                return Promise.resolve(
                    sql.query.includes('GROUP BY')
                        ? [
                              {
                                  app: 'event-sales',
                                  operation: 'x',
                                  writes: 1,
                                  reads: 0,
                              },
                          ]
                        : [
                              {
                                  kind: 'call',
                                  method: 'crm.deal.update',
                                  write: 1,
                              },
                          ],
                );
            }),
        };
        const service = new BitrixFailureQueryService(
            repository as unknown as LogQueryRepository,
        );

        const view = await service.journal(
            {
                hours: 2,
                domain: 'https://April-Garant.bitrix24.ru/crm/',
                app: '  ',
                writeOnly: true,
            },
            9999,
            new Date('2026-11-20T12:00:00.000Z'),
        );

        expect(calls).toHaveLength(2);
        const [rowsSql, countsSql] = calls;
        expect(rowsSql.params).toEqual({
            hours: 2,
            limit: 500,
            domain: 'april-garant.bitrix24.ru',
        });
        expect(rowsSql.query).toContain("'write') = 1");
        expect(countsSql.params).toMatchObject({
            domain: 'april-garant.bitrix24.ru',
        });
        expect(view.summary).toMatchObject({ total: 1, writes: 1, hours: 2 });
        expect(view.rows).toHaveLength(1);
        expect(view.rows[0]).toMatchObject({
            method: 'crm.deal.update',
            write: true,
        });
    });
});

describe('DI-граф LogsAdminModule с журналом сбоев', () => {
    it('оба контроллера получают свои сервисы', () => {
        expect(findMissingModuleDependencies(LogsAdminModule)).toEqual([]);
    });
});
