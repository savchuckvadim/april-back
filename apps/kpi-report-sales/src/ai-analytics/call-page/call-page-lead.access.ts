import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { CallPageLeadService, type CallPageLeadPayload } from '@lib/call-lib';
import { AI_ANALYTICS_LEADER_ROLES } from '../constants/ai-analytics.const';
import {
    isManagerVisible,
    type RequesterAccess,
} from '../domain/access/perimeter.util';
import {
    CallPageCallResolver,
    type CallPageCall,
} from './call-page-call.resolver';
import { CALL_PAGE_LEAD_MESSAGES } from './call-page-lead.const';

/** Открытая личная страница: звонок и чей ключ. */
export interface CallPageLeadContext {
    call: CallPageCall;
    lead: CallPageLeadPayload;
}

/**
 * Право на отзыв прямо сейчас: руководитель по структуре или
 * суперпользователь, и менеджер звонка в его периметре.
 */
export function canReviewCall(
    access: RequesterAccess,
    managerId: string | null,
): boolean {
    const leader = (AI_ANALYTICS_LEADER_ROLES as readonly string[]).includes(
        access.role,
    );
    return (
        (leader || access.isSuperUser === true) &&
        isManagerVisible(access, managerId)
    );
}

/**
 * Проверка пары «ключ звонка + личный ключ»: подпись и срок личного ключа,
 * тот же звонок, ссылка звонка не отозвана, тот же портал. Подделка, чужой
 * звонок или отозванная ссылка — 404 «Ссылка недействительна»; срок вышел
 * — 410 с подсказкой открыть разбор из отчёта заново.
 */
@Injectable()
export class CallPageLeadAccess {
    constructor(
        private readonly leads: CallPageLeadService,
        private readonly calls: CallPageCallResolver,
    ) {}

    async open(
        callToken: string,
        leadToken: string,
        nowMs: number = Date.now(),
    ): Promise<CallPageLeadContext> {
        const check = this.leads.verify(callToken, leadToken, nowMs);
        if (check.status === 'invalid') {
            throw new NotFoundException(CALL_PAGE_LEAD_MESSAGES.invalid);
        }
        if (check.status === 'expired') {
            throw new GoneException(CALL_PAGE_LEAD_MESSAGES.expired);
        }
        const call = await this.calls
            .resolve(callToken)
            .catch((error: unknown) => {
                if (error instanceof NotFoundException) return null;
                throw error;
            });
        if (call === null || call.domain !== check.payload.d) {
            throw new NotFoundException(CALL_PAGE_LEAD_MESSAGES.invalid);
        }
        return { call, lead: check.payload };
    }
}
