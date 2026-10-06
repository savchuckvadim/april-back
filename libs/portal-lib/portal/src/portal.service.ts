import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from 'src/core/redis/redis.service';
import { IPortal, IPortalResponse } from './interfaces/portal.interface';
import { Redis } from 'ioredis';
import { APIOnlineClient } from '@lib/online';
import { PortalModelFactory } from './factory/potal-model.factory';
import { PortalModel } from './services/portal.model';
import { getErrorString, TimedCache } from '@lib/shared';

@Injectable()
export class PortalService {
    private readonly logger = new Logger(PortalService.name);
    private readonly CACHE_TTL = 36000;
    /** Минимальный интервал между принудительными обновлениями слепка. */
    private static readonly REFRESH_COOLDOWN_SEC = 300;
    /** Сколько сырой слепок живёт в памяти процесса. */
    private static readonly RAW_PORTAL_TTL_MS = 30_000;
    private readonly redis: Redis;
    private readonly rawPortalCache = new TimedCache<string>(
        PortalService.RAW_PORTAL_TTL_MS,
    );

    constructor(
        private readonly redisService: RedisService,
        private readonly apiOnlineClient: APIOnlineClient,
        private readonly modelFactory: PortalModelFactory,
    ) {
        this.logger.log('PortalService initialized');
        this.redis = this.redisService.getClient();
    }

    /**
     * Слепок портала: память процесса → Redis → online-API.
     *
     * Вебхук портала в лог НЕ пишется. Раньше он печатался открытым текстом
     * на каждое чтение слепка — то есть на каждый init, десятки раз на одно
     * открытие сделки, и уезжал в общие логи (разбор 05.10.2026).
     *
     * Сырой JSON слепка (около мегабайта) держится в памяти процесса
     * полминуты: без этого он тянулся из Redis на каждый init. Разбирается
     * JSON на каждый вызов заново — вызывающий получает СВОЙ объект и может
     * его менять, не задевая остальных.
     */
    async getPortalByDomain(domain: string): Promise<IPortal> {
        const cacheKey = `portal_${domain}`;
        const cached = await this.rawPortalCache.get(domain, async () => {
            const raw = await this.redis.get(cacheKey);
            return raw ?? undefined;
        });

        if (cached) {
            return JSON.parse(cached) as IPortal;
        }

        this.logger.log(
            `Слепок портала ${domain} не найден в кэше — запрашиваем online-API`,
        );
        const response = await this.apiOnlineClient.request(
            'post',
            'getportal',
            { domain },
            'portal',
        );
        if (response.resultCode === 0) {
            const portal = response.data as IPortal;
            await this.redis.set(
                cacheKey,
                JSON.stringify(portal),
                'EX',
                this.CACHE_TTL,
            );
            return portal;
        }
        this.logger.error(`Error getting portal: ${response.message}`);
        throw new Error(response.message as string);
    }
    /**
     * Принудительно перечитывает слепок портала из online-API, сбросив кэш.
     *
     * Зачем: слепок живёт 10 часов, а pbx-сущности (поля, стадии) ставят на
     * портал в любой момент. До истечения TTL приложения считают их
     * «неустановленными» и молча теряют записи. Потребитель, обнаруживший
     * заведомо неполный слепок, зовёт этот метод.
     *
     * Кулдаун: не чаще раза в REFRESH_COOLDOWN_SEC на домен — иначе портал
     * без установленных полей дёргал бы внешний API на каждой операции.
     * Кулдаун активен — возвращаем то, что есть (без запроса).
     */
    async refreshByDomain(domain: string): Promise<IPortal> {
        const cooldownKey = `portal_refresh_${domain}`;
        const fresh = await this.redis.set(
            cooldownKey,
            '1',
            'EX',
            PortalService.REFRESH_COOLDOWN_SEC,
            'NX',
        );
        if (fresh === null) {
            this.logger.log(
                `Обновление слепка ${domain} пропущено — кулдаун ещё активен`,
            );
            return this.getPortalByDomain(domain);
        }

        this.logger.log(`Принудительное обновление слепка портала ${domain}`);
        this.rawPortalCache.delete(domain);
        await this.redis.del(`portal_${domain}`);
        return this.getPortalByDomain(domain);
    }

    async getModelByDomain(domain: string): Promise<PortalModel> {
        Logger.log('getModelByDomain: ' + domain);
        const portal = await this.getPortalByDomain(domain);
        Logger.log('getModelByDomain: ' + portal?.id);
        return this.modelFactory.create(portal);
    }
    /** Адрес вебхука портала. В лог не пишется: это ключ доступа. */
    async getHook(domain: string): Promise<string> {
        const portal = await this.getPortalByDomain(domain);
        return `https://${domain}/${portal.C_REST_WEB_HOOK_URL}`;
    }

    async getPortalData(domain: string): Promise<IPortalResponse> {
        this.logger.log(`Getting portal data for domain: ${domain}`);
        try {
            const portal = await this.getPortalByDomain(domain);
            this.logger.log('Portal data retrieved successfully');
            return {
                success: true,
                data: portal,
            };
        } catch (error) {
            const err = getErrorString(error);
            this.logger.error(`Error getting portal data: ${err}`);
            return {
                success: false,
                error: err,
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
