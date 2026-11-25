import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
    PortalViewGetRequestDto,
    PortalViewSaveRequestDto,
} from '../dto/portal-view-request.dto';

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

describe('PortalViewGetRequestDto', () => {
    it('домен и пользователь обязательны', async () => {
        const dto = (await pipe.transform(base, {
            type: 'body',
            metatype: PortalViewGetRequestDto,
        })) as PortalViewGetRequestDto;
        expect(dto).toMatchObject(base);

        await expect(
            pipe.transform(
                { domain: 'gsr.bitrix24.ru' },
                { type: 'body', metatype: PortalViewGetRequestDto },
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('PortalViewSaveRequestDto', () => {
    it('одни домен и пользователь проходят: все поля необязательны', async () => {
        const dto = await validateSave({});
        expect(dto.tabsHidden).toBeUndefined();
        expect(dto.chartsEnabled).toBeUndefined();
        expect(dto.badgesMain).toBeUndefined();
    });

    it('полный допустимый запрос проходит без изменений', async () => {
        const dto = await validateSave({
            tabsHidden: ['merged', 'call_reviews'],
            chartsEnabled: false,
            badgesMain: ['step_missing', 'm:cold.utp_unique', 'm:pres.a-b'],
        });
        expect(dto.tabsHidden).toEqual(['merged', 'call_reviews']);
        expect(dto.chartsEnabled).toBe(false);
        expect(dto.badgesMain).toEqual([
            'step_missing',
            'm:cold.utp_unique',
            'm:pres.a-b',
        ]);
    });

    it('пустые списки допустимы: «ничего не скрыто» и «набор по умолчанию»', async () => {
        const dto = await validateSave({ tabsHidden: [], badgesMain: [] });
        expect(dto.tabsHidden).toEqual([]);
        expect(dto.badgesMain).toEqual([]);
    });

    it('вкладки: только коды из справочника, «all» и мусор отклоняются', async () => {
        await expect(validateSave({ tabsHidden: ['all'] })).rejects.toThrow(
            BadRequestException,
        );
        await expect(
            validateSave({ tabsHidden: ['finance', 'zzz'] }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(await messageOf({ tabsHidden: ['zzz'] })).toContain(
            'Неизвестная вкладка отчёта',
        );
        await expect(
            validateSave({ tabsHidden: 'finance' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(validateSave({ tabsHidden: [1] })).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('вкладок не больше 20', async () => {
        const twenty = Array.from({ length: 20 }, () => 'events');
        await expect(
            validateSave({ tabsHidden: twenty }),
        ).resolves.toBeDefined();
        await expect(
            validateSave({ tabsHidden: [...twenty, 'events'] }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('графики — только булево значение', async () => {
        await expect(
            validateSave({ chartsEnabled: 'да' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(validateSave({ chartsEnabled: 1 })).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('бейджи: формат идентификатора проверяется у каждого', async () => {
        for (const bad of [
            'Step_Missing',
            'step missing',
            '_step',
            'step__missing',
            'step_',
            'm:',
            'm:Cold',
            'x:cold',
            '',
        ]) {
            await expect(
                validateSave({ badgesMain: ['signal', bad] }),
            ).rejects.toBeInstanceOf(BadRequestException);
        }
        expect(await messageOf({ badgesMain: ['Bad'] })).toContain(
            'строчная латиница',
        );
    });

    it('бейджи: id не длиннее 80 знаков, список — не больше 60', async () => {
        await expect(
            validateSave({ badgesMain: [`a${'b'.repeat(79)}`] }),
        ).resolves.toBeDefined();
        await expect(
            validateSave({ badgesMain: [`a${'b'.repeat(80)}`] }),
        ).rejects.toBeInstanceOf(BadRequestException);

        const sixty = Array.from({ length: 60 }, (_, index) => `m:p${index}`);
        await expect(
            validateSave({ badgesMain: sixty }),
        ).resolves.toBeDefined();
        await expect(
            validateSave({ badgesMain: [...sixty, 'signal'] }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            validateSave({ badgesMain: 'signal' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(validateSave({ badgesMain: [42] })).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('лишние поля отбрасываются (whitelist)', async () => {
        const dto = (await validateSave({
            chartsEnabled: true,
            updatedBy: 'Подмена',
        })) as PortalViewSaveRequestDto & { updatedBy?: string };
        expect(dto.updatedBy).toBeUndefined();
    });

    it('домен и пользователь обязательны и в запросе сохранения', async () => {
        await expect(
            pipe.transform(
                { chartsEnabled: true },
                { type: 'body', metatype: PortalViewSaveRequestDto },
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
