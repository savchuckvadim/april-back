/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { rq_counter } from 'generated/prisma';
import { CounterNumberService } from './counter-number.service';
import { CounterRepository } from '../repository/counter.repository';
import { CounterType } from '../lib/counter-type.enum';

interface PivotShape {
    rq_id: bigint;
    counter_id: bigint;
    value: number;
    type: CounterType;
    prefix: string | null;
    postfix: string | null;
    day: boolean;
    year: boolean;
    month: boolean;
    count: number;
    size: number;
}

const buildPivot = (overrides: Partial<PivotShape> = {}): rq_counter => {
    return {
        rq_id: 1n,
        counter_id: 2n,
        value: 0,
        type: CounterType.OFFER,
        prefix: 'INV',
        postfix: null,
        day: false,
        year: false,
        month: false,
        count: 5,
        size: 1,
        ...overrides,
    } as unknown as rq_counter;
};

describe('CounterNumberService', () => {
    let service: CounterNumberService;
    let repo: jest.Mocked<CounterRepository>;

    beforeEach(async () => {
        const repoMock: Partial<jest.Mocked<CounterRepository>> = {
            findPivot: jest.fn(),
            incrementAndGet: jest.fn(),
            setCurrent: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CounterNumberService,
                { provide: CounterRepository, useValue: repoMock },
            ],
        }).compile();

        service = module.get(CounterNumberService);
        repo = module.get(CounterRepository);
    });

    describe('getNextNumber', () => {
        it('инкрементирует счётчик и возвращает форматированный номер', async () => {
            repo.findPivot.mockResolvedValue(buildPivot({ prefix: 'INV' }));
            repo.incrementAndGet.mockResolvedValue(6);

            const result = await service.getNextNumber(1, CounterType.OFFER);

            expect(repo.findPivot).toHaveBeenCalledWith(1, CounterType.OFFER);
            expect(repo.incrementAndGet).toHaveBeenCalledWith(1n, 2n, 1);
            expect(result).toBe('INV-6');
        });

        it('возвращает fallback, если pivot не найден', async () => {
            repo.findPivot.mockResolvedValue(null);

            const result = await service.getNextNumber(99, CounterType.OFFER);

            expect(repo.incrementAndGet).not.toHaveBeenCalled();
            expect(result.startsWith('99')).toBe(true);
        });
    });

    describe('peekCurrentNumber', () => {
        it('возвращает текущее значение без инкремента', async () => {
            repo.findPivot.mockResolvedValue(
                buildPivot({ prefix: 'INV', count: 12 }),
            );

            const result = await service.peekCurrentNumber(
                1,
                CounterType.OFFER,
            );

            expect(repo.incrementAndGet).not.toHaveBeenCalled();
            expect(repo.setCurrent).not.toHaveBeenCalled();
            expect(result).toBe('INV-12');
        });

        it('возвращает fallback, если pivot не найден', async () => {
            repo.findPivot.mockResolvedValue(null);

            const result = await service.peekCurrentNumber(
                7,
                CounterType.INVOICE,
            );

            expect(result.startsWith('7')).toBe(true);
        });
    });

    describe('previewNextNumber', () => {
        it('возвращает номер следующего next и не пишет в базу', async () => {
            repo.findPivot.mockResolvedValue(
                buildPivot({ prefix: 'INV', count: 5 }),
            );

            const result = await service.previewNextNumber(
                1,
                CounterType.OFFER,
            );

            expect(repo.findPivot).toHaveBeenCalledWith(1, CounterType.OFFER);
            expect(repo.incrementAndGet).not.toHaveBeenCalled();
            expect(repo.setCurrent).not.toHaveBeenCalled();
            expect(result).toBe('INV-6');
        });

        it('шаг берётся из size связи', async () => {
            repo.findPivot.mockResolvedValue(
                buildPivot({ prefix: 'INV', count: 10, size: 5 }),
            );

            const result = await service.previewNextNumber(
                1,
                CounterType.OFFER,
            );

            expect(result).toBe('INV-15');
        });

        it('два просмотра подряд дают одинаковый номер', async () => {
            repo.findPivot.mockResolvedValue(
                buildPivot({ prefix: 'INV', count: 5 }),
            );

            const first = await service.previewNextNumber(1, CounterType.OFFER);
            const second = await service.previewNextNumber(
                1,
                CounterType.OFFER,
            );

            expect(first).toBe(second);
            expect(repo.incrementAndGet).not.toHaveBeenCalled();
        });

        it('возвращает fallback, если pivot не найден', async () => {
            repo.findPivot.mockResolvedValue(null);

            const result = await service.previewNextNumber(
                7,
                CounterType.INVOICE,
            );

            expect(repo.incrementAndGet).not.toHaveBeenCalled();
            expect(result.startsWith('7')).toBe(true);
        });

        describe('формат с префиксом, датой и постфиксом', () => {
            beforeAll(() => {
                jest.useFakeTimers();
                // Локальный полдень: день, месяц и год не зависят от пояса.
                jest.setSystemTime(new Date(2026, 3, 9, 12, 0, 0));
            });

            afterAll(() => {
                jest.useRealTimers();
            });

            it('совпадает с форматом next: число на шаг больше текущего', async () => {
                const pivot = buildPivot({
                    prefix: 'A',
                    postfix: 'Z',
                    day: true,
                    month: true,
                    year: true,
                    count: 3,
                });
                repo.findPivot.mockResolvedValue(pivot);
                repo.incrementAndGet.mockResolvedValue(4);

                const preview = await service.previewNextNumber(
                    1,
                    CounterType.OFFER,
                );
                const next = await service.getNextNumber(1, CounterType.OFFER);

                expect(preview).toBe('A-4-09-04-2026-Z');
                expect(next).toBe(preview);
            });
        });
    });

    describe('setCurrent', () => {
        it('устанавливает значение через репозиторий и возвращает форматированный номер', async () => {
            repo.findPivot.mockResolvedValue(buildPivot({ prefix: 'INV' }));
            repo.setCurrent.mockResolvedValue(100);

            const result = await service.setCurrent(1, CounterType.OFFER, 100);

            expect(repo.findPivot).toHaveBeenCalledWith(1, CounterType.OFFER);
            expect(repo.setCurrent).toHaveBeenCalledWith(1n, 2n, 100);
            expect(result).toBe('INV-100');
        });

        it('возвращает fallback и не вызывает setCurrent, если pivot не найден', async () => {
            repo.findPivot.mockResolvedValue(null);

            const result = await service.setCurrent(
                42,
                CounterType.CONTRACT,
                5,
            );

            expect(repo.setCurrent).not.toHaveBeenCalled();
            expect(result.startsWith('42')).toBe(true);
        });

        it('пробрасывает ошибку репозитория наверх', async () => {
            repo.findPivot.mockResolvedValue(buildPivot());
            repo.setCurrent.mockRejectedValue(new Error('db down'));

            await expect(
                service.setCurrent(1, CounterType.OFFER, 10),
            ).rejects.toThrow('db down');
        });
    });
});
