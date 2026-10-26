import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import {
    AlignClientTypeRequestDto,
    ClientTypeStateDto,
    SetClientTypeRequestDto,
} from '../dto/client-type.dto';
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
    constructor(private readonly pbx: PBXService) {}

    async align(
        dealId: number,
        dto: AlignClientTypeRequestDto,
    ): Promise<ClientTypeStateDto> {
        const service = await this.service(dto.domain);
        return this.run(() => service.align(dealId));
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
