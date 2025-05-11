import { Injectable } from "@nestjs/common";
import { InitSupplyService } from "./init-supply.service";


@Injectable()
export class InitSupplyUseCase {

    constructor(
        private readonly initSupplyService: InitSupplyService
    ){}

    initSupply(data: any): Promise<any> {
        return this.initSupplyService.initSupply(data);
    }


}

