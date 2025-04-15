import { Test, TestingModule } from '@nestjs/testing';
import { GenerateSupplyReportUseCase } from './generate-supply-report.use-case';

describe('GenerateSupplyReportService', () => {
  let service: GenerateSupplyReportUseCase;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GenerateSupplyReportUseCase],
    }).compile();

    service = module.get<GenerateSupplyReportUseCase>(GenerateSupplyReportUseCase);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
