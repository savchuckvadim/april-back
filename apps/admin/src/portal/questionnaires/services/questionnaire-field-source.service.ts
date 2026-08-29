import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/core/prisma';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { BitrixOwnerTypeId } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { EnumQuestionnaireFieldSource } from '../dto/questionnaire-field-source.dto';

/**
 * Носитель полей со всем, что нужно, чтобы их прочитать и сверить со
 * слепком: два разных идентификатора Битрикса и якорь строки в
 * `bitrixfields`.
 */
export interface QuestionnaireFieldSource {
    entity: EnumQuestionnaireFieldSource;
    /** Идентификатор строки `smarts` в НАШЕЙ БД (не в Битриксе). */
    smartId: number | null;
    /** Для `crm.item.*`: лид 1, сделка 2, контакт 3, компания 4, смарт свой. */
    entityTypeId: number;
    /** `smarts.bitrixId` — id из `crm.type.list`; у штатных сущностей null. */
    bitrixId: number | null;
    title: string;
    /**
     * `entityId` для userfieldconfig: `CRM_COMPANY`… или `CRM_{bitrixId}`.
     * null — прочитать полным способом нельзя (у смарта нет bitrixId).
     */
    ufEntityId: string | null;
    /** Тип сущности в слепке `bitrixfields` (FQCN модели Laravel). */
    snapshotEntityType: PbxEntityTypePrisma;
    /** `entity_id` слепка; null — сущность на портале не установлена. */
    snapshotEntityId: number | null;
    /** Чем носитель нерабочий; пусто — всё в порядке. */
    warning?: string;
}

/** Штатные сущности CRM: порядок как в списке выбора админки. */
const BASE_SOURCES: {
    entity: EnumQuestionnaireFieldSource;
    entityTypeId: number;
    title: string;
    ufEntityId: string;
    snapshotEntityType: PbxEntityTypePrisma;
}[] = [
    {
        entity: EnumQuestionnaireFieldSource.company,
        entityTypeId: BitrixOwnerTypeId.COMPANY,
        title: 'Компания',
        ufEntityId: 'CRM_COMPANY',
        snapshotEntityType: PbxEntityTypePrisma.BTX_COMPANY,
    },
    {
        entity: EnumQuestionnaireFieldSource.deal,
        entityTypeId: BitrixOwnerTypeId.DEAL,
        title: 'Сделка',
        ufEntityId: 'CRM_DEAL',
        snapshotEntityType: PbxEntityTypePrisma.DEAL,
    },
    {
        entity: EnumQuestionnaireFieldSource.lead,
        entityTypeId: BitrixOwnerTypeId.LEAD,
        title: 'Лид',
        ufEntityId: 'CRM_LEAD',
        snapshotEntityType: PbxEntityTypePrisma.LEAD,
    },
    {
        entity: EnumQuestionnaireFieldSource.contact,
        entityTypeId: BitrixOwnerTypeId.CONTACT,
        title: 'Контакт',
        ufEntityId: 'CRM_CONTACT',
        snapshotEntityType: PbxEntityTypePrisma.BTX_CONTACT,
    },
];

/**
 * Откуда админка берёт поля для анкеты: четыре штатные сущности CRM и
 * смарт-процессы портала.
 *
 * Здесь же собраны оба идентификатора смарта, которые легко перепутать:
 * `bitrixId` (из `crm.type.list`, «маленький») адресует ПОЛЯ, а
 * `entityTypeId` — только методы `crm.item.*`. Подставленный не туда
 * entityTypeId Битрикс встречает фразой «Вы не можете просматривать
 * настройки пользовательских полей» — той же, что при нехватке прав, и
 * диагностика уходит в поиск несуществующей проблемы с ключом.
 */
@Injectable()
export class QuestionnaireFieldSourceService {
    constructor(private readonly prisma: PrismaService) {}

