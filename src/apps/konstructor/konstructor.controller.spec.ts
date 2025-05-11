import { Test, TestingModule } from '@nestjs/testing';
import { KonstructorController } from './konstructor.controller';
import { KonstructorService } from './konstructor.service';

describe('KonstructorController', () => {
  let controller: KonstructorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KonstructorController],
      providers: [KonstructorService],
    }).compile();

    controller = module.get<KonstructorController>(KonstructorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
