import { Module } from '@nestjs/common';
import { BitrixController } from './bitrix.controller';
import { BitrixService } from './bitrix.service';

@Module({
  imports: [],
  controllers: [BitrixController],
  providers: [BitrixService],
})
export class BitrixModule {}
