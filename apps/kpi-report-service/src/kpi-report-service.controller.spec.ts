import { Test, TestingModule } from '@nestjs/testing';
import { KpiReportServiceController } from './kpi-report-service.controller';
import { KpiReportServiceService } from './kpi-report-service.service';

describe('KpiReportServiceController', () => {
  let kpiReportServiceController: KpiReportServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [KpiReportServiceController],
      providers: [KpiReportServiceService],
    }).compile();

    kpiReportServiceController = app.get<KpiReportServiceController>(KpiReportServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(kpiReportServiceController.getHello()).toBe('Hello World!');
    });
  });
});
