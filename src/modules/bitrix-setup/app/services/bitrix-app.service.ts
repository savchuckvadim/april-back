import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';

import { CreateBitrixAppDto, GetBitrixAppDto } from '../dto/bitrix-app.dto';
import { PrismaService } from 'src/core/prisma';

import { BitrixAppRepository } from '../repositories/bitrix-app.repository';
import { BitrixAppEntity } from '../model/bitrix-app.model';
import { PortalService } from 'src/modules/portal-konstructor/portal/portal.service';
import { createPortalEntityFromPrisma } from 'src/modules/portal-konstructor/portal/lib/portal-entity.util'
import { PortalEntity } from 'src/modules/portal-konstructor/portal/portal.entity';
import { BitrixTokenService } from '../../token/services/bitrix-token.service';
import { BitrixTokenEntity, SetBitrixSecretDto } from '../../token';
import { BITRIX_APP_CODES } from '../enums/bitrix-app.enum';

@Injectable()
export class BitrixAppService {
    constructor(
        private readonly repository: BitrixAppRepository,
        private readonly prisma: PrismaService,
        private readonly portalService: PortalService,
        private readonly tokenService: BitrixTokenService,
    ) { }



    // BitrixApp methods
    async storeOrUpdateApp(dto: CreateBitrixAppDto): Promise<{ app: BitrixAppEntity; message: string }> {
        try {

            let portal: PortalEntity | null = await this.portalService.getPortalByDomain(dto.domain);
            if (!portal) {
                portal = await this.portalService.create({
                    domain: dto.domain,
                });
            }

            // Create or update app
            const app = await this.repository.storeOrUpdate({
                portal_id: BigInt(portal!.id!),
                group: dto.group,
                type: dto.type,
                code: dto.code,
                status: dto.status,
            });

            if (!app) {
                throw new BadRequestException('Failed to create or update app');
            }

            // Create or update token
            const token = await this.tokenService.storeOrUpdateAppToken(app.id, dto.token);

            return {
                app,
                message: 'Bitrix App saved',
            };
        } catch (error) {
            throw new BadRequestException(`Failed to store or update app: ${error.message}`);
        }
    }

    async setSecret(domain: string, code: BITRIX_APP_CODES, dto: SetBitrixSecretDto): Promise<{
        token: BitrixTokenEntity | null;
        message: string;
    }> {
        const app = await this.repository.findByCodeAndDomain(code, domain);
        if (!app) {
            return {
                token: null,
                message: `App with domain ${domain} and code ${code} not found`,
            };
        }
        return await this.tokenService.storeOrUpdateAppSecret(app.id, dto);

    }

    async getApp(dto: GetBitrixAppDto): Promise<BitrixAppEntity> {
        const app = await this.repository.findByCodeAndDomain(dto.code, dto.domain);
        if (!app) {
            throw new NotFoundException(`App with code ${dto.code} and domain ${dto.domain} not found`);
        }

        return app;
    }

    async getAllApps(): Promise<BitrixAppEntity[]> {
        const apps = await this.repository.findMany();
        if (!apps) {
            return [];
        }

        return apps;
    }

    async getAppsByPortal(domain: string): Promise<BitrixAppEntity[]> {
        const apps = await this.repository.findByPortal(domain);
        if (!apps) {
            return [];
        }

        return apps;
    }

    async updateApp(id: number, dto: Partial<BitrixAppEntity>): Promise<BitrixAppEntity> {
        const app = await this.repository.findById(BigInt(id));
        if (!app) {
            throw new NotFoundException(`App with id ${id} not found`);
        }

        return this.repository.update(BigInt(id), dto);
    }

    async deleteApp(id: bigint): Promise<boolean> {
        return await this.repository.delete(id);
    }
}
