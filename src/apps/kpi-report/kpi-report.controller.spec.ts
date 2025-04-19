import { Test, TestingModule } from '@nestjs/testing';
import { KpiReportController } from './kpi-report.controller';
import { KpiReportService } from './services/kpi-report.service';

describe('KpiReportController', () => {
  let controller: KpiReportController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KpiReportController],
      providers: [KpiReportService],
    }).compile();

    controller = module.get<KpiReportController>(KpiReportController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
