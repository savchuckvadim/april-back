import { Test, TestingModule } from '@nestjs/testing';
import { EventServiceService } from './event-service.service';

describe('EventServiceService', () => {
  let service: EventServiceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventServiceService],
    }).compile();

    service = module.get<EventServiceService>(EventServiceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
