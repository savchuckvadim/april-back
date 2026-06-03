/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CounterAdminService } from './counter-admin.service';
import { CounterRepository } from '../repository/counter.repository';
import { CounterWithRqs, RqWithCounters } from '../lib/counter.types';
import { CounterType } from '../lib/counter-type.enum';
import { CreateCounterDto } from '../document-counter.dto';

const buildCounter = (
    overrides: Partial<CounterWithRqs> = {},
): CounterWithRqs => {
    return {
        id: 1n,
        name: 'invoice_counter',
        title: 'Счётчик счетов',
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-02T00:00:00Z'),
        rq_counter: [
            {
                rq_id: 10n,
                counter_id: 1n,
                value: 0,
                type: CounterType.INVOICE,
                prefix: 'INV',
                postfix: null,
                day: false,
                year: false,
                month: false,
                count: 1,
                size: 1,
                rqs: { name: 'ООО Тест' },
            },
        ],
        ...overrides,
    } as unknown as CounterWithRqs;
};

describe('CounterAdminService', () => {
    let service: CounterAdminService;
    let repo: jest.Mocked<CounterRepository>;

    beforeEach(async () => {
        const repoMock: Partial<jest.Mocked<CounterRepository>> = {
            create: jest.fn(),
            findById: jest.fn(),
            findAllByRq: jest.fn(),
            findMany: jest.fn(),
            remove: jest.fn(),
            getSelectRqs: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CounterAdminService,
                { provide: CounterRepository, useValue: repoMock },
            ],
        }).compile();

        service = module.get(CounterAdminService);
        repo = module.get(CounterRepository);
    });

    describe('create', () => {
        it('создаёт счётчик и возвращает сериализованный результат', async () => {
            const dto = {
                rq_id: 10,
                name: 'n',
                title: 't',
            } as CreateCounterDto;
            repo.create.mockResolvedValue(buildCounter());

            const result = await service.create(dto);

            expect(repo.create).toHaveBeenCalledWith(dto);
            expect(result?.id).toBe('1');
            expect(result?.rqs?.[0].rq_id).toBe('10');
        });
    });

    describe('findOne', () => {
        it('возвращает сериализованный счётчик', async () => {
            repo.findById.mockResolvedValue(buildCounter());

            const result = await service.findOne(1);

            expect(repo.findById).toHaveBeenCalledWith(1);
            expect(result.id).toBe('1');
        });

        it('бросает NotFoundException, если счётчик не найден', async () => {
            repo.findById.mockResolvedValue(null);

            await expect(service.findOne(404)).rejects.toBeInstanceOf(
                NotFoundException,
            );
        });
    });

    describe('findAllByRq', () => {
        it('возвращает плоский список счётчиков с pivot', async () => {
            const rq: RqWithCounters = {
                rq_counter: [
                    {
                        counter_id: 1n,
                        rq_id: 10n,
                        value: 0,
                        type: CounterType.OFFER,
                        prefix: 'INV',
                        postfix: null,
                        day: false,
                        year: false,
                        month: false,
                        count: 7,
                        size: 1,
                        counters: {
                            id: 1n,
                            name: 'offer_counter',
                            title: 'КП',
                        },
                    },
                ],
            } as unknown as RqWithCounters;
            repo.findAllByRq.mockResolvedValue(rq);

            const result = await service.findAllByRq(10);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('1');
            expect(result[0].name).toBe('offer_counter');
            expect(result[0].pivot.count).toBe(7);
            expect(result[0].pivot.type).toBe(CounterType.OFFER);
        });

        it('бросает NotFoundException, если Rq не найден', async () => {
            repo.findAllByRq.mockResolvedValue(null);

            await expect(service.findAllByRq(1)).rejects.toBeInstanceOf(
                NotFoundException,
            );
        });
    });

    describe('getAllCounters', () => {
        it('возвращает массив сериализованных счётчиков', async () => {
            repo.findMany.mockResolvedValue([
                buildCounter({ id: 1n } as Partial<CounterWithRqs>),
                buildCounter({ id: 2n } as Partial<CounterWithRqs>),
            ]);

            const result = await service.getAllCounters();

            expect(result).toHaveLength(2);
            expect(result[0]?.id).toBe('1');
            expect(result[1]?.id).toBe('2');
        });
    });

    describe('remove', () => {
        it('удаляет счётчик и возвращает сообщение', async () => {
            repo.findById.mockResolvedValue(buildCounter());
            repo.remove.mockResolvedValue(undefined);

            const result = await service.remove(1);

            expect(repo.remove).toHaveBeenCalledWith(1);
            expect(result.message).toMatch(/successfully deleted/);
        });

        it('бросает NotFoundException, если счётчик не найден', async () => {
            repo.findById.mockResolvedValue(null);

            await expect(service.remove(1)).rejects.toBeInstanceOf(
                NotFoundException,
            );
            expect(repo.remove).not.toHaveBeenCalled();
        });
    });

    describe('getInitial', () => {
        it('передаёт первый rq из списка как initialValue', async () => {
            repo.getSelectRqs.mockResolvedValue([
                { value: 1, label: 'A' },
                { value: 2, label: 'B' },
            ]);

            const result = await service.getInitial();

            expect(repo.getSelectRqs).toHaveBeenCalledWith(undefined);
            expect(result.apiName).toBe('counter');
            const rqField = result.groups[0].fields.find(
                f => f.name === 'rq_id',
            );
            expect(rqField?.initialValue).toEqual({ value: 1, label: 'A' });
        });

        it('передаёт rqId в репозиторий и initialValue=null для пустого списка', async () => {
            repo.getSelectRqs.mockResolvedValue([]);

            const result = await service.getInitial(42);

            expect(repo.getSelectRqs).toHaveBeenCalledWith(42);
            const rqField = result.groups[0].fields.find(
                f => f.name === 'rq_id',
            );
            expect(rqField?.initialValue).toBeNull();
        });
    });
});
