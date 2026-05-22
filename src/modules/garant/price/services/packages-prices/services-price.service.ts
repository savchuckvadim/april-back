import { Injectable } from '@nestjs/common';
import { PriceRepository } from '../../repositories/price.repository';
import { ServicesPriceExcelParseService } from '../excel/services-price-excel-parse.service';
import { PriceEntity } from '../../entity/price.entity';

@Injectable()
export class ServicesPriceService {
    constructor(
        private readonly repo: PriceRepository,
        private readonly priceExcelService: ServicesPriceExcelParseService,
    ) {}

    async updateFromExcel(): Promise<PriceEntity[]> {
        // Читаем данные из Excel
        const prices = await this.priceExcelService.readPricesFromExcel();
        if (!prices) {
            throw new Error('Failed to read prices from Excel file');
        }
        // Обновляем или создаем цены
        const updatedPrices: PriceEntity[] = [];

        for (const price of prices) {
            if (!price.code || !price.region_type || !price.garantPackageCode) {
                continue;
            }

            const updatetdPrice = await this.repo.storeByPackage(price);

            updatedPrices.push(updatetdPrice);
        }
        return updatedPrices;
    }
}
