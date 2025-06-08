import { Module } from '@nestjs/common';

import { FieldsController } from './fields.controller';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { FieldsFactoryService } from './factory/fields-factory.service';

@Module({
  imports: [
    PBXModule
  ],
  controllers: [FieldsController],
  providers: [FieldsFactoryService],
})
export class FieldsModule {}
