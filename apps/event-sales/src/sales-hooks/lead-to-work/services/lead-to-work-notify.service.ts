import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { historyActor } from '../../../shared/lead-request/lead-request-history.util';

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
    /**
     * Холодный обзвон ЗАБРАЛ клиента вместе со сделкой: прежний теряет
     * не только заявку. null — обычное назначение заявки (текст прежний).
     */
    takeover?: IXoTakeoverNotice | null;
}

/** Что сказать о перехвате клиента холодным обзвоном. */
export interface IXoTakeoverNotice {
    /** Сделка, перешедшая новому ответственному. */
    dealId: number;
    /** Клиент (компания, иначе заявка) — чтобы узнать его в тексте. */
    clientTitle: string;
    /** Название стадии ДО перехвата; null — не определилась. */
    previousStageName: string | null;
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

    constructor(
        private readonly bitrix: BitrixService,
        /** Имена сотрудников пачки (UserNameResolver); нет имени — id. */
        private readonly names: Readonly<Record<number, string>> = {},
    ) {}

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
            await this.send(
                input.responsibleId,
                this.messageToNew(input, link),
                warnings,
            );
        }

        // 2. Прежнему — почему работа ушла (сам отдал или передали за него).
        if (previous && previous !== input.responsibleId) {
            await this.send(
                previous,
                this.messageToPrevious(input, link, previous),
                warnings,
            );
        }
        return warnings;
    }

    /** Новому ответственному — что он получил и что делать сейчас. */
    private messageToNew(input: ILeadAssignNotifyInput, link: string): string {
        const action = input.requiresAccept
            ? ' Подтвердите принятие в приложении «Звонки» — до подтверждения работа по заявке заблокирована.'
            : '';
        const { takeover } = input;
        if (!takeover) return `Вам назначена заявка ${link}.${action}`;

        /*
         * Перехват: забравший должен понимать, что взял не пустую заявку, а
         * клиента с историей — иначе он начинает разговор с нуля там, где
         * уже шли переговоры.
         */
        const from = historyActor(this.names, input.previousResponsibleId);
        const was =
            input.previousResponsibleId && from
                ? ` Раньше по нему работал(а) ${from}` +
                  (takeover.previousStageName
                      ? `, сделка была на стадии «${takeover.previousStageName}».`
                      : '.')
                : '';
        return (
            `Вам передан клиент ${takeover.clientTitle} по холодному обзвону.` +
            `${was} Сделка ${this.dealLink(input.domain, takeover.dealId)}` +
            ` переведена в «Холодные» и теперь за вами.${action}` +
            ` Заявка: ${link}`
        );
    }

    /** Прежнему — что именно у него забрали и что делать, если это ошибка. */
    private messageToPrevious(
        input: ILeadAssignNotifyInput,
        link: string,
        previous: number,
    ): string {
        const to = historyActor(this.names, input.responsibleId);
        const { takeover } = input;
        if (!takeover) {
            return input.transferredById === previous
                ? `Вы передали заявку ${link} сотруднику ${to}.`
                : `Заявка ${link} передана другому сотруднику (${to}).`;
        }

        /*
         * Главная правка 27.10.2026: прежний видел «заявка передана» и не
         * понимал, что потерял клиента, сделку и прогресс по ней. Теперь
         * названы клиент, сделка и стадия, с которой её откатили.
         */
        const stage = takeover.previousStageName
            ? ` Сделка ${this.dealLink(input.domain, takeover.dealId)} была на стадии «${takeover.previousStageName}» и вернулась в «Холодные».`
            : ` Сделка ${this.dealLink(input.domain, takeover.dealId)} вернулась в «Холодные».`;
        return (
            `По клиенту ${takeover.clientTitle} запущен холодный обзвон —` +
            ` работа перешла к ${to}.${stage}` +
            ' Компания и контакты теперь за новым ответственным.' +
            ` Заявка: ${link}` +
            ' Если это ошибка — напишите руководителю, работу вернут.'
        );
    }

    /** Ссылка на сделку в формате уведомлений Битрикса. */
    private dealLink(domain: string, dealId: number): string {
        return `[URL=https://${domain}/crm/deal/details/${dealId}/]№${dealId}[/URL]`;
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
