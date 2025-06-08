import { Injectable } from "@nestjs/common";
import { ComplectEntity } from "../complect.entity";
import { ComplectRepository } from "../repository/complect.repository";
import { CreateComplectDto } from "../dto/create-complect.dto";
import { InfoblockLightEntity } from '../../infoblock/infoblock.entity';
import { InfoblockService } from '../../infoblock/infoblock.service';
import { getLightFromEntity } from '../../infoblock/lib/infoblock-entity.util';
@Injectable()
export class ComplectService {
    constructor(
        private readonly complectRepository: ComplectRepository,
        private readonly infoblockService: InfoblockService
    ) { }

    async create(createComplectDto: CreateComplectDto): Promise<ComplectEntity | null> {
        const complect = new ComplectEntity();
        Object.assign(complect, createComplectDto);
        return this.complectRepository.create(complect);
    }

    async findAll(): Promise<ComplectEntity[] | null> {
        return this.complectRepository.findMany();
    }

    async findById(id: string): Promise<ComplectEntity | null> {
        return this.complectRepository.findById(id);
    }

    async update(id: string, updateComplectDto: CreateComplectDto): Promise<ComplectEntity | null> {
        const complect = new ComplectEntity();
        Object.assign(complect, { id, ...updateComplectDto });
        return this.complectRepository.update(complect);
    }

    async getAvailableInfoblocks(id: string): Promise<InfoblockLightEntity[] | undefined> {
        const complect = await this.findById(id);
        if (!complect) {
            throw new Error('Комплект не найден');
        }
        if (!complect.infoblocks) {
            throw new Error('Инфоблоки у комплекта не найдены');
        }
        return complect.infoblocks.map(infoblock => getLightFromEntity(infoblock));
    }
} 