import { Injectable } from "@nestjs/common";
import { ProviderRepository } from "./provider.repository";
import { RqEntity } from "./provider.entity";
@Injectable()
export class ProviderService {
    constructor(private readonly providerRepository: ProviderRepository) {}

    async findById(id: number): Promise<RqEntity | null> {
        return await this.providerRepository.findById(id);
    }
}