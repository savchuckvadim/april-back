import { BitrixService } from "@/modules/bitrix";
import { EventTaskDto } from "../../dto/event-sale-flow/task.dto";
import { CreateTaskDto, TaskBitrixService } from "./task-bitrix.service";

export class TaskFlowDto {

    currentTask?: EventTaskDto
    entityType: 'lead' | 'company'
    entityId: number
    isExpired: boolean //перенос
    isPlanned: boolean //происходит планирование нового события

}
export class TaskFlowService {
    constructor(
        private readonly bitrix: BitrixService,
    ) { }

    async flow(flowDto: TaskFlowDto, createTaskDto: CreateTaskDto): Promise<void> {
        const {
            currentTask,
            entityType,
            entityId,
            isExpired,
            isPlanned,

        } = flowDto

        let companyId: number | null = null;
        let leadId: number | null = null;
        let currentTaskId: number | null = null;

        const contact = createTaskDto.contact;

        if (entityType === 'company') {
            companyId = entityId;
        } else if (entityType === 'lead') {
            leadId = entityId;
        }
        if (currentTask) {
            currentTaskId = currentTask.id;
        }

        const taskService = new TaskBitrixService(this.bitrix);

        if (!isExpired) { //не перенос
            if (isPlanned) { //происходит планирование нового события

                //создаем новую задачу
                await taskService.createTask(createTaskDto);

            } else { //не планируется новое события
                if (currentTaskId) {
                    //закрываем текущую задачу
                    //формируем batch комманды в task bitrix
                    taskService.completeTaskBatchCommand([currentTaskId]);

                    //сразу отправляем
                    // потом еще решить сразу ли отправлять
                    // будет зависить от bitrix контекста - тут bitrix сформирован  или передан из мне
                    // тоже самое касается  taskService
                    await this.bitrix.api.callBatch()
                }
            }
        } else { //перенос
            if (currentTaskId) {
                await taskService.changeCurrentTaskDeadline(
                    this.bitrix.api.domain,
                    currentTaskId,
                    createTaskDto.deadline,
                    true //сформировать batch команду или отправить метод сразу
                );
                //сразу отправляем
                // потом еще решить сразу ли отправлять
                await this.bitrix.api.callBatch()
            }
        }



    }
    async createTask(dto: any): Promise<void> {

    }
    async changeCurrentTask(dto: any): Promise<void> {

    }
    async updateCreatedTask(dto: any): Promise<void> {

    }
}
