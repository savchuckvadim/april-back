import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';

import { CreateBitrixAppDto, CreateBitrixAppWithTokenDto, GetBitrixAppDto } from '../dto/bitrix-app.dto';
import { PrismaService } from 'src/core/prisma';

import { BitrixAppRepository } from '../repositories/bitrix-app.repository';
import { BitrixAppEntity, BitrixAppDto } from '../model/bitrix-app.model';
import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';
import { PortalEntity } from '@/modules/portal-konstructor/portal/portal.entity';
import { BitrixTokenService } from '../../token/services/bitrix-token.service';
import { BitrixTokenEntity, SetBitrixSecretDto } from '../../token';
import { BITRIX_APP_CODES, BITRIX_APP_GROUPS, BITRIX_APP_TYPES } from '../enums/bitrix-app.enum';
import { EnabledAppDto } from '../dto/enaled-app.dto';
import { BitrixSecretService } from '../../secret/services/bitrix-secret.service';

@Injectable()
export class BitrixAppService {
    constructor(
        private readonly repository: BitrixAppRepository,
        private readonly prisma: PrismaService,
        private readonly portalService: PortalStoreService,
        private readonly tokenService: BitrixTokenService,
        private readonly secretService: BitrixSecretService,
    ) { }


    async getEnabledApps(): Promise<EnabledAppDto[]> {
        const app: EnabledAppDto = {
            code: BITRIX_APP_CODES.SALES,
            group: BITRIX_APP_GROUPS.SALES,
            type: BITRIX_APP_TYPES.FULL,
            placements: [
                {
                    type: BITRIX_APP_TYPES.KONSTRUCTOR,
                    title: 'Конструктор Коммерческих Предложений',
                    description: 'Встраиваемый виджет Конструктор Коммерческих Предложений',
                    value: 'Встраиваемый виджет Конструктор Коммерческих Предложений',

                },
                {
                    type: BITRIX_APP_TYPES.EVENT,
                    title: 'Приложение звонки',
                    description: 'Встраиваемый виджет Приложение звонки',
                    value: 'Встраиваемый виджет Приложение звонки',

                },
                {
                    type: BITRIX_APP_TYPES.WEBHOOK,
                    title: 'Webhook Холодный обзвон',
                    description: 'Встраиваемый виджет Webhook Холодный обзвон',
                    value: 'Встраиваемый виджет Webhook Холодный обзвон',

                },
            ],

        };
        return [app];
    }

    // BitrixApp methods
    // BitrixApp methods
    async storeOrUpdateApp(dto: CreateBitrixAppDto): Promise<{
        app: BitrixAppDto;
        message: string
    }> {
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

            // NO need to create or update token

            return {
                app: new BitrixAppDto(app),
                message: 'Bitrix App saved and token created',
            };
        } catch (error) {
            throw new BadRequestException(`Failed to store or update app: ${error.message}`);
        }
    }


    async storeOrUpdateAppWithToken(dto: CreateBitrixAppWithTokenDto): Promise<{
        app: BitrixAppEntity;
        token: BitrixTokenEntity;
        message: string
    }> {
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
                token: token.token,
                message: 'Bitrix App saved and token created',
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
    async getAppsByPortalId(portalId: number): Promise<BitrixAppEntity[]> {
        const apps = await this.repository.findByPortalId(portalId);
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
