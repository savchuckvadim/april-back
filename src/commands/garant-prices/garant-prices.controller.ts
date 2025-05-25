import { Controller, Get } from '@nestjs/common';
import { GarantPricesService } from './garant-prices.service';

@Controller('garant-prices')
export class GarantPricesController {
  constructor(private readonly garantPricesService: GarantPricesService) {}

  @Get()
  async updateGarantPrices() {
    return this.garantPricesService.update();
  }
}
