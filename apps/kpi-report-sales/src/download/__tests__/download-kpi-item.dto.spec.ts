import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { DownloadReportKpiItemDto } from '../dto/get-excel-report.dto';

/** Колонка строки отчёта для Excel: обычная и плановая (kind = plan). */
const pipe = new ValidationPipe({ whitelist: true, transform: true });

const validate = (
    body: Record<string, unknown>,
): Promise<DownloadReportKpiItemDto> =>
    pipe.transform(body, {
        type: 'body',
        metatype: DownloadReportKpiItemDto,
    }) as Promise<DownloadReportKpiItemDto>;

describe('DownloadReportKpiItemDto', () => {
    it('обычная колонка — как раньше, без вида и заметки', async () => {
        const dto = await validate({
            id: 'call_done',
            action: 'Звонок',
            count: 5,
        });
        expect(dto).toMatchObject({ action: 'Звонок', count: 5 });
        expect(dto.kind).toBeUndefined();
        expect(dto.note).toBeUndefined();
    });

    it('плановая колонка: kind = plan, заметка, count null (плана нет)', async () => {
        const dto = await validate({
            id: 'plan:presentations_done',
            action: 'План: Презентация',
            count: null,
            kind: 'plan',
            note: 'План по показателю «Презентация»',
        });
        expect(dto).toMatchObject({
            kind: 'plan',
            count: null,
            note: 'План по показателю «Презентация»',
        });
    });

    it('неизвестный вид колонки и не строка — ошибка', async () => {
        await expect(
            validate({ action: 'Звонок', count: 1, kind: 'fact' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            validate({ action: 'Звонок', count: 1, kind: 1 }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('заметка — до 300 знаков', async () => {
        await expect(
            validate({
                action: 'План',
                count: 1,
                kind: 'plan',
                note: 'я'.repeat(300),
            }),
        ).resolves.toBeDefined();
        await expect(
            validate({
                action: 'План',
                count: 1,
                kind: 'plan',
                note: 'я'.repeat(301),
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
