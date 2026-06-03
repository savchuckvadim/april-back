import { Test, TestingModule } from '@nestjs/testing';
import { EventSalesController } from './event-sales.controller';
import { EventSalesService } from './event-sales.service';

describe('EventSalesController', () => {
  let eventSalesController: EventSalesController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [EventSalesController],
      providers: [EventSalesService],
    }).compile();

    eventSalesController = app.get<EventSalesController>(EventSalesController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(eventSalesController.getHello()).toBe('Hello World!');
    });
  });
});
