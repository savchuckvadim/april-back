import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxTaskRepository } from '../repository/task.repository';

/**
 * `tasks.task.files.attach` по документации принимает ОДИН файл —
 * параметр `fileId`. Прежний вызов с `files: [...]` Битрикс молча не
 * понимал: файл еженедельного отчёта по звонкам к задаче не прикреплялся.
 */
describe('BxTaskRepository — прикрепить файл Диска к задаче', () => {
    const setup = () => {
        const callType = jest.fn().mockResolvedValue({ result: {} });
        const addCmdBatchType = jest.fn();
        const repo = new BxTaskRepository({
            callType,
            addCmdBatchType,
        } as unknown as BitrixBaseApi);
        return { repo, callType, addCmdBatchType };
    };

    it('один файл — параметр fileId, как в документации', async () => {
        const { repo, callType } = setup();

        await repo.fileAttach(765741, 9035);

        expect(callType).toHaveBeenCalledWith('tasks', 'task', 'files.attach', {
            taskId: 765741,
            fileId: 9035,
        });
    });

    it('несколько файлов — по вызову на каждый', async () => {
        const { repo, callType } = setup();

        await repo.filesAttach(765741, [9035, 9036]);

        expect(
            callType.mock.calls.map(([, , , data]) => data as unknown),
        ).toEqual([
            { taskId: 765741, fileId: 9035 },
            { taskId: 765741, fileId: 9036 },
        ]);
    });

    it('batch — одна команда на файл с fileId', () => {
        const { repo, addCmdBatchType } = setup();

        repo.fileAttachBtch('att_1', 765741, 9035);

        expect(addCmdBatchType).toHaveBeenCalledWith(
            'att_1',
            'tasks',
            'task',
            'files.attach',
            { taskId: 765741, fileId: 9035 },
        );
    });
});
