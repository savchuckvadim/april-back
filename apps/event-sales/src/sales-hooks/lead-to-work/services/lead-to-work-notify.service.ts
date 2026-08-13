import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';

/** Кому и о чём сообщаем при назначении/передаче заявки. */
export interface ILeadAssignNotifyInput {
    domain: string;
    leadId: number;
    /** Название заявки/лида для текста сообщения. */
    leadTitle: string;
    /** Новый ответственный — ему «вам назначена». */
    responsibleId: number;
    /** Прежний ответственный при передаче; null — первое назначение. */
    previousResponsibleId: number | null;
    /** Сотрудник САМ отдал заявку («Передать другому» в «Звонках»). */
    transferredById: number | null;
    /** Нужно ли подтверждение (ХО-ветка) — от этого зависит текст. */
    requiresAccept: boolean;
}

/**
 * Персональные уведомления участникам назначения заявки.
 *
 * Зачем: заявку назначает робот/round-robin, и без сообщения менеджер
 * узнаёт о ней только случайно — открыв «Звонки». А прежний ответственный
 * не понимает, почему работа исчезла из его списка.
 *
 * Отправка — ПОСЛЕ основного батча, отдельными вызовами: `im.notify` не
 * поддерживает batch-подстановки `$result[...]`, а падение уведомления не
 * должно ронять уже выполненное назначение (ошибки — в warnings).
 *
 * НЕ @Injectable: `new` с per-domain инстансом Битрикса.
 */
export class LeadToWorkNotifyService {
    private readonly logger = new Logger(LeadToWorkNotifyService.name);

    constructor(private readonly bitrix: BitrixService) {}

    /** Возвращает предупреждения (не бросает: уведомление вторично). */
    async notifyAssignment(input: ILeadAssignNotifyInput): Promise<string[]> {
        const warnings: string[] = [];
        const link = `[URL=https://${input.domain}/crm/lead/details/${input.leadId}/]${input.leadTitle}[/URL]`;
        const previous = input.previousResponsibleId;
        const changed = !previous || previous !== input.responsibleId;

        /*
         * Новому ответственному — что делать прямо сейчас. Молчим, когда
         * работа осталась у того же человека и подтверждения не требуется:
         * конвертация лида в работу собственной заявки не новость, а спам
         * (менеджер сам её и запустил).
         */
        if (changed || input.requiresAccept) {
            const action = input.requiresAccept
                ? ' Подтвердите принятие в приложении «Звонки» — до подтверждения работа по заявке заблокирована.'
                : '';
            await this.send(
                input.responsibleId,
                `Вам назначена заявка ${link}.${action}`,
                warnings,
            );
        }

        // 2. Прежнему — почему работа ушла (сам отдал или передали за него).
        if (previous && previous !== input.responsibleId) {
            const message =
                input.transferredById === previous
                    ? `Вы передали заявку ${link} сотруднику ${input.responsibleId}.`
                    : `Заявка ${link} передана другому сотруднику (${input.responsibleId}).`;
            await this.send(previous, message, warnings);
        }
        return warnings;
    }

    private async send(
        userId: number,
        message: string,
        warnings: string[],
    ): Promise<void> {
        try {
            await this.bitrix.imNotify.systemAdd({
                USER_ID: userId,
                MESSAGE: message,
            });
        } catch (error) {
            const text = `Уведомление пользователю ${userId} не отправлено — ${(error as Error).message}`;
            warnings.push(text);
            this.logger.warn(text);
        }
    }
}
