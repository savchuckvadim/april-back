import { Module } from '@nestjs/common';
import { InitSupplyController } from './supply/init-supply.ts/init-supply.controller';
import { InitSupplyService } from './supply/init-supply.ts/init-supply.service';
import { InitSupplyUseCase } from './supply/init-supply.ts/init-supply.use-case';
import { TemplateModule } from './modules/template/template.module';

@Module({
  imports: [TemplateModule],
  controllers: [InitSupplyController],
  providers: [
    InitSupplyUseCase,
    InitSupplyService
  ],
  exports: [
    TemplateModule
  ]
})
export class KonstructorModule { }
