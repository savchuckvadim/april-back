import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from 'src/core/redis/redis.service';
import { BxDepartmentCacheResetResponseDto } from '../dto/bx-department-cache.dto';

/**
 * Префиксы ключей кэша либы bx-department.
 * Должны соответствовать ключам в BxDepartmentService (`department_*`),
 * BxDepartmentStructureService (`department_structure_v2_*`)
 * и BxTeamService (`bx_team_*`).
 */
const CACHE_KEY_PREFIXES = [
    'department_structure_v2',
    'department',
    'bx_team',
] as const;

const SCAN_COUNT = 100;
const DEL_CHUNK_SIZE = 500;

/**
 * Сброс кэша отделов и команд в Redis: по конкретному домену или по всем
 * порталам сразу. Ключи ищутся через SCAN (не KEYS — он блокирует Redis),
 * пересечения паттернов (`department_*` накрывает и structure-ключи)
 * дедуплицируются перед удалением.
 */
@Injectable()
export class BxDepartmentCacheService {
    private readonly logger = new Logger(BxDepartmentCacheService.name);
    private readonly redis: Redis;

    constructor(private readonly redisService: RedisService) {
        this.redis = this.redisService.getClient();
    }

    /** Удаляет ключи кэша домена (или всех доменов) и возвращает статистику. */
    async reset(domain?: string): Promise<BxDepartmentCacheResetResponseDto> {
        const patterns = this.buildPatterns(domain);
        const keys = new Set<string>();
        for (const pattern of patterns) {
            for (const key of await this.scanKeys(pattern)) {
                keys.add(key);
            }
        }
        const deletedCount = await this.deleteKeys([...keys]);
        this.logger.log(
            `Сброшен кэш department (${domain ?? 'все домены'}): удалено ключей — ${deletedCount}`,
        );
        return { deletedCount, patterns };
    }

    private buildPatterns(domain?: string): string[] {
        const target = domain ?? '*';
        return CACHE_KEY_PREFIXES.map(prefix => `${prefix}_${target}_*`);
    }

    private async scanKeys(pattern: string): Promise<string[]> {
        const keys: string[] = [];
        let cursor = '0';
        do {
            const [nextCursor, batch] = await this.redis.scan(
                cursor,
                'MATCH',
                pattern,
                'COUNT',
                SCAN_COUNT,
            );
            cursor = nextCursor;
            keys.push(...batch);
        } while (cursor !== '0');
        return keys;
    }

    private async deleteKeys(keys: string[]): Promise<number> {
        let deleted = 0;
        for (let i = 0; i < keys.length; i += DEL_CHUNK_SIZE) {
            deleted += await this.redis.del(
                ...keys.slice(i, i + DEL_CHUNK_SIZE),
            );
        }
        return deleted;
    }
}
