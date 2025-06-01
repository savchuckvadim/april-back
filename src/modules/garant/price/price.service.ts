import { PriceRepository } from "./price.repository";

export class PriceService {
    constructor(

        private readonly repo: PriceRepository
    ) { }

    async getAll() {
        return await this.repo.findMany()
    }
}