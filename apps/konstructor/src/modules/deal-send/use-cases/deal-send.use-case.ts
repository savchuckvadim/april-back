import {
    BadGatewayException,
    ConflictException,
    Injectable,
    Logger,
    UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PBXService } from '@lib/pbx';
import { BitrixService, IBXDeal, IBXProductRowRow } from '@lib/bitrix';
import { RedisService } from '@lib/core/redis/redis.service';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    DealSendDto,
    DealSendFieldDto,
    DealSendTargetDto,
    DealSendResponseDto,
    DealSendWarning,
} from '../dto/deal-send.dto';
import { DealFieldResolverService } from '../services/deal-field-resolver.service';
import { DealSendJobDto } from '../dto/deal-send-job.dto';
import { DealSendSupplyTextsService } from '../services/deal-send-supply-texts.service';
import { resolveCreateStageId } from '../lib/deal-create-stage.util';
import {
    DEAL_SEND_JOB_OPTIONS,
    DEAL_SEND_LATEST_TTL_SEC,
    dealSendLatestKey,
    describeDealSendError,
} from '../lib/deal-send-job.options';

/** Как легаси addDeal: событие в живой ленте и уведомление ответственному. */
const DEAL_CREATE_PARAMS = { REGISTER_SONET_EVENT: 'Y' };
/**
 * crm.deal.add без автоповтора ядра Bitrix: на таймауте Bitrix мог сделку
 * уже создать, и повтор дал бы вторую. Повтор делает фронт — тем же
 * requestKey.
 */
const DEAL_CREATE_CALL = { retries: 0 };
/** Создание идёт: повтор с тем же ключом ждёт, а не создаёт вторую сделку. */
const CREATE_PENDING = 'pending';
const CREATE_PENDING_TTL_SEC = 120;
/** Созданная сделка помнится сутки — повтор после обрыва вернёт её. */
const CREATE_DONE_TTL_SEC = 24 * 60 * 60;

export const dealSendCreateKey = (domain: string, requestKey: string): string =>
    `konstructor:deal-send:create:${domain}:${requestKey}`;

/**
 * Отправка сделки из конструктора.
 *
 * Разделение как в легаси: сделка создаётся синхронно (фронту немедленно нужен
 * её id, чтобы сохранить слепок и увести менеджера в карточку), а запись полей
 * и товарных строк уходит в свою очередь `konstructor-deal-send`. Фронт
 * опрашивает статус задания по operationId ограниченное время и при сбое
 * отправляет запись в легаси (переходный период, решение 11.11.2026).
 */
@Injectable()
export class DealSendUseCase {
    private readonly logger = new Logger(DealSendUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly dispatcher: QueueDispatcherService,
        private readonly supplyTexts: DealSendSupplyTextsService,
        private readonly redisService: RedisService,
    ) {}

    async execute(dto: DealSendDto): Promise<DealSendResponseDto> {
        const { bitrix, PortalModel } = await this.pbx.init(dto.domain);

        // тексты поставки — с бэка по supplyCode (новый фронт); присланные поля сильнее
        const enrichedFields = await this.supplyTexts.enrich(
            dto.fields,
            dto.supplyCode,
            dto.contractKind,
        );
        const resolver = new DealFieldResolverService(PortalModel);
        if (dto.target?.kind === 'smart') {
            return this.executeSmart(
                dto,
                enrichedFields,
                resolver,
                bitrix,
                PortalModel,
            );
        }
        // у маркетплейс-портала схема сделок пустая — иначе TypeError на deals[0]
        if (!PortalModel.getDeal()) {
            throw new UnprocessableEntityException(
                `На портале ${dto.domain} нет pbx-схемы сделок — конструктор не может записать сделку`,
            );
        }
        const { fields, skipped } = resolver.resolve(enrichedFields);

        if (skipped.length) {
            const details = skipped
                .map(item => `«${item.title}» ${item.code} (${item.reason})`)
                .join(', ');
            this.logger.warn(`${dto.domain}: не записаны поля — ${details}`);
        }

        const warnings: DealSendWarning[] = [];
        let dealId = dto.dealId ?? null;
        let created = false;
        let replayed = false;

        if (!dealId) {
            const creation = await this.createDeal(
                dto,
                bitrix,
                PortalModel,
                fields,
                warnings,
            );
            dealId = creation.dealId;
            replayed = creation.replayed;
            created = true;
        }

        const job: DealSendJobDto = {
            domain: dto.domain,
            dealId,
            // компанию — при каждом сохранении, как Laravel (update_infoblocks):
            // браузерный addDeal её не ставил, и сделки оставались без компании
            fields: dto.companyId
                ? { ...fields, COMPANY_ID: String(dto.companyId) }
                : fields,
            productRows: this.resolveRows(dto, resolver),
        };
        const operationId = await this.enqueue(job, warnings);

        this.logger.log(
            `${dto.domain} сделка ${dealId}${created ? (replayed ? ' (повтор создания)' : ' создана') : ''}: полей ${Object.keys(job.fields).length}, строк ${job.productRows?.length ?? '—'}, operationId ${operationId ?? '—'}, сборка фронта ${dto.clientBuild ?? '—'}`,
        );

        return {
            dealId,
            created,
            skipped,
            smartId: null,
            operationId,
            warnings,
        };
    }

