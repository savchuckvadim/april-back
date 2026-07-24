import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import dayjs from 'dayjs';
import Redis from 'ioredis';
import { RedisService } from 'src/core/redis/redis.service';
import { PBXService } from '@/modules/pbx';
import {
    BitrixV3Service,
    BitrixV3ServiceFactory,
    EBxHrNodeType,
    IBXHrNodeTree,
} from '@lib/bitrix-v3';
import { BxTeamResponseDto, EBxTeamGroup } from '../dto/bx-team.dto';

/**
 * Имена команд на портале по группе.
 * TODO: когда в конфиге портала (db) появятся id команд —
 * заменить поиск по имени на getDepartamentIdByCode-подобный маппинг.
 */
const TEAM_NAME_BY_GROUP: Record<EBxTeamGroup, string> = {
    [EBxTeamGroup.sales]: 'ЦУП',
    [EBxTeamGroup.service]: 'Отдел сервиса',
};

const CACHE_TTL_SECONDS = 86400;

/**
 * Команды структуры компании (REST 3.0).
 * По группе sales|service находит на портале команду
 * (ЦУП или Отдел сервиса) и возвращает её дерево с участниками.
 */
@Injectable()
export class BxTeamService {
    private readonly logger = new Logger(BxTeamService.name);
    private readonly redis: Redis;

    constructor(
        private readonly redisService: RedisService,
        private readonly pbx: PBXService,
        private readonly bitrixV3Factory: BitrixV3ServiceFactory,
    ) {
        this.redis = this.redisService.getClient();
    }

    async getTeam(
        domain: string,
        group: EBxTeamGroup = EBxTeamGroup.sales,
        resetCache = false,
    ): Promise<BxTeamResponseDto> {
        const day = dayjs().format('MMDD');
        const cacheKey = `bx_team_${domain}_${day}_${group}`;

        if (!resetCache) {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached) as BxTeamResponseDto;
            }
        }

        const bitrixV3 = await this.createClient(domain);
        const team = await this.findTeamByGroup(bitrixV3, domain, group);
        const tree = await bitrixV3.hr.node.getSubtreeWithMembers(team.id);

        const result: BxTeamResponseDto = { team: this.toTreeDto(tree) };
        await this.redis.set(
            cacheKey,
            JSON.stringify(result),
            'EX',
            CACHE_TTL_SECONDS,
        );
        return result;
    }

    private async createClient(domain: string): Promise<BitrixV3Service> {
        const { portal } = await this.pbx.init(domain);
        return this.bitrixV3Factory.create({
            domain: portal.domain,
            webhook: portal.C_REST_WEB_HOOK_URL,
        });
    }

    /**
     * Ищет команду по имени группы: сначала node.search,
     * при пустом результате — точное совпадение по полному списку команд.
     */
    private async findTeamByGroup(
        bitrixV3: BitrixV3Service,
        domain: string,
        group: EBxTeamGroup,
    ): Promise<{ id: number; name: string }> {
        const teamName = TEAM_NAME_BY_GROUP[group];
        const normalized = teamName.trim().toLowerCase();

        const found = await bitrixV3.hr.node.search(
            EBxHrNodeType.TEAM,
            teamName,
        );
        const exact = found.find(
            node => node.name.trim().toLowerCase() === normalized,
        );
        if (exact) {
            return exact;
        }
        if (found.length > 0) {
            this.logger.warn(
                `[${domain}] точного совпадения "${teamName}" нет, беру первую найденную команду "${found[0].name}"`,
            );
            return found[0];
        }

        const allTeams = await bitrixV3.hr.node.getTeams(['id', 'name']);
        const fallback = allTeams.find(
            node => node.name.trim().toLowerCase() === normalized,
        );
        if (fallback) {
            return fallback;
        }

        throw new NotFoundException(
            `На портале ${domain} не найдена команда "${teamName}" (группа ${group})`,
        );
    }

    /**
     * IBXHrNodeTree структурно совпадает с BxTeamTreeDto —
     * маппер фиксирует контракт ответа независимо от типов библиотеки.
     */
    private toTreeDto(tree: IBXHrNodeTree): BxTeamResponseDto['team'] {
        const { node, children } = tree;
        return {
            node: {
                id: node.id,
                name: node.name,
                type: node.type,
                parentId: node.parentId,
                description: node.description,
                userCount: node.userCount,
                colorName: node.colorName,
                xmlId: node.xmlId,
                members: node.members,
            },
            children: children.map(child => this.toTreeDto(child)),
        };
    }
}
