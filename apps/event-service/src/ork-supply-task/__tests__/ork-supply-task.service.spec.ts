import { PBXService } from '@lib/pbx';
import { OrkSupplyTaskService } from '../services/ork-supply-task.service';
import { OrkSupplyTaskJobDto } from '../dto/ork-supply-task.dto';

/**
 * Задачи ОРК собираются по кодам полей RPA, а не по хардкоду `UF_RPA_1_*`:
 * префикс на порталах разный, см. PortalModel.getRpaFieldBitrixId.
 */
describe('OrkSupplyTaskService', () => {
    const JOB: OrkSupplyTaskJobDto = {
        domain: 'd.ru',
        rpaTypeId: 9,
        rpaId: 42,
        dealId: 777,
    };

    const buildRpa = (over: Record<string, unknown> = {}) => ({
        name: 'Гарант-Юрист, ООО «Ромашка»',
        UF_RPA_9_MANAGER_OS: 12,
        UF_RPA_9_RPA_CRM_COMPANY: 555,
        UF_RPA_9_SITUATION_COMMENTS: 'клиент новый',
        UF_RPA_9_RPA_OWNER_COMMENT: ['строка 1', 'строка 2'],
        UF_RPA_9_RPA_TMC_COMMENT: [],
        UF_RPA_9_CLIENT_CALL_DATE: '2026-09-01T00:00:00+03:00',
        UF_RPA_9_SUPPLY_DATE: '2026-09-05T14:30:00+03:00',
        ...over,
    });

    const build = (rpa: Record<string, unknown> | null) => {
        const taskAdd = jest.fn().mockResolvedValue({
            result: { task: { id: 100 } },
        });
        const pbx = {
            init: jest.fn().mockResolvedValue({
                bitrix: {
                    rpaItem: {
                        get: jest.fn().mockResolvedValue({
                            result: { item: rpa },
                        }),
                    },
                    task: { add: taskAdd },
                },
                PortalModel: {
                    getRpaFieldBitrixIdByCode: (_rpa: string, code: string) =>
                        `UF_RPA_9_${code.toUpperCase()}`,
                },
            }),
        } as unknown as PBXService;

        return { service: new OrkSupplyTaskService(pbx), taskAdd };
    };

    it('создаёт обучение и поставку с привязкой к компании и сделке', async () => {
        const { service, taskAdd } = build(buildRpa());

        const created = await service.createSupplyTasks(JOB);

        expect(created).toEqual([100, 100]);
        expect(taskAdd).toHaveBeenCalledTimes(2);

        const [education, supply] = taskAdd.mock.calls.map(call => call[0]);
        expect(education.TITLE).toBe(
            'Первичное обучение: Гарант-Юрист, ООО «Ромашка»',
        );
        expect(supply.TITLE).toBe('Гарант-Юрист, ООО «Ромашка»');
        expect(education.RESPONSIBLE_ID).toBe(12);
        expect(education.UF_CRM_TASK).toEqual(['CO_555', 'D_777']);
        expect(education.DESCRIPTION).toContain('клиент новый');
        expect(education.DESCRIPTION).toContain('строка 1\nстрока 2');
    });

    it('подставляет 11:00, когда у даты нет времени, и не трогает остальные', async () => {
        const { service, taskAdd } = build(buildRpa());

        await service.createSupplyTasks(JOB);

        const [education, supply] = taskAdd.mock.calls.map(call => call[0]);
        expect(education.DEADLINE).toBe('2026-09-01T11:00:00+03:00');
        expect(supply.DEADLINE).toBe('2026-09-05T14:30:00+03:00');
    });

    it('без менеджера ОС задачи не создаются', async () => {
        const { service, taskAdd } = build(
            buildRpa({ UF_RPA_9_MANAGER_OS: null }),
        );

        expect(await service.createSupplyTasks(JOB)).toEqual([]);
        expect(taskAdd).not.toHaveBeenCalled();
    });

    it('без RPA задачи не создаются', async () => {
        const { service, taskAdd } = build(null);

        expect(await service.createSupplyTasks(JOB)).toEqual([]);
        expect(taskAdd).not.toHaveBeenCalled();
    });
});
