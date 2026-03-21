import { Injectable } from '@nestjs/common';
import { InfoblockRepository } from './infoblock.repository';
import { InfoblockEntity } from './infoblock.entity';
import { InfoblockEntityDto } from './dto/infoblock-entity.dto';

@Injectable()
export class InfoblockService {
    constructor(private readonly infoblockRepository: InfoblockRepository) {}

    async getInfoblocks(): Promise<InfoblockEntity[] | null> {
        return this.infoblockRepository.findMany();
    }

    async getInfoblockByCode(code: string): Promise<InfoblockEntity | null> {
        return this.infoblockRepository.findByCode(code);
    }

    async getInfoblocksByCodse(
        codes: string[],
    ): Promise<InfoblockEntity[] | null> {
        return await this.infoblockRepository.findByCodes(codes);
    }

    async getInfoblockById(id: number): Promise<InfoblockEntity | null> {
        return this.infoblockRepository.findById(id);
    }

    async create(
        createInfoblockDto: Partial<InfoblockEntity>,
    ): Promise<InfoblockEntityDto> {
        return new InfoblockEntityDto(
            await this.infoblockRepository.create(createInfoblockDto),
        );
    }

    async update(
        id: string,
        updateInfoblockDto: Partial<InfoblockEntity>,
    ): Promise<InfoblockEntity | null> {
        return this.infoblockRepository.update({ id, ...updateInfoblockDto });
    }

    async delete(id: number): Promise<boolean> {
        return await this.infoblockRepository.delete(id.toString());
    }
    async setGroup(
        infoblockId: string,
        groupId: string | null,
    ): Promise<InfoblockEntity | null> {
        return this.infoblockRepository.setGroup(infoblockId, groupId);
    }

    // async setParent(infoblockId: string, parentId: string | null): Promise<InfoblockEntity | null> {
    //     return this.infoblockRepository.setParent(infoblockId, parentId);
    // }

    // async setRelation(infoblockId: string, relationId: string | null): Promise<InfoblockEntity | null> {
    //     return this.infoblockRepository.setRelation(infoblockId, relationId);
    // }

    // async setRelated(infoblockId: string, relatedId: string | null): Promise<InfoblockEntity | null> {
    //     return this.infoblockRepository.setRelated(infoblockId, relatedId);
    // }

    async setExcluded(
        infoblockId: string,
        excludedId: string | null,
    ): Promise<InfoblockEntity | null> {
        return this.infoblockRepository.setExcluded(infoblockId, excludedId);
    }

    async addPackages(
        infoblockId: string,
        packageIds: string[],
    ): Promise<InfoblockEntity | null> {
        return this.infoblockRepository.addPackages(infoblockId, packageIds);
    }

    async removePackages(
        infoblockId: string,
        packageIds: string[],
    ): Promise<InfoblockEntity | null> {
        return this.infoblockRepository.removePackages(infoblockId, packageIds);
    }

    // async setPackages(infoblockId: string, packageIds: string[]): Promise<InfoblockEntity | null> {
    //     return this.infoblockRepository.setPackages(infoblockId, packageIds);
    // }

    // Методы для управления пакетами, в которые входит инфоблок (packages)
    async addInfoblocksToPackage(
        infoblockIds: string[],
        packageId: string,
    ): Promise<InfoblockEntity | null> {
        return this.infoblockRepository.addInfoblocksToPackage(
            infoblockIds,
            packageId,
        );
    }

    async removeFromPackages(
        infoblockIds: string[],
        packageId: string,
    ): Promise<InfoblockEntity | null> {
        return this.infoblockRepository.removeInfoblocksFromPackage(
            infoblockIds,
            packageId,
        );
    }

    async setInPackages(
        infoblockIds: string[],
        packageId: string,
    ): Promise<InfoblockEntity | null> {
        return this.infoblockRepository.setInfoblocksInPackage(
            infoblockIds,
            packageId,
        );
    }
}
