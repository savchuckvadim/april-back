import { StorageService } from "src/core/storage";
import { PriceRepository } from "./price.repository";

export class PriceInstallService {
    constructor(
        private readonly storage: StorageService,
        private readonly: PriceRepository
    ) { }

    setOrUpdate() {

    }
}