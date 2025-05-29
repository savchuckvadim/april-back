import { Module } from '@nestjs/common';
import { ChangeDealCategoryService } from './change-deal-category.service';
import { ChangeDealCategoryController } from './change-deal-category.controller';
import { PBXModule } from 'src/modules/pbx/pbx.module';

@Module({
  imports: [
    PBXModule
  ],
  controllers: [ChangeDealCategoryController],
  providers: [ChangeDealCategoryService],
})
export class ChangeDealCategoryModule {}
