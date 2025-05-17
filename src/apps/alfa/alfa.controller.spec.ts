import { Test, TestingModule } from '@nestjs/testing';
import { AlfaController } from './alfa.controller';
import { AlfaService } from './alfa.service';

describe('AlfaController', () => {
  let controller: AlfaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlfaController],
      providers: [AlfaService],
    }).compile();

    controller = module.get<AlfaController>(AlfaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
