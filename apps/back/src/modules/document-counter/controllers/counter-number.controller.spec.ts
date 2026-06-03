/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { CounterNumberController } from './counter-number.controller';
import { CounterNumberService } from '../services/counter-number.service';
import { CounterType } from '../lib/counter-type.enum';

describe('CounterNumberController', () => {
    let controller: CounterNumberController;
    let numberService: jest.Mocked<CounterNumberService>;

    beforeEach(async () => {
        const serviceMock: Partial<jest.Mocked<CounterNumberService>> = {
            getNextNumber: jest.fn(),
            peekCurrentNumber: jest.fn(),
            setCurrent: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [CounterNumberController],
            providers: [
                { provide: CounterNumberService, useValue: serviceMock },
            ],
        }).compile();

        controller = module.get(CounterNumberController);
        numberService = module.get(CounterNumberService);
    });

    it('GET next — делегирует в сервис и оборачивает результат в { number }', async () => {
        numberService.getNextNumber.mockResolvedValue('INV-7');

        const result = await controller.getNextNumber(1, CounterType.OFFER);

        expect(numberService.getNextNumber).toHaveBeenCalledWith(
            1,
            CounterType.OFFER,
        );
        expect(result).toEqual({ number: 'INV-7' });
    });

    it('GET peek — возвращает текущее значение без инкремента', async () => {
        numberService.peekCurrentNumber.mockResolvedValue('INV-6');

        const result = await controller.peekCurrentNumber(1, CounterType.OFFER);

        expect(numberService.peekCurrentNumber).toHaveBeenCalledWith(
            1,
            CounterType.OFFER,
        );
        expect(result).toEqual({ number: 'INV-6' });
    });

    it('PUT current — передаёт value из body в сервис', async () => {
        numberService.setCurrent.mockResolvedValue('INV-100');

        const result = await controller.setCurrentNumber(1, CounterType.OFFER, {
            value: 100,
        });

        expect(numberService.setCurrent).toHaveBeenCalledWith(
            1,
            CounterType.OFFER,
            100,
        );
        expect(result).toEqual({ number: 'INV-100' });
    });
});
