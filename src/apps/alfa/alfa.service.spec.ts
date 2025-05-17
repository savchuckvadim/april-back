import { Test, TestingModule } from '@nestjs/testing';
import { AlfaService } from './alfa.service';

describe('AlfaService', () => {
  let service: AlfaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AlfaService],
    }).compile();

    service = module.get<AlfaService>(AlfaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
