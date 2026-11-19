import { Controller, Get, Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
    APRIL_INTERNAL_API_KEY_ENV,
    APRIL_INTERNAL_GUARD_MODE_ENV,
    APRIL_INTERNAL_KEY_HEADER,
    APRIL_INTERNAL_KEY_PROTECTED,
    APRIL_INTERNAL_KEY_SECURITY,
} from '../internal-key.const';
import { InternalKeyProtected } from '../internal-key.decorator';
import { isInternalKeyProtected } from '../internal-key.metadata';

const KEY = 'http-test-key-0123456789';

@Controller('closed')
@InternalKeyProtected()
class ClosedController {
    @Get()
    run(): string {
        return 'ok';
    }
}

@Controller('mixed')
class MixedController {
    @Get('closed')
    @InternalKeyProtected()
    closed(): string {
        return 'ok';
    }

    @Get('open')
    open(): string {
        return 'ok';
    }
}

/**
 * Пометка на деле работает в Nest: guard без зависимостей собирается DI
 * любого модуля, режимы off / report / enforce переключаются окружением,
 * соседняя открытая ручка не задета. Заодно — Swagger-метаданные.
 */
describe('@InternalKeyProtected: HTTP', () => {
    const savedMode = process.env[APRIL_INTERNAL_GUARD_MODE_ENV];
    const savedKey = process.env[APRIL_INTERNAL_API_KEY_ENV];
    let app: INestApplication;

    beforeAll(async () => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        const moduleRef = await Test.createTestingModule({
            controllers: [ClosedController, MixedController],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
        jest.restoreAllMocks();
        if (savedMode === undefined)
            delete process.env[APRIL_INTERNAL_GUARD_MODE_ENV];
        else process.env[APRIL_INTERNAL_GUARD_MODE_ENV] = savedMode;
        if (savedKey === undefined)
            delete process.env[APRIL_INTERNAL_API_KEY_ENV];
        else process.env[APRIL_INTERNAL_API_KEY_ENV] = savedKey;
    });

    const setEnv = (mode: string, key?: string): void => {
        process.env[APRIL_INTERNAL_GUARD_MODE_ENV] = mode;
        if (key === undefined) delete process.env[APRIL_INTERNAL_API_KEY_ENV];
        else process.env[APRIL_INTERNAL_API_KEY_ENV] = key;
    };

    const get = (path: string, key?: string) => {
        const call = request(app.getHttpServer() as App).get(path);
        return key ? call.set(APRIL_INTERNAL_KEY_HEADER, key) : call;
    };

    it('enforce, ключ на сервере не задан — 403 и с заголовком', async () => {
        setEnv('enforce');
        await get('/closed', KEY).expect(403);
    });

    it('enforce: без заголовка и с неверным ключом — 403, с верным — 200', async () => {
        setEnv('enforce', KEY);
        await get('/closed').expect(403);
        await get('/mixed/closed', 'wrong-key').expect(403);
        await get('/closed', KEY).expect(200);
        await get('/mixed/closed', KEY).expect(200);
    });

    it('report: без ключа ручка работает как раньше', async () => {
        setEnv('report', KEY);
        await get('/closed').expect(200);
        await get('/mixed/closed', 'wrong-key').expect(200);
    });

    it('off: без ключа ручка работает как раньше', async () => {
        setEnv('off');
        await get('/closed').expect(200);
    });

    it('пометка на методе не закрывает соседнюю ручку', async () => {
        setEnv('enforce');
        await get('/mixed/open').expect(200);
    });

    it('метаданные: guard, метка и схема безопасности Swagger', () => {
        expect(isInternalKeyProtected(ClosedController, 'run')).toBe(true);
        expect(isInternalKeyProtected(MixedController, 'closed')).toBe(true);
        expect(isInternalKeyProtected(MixedController, 'open')).toBe(false);
        expect(
            Reflect.getMetadata(APRIL_INTERNAL_KEY_PROTECTED, ClosedController),
        ).toBe(true);
        expect(
            Reflect.getMetadata(DECORATORS.API_SECURITY, ClosedController),
        ).toEqual([{ [APRIL_INTERNAL_KEY_SECURITY]: [] }]);
    });

    it('несуществующий метод — ошибка, а не тихое false', () => {
        expect(() => isInternalKeyProtected(MixedController, 'nope')).toThrow(
            'нет такого метода',
        );
    });
});
