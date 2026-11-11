import { readFileSync } from 'fs';
import { join } from 'path';
import {
    BULL_MODULE_QUEUE,
    BULL_MODULE_QUEUE_PROCESS,
} from '@nestjs/bull/dist/bull.constants';
import { RedisModule } from '@lib/core/redis/redis.module';
import { OfferWordModule } from '../offer-word.module';
import { OfferWordWorkerModule } from '../offer-word-worker.module';

/**
 * Очереди КП и превью слушает только приложение konstructor.
 *
 * OfferWordModule импортирует ещё и admin. Пока процессоры жили в нём,
 * admin был вторым потребителем: КП и превью выполнялись в контейнере без
 * Gotenberg, а запись сделки из общей очереди падала без обработчика
 * (11.11.2026). Тест держит процессоры в OfferWordWorkerModule и проверяет
 * связи DI по метаданным — без подъёма приложения: забытый export уронил бы
 * старт konstructor на проде.
 */
type Provider = { name?: string };

const metadata = (key: string, target: object): unknown[] =>
    (Reflect.getMetadata(key, target) as unknown[] | undefined) ?? [];

const isProcessor = (provider: unknown): provider is Provider =>
    typeof provider === 'function' &&
    Reflect.hasMetadata(BULL_MODULE_QUEUE, provider);

const processorsOf = (module: object): Provider[] =>
    metadata('providers', module).filter(isProcessor);

describe('OfferWordWorkerModule: очереди КП слушает только konstructor', () => {
    it('в OfferWordModule нет процессоров — его импортирует admin', () => {
        expect(processorsOf(OfferWordModule).map(({ name }) => name)).toEqual(
            [],
        );
    });

    it('процессоры КП, КП v2 и превью — в OfferWordWorkerModule', () => {
        expect(
            processorsOf(OfferWordWorkerModule)
                .map(({ name }) => name)
                .sort(),
        ).toEqual([
            'OfferGenerateMultiProcessor',
            'OfferGenerateProcessor',
            'OfferWordEphemeralPdfProcessor',
        ]);
    });

    it('зависимости процессоров экспортируются импортируемыми модулями', () => {
        const exported = new Set([
            ...metadata('exports', OfferWordModule),
            ...metadata('exports', RedisModule),
        ]);
        // без метаданных конструктора проверка ниже прошла бы впустую
        const dependencyCounts = processorsOf(OfferWordWorkerModule).map(
            processor => metadata('design:paramtypes', processor).length,
        );
        expect(dependencyCounts.every(count => count > 0)).toBe(true);

        const missing = processorsOf(OfferWordWorkerModule).flatMap(processor =>
            metadata('design:paramtypes', processor)
                .filter(dependency => !exported.has(dependency))
                .map(
                    dependency =>
                        `${processor.name} ← ${(dependency as Provider)?.name ?? String(dependency)}`,
                ),
        );

        expect(missing).toEqual([]);
    });

    it('модуль воркеров подключает konstructor и не подключает admin', () => {
        const read = (relativePath: string): string =>
            readFileSync(join(__dirname, relativePath), 'utf8');

        expect(read('../../app.module.ts')).toMatch(
            /^\s*OfferWordWorkerModule,/m,
        );
        expect(read('../../../../admin/src/admin.module.ts')).not.toContain(
            'OfferWordWorkerModule',
        );
    });

    // Пока очередь была общей, параллельность трёх именованных обработчиков
    // у Bull складывалась; после разделения @Process без concurrency дал бы
    // по одному заданию на все порталы (ревью 11.11.2026).
    it('КП, КП v2 и превью обрабатываются больше чем по одному', () => {
        const concurrencyOf = (processor: Provider): number | undefined => {
            const prototype = (processor as { prototype: object }).prototype;
            const handler = Object.getOwnPropertyNames(prototype)
                .map(key => (prototype as Record<string, unknown>)[key])
                .find(
                    method =>
                        typeof method === 'function' &&
                        Reflect.hasMetadata(BULL_MODULE_QUEUE_PROCESS, method),
                ) as object | undefined;
            return handler
                ? (
                      Reflect.getMetadata(
                          BULL_MODULE_QUEUE_PROCESS,
                          handler,
                      ) as {
                          concurrency?: number;
                      }
                  ).concurrency
                : undefined;
        };

        for (const processor of processorsOf(OfferWordWorkerModule)) {
            expect({
                processor: processor.name,
                concurrency: concurrencyOf(processor),
            }).toEqual({
                processor: processor.name,
                concurrency: expect.any(Number) as number,
            });
            expect(concurrencyOf(processor)).toBeGreaterThan(1);
        }
    });
});
