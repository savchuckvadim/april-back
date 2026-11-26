import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PortalViewSaveRequestDto } from '../dto/portal-view-request.dto';

/** Валидация новых полей запроса сохранения: свои названия и колонки планов. */
const pipe = new ValidationPipe({ whitelist: true, transform: true });
const base = { domain: 'gsr.bitrix24.ru', requesterUserId: '447' };

const validateSave = (
    body: Record<string, unknown>,
): Promise<PortalViewSaveRequestDto> =>
    pipe.transform(
        { ...base, ...body },
        { type: 'body', metatype: PortalViewSaveRequestDto },
    ) as Promise<PortalViewSaveRequestDto>;

const messageOf = async (body: Record<string, unknown>): Promise<string> => {
    try {
        await validateSave(body);
    } catch (error) {
        return JSON.stringify((error as BadRequestException).getResponse());
    }
    return '';
};

describe('PortalViewSaveRequestDto: свои названия', () => {
    it('новые поля необязательны', async () => {
        const dto = await validateSave({});
        expect(dto.labels).toBeUndefined();
        expect(dto.plansEvents).toBeUndefined();
        expect(dto.planColumnsHidden).toBeUndefined();
    });

    it('объект названий проходит как есть, пустое значение допустимо', async () => {
        const labels = {
            'ev:presentation_plan': 'Назначенная презентация',
            'call:30': '',
            'plan:calls_done': ` ${'я'.repeat(60)} `,
        };
        const dto = await validateSave({ labels });
        expect(dto.labels).toEqual(labels);
        expect((await validateSave({ labels: {} })).labels).toEqual({});
    });

    it('не объект — ошибка', async () => {
        for (const labels of ['текст', 42, ['ev:call_plan'], null]) {
            const message = await messageOf({ labels });
            // null с @IsOptional пропускается: «не менять».
            if (labels === null) {
                expect(message).toBe('');
                continue;
            }
            expect(message).toContain('Свои названия');
        }
    });

    it('ключ не по шаблону и нестроковое название — ошибка с понятным текстом', async () => {
        expect(
            await messageOf({ labels: { 'xo:call_plan': 'Звонок' } }),
        ).toContain('Ключ своего названия');
        expect(
            await messageOf({ labels: { 'ev:Call_Plan': 'Звонок' } }),
        ).toContain('Ключ своего названия');
        expect(await messageOf({ labels: { 'ev:call_plan': 5 } })).toContain(
            'Свои названия',
        );
    });

    it('название длиннее 60 знаков после обрезки и больше 100 записей — ошибка', async () => {
        expect(
            await messageOf({ labels: { 'ev:call_plan': 'я'.repeat(61) } }),
        ).toContain('не длиннее 60 знаков');

        const hundred = Object.fromEntries(
            Array.from({ length: 100 }, (_, index) => [`ev:k${index}`, 'x']),
        );
        await expect(validateSave({ labels: hundred })).resolves.toBeDefined();
        expect(
            await messageOf({ labels: { ...hundred, 'ev:k100': 'x' } }),
        ).toContain('не больше 100');
    });
});

describe('PortalViewSaveRequestDto: колонки планов', () => {
    it('флаги — только булевы значения', async () => {
        const dto = await validateSave({
            plansEvents: true,
            plansMerged: false,
            plansCallings: true,
        });
        expect(dto).toMatchObject({
            plansEvents: true,
            plansMerged: false,
            plansCallings: true,
        });
        for (const field of ['plansEvents', 'plansMerged', 'plansCallings']) {
            await expect(
                validateSave({ [field]: 'да' }),
            ).rejects.toBeInstanceOf(BadRequestException);
        }
    });

    it('скрытые колонки: только коды планов с фактом в событиях или звонках', async () => {
        const dto = await validateSave({
            planColumnsHidden: ['sales_count', 'calls_over_30s'],
        });
        expect(dto.planColumnsHidden).toEqual([
            'sales_count',
            'calls_over_30s',
        ]);
        expect(
            (await validateSave({ planColumnsHidden: [] })).planColumnsHidden,
        ).toEqual([]);

        expect(
            await messageOf({ planColumnsHidden: ['sales_monthly_amount'] }),
        ).toContain('Неизвестный плановый показатель');
        await expect(
            validateSave({ planColumnsHidden: ['airtime_minutes'] }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            validateSave({ planColumnsHidden: 'sales_count' }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('скрытых колонок не больше 20', async () => {
        const twenty = Array.from({ length: 20 }, () => 'calls_done');
        await expect(
            validateSave({ planColumnsHidden: twenty }),
        ).resolves.toBeDefined();
        await expect(
            validateSave({ planColumnsHidden: [...twenty, 'calls_done'] }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
