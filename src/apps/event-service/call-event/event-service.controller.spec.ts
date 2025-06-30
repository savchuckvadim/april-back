import { Test, TestingModule } from '@nestjs/testing';
import { EventServiceController } from './event-service.controller';
import { EventServiceService } from './event-service.service';

describe('EventServiceController', () => {
  let controller: EventServiceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventServiceController],
      providers: [EventServiceService],
    }).compile();

    controller = module.get<EventServiceController>(EventServiceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
