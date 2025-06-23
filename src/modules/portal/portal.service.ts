import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from 'src/core/redis/redis.service';
import { IPortal, IPortalResponse } from './interfaces/portal.interface';
import { Redis } from 'ioredis';
import { APIOnlineClient } from '../../clients/online/';
import { PortalModelFactory } from './factory/potal-model.factory';
import { PortalModel } from './services/portal.model';

@Injectable()
export class PortalService {
    private readonly logger = new Logger(PortalService.name);
    private readonly CACHE_TTL = 36000;
    private readonly redis: Redis;

    constructor(
        private readonly redisService: RedisService,
        private readonly apiOnlineClient: APIOnlineClient,
        private readonly modelFactory: PortalModelFactory
    ) {
        this.logger.log('PortalService initialized');
        this.redis = this.redisService.getClient();
    }

    async getPortalByDomain(domain: string): Promise<IPortal> {
        this.logger.log(`Getting portal for domain: ${domain}`);
        const cacheKey = `portal_${domain}`;
        const cached = await this.redis.get(cacheKey);


        if (cached) {
            this.logger.log('Returning cached portal');
            const portal = JSON.parse(cached);
            this.logger.log(`Cached portal domain: ${portal?.domain}`);
            this.logger.log(`Cached portal webhook: ${portal?.C_REST_WEB_HOOK_URL}`);
            return portal;
        }

        this.logger.log('Portal not found in cache, requesting from API');
        const response = await this.apiOnlineClient.request('post', 'getportal', { domain }, 'portal');
        this.logger.log(`API response code: ${response.resultCode}`);
        if (response.resultCode === 0) {
            const portal = response.data;
            this.logger.log(`Portal from API domain: ${portal?.domain}`);
            this.logger.log(`Portal from API webhook: ${portal?.C_REST_WEB_HOOK_URL}`);
            this.logger.log(`Caching portal for domain: ${domain}`);
            await this.redis.set(cacheKey, JSON.stringify(portal), 'EX', this.CACHE_TTL);
            return portal;
        }
        this.logger.error(`Error getting portal: ${response.message}`);
        throw new Error(response.message);
    }
    async getModelByDomain(domain: string): Promise<PortalModel> {
        Logger.log('getModelByDomain: ' + domain);
        const portal = await this.getPortalByDomain(domain);
        Logger.log('getModelByDomain: ' + portal?.id);
        return this.modelFactory.create(portal);
    }
    async getHook(domain: string): Promise<string> {
        this.logger.log(`Getting hook for domain: ${domain}`);
        const portal = await this.getPortalByDomain(domain);
        const hook = `https://${domain}/${portal.C_REST_WEB_HOOK_URL}`;
        this.logger.log(`Hook URL: ${hook}`);
        return hook;
    }

    async getPortalData(domain: string): Promise<IPortalResponse> {
        this.logger.log(`Getting portal data for domain: ${domain}`);
        try {
            const portal = await this.getPortalByDomain(domain);
            this.logger.log('Portal data retrieved successfully');
            return {
                success: true,
                data: portal as IPortal
            };
        } catch (error) {
            this.logger.error(`Error getting portal data: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // async updatePortalData(domain: string, data: IPortal): Promise<IPortalResponse> {
    //     this.logger.log(`Updating portal data for domain: ${domain}`);
    //     await this.redis.set(domain, JSON.stringify(data), 'EX', this.CACHE_TTL);
    //     this.logger.log('Portal data updated successfully');
    //     return {
    //         success: true,
    //         data: data as IPortal
    //     };
    // }
} 