import { Test, TestingModule } from '@nestjs/testing';
import { BitrixController } from './bitrix.controller';
import { BitrixService } from './bitrix.service';

describe('BitrixController', () => {
    let bitrixController: BitrixController;

    beforeEach(async () => {
        const app: TestingModule = await Test.createTestingModule({
            controllers: [BitrixController],
            providers: [BitrixService],
        }).compile();

        bitrixController = app.get<BitrixController>(BitrixController);
    });

    describe('root', () => {
        it('should return "Hello World!"', () => {
            expect(bitrixController.getHello()).toBe('Hello World!');
        });
    });
});
