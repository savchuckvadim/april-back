import { Test, TestingModule } from '@nestjs/testing';
import { KonstructorController } from './konstructor.controller';
import { KonstructorService } from './konstructor.service';

describe('KonstructorController', () => {
    let konstructorController: KonstructorController;

    beforeEach(async () => {
        const app: TestingModule = await Test.createTestingModule({
            controllers: [KonstructorController],
            providers: [KonstructorService],
        }).compile();

        konstructorController = app.get<KonstructorController>(
            KonstructorController,
        );
    });

    describe('root', () => {
        it('should return "Hello World!"', () => {
            expect(konstructorController.getHello()).toBe('Hello World!');
        });
    });
});
