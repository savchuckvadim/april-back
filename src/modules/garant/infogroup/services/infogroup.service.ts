import { Injectable } from '@nestjs/common';
import { InfogroupEntity } from '../entity/infogroup.entity';
import { InfogroupRepository } from '../repositories/infogroup.repository';

@Injectable()
export class InfogroupService {
    constructor(private readonly infogroupRepository: InfogroupRepository) {}

    async create(
        infogroup: Partial<InfogroupEntity>,
    ): Promise<InfogroupEntity | null> {
        return this.infogroupRepository.create(infogroup);
    }

    async update(
        infogroup: Partial<InfogroupEntity>,
    ): Promise<InfogroupEntity | null> {
        return this.infogroupRepository.update(infogroup);
    }

    async findById(id: number): Promise<InfogroupEntity | null> {
        return this.infogroupRepository.findById(id);
    }

    async findMany(): Promise<InfogroupEntity[] | null> {
        return this.infogroupRepository.findMany();
    }

    async addInfoblocks(
        infogroupId: string,
        infoblockIds: string[],
    ): Promise<InfogroupEntity | null> {
        return this.infogroupRepository.addInfoblocks(
            infogroupId,
            infoblockIds,
        );
    }

    async removeInfoblocks(
        infogroupId: string,
        infoblockIds: string[],
    ): Promise<InfogroupEntity | null> {
        return this.infogroupRepository.removeInfoblocks(
            infogroupId,
            infoblockIds,
        );
    }

    async setInfoblocks(
        infogroupId: string,
        infoblockIds: string[],
    ): Promise<InfogroupEntity | null> {
        return this.infogroupRepository.setInfoblocks(
            infogroupId,
            infoblockIds,
        );
    }
}
