import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
} from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import { ActiveStaffService } from '../../../shared/active-staff/active-staff.service';
import { HeadAccessService } from '../../../shared/head-access/head-access.service';
import { UserNameResolver } from '../../../shared/lead-request/user-name.resolver';
import { ClassifiedClient } from '../../../duplicate-report/types/duplicate-report.types';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import { EnumSalesHookSource } from '../../core/contracts/sales-hook-job.type';
import { SalesHookOperationDto } from '../../core/dto/sales-hook-operation.dto';
import { SalesHookDispatchService } from '../../core/services/sales-hook-dispatch.service';
import { SalesHookIdempotencyService } from '../../core/services/sales-hook-idempotency.service';
import {
    buildJoinToMainItem,
    IJoinToMainItem,
} from '../../join-to-main/dto/join-to-main.dto';
import {
    ClientWorkJoinRequestDto,
    ClientWorkRequestDto,
    ClientWorkResponseDto,
} from '../dto/client-work.dto';
import {
    joinDealIds,
    joinSelectionError,
    toClientWorkResponse,
} from '../lib/client-work.mapper';
import { ClientWorkReader } from './client-work.reader';

const HOOK = EnumSalesHookCode.JOIN_TO_MAIN;

/**
 * «Открытые сделки по клиенту» в «Звонках»: все открытые сделки клиента и
 * присоединение выбранных к основной одной операцией.
 *
 * Присоединение — тот же бережный хук «Присоединить сюда» (join-to-main:
 * дубль → «Дубль», задачи/дела/контакты/заявки → в основную, ничего не
 * удаляется), только пачкой и с ПРОВЕРКОЙ ПРАВ на сервере. Выбор
 * перепроверяется свежим чтением: список у руководителя мог устареть.
 *
 * `@Injectable`, но инстанс Битрикса живёт только внутри вызова
 * (CLAUDE.md — иначе гонка порталов).
 */
@Injectable()
export class ClientWorkService {
    private readonly logger = new Logger(ClientWorkService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly staff: ActiveStaffService,
        private readonly userNames: UserNameResolver,
        private readonly access: HeadAccessService,
        private readonly dispatch: SalesHookDispatchService,
        private readonly idempotency: SalesHookIdempotencyService,
    ) {}

    async load(dto: ClientWorkRequestDto): Promise<ClientWorkResponseDto> {
        const { bitrix, PortalModel: portal } = await this.pbx.init(dto.domain);
        const warnings: string[] = [];
        const client = await new ClientWorkReader(
            bitrix,
            portal,
            dto.domain,
            this.staff,
        ).load(dto.dealId, new Date(), warnings);
        const names = client
            ? await this.names(dto.domain, bitrix, client)
            : new Map<number, string>();
        const canJoin = await this.access.canManageDuplicates(
            dto.domain,
            dto.userId,
        );
        if (warnings.length) {
            this.logger.warn(
                `[client-work] ${dto.domain} сделка ${dto.dealId}: ${warnings.join('; ')}`,
            );
        }
        return toClientWorkResponse(client, {
            currentDealId: dto.dealId,
            names,
            canJoin,
        });
    }

    /** Присоединить выбранные к основной; 403 — не руководитель, 400 — выбор устарел. */
    async join(dto: ClientWorkJoinRequestDto): Promise<SalesHookOperationDto> {
        await this.access.assertCanManageDuplicates(
            dto.domain,
            dto.initiatorUserId,
        );
        const { bitrix, PortalModel: portal } = await this.pbx.init(dto.domain);
        const client = await new ClientWorkReader(
            bitrix,
            portal,
            dto.domain,
            this.staff,
        ).load(dto.mainDealId, new Date(), []);
        const error = joinSelectionError(client, dto.mainDealId, dto.dealIds);
        if (error) throw new BadRequestException(error);

        const items = joinDealIds(dto.mainDealId, dto.dealIds).map(dealId =>
            buildJoinToMainItem({
                dealId,
                targetType: 'deal',
                targetId: dto.mainDealId,
                closeAsDuplicate: true,
            }),
        );
        const operation = await this.dispatch.accept<IJoinToMainItem>(
            HOOK,
            dto.domain,
            EnumSalesHookSource.FRAME,
            items.map(item => {
                const entityKey = `deal:${item.dealId}`;
                return {
                    entityKey,
                    fingerprint: this.idempotency.fingerprint(HOOK, entityKey, {
                        ...item,
                    }),
                    data: item,
                };
            }),
            {
                operationId: dto.operationId,
                socketId: dto.socketId,
                initiatorUserId: dto.initiatorUserId,
            },
        );
        if (!operation) {
            throw new ConflictException(
                'Эти сделки только что присоединялись другой операцией — ' +
                    'обновите список и повторите',
            );
        }
        this.logger.log(
            `[client-work] ${dto.domain}: ${items.length} сделок → ${dto.mainDealId}, ` +
                `инициатор ${dto.initiatorUserId}, операция ${operation.operationId}`,
        );
        return operation;
    }

    /** Имена ответственных; портал молчит — пусто (покажется «сотрудник N»). */
    private async names(
        domain: string,
        bitrix: BitrixService,
        client: ClassifiedClient,
    ): Promise<Map<number, string>> {
        const ids = client.deals
            .map(item => item.deal.assignedById)
            .filter((id): id is number => id !== null);
        const map = await this.userNames.resolve(domain, bitrix, ids);
        return new Map(
            Object.entries(map).map(([id, name]) => [Number(id), name]),
        );
    }
}