    /**
     * Новая сделка — в sales_base на стадии «Документы» (решение владельца
     * 11.11.2026), сразу с компанией, ответственным и поставщиком: фронт
     * читает сделку сразу после ответа, а запасная запись через Laravel
     * поставщика не пишет. Остальные поля дописывает задание.
     *
     * Нет воронки — 422 без создания: фронт создаёт сделку по-старому.
     */
    private async createDeal(
        dto: DealSendDto,
        bitrix: BitrixService,
        PortalModel: PortalModel,
        fields: Partial<IBXDeal>,
        warnings: DealSendWarning[],
    ): Promise<{ dealId: number; replayed: boolean }> {
        const categoryCode =
            dto.categoryCode ?? PbxDealCategoryCodeEnum.sales_base;
        const category = PortalModel.getDealCategoryByCode(categoryCode);
        if (!category) {
            throw new UnprocessableEntityException(
                `На портале ${dto.domain} нет воронки сделок "${categoryCode}"`,
            );
        }

        const lockKey = dto.requestKey
            ? dealSendCreateKey(dto.domain, dto.requestKey)
            : null;
        if (lockKey) {
            const previousDealId = await this.claimCreate(lockKey);
            if (previousDealId) {
                warnings.push('replayed');
                return { dealId: previousDealId, replayed: true };
            }
        }

        let dealId = 0;
        try {
            const createFields = this.buildCreateFields(
                dto,
                PortalModel,
                category,
                categoryCode,
                fields,
                warnings,
            );
            const response = await bitrix.deal.set(
                createFields,
                DEAL_CREATE_PARAMS,
                DEAL_CREATE_CALL,
            );
            dealId = Number(response.result);
        } catch (error) {
            // сделка не создана или исход неизвестен — ключ освобождаем,
            // фронт повторит тем же ключом или создаст по-старому
            await this.releaseCreate(lockKey);
            throw error;
        }
        if (!dealId) {
            await this.releaseCreate(lockKey);
            throw new BadGatewayException(
                `Bitrix не создал сделку на портале ${dto.domain}`,
            );
        }

        // Дальше сделка уже есть: никаких исключений — иначе фронт не узнал
        // бы её id и создал вторую по-старому.
        if (lockKey) {
            try {
                await this.redis().set(
                    lockKey,
                    String(dealId),
                    'EX',
                    CREATE_DONE_TTL_SEC,
                );
            } catch (error) {
                this.logger.warn(
                    `${dto.domain}: сделка ${dealId} создана, но ключ повтора не записан — ${describeDealSendError(error)}`,
                );
            }
        }
        return { dealId, replayed: false };
    }

