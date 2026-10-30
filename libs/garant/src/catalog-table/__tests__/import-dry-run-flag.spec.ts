import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ImportTableRequestDto } from '../dto/catalog-table.dto';

/**
 * Регресс: глобальный ValidationPipe включает enableImplicitConversion,
 * а оно приводит к true ЛЮБУЮ непустую строку, в том числе 'false'.
 * Из-за этого «Сохранить в каталог» уходило как пробный прогон и
 * ничего не записывало, а бэк отвечал «обновлено 19».
 */
const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    forbidUnknownValues: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
});

const parse = async (body: Record<string, unknown>): Promise<boolean> => {
    const dto = (await pipe.transform(body, {
        type: 'body',
        metatype: ImportTableRequestDto,
    })) as { dryRun?: boolean };
    return dto.dryRun ?? false;
};

describe('флаг dryRun из multipart-формы', () => {
    it('строка «false» означает запись, а не пробный прогон', async () => {
        expect(await parse({ dryRun: 'false' })).toBe(false);
    });

    it('строка «true» означает пробный прогон', async () => {
        expect(await parse({ dryRun: 'true' })).toBe(true);
    });

    it('регистр не важен', async () => {
        expect(await parse({ dryRun: 'FALSE' })).toBe(false);
        expect(await parse({ dryRun: 'TRUE' })).toBe(true);
    });

    it('принимает 0 и 1', async () => {
        expect(await parse({ dryRun: '0' })).toBe(false);
        expect(await parse({ dryRun: '1' })).toBe(true);
    });

    it('без флага — запись (как в описании ручки)', async () => {
        expect(await parse({})).toBe(false);
    });
});
