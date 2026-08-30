import { Injectable, Logger } from '@nestjs/common';
import { FlowBitrix, SideFlowName, sideFlowLogTag } from './side-flow.types';

/**
 * Привязка элемента смарта к задаче через `UF_CRM_TASK`.
 *
 * Вопрос владельца 25.08: закрытая/перенесённая задача должна нести
 * ссылку `T{hex(entityTypeId)}_{elementId}` — тогда сущности смарта
 * находятся из карточки задачи штатным полем, без единой дотяжки.
 *
 * Оба сайд-потока (презентации и ЗПР) писали это ПОБАЙТОВО одинаковым
 * приватным методом: правило одно, и чиниться оно должно один раз.
 *
 * `bitrix` приходит АРГУМЕНТОМ, а не полем сервиса: инстанс привязан к
 * домену портала, и общий `this.bitrix` в `@Injectable()` дал бы race
 * condition между порталами (правило CLAUDE.md).
 */
@Injectable()
export class SideFlowTaskBinderService {
    private readonly logger = new Logger(SideFlowTaskBinderService.name);

    /**
     * Привязка элемента к задаче — украшение, ошибки не роняют джоб.
     *
     * `flow` — кто позвал: единственное, чем в логе различаются два потока.
     * Необязателен намеренно (на саму привязку он не влияет), но без него
     * отказ виден только как общий `[side-flow]`, и по каналу уже не найти,
     * чей отчёт не привязал свой элемент.
     */
    async bind(
        bitrix: FlowBitrix,
        taskId: number,
        entityTypeId: number,
        elementId: number,
        flow?: SideFlowName,
    ): Promise<void> {
        const ref = `T${entityTypeId.toString(16)}_${elementId}`;
        try {
            const response = (await bitrix.task.get(taskId, [
                'ID',
                'UF_CRM_TASK',
            ])) as {
                result?: {
                    task?: { ufCrmTask?: unknown; UF_CRM_TASK?: unknown };
                };
            } | null;
            const task = response?.result?.task;
            // tasks.* отдаёт camelCase (ufCrmTask), но терпим оба регистра.
            const raw = task?.ufCrmTask ?? task?.UF_CRM_TASK;
            const current = Array.isArray(raw) ? raw.map(String) : [];
            /*
             * Повторный джоб (Bull доставляет at-least-once) не должен
             * дописывать ту же ссылку вторым элементом списка: дубль в
             * `UF_CRM_TASK` виден владельцу в карточке задачи.
             */
            if (current.includes(ref)) return;

            await bitrix.task.update(taskId, {
                UF_CRM_TASK: [...current, ref],
            });
        } catch (error) {
            this.logger.warn(
                `${sideFlowLogTag(flow)} привязка элемента ${ref} к задаче ` +
                    `${taskId} не записана: ${(error as Error).message}`,
            );
        }
    }
}
