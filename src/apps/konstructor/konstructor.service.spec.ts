import { Test, TestingModule } from '@nestjs/testing';
import { KonstructorService } from './konstructor.service';

describe('KonstructorService', () => {
  let service: KonstructorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KonstructorService],
    }).compile();

    service = module.get<KonstructorService>(KonstructorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
