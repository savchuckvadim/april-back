import { Injectable, NotFoundException } from '@nestjs/common';
import { PbxUserRepository } from '../repositories/pbx-user.repository';
import { PbxUserEntityDto } from '../dto/pbx-user-entity.dto';
import { PbxUserUpdateDto } from '../dto/pbx-user-update.dto';
import { PortalStoreService } from 'src/modules/portal-konstructor/portal/portal-store.service';

@Injectable()
export class PbxUserService {
    constructor(
        private readonly pbxUserRepository: PbxUserRepository,
        private readonly portalStoreService: PortalStoreService,
    ) {}

    async findById(id: string): Promise<PbxUserEntityDto> {
        const user = await this.pbxUserRepository.findById(id);
        if (!user) throw new NotFoundException('User not found');
        return new PbxUserEntityDto(user);
    }
    async findByPortalId(portalId: string): Promise<PbxUserEntityDto> {
        const user = await this.pbxUserRepository.findByPortalId(portalId);
        if (!user) throw new NotFoundException('User not found');
        return new PbxUserEntityDto(user);
    }
    async findByPortalDomain(portalDomain: string): Promise<PbxUserEntityDto> {
        const user =
            await this.pbxUserRepository.findByPortalDomain(portalDomain);
        if (!user) throw new NotFoundException('User not found');
        return new PbxUserEntityDto(user);
    }
    async findAll(): Promise<PbxUserEntityDto[]> {
        const users = await this.pbxUserRepository.findAll();
        if (!users) throw new NotFoundException('Users not found');
        return users.map(user => new PbxUserEntityDto(user));
    }
    async createByDomain(
        code: string,
        domain: string,
    ): Promise<PbxUserEntityDto> {
        const portal = await this.portalStoreService.getPortalByDomain(domain);
        if (!portal) throw new NotFoundException('Portal not found');
        return await this.create(code, portal.id.toString());
    }
    async create(code: string, portalId: string): Promise<PbxUserEntityDto> {
        const newUser = await this.pbxUserRepository.create({ code }, portalId);
        if (!newUser) throw new NotFoundException('User not created');
        return new PbxUserEntityDto(newUser);
    }
    async update(
        id: string,
        user: PbxUserUpdateDto,
    ): Promise<PbxUserEntityDto> {
        const updatedUser = await this.pbxUserRepository.update(id, user);
        if (!updatedUser) throw new NotFoundException('User not updated');
        return new PbxUserEntityDto(updatedUser);
    }
    async delete(id: string): Promise<boolean> {
        return await this.pbxUserRepository.delete(id);
    }
}
