import { Injectable } from "@nestjs/common";
import { InfogroupEntity } from "./infogroup.entity";
import { InfogroupRepository } from "./infogroup.repository";

@Injectable()
export class InfogroupService {
    constructor(private readonly infogroupRepository: InfogroupRepository) { }

    async create(infogroup: Partial<InfogroupEntity>): Promise<InfogroupEntity | null> {
        return this.infogroupRepository.create(infogroup);
    }

    async update(infogroup: Partial<InfogroupEntity>): Promise<InfogroupEntity | null> {
        return this.infogroupRepository.update(infogroup);
    }

    async findById(id: number): Promise<InfogroupEntity | null> {
        return this.infogroupRepository.findById(id);
    }

    async findMany(): Promise<InfogroupEntity[] | null> {
        return this.infogroupRepository.findMany();
    }
} 