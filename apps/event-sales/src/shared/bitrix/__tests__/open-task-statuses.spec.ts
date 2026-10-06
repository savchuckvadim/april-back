import { EBXTaskStatus } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { isOpenTaskStatus, isPendingTaskStatus } from '../open-task-statuses';

describe('статусы задач: «открытая» и «предстоящая»', () => {
    it('предстоящая — то, что исполнителю ещё предстоит сделать', () => {
        expect(isPendingTaskStatus(EBXTaskStatus.NEW)).toBe(true);
        expect(isPendingTaskStatus(EBXTaskStatus.PENDING)).toBe(true);
        expect(isPendingTaskStatus(EBXTaskStatus.IN_PROGRESS)).toBe(true);
    });

    it('«Ждёт контроля» — не предстоящая: исполнитель её уже закрыл', () => {
        expect(isPendingTaskStatus(EBXTaskStatus.SUPPOSEDLY_COMPLETED)).toBe(
            false,
        );
    });

    it('«Ждёт контроля» остаётся открытой для отчёта по дублям — это след работы', () => {
        expect(isOpenTaskStatus(EBXTaskStatus.SUPPOSEDLY_COMPLETED)).toBe(true);
    });

    it('завершённая, отложенная и отклонённая — ни то, ни другое', () => {
        for (const status of [
            EBXTaskStatus.COMPLETED,
            EBXTaskStatus.DEFERRED,
            EBXTaskStatus.DECLINED,
        ]) {
            expect(isOpenTaskStatus(status)).toBe(false);
            expect(isPendingTaskStatus(status)).toBe(false);
        }
    });
});
