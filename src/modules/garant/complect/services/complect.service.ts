import { Injectable } from '@nestjs/common';
import { ComplectEntity } from '../complect.entity';
import { ComplectRepository } from '../repository/complect.repository';
import { CreateComplectDto } from '../dto/create-complect.dto';
import { InfoblockLightEntity } from '../../infoblock/infoblock.entity';
import { InfoblockService } from '../../infoblock/infoblock.service';
import { getLightFromEntity } from '../../infoblock/lib/infoblock-entity.util';
@Injectable()
export class ComplectService {
    constructor(
        private readonly complectRepository: ComplectRepository,
        private readonly infoblockService: InfoblockService,
    ) {}

    async create(
        createComplectDto: CreateComplectDto,
    ): Promise<ComplectEntity | null> {
        const complect = new ComplectEntity();
        Object.assign(complect, createComplectDto);
        return this.complectRepository.create(complect);
    }

    async findAll(): Promise<ComplectEntity[] | null> {
        return await this.complectRepository.findMany();
    }

    async findById(id: string): Promise<ComplectEntity | null> {
        return await this.complectRepository.findById(id);
    }

    async findByCode(code: string): Promise<ComplectEntity | null> {
        return await this.complectRepository.findByCode(code);
    }

    async update(
        id: string,
        updateComplectDto: CreateComplectDto,
    ): Promise<ComplectEntity | null> {
        const complect = new ComplectEntity();
        Object.assign(complect, { id, ...updateComplectDto });
        return await this.complectRepository.update(complect);
    }

    async getAvailableInfoblocks(
        id: string,
    ): Promise<InfoblockLightEntity[] | undefined> {
        const complect = await this.findById(id);
        if (!complect) {
            throw new Error('Комплект не найден');
        }
        if (!complect.infoblocks) {
            throw new Error('Инфоблоки у комплекта не найдены');
        }
        return complect.infoblocks.map(infoblock =>
            getLightFromEntity(infoblock),
        );
    }

    async addInfoblocks(
        complectId: string,
        infoblockIds: string[],
    ): Promise<ComplectEntity | null> {
        return await this.complectRepository.addInfoblocks(
            complectId,
            infoblockIds,
        );
    }

    async removeInfoblocks(
        complectId: string,
        infoblockIds: string[],
    ): Promise<ComplectEntity | null> {
        return await this.complectRepository.removeInfoblocks(
            complectId,
            infoblockIds,
        );
    }

    async removeInfoblock(
        complectId: string,
        infoblockId: string,
    ): Promise<ComplectEntity | null> {
        return await this.complectRepository.removeInfoblock(
            complectId,
            infoblockId,
        );
    }

    async setInfoblocks(
        complectId: string,
        infoblockIds: string[],
    ): Promise<ComplectEntity | null> {
        return await this.complectRepository.setInfoblocks(
            complectId,
            infoblockIds,
        );
    }
}
