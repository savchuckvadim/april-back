import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    BitrixV3Service,
    BitrixV3ServiceFactory,
    EBxHrMemberRole,
    IBXHrNodeMember,
} from '@lib/bitrix-v3';
import { IBXDepartment } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import {
    legacyIdFromAccessCode,
    toPositiveInt,
    uniqueIds,
} from '../lib/department-heads.util';

/** Роли участника узла, которые считаем руководителями; порядок = порядок в HEADS. */
const HEAD_ROLES: readonly EBxHrMemberRole[] = [
    EBxHrMemberRole.HEAD,
    EBxHrMemberRole.DEPUTY_HEAD,
];

/**
 * Руководители отделов из НОВОЙ структуры компании (REST 3.0,
 * `humanresources.node.*`): руководитель и заместители на отдел.
 *
 * Зачем: легаси `department.get` держит одного руководителя в `UF_HEAD`,
 * а при двух руководителях в новой структуре Битрикс пишет туда null
 * (инцидент gsirk 05.09.2026). Заместитель в `UF_HEAD` не виден никогда.
 *
 * Сопоставление: у узла-отдела `accessCode = 'D' + ID department.get`.
 * `node.list` участников не отдаёт даже с select, поэтому роли читаются
 * `node.get` по каждому нужному отделу (параллельно; конкурентность
 * ограничивает транспорт v3).
 *
 * Fail-open: нет вебхука, нет скоупа `humanresources`, таймаут — warn в лог
 * и пустая карта, поведение сводится к прежнему `UF_HEAD`.
 */
@Injectable()
export class BxDepartmentHeadsService {
    private readonly logger = new Logger(BxDepartmentHeadsService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly bitrixV3Factory: BitrixV3ServiceFactory,
    ) {}

    /** «ID отдела → [руководитель, ...заместители]» для переданных отделов. */
    async resolve(
        domain: string,
        departments: IBXDepartment[],
    ): Promise<Map<number, number[]>> {
        const heads = new Map<number, number[]>();
        const nameById = new Map<number, string>();
        for (const dep of departments) {
            const id = toPositiveInt(dep.ID);
            if (id !== null && !nameById.has(id)) {
                nameById.set(id, dep.NAME ?? '');
            }
        }
        if (nameById.size === 0) return heads;

        try {
            const bitrixV3 = await this.createClient(domain);
            const nodeByLegacyId = await this.mapNodesToLegacyIds(bitrixV3);
            await Promise.all(
                [...nameById].map(async ([legacyId, name]) => {
                    const nodeId = nodeByLegacyId.get(legacyId);
                    if (!nodeId) {
                        this.logger.warn(
                            `[${domain}] отдел ${legacyId} «${name}» не найден в структуре v3 (нет узла с accessCode D${legacyId}) — остаётся UF_HEAD`,
                        );
                        return;
                    }
                    try {
                        const node =
                            await bitrixV3.hr.node.getWithMembers(nodeId);
                        heads.set(legacyId, this.pickHeads(node.members));
                    } catch (error) {
                        this.logger.warn(
                            `[${domain}] участники узла ${nodeId} (отдел ${legacyId} «${name}») не прочитаны: ${this.message(error)}`,
                        );
                    }
                }),
            );
        } catch (error) {
            this.logger.warn(
                `[${domain}] руководители из структуры v3 недоступны, остаётся UF_HEAD: ${this.message(error)}`,
            );
        }
        return heads;
    }

    private async createClient(domain: string): Promise<BitrixV3Service> {
        const { portal } = await this.pbx.init(domain);
        return this.bitrixV3Factory.create({
            domain: portal.domain,
            webhook: portal.C_REST_WEB_HOOK_URL,
        });
    }

    /** Все узлы-отделы портала → «ID department.get → id узла» по accessCode. */
    private async mapNodesToLegacyIds(
        bitrixV3: BitrixV3Service,
    ): Promise<Map<number, number>> {
        const nodes = await bitrixV3.hr.node.getDepartments([
            'id',
            'accessCode',
        ]);
        const map = new Map<number, number>();
        for (const node of nodes) {
            const legacyId = legacyIdFromAccessCode(node.accessCode);
            if (legacyId !== null && !map.has(legacyId)) {
                map.set(legacyId, node.id);
            }
        }
        return map;
    }

    /** Руководители первыми, потом заместители; без дублей и мусора. */
    private pickHeads(members: IBXHrNodeMember[] | undefined): number[] {
        const list = members ?? [];
        return uniqueIds(
            HEAD_ROLES.flatMap(role =>
                list
                    .filter(member => member.role === role)
                    .map(member => toPositiveInt(member.userId)),
            ),
        );
    }

    private message(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
