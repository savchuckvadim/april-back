import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { APIOnlineClient } from 'src/clients/online';
import { GarantPricesParseService } from './services/excel-parse/garant-prices-parse.service';
import { StorageService, StorageType } from 'src/core/storage';
@Injectable()
export class GarantPricesService {
    private readonly logger = new Logger(GarantPricesService.name);
    constructor(
        private readonly online: APIOnlineClient,
        private readonly parseService: GarantPricesParseService,
        private readonly storageService: StorageService
    ) { }

    async update() {
        const path = this.storageService.getFilePath(StorageType.APP, 'garant', 'prices.xlsx')
        this.logger.log(path)
        const exists = await this.storageService.fileExistsByType(StorageType.APP, 'garant', 'prices.xlsx')
        this.logger.log(exists)
        if (!exists) {
            const file = await this.storageService.readFileByType(StorageType.APP, 'garant', 'prices.xlsx')
            this.logger.log(file)
            throw new HttpException('File not found', HttpStatus.BAD_REQUEST)
        }
        const prices = await this.parseService.parseProfPrices(path);
        return prices;
    }
}