    private buildCreateFields(
        dto: DealSendDto,
        PortalModel: PortalModel,
        category: IPCategory,
        categoryCode: PbxDealCategoryCodeEnum,
        fields: Partial<IBXDeal>,
        warnings: DealSendWarning[],
    ): Partial<IBXDeal> {
        const createFields: Partial<IBXDeal> = {
            TITLE: dto.dealName ?? '',
            CATEGORY_ID: category.bitrixId,
            OPENED: dto.opened === false ? 'N' : 'Y',
            // как легаси addDeal; OPPORTUNITY не шлём — сумму считают строки
            CURRENCY_ID: 'RUB',
            PROBABILITY: 30,
        };
        // «Документы» — только для продажной воронки: у других её нет
        if (categoryCode === PbxDealCategoryCodeEnum.sales_base) {
            const stageId = resolveCreateStageId(category);
            if (stageId) {
                createFields.STAGE_ID = stageId;
            } else {
                warnings.push('stage_not_found');
                this.logger.warn(
                    `${dto.domain}: в воронке sales_base нет стадии «Документы» — сделка создаётся на первой стадии`,
                );
            }
        }
        if (dto.userId) {
            createFields.ASSIGNED_BY_ID = String(dto.userId);
        }
        if (dto.companyId) {
            createFields.COMPANY_ID = String(dto.companyId);
        }
        const providerFieldId =
            PortalModel.getDealFieldBitrixIdByCode('document_provider');
        if (providerFieldId && fields[providerFieldId] !== undefined) {
            createFields[providerFieldId] = fields[providerFieldId];
        }
        return createFields;
    }

    /**
     * Занять ключ создания. null — ключ наш, создаём; число — сделка уже
     * создана этим ключом (повтор после обрыва или двойной клик).
     */
    private async claimCreate(lockKey: string): Promise<number | null> {
        const claimed = await this.redis().set(
            lockKey,
            CREATE_PENDING,
            'EX',
            CREATE_PENDING_TTL_SEC,
            'NX',
        );
        if (claimed === 'OK') {
            return null;
        }
        const value = await this.redis().get(lockKey);
        const previousDealId = Number(value);
        if (value && value !== CREATE_PENDING && previousDealId) {
            return previousDealId;
        }
        throw new ConflictException(
            'Сделка по этому сохранению уже создаётся — повторите через несколько секунд',
        );
    }

    private async releaseCreate(lockKey: string | null): Promise<void> {
        if (!lockKey) return;
        try {
            await this.redis().del(lockKey);
        } catch (error) {
            this.logger.warn(
                `Ключ повтора создания ${lockKey} не освобождён — ${describeDealSendError(error)}`,
            );
        }
    }

    /**
     * Пустой список строк — не трогаем строки сделки, как легаси (Laravel
     * выбрасывал пустые массивы): случайный [] стёр бы товары и сумму.
     */
    private resolveRows(
        dto: DealSendDto,
        resolver: DealFieldResolverService,
    ): IBXProductRowRow[] | undefined {
        return dto.productRows?.length
            ? resolver.resolveProductRows(dto.productRows)
            : undefined;
    }

    /**
     * Поставить запись в очередь; null — писать нечего или поставить не
     * удалось. Во втором случае — предупреждение write_not_queued, и фронт
     * пишет через легаси: сделка к этому моменту уже может быть создана, и
     * ошибка ответа лишила бы фронт её id.
     */
    private async enqueue(
        job: DealSendJobDto,
        warnings: DealSendWarning[],
    ): Promise<string | null> {
        if (!Object.keys(job.fields).length && !job.productRows) {
            return null;
        }
        const operationId = randomUUID();
        try {
            await this.markLatest(job, operationId);
            await this.dispatcher.dispatch(
                QueueNames.KONSTRUCTOR_DEAL_SEND,
                JobNames.KONSTRUCTOR_DEAL_SEND,
                job,
                operationId,
                DEAL_SEND_JOB_OPTIONS,
            );
            return operationId;
        } catch (error) {
            warnings.push('write_not_queued');
            this.logger.error(
                `${job.domain} сделка ${job.dealId}: запись не поставлена в очередь — ${describeDealSendError(error)}`,
                { telegram: true },
            );
            return null;
        }
    }

