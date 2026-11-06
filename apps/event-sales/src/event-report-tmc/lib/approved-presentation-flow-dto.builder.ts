import { BadRequestException } from '@nestjs/common';
import { EventSalesFlowDto } from '../../event-report/dto/event-sale-flow/event-sales-flow.dto';
import { EEvFlowFrom } from '../../event-report/dto/event-sale-flow/flow-context.dto';
import { EnumEventPlanCode } from '../../event-report/types/plan-types';
import {
    EnumEventItemResultType,
    EnumWorkStatusCode,
    EnumWorkStatusName,
} from '../../event-report/types/report-types';
import { TmcPresentationApprovedDto } from '../dto/tmc-presentation-approved.dto';
import { parseCrmEntityId } from './crm-entity-id.util';

/** Нормализованные параметры согласованной заявки. */
export interface ApprovedPresentationInput {
    domain: string;
    tmcDealId: number;
    companyId: number;
    contactId: number | null;
    /** Руководитель, утвердивший заявку (постановщик плана). */
    ownerId: number;
    /** Менеджер ОП, которому назначена презентация. */
    managerId: number;
    /** ТМЦ-менеджер, подавший заявку. */
    tmcId: number;
    deadline: string;
    name: string;
    commentOwner: string;
    commentTmc: string;
    commentManager: string;
}

/** Плейсмент карточки компании — владелец события при планировании из неё. */
const COMPANY_PLACEMENT = 'CRM_COMPANY_DETAIL_TAB';

/**
 * `user_12` (так бизнес-процесс печатает поле «сотрудник») либо голый id →
 * число; пусто/мусор → 0.
 */
export const parseBpUserId = (
    raw: string | number | undefined | null,
): number => {
    if (raw === null || raw === undefined) return 0;
    const digits = String(raw)
        .trim()
        .replace(/^user_/i, '');
    const id = Number(digits);
    return Number.isInteger(id) && id > 0 ? id : 0;
};

/** Id сущности CRM из параметра робота: голый id либо `D_123`/`CO_123`; мусор — 0. */
const toId = (raw: string | number | undefined | null): number =>
    parseCrmEntityId(raw) ?? 0;

const text = (raw: string | undefined | null): string =>
    typeof raw === 'string' ? raw.trim() : '';

/**
 * Проверка и нормализация параметров робота. Домен — из `auth[domain]`
 * (так шлёт исходящий вебхук Битрикса) либо из `domain`. Ошибка — 400 с
 * текстом, который можно прочитать в журнале бизнес-процесса.
 */
export function normalizeApprovedPresentation(
    raw: TmcPresentationApprovedDto,
): ApprovedPresentationInput {
    const domain = text(raw.auth?.domain) || text(raw.domain);
    if (!domain) {
        throw new BadRequestException(
            'Не передан домен портала (auth[domain] или domain)',
        );
    }
    const tmcDealId = toId(raw.tmcDealId);
    if (!tmcDealId) {
        throw new BadRequestException('Не передана ТМЦ-сделка (tmcDealId)');
    }
    const companyId = toId(raw.companyId);
    if (!companyId) {
        throw new BadRequestException('Не передана компания (companyId)');
    }
    const managerId = parseBpUserId(raw.managerId);
    if (!managerId) {
        throw new BadRequestException(
            'Не передан менеджер, которому назначена презентация (managerId)',
        );
    }
    const deadline = text(raw.deadline);
    if (!deadline) {
        throw new BadRequestException(
            'Не передана дата презентации (deadline)',
        );
    }
    return {
        domain,
        tmcDealId,
        companyId,
        contactId: toId(raw.contactId) || null,
        // Руководитель не указан — план ставит сам менеджер.
        ownerId: parseBpUserId(raw.ownerId) || managerId,
        managerId,
        tmcId: parseBpUserId(raw.tmcId),
        deadline,
        name: text(raw.name) || 'Презентация',
        commentOwner: text(raw.commentOwner),
        commentTmc: text(raw.commentTMC),
        commentManager: text(raw.commentManager),
    };
}

/**
 * Комментарий отчёта из трёх комментариев заявки — построчно и только
 * заполненные (легаси склеивало их же, но из-за опечатки теряло строку
 * менеджера без комментария ТМЦ).
 */
export const approvedPresentationComment = (
    input: Pick<
        ApprovedPresentationInput,
        'commentTmc' | 'commentOwner' | 'commentManager'
    >,
): string =>
    [
        input.commentTmc ? `ТМЦ: ${input.commentTmc}` : '',
        input.commentOwner ? `Руководитель: ${input.commentOwner}` : '',
        input.commentManager ? `Менеджер: ${input.commentManager}` : '',
    ]
        .filter(Boolean)
        .join('\n');

