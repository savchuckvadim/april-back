/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { CounterAdminController } from './counter-admin.controller';
import { CounterAdminService } from '../services/counter-admin.service';
import { CreateCounterDto } from '../document-counter.dto';
import { SerializedCounter } from '../lib/counter.types';

describe('CounterAdminController', () => {
    let controller: CounterAdminController;
    let adminService: jest.Mocked<CounterAdminService>;

    beforeEach(async () => {
        const serviceMock: Partial<jest.Mocked<CounterAdminService>> = {
            getInitial: jest.fn(),
            getAllCounters: jest.fn(),
            findAllByRq: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            remove: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [CounterAdminController],
            providers: [
                { provide: CounterAdminService, useValue: serviceMock },
            ],
        }).compile();

        controller = module.get(CounterAdminController);
        adminService = module.get(CounterAdminService);
    });

    it('GET initial — пробрасывает rqId (как Number) в сервис', async () => {
        const initial = { apiName: 'counter' };
        adminService.getInitial.mockResolvedValue(
            initial as unknown as ReturnType<
                CounterAdminService['getInitial']
            > extends Promise<infer R>
                ? R
                : never,
        );

        const result = await controller.getInitial('42');

        expect(adminService.getInitial).toHaveBeenCalledWith(42);
        expect(result).toEqual({
            success: true,
            data: { initial },
        });
    });

    it('GET initial — вызывает сервис с undefined, если rqId не передан', async () => {
        adminService.getInitial.mockResolvedValue(
            {} as Awaited<ReturnType<CounterAdminService['getInitial']>>,
        );

        await controller.getInitial();

        expect(adminService.getInitial).toHaveBeenCalledWith(undefined);
    });

    it('GET all — оборачивает результат в success/data', async () => {
        const counters = [{ id: '1' }] as unknown as SerializedCounter[];
        adminService.getAllCounters.mockResolvedValue(counters);

        const result = await controller.getAllCounters();

        expect(result).toEqual({
            success: true,
            data: { counters },
        });
    });

    it('GET rq/:rqId — передаёт rqId как число', async () => {
        adminService.findAllByRq.mockResolvedValue([]);

        const result = await controller.findAllByRq(10);

        expect(adminService.findAllByRq).toHaveBeenCalledWith(10);
        expect(result).toEqual({ success: true, data: { counters: [] } });
    });

    it('GET :counterId — возвращает один счётчик', async () => {
        const counter = { id: '7' } as unknown as SerializedCounter;
        adminService.findOne.mockResolvedValue(counter);

        const result = await controller.findOne(7);

        expect(adminService.findOne).toHaveBeenCalledWith(7);
        expect(result).toEqual({ success: true, data: { counter } });
    });

    it('POST / — создаёт счётчик через сервис', async () => {
        const dto = {
            rq_id: 10,
            name: 'n',
            title: 't',
        } as CreateCounterDto;
        const counter = { id: '1' } as unknown as SerializedCounter;
        adminService.create.mockResolvedValue(counter);

        const result = await controller.create(dto);

        expect(adminService.create).toHaveBeenCalledWith(dto);
        expect(result).toEqual({ success: true, data: { counter } });
    });

    it('DELETE :counterId — пробрасывает сообщение из сервиса', async () => {
        adminService.remove.mockResolvedValue({ message: 'ok' });

        const result = await controller.remove(5);

        expect(adminService.remove).toHaveBeenCalledWith(5);
        expect(result).toEqual({
            success: true,
            data: { message: 'ok' },
        });
    });
});
