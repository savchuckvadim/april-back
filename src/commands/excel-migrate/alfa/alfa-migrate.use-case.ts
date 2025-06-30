
import { Injectable } from "@nestjs/common";
import { AlfaBitrixService } from "./services/alfa-bitrix.service";
import { AlfaParseService } from "./services/alfa-parse.service";

@Injectable()
export class AlfaMigrateUseCase {
    constructor(
        private readonly parseService: AlfaParseService,
        private readonly bitrixService: AlfaBitrixService

    ) { }

    async migrate(domain: string, filePath: string) {
        const parsedData = (await this.parseService.parseExcel(filePath)).filter((item, i) => i > 0);

        //  return parsedData
        const result = await this.bitrixService.migrate(domain, parsedData);
        return {
            // parceCount: parsedData.length,
            // parsedData,
            result
        }
        // return { count: parsedData.length, result: result, parsedData: parsedData.map(item => ({ supplyDate: item.supplyDate, ...item.contract })) }

    }


}