/**
 * Ключ даты для id операции — минута в локали портала, одна для любого
 * написания: робот печатает `15.11.2026 14:30:00` (бывает и без секунд),
 * подстраховка по крону отдаёт CRM-формат, REST может прислать ISO со
 * смещением. Иначе одно согласование из робота и из крона получило бы
 * разные id и запланировалось дважды. Непонятное написание — цифры как есть.
 */
export const deadlineOperationKey = (raw: string): string => {
    const value = raw.trim();
    const ru = /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2}))?/.exec(value);
    if (ru) return `${ru[3]}${ru[2]}${ru[1]}${ru[4] ?? '00'}${ru[5] ?? '00'}`;
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(value);
    if (iso) {
        return `${iso[1]}${iso[2]}${iso[3]}${iso[4] ?? '00'}${iso[5] ?? '00'}`;
    }
    return value.replace(/\D/g, '');
};

/**
 * Детерминированный id операции: робот может сработать повторно (перезапуск
 * бизнес-процесса), а подстраховка по крону — поставить то же согласование
 * вслед за роботом; вторая постановка той же заявки вернёт статус первой.
 */
export const approvedPresentationOperationId = (
    input: Pick<
        ApprovedPresentationInput,
        'tmcDealId' | 'managerId' | 'deadline'
    >,
): string =>
    `tmc-approve-${input.tmcDealId}-${input.managerId}-` +
    deadlineOperationKey(input.deadline);

/**
 * Отчёт ОТДЕЛА ПРОДАЖ «запланирована презентация» от имени менеджера ОП —
 * то, что легаси-ручка `/initpres/success` собирала из параметров робота.
 *
 * Режим — `sales`: основную сделку ОП менеджеру, pres-сделку, задачу и KPI
 * ставит обычный поток отчёта. ТМЦ-сделка едет в `tmcDealId`: init находит
 * её без задачи, `TmcDealService` привяжет к новой pres-сделке и переведёт
 * в «Заявка принята», а элемент смарта «Заявка» продвинется в
 * «Запланирована» (presentation-flow). `plan.tmc` — кто подал заявку.
 *
 * Статусы отчёта — заглушки «ничего не выбиралось» (`resultStatus: new`,
 * «В работе»), как слал легаси: отчитываться по прошлому событию здесь
 * нечего, это чистый план.
 */
export function buildApprovedPresentationFlowDto(
    input: ApprovedPresentationInput,
    operationId: string,
): EventSalesFlowDto {
    return {
        domain: input.domain,
        operationId,
        plan: {
            responsibility: { ID: input.managerId },
            createdBy: { ID: input.ownerId },
            ...(input.tmcId ? { tmc: { ID: input.tmcId } } : {}),
            type: {
                current: {
                    id: 2,
                    code: EnumEventPlanCode.PRESENTATION,
                    name: 'Презентация',
                },
            },
            name: input.name,
            deadline: input.deadline,
            isPlanned: true,
            isActive: true,
            contact: input.contactId ? { ID: input.contactId } : null,
        },
        report: {
            resultStatus: EnumEventItemResultType.NEW,
            description: approvedPresentationComment(input),
            workStatus: {
                current: {
                    id: 0,
                    code: EnumWorkStatusCode.inJob,
                    name: EnumWorkStatusName.inJob,
                    isActive: true,
                },
            },
            noresultReason: {
                current: {
                    id: 0,
                    code: 'secretar',
                    name: 'Секретарь',
                    isActive: false,
                },
            },
            failType: {
                current: {
                    id: 0,
                    code: 'failure',
                    name: 'Отказ',
                    isActive: false,
                },
            },
            failReason: {
                current: {
                    id: 0,
                    code: 'fail_notime',
                    name: 'Не было времени',
                    isActive: false,
                },
            },
            contact: null,
            isNoCall: false,
        },
        context: { from: EEvFlowFrom.COMPANY, companyId: input.companyId },
        placement: {
            placement: COMPANY_PLACEMENT,
            options: { ID: input.companyId },
        },
        departament: {
            mode: { id: 1, code: 'sales', name: 'Менеджер по продажам' },
        },
        presentation: {
            count: { company: 0, smart: 0, deal: 0 },
            isPresentationDone: false,
            isUnplannedPresentation: false,
        },
        tmcDealId: input.tmcDealId,
    };
}
