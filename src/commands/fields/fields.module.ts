import { Module } from '@nestjs/common';
import { FieldsService } from './fields.service';
import { FieldsController } from './fields.controller';
import { PBXModule } from 'src/modules/pbx/pbx.module';

@Module({
  imports: [
    PBXModule
  ],
  controllers: [FieldsController],
  providers: [FieldsService],
})
export class FieldsModule {}
