import { Module } from '@nestjs/common';
import { GarantPricesService } from './garant-prices.service';
import { GarantPricesController } from './garant-prices.controller';
import { OnlineClientModule } from 'src/clients/online';
import { GarantPricesParseService } from './services/excel-parse/garant-prices-parse.service';
import { StorageModule } from 'src/core/storage/storage.module';


@Module({
  imports: [
    OnlineClientModule,
    StorageModule
  ],
  controllers: [GarantPricesController],
  providers: [GarantPricesService, GarantPricesParseService],
})
export class GarantPricesModule {}
