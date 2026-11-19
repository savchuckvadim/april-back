import { createGlobalValidationPipe } from '@lib/core/bootstrap/global-validation-pipe';
import { UpdateRqDto } from './provider.dto';

/** Тело правки реквизитов через тот же ValidationPipe, что и в проде */
const pipe = createGlobalValidationPipe();

const parse = (body: Record<string, unknown>): Promise<UpdateRqDto> =>
    pipe.transform(body, {
        type: 'body',
        metatype: UpdateRqDto,
    }) as Promise<UpdateRqDto>;

describe('UpdateRqDto через ValidationPipe', () => {
    it('withTax принимается и доезжает до сервиса, в том числе false', async () => {
        expect((await parse({ withTax: true })).withTax).toBe(true);
        expect((await parse({ withTax: false })).withTax).toBe(false);
    });

    it('без withTax поле остаётся неопределённым: признак не меняется', async () => {
        const dto = await parse({ name: 'ООО «Новое»' });
        expect(dto.withTax).toBeUndefined();
        expect(dto.name).toBe('ООО «Новое»');
    });

    it('лишние поля, которых нет в DTO, срезаются', async () => {
        const dto = await parse({ withTax: true, agentId: 5 });
        expect(dto).not.toHaveProperty('agentId');
    });
});
