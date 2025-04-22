import { Module } from '@nestjs/common';
import { GsrServiceController } from './gsr.controller';
import { GsrParseService } from './gsr.service';


@Module({
  controllers: [GsrServiceController],
  providers: [GsrParseService],
})
export class GsrModule {}
