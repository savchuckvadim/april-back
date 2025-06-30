import { GsrBitrixService } from "./gsr-bitrix.service";
import { GsrParseService } from "./gsr-parse.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class GsrMigrateUseCase {
    constructor(
        private readonly parseService: GsrParseService,
        private readonly bitrixService: GsrBitrixService

    ) { }

    async migrate(domain: string, userId: string, filePath: string) {
        const parsedData = (await this.parseService.parseExcel(filePath)).filter((_, i) => i > 0);

        // return parsedData
        const result = await this.bitrixService.migrateToBitrix(domain, userId, parsedData);
        return { count: parsedData.length, result: result, parsedData: parsedData.map(item => ({ supplyDate: item.supplyDate, ...item.contract })) }

    }

    async getDeals(domain: string, filePath: string) {
        const parsedData = await this.parseService.parseExcel(filePath);
        const result = await this.bitrixService.getDeals(domain, parsedData);
        return result
    }

    async updateDeals(domain: string, userId: string, filePath: string) {
        const parsedData = await this.parseService.parseExcel(filePath);
        const result = await this.bitrixService.updateDeals(domain, userId, parsedData);
        return result
    }
}
