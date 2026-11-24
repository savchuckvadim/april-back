import { RedisModule } from '@lib/core/redis/redis.module';
import { QueueModule } from '@lib/queue';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { EventModule } from '../../event.module';
import { EventDocumentReportModule } from '../event-document-report.module';
import { EventDocumentFlowProcessor } from '../queue/event-document-flow.processor';
import { EventDocumentInitService } from '../services/init/event-document-init.service';
import { EventDocumentFlowStatusService } from '../services/status/event-document-flow-status.service';
import { EventDocumentReportUseCase } from '../use-cases/event-document-report.use-case';

/**
 * Проводка модуля, а не логика.
 *
 * Юнит-тесты собирают сервисы вручную и ошибок внедрения зависимостей не
 * видят: модуль без нужного импорта проходит всё зелёным, а приложение
 * падает на старте. Полная сборка контейнера тянет базу, Redis и ClickHouse,
 * поэтому проверяются метаданные модуля — как в
 * `xo-dispatch-rescue.module.spec.ts`.
 */
const metadataOf = (key: string, moduleClass: object): unknown[] =>
    (Reflect.getMetadata(key, moduleClass) as unknown[] | undefined) ?? [];

describe('EventDocumentReportModule — проводка', () => {
    it('воркер, сценарий, чтение и отметка события объявлены провайдерами', () => {
        expect(metadataOf('providers', EventDocumentReportModule)).toEqual(
            expect.arrayContaining([
                EventDocumentFlowProcessor,
                EventDocumentReportUseCase,
                EventDocumentInitService,
                EventDocumentFlowStatusService,
            ]),
        );
    });

    // Ни один из трёх модулей не глобальный: без явного импорта
    // приложение не поднимается.
    it.each([
        ['PBXModule — портал и Битрикс для сценария', PBXModule],
        ['RedisModule — отметка «событие взято в работу»', RedisModule],
        ['QueueModule — очередь и слот клиента', QueueModule],
    ])('импортирует %s', (_title, imported) => {
        expect(metadataOf('imports', EventDocumentReportModule)).toContain(
            imported,
        );
    });

    // Наружу (Swagger) модуль ничего не добавляет: вход только из очереди.
    it('HTTP-ручек у модуля нет', () => {
        expect(metadataOf('controllers', EventDocumentReportModule)).toEqual(
            [],
        );
    });

    it('подключён к приложению event-sales', () => {
        expect(metadataOf('imports', EventModule)).toContain(
            EventDocumentReportModule,
        );
    });
});
