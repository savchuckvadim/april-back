import { Injectable } from '@nestjs/common';
import type { RequesterAccess } from '../domain/access/perimeter.util';
import { presentDealMovementHonesty } from './deal-movement-honesty.presenter';
import { presentDealMovementMatrix } from './deal-movement-matrix.presenter';
import { DealMovementNamesReader } from './deal-movement-names.reader';
import { DealMovementPeriodLoader } from './deal-movement-period.loader';
import { dealMovementScopeOf } from './deal-movement-scope';
import { presentDealMovementStatuses } from './deal-movement-statuses.presenter';
import { buildDealMovementPeriodKey } from './deal-movement-vitrina.const';
import type { DealMovementOverviewResponseDto } from './dto/deal-movement-overview.dto';
import type { DealMovementOverviewRequestDto } from './dto/deal-movement-request.dto';

/**
 * Обзор витрины «Движение сделок» за период (постановка §7, пп. 1, 3, 4):
 * статусы по отделу и менеджерам на последнюю ночь и по ночам, матрица
 * «оценка × продвижение» и честность оценок. Синхронно: читаются только
 * ночные снимки (ais) и разборы звонков из БД — Битрикс не вызывается;
 * выборка периода общая на портал и лежит в кэше 5 минут, периметр
 * пользователя применяется к ней в памяти.
 *
 * `@Injectable` без bitrix-состояния.
 */
@Injectable()
export class DealMovementOverviewUseCase {
    constructor(
        private readonly period: DealMovementPeriodLoader,
        private readonly names: DealMovementNamesReader,
    ) {}

    async execute(
        dto: DealMovementOverviewRequestDto,
        access: RequesterAccess,
    ): Promise<DealMovementOverviewResponseDto> {
        const scope = dealMovementScopeOf(access, dto.managerIds);
        const [source, names] = await Promise.all([
            this.period.load(dto.domain, dto.from, dto.to),
            this.names.names(dto.domain),
        ]);
        return {
            status: 'ready',
            requestKey: buildDealMovementPeriodKey(
                dto.domain,
                dto.from,
                dto.to,
            ),
            data: {
                from: dto.from,
                to: dto.to,
                statuses: presentDealMovementStatuses({
                    nights: source.nights,
                    from: dto.from,
                    to: dto.to,
                    scope,
                    names,
                }),
                matrix: presentDealMovementMatrix({
                    calls: source.calls,
                    scope,
                    names,
                }),
                honesty: presentDealMovementHonesty({ source, scope, names }),
            },
        };
    }
}