    /** Домен портала: без него в Битрикс не сходить. */
    async requireDomain(portalId: number): Promise<string> {
        const portal = await this.prisma.portal.findUnique({
            where: { id: BigInt(portalId) },
            select: { domain: true },
        });
        if (!portal?.domain) {
            throw new NotFoundException(`Портал ${portalId} не найден`);
        }
        return portal.domain;
    }

    /** Все носители портала: штатные сущности, затем смарты. */
    async listSources(portalId: number): Promise<QuestionnaireFieldSource[]> {
        const [company, deal, lead, contact, smarts] = await Promise.all([
            this.prisma.btx_companies.findFirst({
                where: { portal_id: BigInt(portalId) },
                select: { id: true },
            }),
            this.prisma.btx_deals.findFirst({
                where: { portal_id: BigInt(portalId) },
                select: { id: true },
            }),
            this.prisma.btx_leads.findFirst({
                where: { portal_id: BigInt(portalId) },
                select: { id: true },
            }),
            this.prisma.btx_contacts.findFirst({
                where: { portal_id: BigInt(portalId) },
                select: { id: true },
            }),
            this.prisma.smarts.findMany({
                where: { portal_id: BigInt(portalId) },
                orderBy: [{ title: 'asc' }, { id: 'asc' }],
            }),
        ]);

        const anchors: Record<string, bigint | null> = {
            [EnumQuestionnaireFieldSource.company]: company?.id ?? null,
            [EnumQuestionnaireFieldSource.deal]: deal?.id ?? null,
            [EnumQuestionnaireFieldSource.lead]: lead?.id ?? null,
            [EnumQuestionnaireFieldSource.contact]: contact?.id ?? null,
        };

        const sources: QuestionnaireFieldSource[] = BASE_SOURCES.map(base => {
            const anchor = anchors[base.entity];
            return {
                entity: base.entity,
                smartId: null,
                entityTypeId: base.entityTypeId,
                bitrixId: null,
                title: base.title,
                ufEntityId: base.ufEntityId,
                snapshotEntityType: base.snapshotEntityType,
                snapshotEntityId: anchor === null ? null : Number(anchor),
            };
        });

        for (const smart of smarts) {
            const bitrixId =
                smart.bitrixId === null ? null : Number(smart.bitrixId);
            sources.push({
                entity: EnumQuestionnaireFieldSource.smart,
                smartId: Number(smart.id),
                entityTypeId: Number(smart.entityTypeId),
                bitrixId,
                title: smart.title || smart.name,
                // CRM_{id из crm.type.list} — и только он. Собрать
                // `CRM_${entityTypeId}` значит получить ошибку прав на
                // ровном месте (боевой инцидент 2026-07-21).
                ufEntityId: bitrixId === null ? null : `CRM_${bitrixId}`,
                snapshotEntityType: PbxEntityTypePrisma.SMART,
                snapshotEntityId: Number(smart.id),
                warning:
                    bitrixId === null
                        ? 'У смарта не записан идентификатор типа из ' +
                          'crm.type.list — поля читаются урезанным ' +
                          'способом, без xmlId.'
                        : undefined,
            });
        }

        return sources;
    }

    /** Один носитель по параметрам запроса. */
    async resolveSource(
        portalId: number,
        entity: EnumQuestionnaireFieldSource,
        smartId?: number,
    ): Promise<QuestionnaireFieldSource> {
        const sources = await this.listSources(portalId);
        if (entity !== EnumQuestionnaireFieldSource.smart) {
            const found = sources.find(source => source.entity === entity);
            if (!found) {
                throw new BadRequestException(`Неизвестный носитель ${entity}`);
            }
            return found;
        }

        if (!smartId) {
            throw new BadRequestException(
                'Для носителя «смарт-процесс» нужен smartId — ' +
                    'идентификатор строки из GET /questionnaire-fields/sources',
            );
        }
        const found = sources.find(source => source.smartId === smartId);
        if (!found) {
            throw new NotFoundException(
                `Смарт ${smartId} не принадлежит порталу ${portalId}`,
            );
        }
        return found;
    }
}
