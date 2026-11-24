/* eslint-disable @typescript-eslint/unbound-method */
import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
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
            previewNextNumber: jest.fn(),
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

    it('GET preview — отдаёт следующий номер, не вызывая выдачу', async () => {
        numberService.previewNextNumber.mockResolvedValue('INV-7');

        const result = await controller.previewNextNumber(1, CounterType.OFFER);

        expect(numberService.previewNextNumber).toHaveBeenCalledWith(
            1,
            CounterType.OFFER,
        );
        expect(numberService.getNextNumber).not.toHaveBeenCalled();
        expect(result).toEqual({ number: 'INV-7' });
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

describe('CounterNumberController — маршруты preview/next/peek по HTTP', () => {
    let app: INestApplication;
    let server: Server;

    const numberService = {
        getNextNumber: jest.fn(),
        peekCurrentNumber: jest.fn(),
        previewNextNumber: jest.fn(),
        setCurrent: jest.fn(),
    };

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [CounterNumberController],
            providers: [
                { provide: CounterNumberService, useValue: numberService },
            ],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
        server = app.getHttpServer() as Server;
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        numberService.previewNextNumber.mockResolvedValue('INV-7');
        numberService.getNextNumber.mockResolvedValue('INV-7');
        numberService.peekCurrentNumber.mockResolvedValue('INV-6');
    });

    it('GET /document-counter/preview/:rqId/:type отвечает { number } и ничего не выдаёт', async () => {
        const res = await request(server)
            .get('/document-counter/preview/12/offer')
            .expect(200);

        expect(res.body).toEqual({ number: 'INV-7' });
        expect(numberService.previewNextNumber).toHaveBeenCalledWith(
            12,
            CounterType.OFFER,
        );
        expect(numberService.getNextNumber).not.toHaveBeenCalled();
    });

    it.each([CounterType.INVOICE, CounterType.OFFER, CounterType.CONTRACT])(
        'preview принимает тип %s',
        async type => {
            await request(server)
                .get(`/document-counter/preview/1/${type}`)
                .expect(200);

            expect(numberService.previewNextNumber).toHaveBeenCalledWith(
                1,
                type,
            );
        },
    );

    it('preview отклоняет неизвестный type кодом 400', async () => {
        await request(server)
            .get('/document-counter/preview/1/receipt')
            .expect(400);

        expect(numberService.previewNextNumber).not.toHaveBeenCalled();
    });

    it('preview отклоняет нечисловой rqId кодом 400', async () => {
        await request(server)
            .get('/document-counter/preview/abc/offer')
            .expect(400);

        expect(numberService.previewNextNumber).not.toHaveBeenCalled();
    });

    it('preview не перехватывает next и peek', async () => {
        await request(server).get('/document-counter/next/1/offer').expect(200);
        await request(server).get('/document-counter/peek/1/offer').expect(200);

        expect(numberService.getNextNumber).toHaveBeenCalledTimes(1);
        expect(numberService.peekCurrentNumber).toHaveBeenCalledTimes(1);
        expect(numberService.previewNextNumber).not.toHaveBeenCalled();
    });
});
