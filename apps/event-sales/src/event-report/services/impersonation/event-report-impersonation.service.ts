import { Injectable, Logger } from '@nestjs/common';
import { BxSuperUserService } from '@lib/bx-department';
import { EventSalesFlowDto } from '../../dto/event-sale-flow/event-sales-flow.dto';
import {
    IMPERSONATION_LOG_CONTEXT,
    ImpersonationCheck,
    impersonationFromDto,
    impersonationLogLine,
} from './impersonation.mark';

/**
 * РЕЖИМ «РАБОТАТЬ КАК»: суперпользователь April отчитался от имени
 * сотрудника.
 *
 * Сервис проверяет роль по списку суперпользователей портала и оставляет
 * тихую метку — строку журнала с контекстом {@link IMPERSONATION_LOG_CONTEXT}
 * (журнал в админке, хранится 30 дней). На портал ничего не пишет: что
 * показать в отчёте, решает режим руководителя (видимая пометка, если роль
 * не подтвердилась).
 *
 * Проверка — согласованность, а не защита: id приходят с клиента. Поэтому
 * сбой проверки считается «не подтверждено» — отчёт получит видимую
 * пометку, а не спрячет отправителя.
 */
@Injectable()
export class EventReportImpersonationService {
    private readonly logger = new Logger(IMPERSONATION_LOG_CONTEXT);

    constructor(private readonly superUsers: BxSuperUserService) {}

    /** Проверка отчёта; null — поле не передано, отчёт обычный. */
    async check(dto: EventSalesFlowDto): Promise<ImpersonationCheck | null> {
        const draft = impersonationFromDto(dto, false);
        if (!draft) return null;

        const check: ImpersonationCheck = {
            ...draft,
            isConfirmed: await this.isSuperUser(dto.domain, draft.superUserId),
        };
        const line = impersonationLogLine(
            dto.domain,
            check,
            Number(dto.currentTask?.id) || 0,
        );
        if (check.isConfirmed) {
            this.logger.log(line);
        } else {
            this.logger.warn(line);
        }
        return check;
    }

    private async isSuperUser(
        domain: string,
        userId: number,
    ): Promise<boolean> {
        try {
            return await this.superUsers.isSuperUser(domain, userId);
        } catch (error) {
            this.logger.warn(
                `[${domain}] роль #${userId} не проверена: ` +
                    `${(error as Error).message}`,
            );
            return false;
        }
    }
}
