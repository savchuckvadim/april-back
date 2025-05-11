import { Module } from '@nestjs/common';
import { InitSupplyController } from './supply/init-supply.ts/init-supply.controller';
import { InitSupplyService } from './supply/init-supply.ts/init-supply.service';
import { InitSupplyUseCase } from './supply/init-supply.ts/init-supply.use-case';

@Module({
  controllers: [InitSupplyController],
  providers: [
    InitSupplyUseCase,
    InitSupplyService
  ],
})
export class KonstructorModule {}
