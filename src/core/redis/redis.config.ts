// redis.config.ts
import { ConfigService } from '@nestjs/config';

export function createRedisOptions(
    configService: ConfigService,
): {
   
    url: string | undefined,
    host: string | undefined,
    port: number, maxRetriesPerRequest: number,
    connectTimeout: number
} {
    const url = configService.get<string>('REDIS_URL');
    const host = configService.get<string>('REDIS_HOST') ?? 'redis';
    const port = parseInt(
        configService.get<string>('REDIS_PORT') ?? '6379',
        10,
    );

    return {
        url,
        host,
        port,
        maxRetriesPerRequest: 3,
        connectTimeout: 10000,
    };

}
