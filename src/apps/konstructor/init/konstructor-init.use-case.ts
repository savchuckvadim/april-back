import { Injectable } from "@nestjs/common";
import { Complects, InitComplectService } from "./services/init-complect.service";
import { InfoGroups, InitInfoblockService } from "./services/init-infoblock.service";

export interface KonstruktorInit {
    complects: Complects | null
    infoblocks: InfoGroups[] | null
}
@Injectable()
export class KonstructorInitUseCase {
    constructor(
        private readonly complect: InitComplectService,
        private readonly infoblock: InitInfoblockService
    ) { }

    async init(): Promise<KonstruktorInit> {
        const complects = await this.complect.get()
        const infoblocks = await this.infoblock.get()
        return {
            complects,
            infoblocks
        }
    }
}