    /**
     * Это сохранение — последнее для сделки: более старые задания (повтор
     * после паузы, параллельный воркер) его не перетрут. Redis недоступен —
     * ставим задание без отметки: запись важнее порядка.
     */
    private async markLatest(
        job: DealSendJobDto,
        operationId: string,
    ): Promise<void> {
        try {
            await this.redis().set(
                dealSendLatestKey(job),
                operationId,
                'EX',
                DEAL_SEND_LATEST_TTL_SEC,
            );
        } catch (error) {
            this.logger.warn(
                `${job.domain} сделка ${job.dealId}: последнее сохранение не отмечено — ${describeDealSendError(error)}`,
            );
        }
    }

    private redis() {
        return this.redisService.getClient();
    }

    /**
     * Сервисный отдел, «предложение на будущий период»: поля и строки идут в
     * элемент смарта (service_offer), привязанный к сделке. Элемента нет —
     * создаём (title, parentId2 = сделка, компания, ответственный).
     *
     * Ошибки — 422, а не 400: глобальный фильтр превращает любой
     * BadRequest в безликое «Validation failed».
     */
    private async executeSmart(
        dto: DealSendDto,
        fields: DealSendFieldDto[],
        resolver: DealFieldResolverService,
        bitrix: BitrixService,
        PortalModel: PortalModel,
    ): Promise<DealSendResponseDto> {
        const target = dto.target as DealSendTargetDto;
        const smartType = target.smartType ?? 'service_offer';
        const smart = PortalModel.getSmartByType(smartType as never);
        if (!smart?.entityTypeId) {
            throw new UnprocessableEntityException(
                `На портале ${dto.domain} не установлен смарт "${smartType}"`,
            );
        }
        if (!dto.dealId) {
            throw new UnprocessableEntityException(
                'Элемент смарта привязывается к сделке — сначала сохраните сделку',
            );
        }
        const entityTypeId = Number(smart.entityTypeId);
        let smartId = target.smartId ?? null;
        if (!smartId) {
            const created = (await bitrix.item.add(String(entityTypeId), {
                title: target.title || smart.title || smart.name,
                parentId2: dto.dealId,
                ...(dto.companyId ? { companyId: dto.companyId } : {}),
                ...(dto.userId ? { assignedById: dto.userId } : {}),
            })) as {
                result?: { item?: { id?: number } };
                item?: { id?: number };
            } | null;
            smartId =
                Number(created?.result?.item?.id ?? created?.item?.id) || null;
            if (!smartId) {
                throw new BadGatewayException(
                    `Bitrix не создал элемент смарта "${smartType}" на портале ${dto.domain}`,
                );
            }
        }
        const { fields: smartFields, skipped } = resolver.resolveSmartFields(
            fields,
            smart,
        );
        if (skipped.length) {
            this.logger.warn(
                `${dto.domain}: не записаны поля смарта — ${skipped.map(item => `«${item.title}» ${item.code} (${item.reason})`).join(', ')}`,
            );
        }
        const job: DealSendJobDto = {
            domain: dto.domain,
            dealId: dto.dealId,
            fields: {
                ...(target.title ? { title: target.title } : {}),
                ...smartFields,
            } as DealSendJobDto['fields'],
            productRows: this.resolveRows(dto, resolver),
            target: {
                kind: 'smart',
                entityTypeId,
                smartId,
                ownerType: smartOwnerType(smart.crm, entityTypeId),
            },
        };
        const warnings: DealSendWarning[] = [];
        const operationId = await this.enqueue(job, warnings);
        return {
            dealId: dto.dealId,
            created: false,
            skipped,
            smartId,
            operationId,
            warnings,
        };
    }
}

/**
 * ownerType товарных строк динамического типа: `T{hex(entityTypeId)}`; в
 * портальной схеме он лежит в smarts.crm с хвостовым подчёркиванием.
 */
export const smartOwnerType = (
    crm: string | null | undefined,
    entityTypeId: number,
): string => (crm ? crm.replace(/_$/, '') : `T${entityTypeId.toString(16)}`);
