import { Injectable } from '@nestjs/common';
import { PriceRepository } from '../../repositories/price.repository';
import { PriceEntity } from '../../entity/price.entity';
import { ComplectPriceExcelParseService } from '../excel/complect-price-excel-parse.service';

@Injectable()
export class ComplectExcelService {
    constructor(
        private readonly repo: PriceRepository,
        private readonly priceExcelService: ComplectPriceExcelParseService,
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
            if (
                !price.complectCode ||
                !price.supplyType ||
                !price.region_type
            ) {
                continue;
            }

            const updatetdPrice = await this.repo.storeByComplect(price);

            updatedPrices.push(updatetdPrice);
        }

        return updatedPrices;
    }
}
