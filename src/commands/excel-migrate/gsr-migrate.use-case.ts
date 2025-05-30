import { GsrBitrixService } from "./gsr-bitrix.service";
import { GsrParseService } from "./gsr-parse.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class GsrMigrateUseCase {
    constructor(
        private readonly parseService: GsrParseService,
        private readonly bitrixService: GsrBitrixService

    ) { }

    async migrate(domain: string, filePath: string) {
        const parsedData = await this.parseService.parseExcel(filePath);

        const result = await this.bitrixService.migrateToBitrix(domain, parsedData);
        return result

    }

    async getDeals(domain: string, filePath: string) {
        const parsedData = await this.parseService.parseExcel(filePath);
        const result = await this.bitrixService.getDeals(domain, parsedData);
        return result
    }

    async updateDeals(domain: string, filePath: string) {
        const parsedData = await this.parseService.parseExcel(filePath);
        const result = await this.bitrixService.updateDeals(domain, parsedData);
        return result
    }
}
