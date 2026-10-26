import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import {
    AlignClientTypeRequestDto,
    ClientTypeAlignResponseDto,
    ClientTypeStateDto,
    SetClientTypeRequestDto,
} from '../dto/client-type.dto';
import { OpenCardOnceGuard } from '../../shared/open-card-once';
import {
    ClientTypeDealNotFoundError,
    ClientTypeNoTargetError,
} from '../lib/client-type.errors';
import { ClientTypeService } from '../services/client-type.service';

/**
 * Тип клиента во фрейме «Звонков»: выравнивание при открытии сделки и
 * выбор в шапке. Доменная работа — в `ClientTypeService`; здесь инстанс
 * Битрикса по домену и перевод доменных ошибок в коды ответа.
 *
 * `this.bitrix` в поле НЕ хранится (CLAUDE.md) — только `PBXService`.
 */
@Injectable()
export class ClientTypeUseCase {
    constructor(
        private readonly pbx: PBXService,
        private readonly once: OpenCardOnceGuard,
    ) {}

    /** Недавно выравнивали — не повторяем; отметка — после успеха. */
    async align(
        dealId: number,
        dto: AlignClientTypeRequestDto,
    ): Promise<ClientTypeAlignResponseDto> {
        const scope = {
            action: 'client-type-align' as const,
            domain: dto.domain,
            dealId,
        };
        if (await this.once.isRecent(scope)) {
            return {
                current: null,
                deal: null,
                company: null,
                conflict: false,
                warnings: [],
                skipped: true,
            };
        }
        const service = await this.service(dto.domain);
        const state = await this.run(() => service.align(dealId));
        await this.once.remember(scope);
        return { ...state, skipped: false };
    }

    async set(dto: SetClientTypeRequestDto): Promise<ClientTypeStateDto> {
        const service = await this.service(dto.domain);
        return this.run(() =>
            service.set(
                { dealId: dto.dealId, companyId: dto.companyId },
                dto.code,
            ),
        );
    }

    private async service(domain: string): Promise<ClientTypeService> {
        const { bitrix, PortalModel } = await this.pbx.init(domain);
        return new ClientTypeService(bitrix, PortalModel);
    }

    /** Доменные ошибки → 404 / 400. */
    private async run<T>(action: () => Promise<T>): Promise<T> {
        try {
            return await action();
        } catch (error) {
            if (error instanceof ClientTypeDealNotFoundError) {
                throw new NotFoundException(error.message);
            }
            if (error instanceof ClientTypeNoTargetError) {
                throw new BadRequestException(error.message);
            }
            throw error;
        }
    }
}
