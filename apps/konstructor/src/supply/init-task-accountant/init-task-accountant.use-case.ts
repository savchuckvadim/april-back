import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import type { IBXTaskCreateFields } from '@lib/bitrix/domain/tasks/task';
import { InitTaskAccountantDto } from './dto/init-task-accountant.dto';

/** Коды полей RPA «Поставка», из которых собирается задача бухгалтеру. */
const RPA_FIELD = {
    company: 'rpa_crm_company',
    contractStart: 'contract_start',
    contractEnd: 'contract_end',
    supplyDate: 'supply_date',
    firstPayDate: 'first_pay_date',
} as const;

/** Дедлайн задачи бухгалтеру — утро дня поставки. */
const ACCOUNTANT_DEADLINE_TIME = 'T08:00:00';

const ACCOUNTANT_POSITION_MARKER = 'бухгалтер';

type RpaUser = { id?: number | string; workPosition?: string | null };
type TaskAddResponse = { result?: { task?: { id?: number | string } } };

/**
 * Задача бухгалтеру по заявке на поставку. Дёргается роботом Bitrix со стадии
 * RPA — не ОРК-история, а часть флоу поставки, поэтому живёт в konstructor.
 */
@Injectable()
export class InitTaskAccountantUseCase {
    private readonly logger = new Logger(InitTaskAccountantUseCase.name);

    constructor(private readonly pbx: PBXService) {}

    async execute(dto: InitTaskAccountantDto): Promise<number | null> {
        const domain = dto.auth.domain;
        const { typeId, itemId } = this.parseDocumentId(dto.document_id);

        const { bitrix, PortalModel: portalModel } =
            await this.pbx.init(domain);

        const rpaResponse = await bitrix.rpaItem.get({ typeId, id: itemId });
        const rpa = rpaResponse.result.item;
        if (!rpa) {
            throw new NotFoundException(`RPA ${typeId}:${itemId} не найдена`);
        }

        const rpaValue = (code: string): unknown => {
            const fieldName = portalModel.getRpaFieldBitrixIdByCode(
                'supply',
                code,
            );
            return fieldName ? rpa[fieldName] : undefined;
        };

        const supplyDate = this.toText(rpaValue(RPA_FIELD.supplyDate));
        const fields: IBXTaskCreateFields = {
            TITLE: this.toText(rpa.name) || 'Заявка на поставку',
            RESPONSIBLE_ID: this.resolveAccountantId(rpa),
            DESCRIPTION: this.buildDescription({
                domain,
                typeId,
                itemId,
                contractStart: this.toDate(rpaValue(RPA_FIELD.contractStart)),
                contractEnd: this.toDate(rpaValue(RPA_FIELD.contractEnd)),
                supplyDate: this.toDate(supplyDate),
                firstPayDate: this.toDate(rpaValue(RPA_FIELD.firstPayDate)),
            }),
            DEADLINE: this.atDeadlineTime(supplyDate),
        };

        const companyId = this.toId(rpaValue(RPA_FIELD.company));
        if (companyId) {
            fields.UF_CRM_TASK = [`CO_${companyId}`];
        }

        const response = (await bitrix.task.add(fields)) as TaskAddResponse;
        const taskId = Number(response?.result?.task?.id);
        if (!taskId) {
            this.logger.warn(
                `RPA ${typeId}:${itemId}: задача бухгалтеру создана без id в ответе`,
            );
            return null;
        }

        await bitrix.api.call('rpa.timeline.add', {
            typeId,
            itemId,
            userId: String(fields.RESPONSIBLE_ID),
            fields: {
                title: 'Задача для бухгалтера',
                description: this.buildTaskLink(
                    domain,
                    fields.RESPONSIBLE_ID,
                    taskId,
                ),
            },
        });

        return taskId;
    }

    /** document_id робота: ["rpa", "<...>", "<typeId>:<itemId>"] */
    private parseDocumentId(documentId: string[]): {
        typeId: number;
        itemId: number;
    } {
        const [typeIdStr, itemIdStr] = String(documentId?.[2] ?? '').split(':');
        const typeId = Number(typeIdStr);
        const itemId = Number(itemIdStr);
        if (!typeId || !itemId) {
            throw new NotFoundException(
                `Не разобрать document_id: ${JSON.stringify(documentId)}`,
            );
        }
        return { typeId, itemId };
    }

    /**
     * Ответственный — сотрудник из карточки RPA, у которого в должности есть
     * «бухгалтер». Если такого нет, задача уходит тому, кто менял заявку
     * последним (как в легаси-версии).
     */
    private resolveAccountantId(rpa: Record<string, unknown>): number | string {
        const users = rpa.users as Record<string, RpaUser> | undefined;
        for (const user of Object.values(users ?? {})) {
            const position = String(user?.workPosition ?? '')
                .trim()
                .toLowerCase();
            if (position.includes(ACCOUNTANT_POSITION_MARKER) && user?.id) {
                return user.id;
            }
        }
        return (rpa.updatedBy as number | string) ?? 1;
    }

    private buildDescription(params: {
        domain: string;
        typeId: number;
        itemId: number;
        contractStart: string;
        contractEnd: string;
        supplyDate: string;
        firstPayDate: string;
    }): string {
        const link = `https://${params.domain}/rpa/item/${params.typeId}/${params.itemId}/`;
        return [
            `Действие договора с ${params.contractStart} до ${params.contractEnd}`,
            `Дата поставки: ${params.supplyDate}`,
            `Дата первой оплаты: ${params.firstPayDate}`,
            '',
            `ссылка на RPA: <a href="${link}">Заявка на поставку</a>`,
        ].join('\n');
    }

    private buildTaskLink(
        domain: string,
        responsibleId: number | string,
        taskId: number,
    ): string {
        const link = `https://${domain}/company/personal/user/${responsibleId}/tasks/task/view/${taskId}/`;
        return `<a href="${link}">Задача для бухгалтера</a>`;
    }

    /**
     * `2026-08-27T00:00:00+03:00` → `27.08.2026`. Берём первые 10 символов ISO
     * и не считаем ничего по часовым поясам — тип поля по порталам разный.
     */
    private toDate(value: unknown): string {
        const raw = this.toText(value).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            return '—';
        }
        const [year, month, day] = raw.split('-');
        return `${day}.${month}.${year}`;
    }

    /** Дедлайн ставим на 08:00 дня поставки, смещение оставляем как есть. */
    private atDeadlineTime(raw: string): string | undefined {
        if (!raw) {
            return undefined;
        }
        return raw.replace(/T\d{2}:\d{2}:\d{2}/, ACCOUNTANT_DEADLINE_TIME);
    }

    private toText(value: unknown): string {
        if (value === null || value === undefined) {
            return '';
        }
        if (Array.isArray(value)) {
            return value.map(item => this.toText(item)).join('\n');
        }
        return String(value);
    }

    private toId(value: unknown): number | undefined {
        const id = Number(Array.isArray(value) ? value[0] : value);
        return Number.isFinite(id) && id > 0 ? id : undefined;
    }
}
