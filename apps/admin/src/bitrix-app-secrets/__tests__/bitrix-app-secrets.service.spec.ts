import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core';
import { decrypt, encrypt } from '@/shared/lib/utils/crypt.util';
import { BitrixAppSecretsService } from '../services/bitrix-app-secrets.service';

interface PrismaSecretsMock {
    bitrix_app_secrets: {
        findMany: jest.Mock;
        findFirst: jest.Mock;
        update: jest.Mock;
        create: jest.Mock;
        delete: jest.Mock;
    };
}

const row = (over: Record<string, unknown> = {}) => ({
    id: BigInt(1),
    code: 'garant_manager',
    client_id: 'app.686c1234abcd5.12345678',
    client_secret: 'FyX0Zw1abcdEFGH2ijkLMN3opqRST4uv',
    group: 'marketplace',
    type: 'garant',
    created_at: new Date('2026-07-18T12:00:00Z'),
    updated_at: new Date('2026-07-18T12:00:00Z'),
    ...over,
});

describe('BitrixAppSecretsService (CRUD OAuth-кред приложений)', () => {
    let service: BitrixAppSecretsService;
    let prisma: PrismaSecretsMock;

    beforeEach(() => {
        prisma = {
            bitrix_app_secrets: {
                findMany: jest.fn().mockResolvedValue([row()]),
                findFirst: jest.fn().mockResolvedValue(row()),
                update: jest.fn().mockResolvedValue(row()),
                create: jest.fn().mockResolvedValue(row()),
                delete: jest.fn().mockResolvedValue(row()),
            },
        };
        service = new BitrixAppSecretsService(
            prisma as unknown as PrismaService,
        );
    });

    it('список/чтение: client_secret ВСЕГДА маскирован (legacy-строка открытым текстом читается)', async () => {
        const [dto] = await service.findAll();

        expect(dto.clientSecretMasked).toBe('FyX0…T4uv');
        expect(JSON.stringify(dto)).not.toContain(
            'FyX0Zw1abcdEFGH2ijkLMN3opqRST4uv',
        );
        expect(dto.clientId).toBe('app.686c1234abcd5.12345678');
    });

    it('шифрованная строка маскируется по РАСШИФРОВАННОМУ значению', async () => {
        prisma.bitrix_app_secrets.findMany.mockResolvedValue([
            row({
                client_secret: encrypt('FyX0Zw1abcdEFGH2ijkLMN3opqRST4uv'),
            }),
        ]);
        const [dto] = await service.findAll();
        expect(dto.clientSecretMasked).toBe('FyX0…T4uv');
    });

    it('upsert: секрет ШИФРУЕТСЯ перед сохранением (в БД не открытый текст)', async () => {
        const dto = await service.upsert('garant_manager', {
            clientId: 'new.client.id',
            clientSecret: 'new-secret-value-123',
        });

        const [updateArgs] = prisma.bitrix_app_secrets.update.mock.calls[0] as [
            {
                where: { id: bigint };
                data: { client_id: string; client_secret: string };
            },
        ];
        expect(updateArgs.where).toEqual({ id: BigInt(1) });
        expect(updateArgs.data.client_id).toBe('new.client.id');
        // в БД уходит шифротекст, расшифровка возвращает исходный секрет
        expect(updateArgs.data.client_secret).not.toBe('new-secret-value-123');
        expect(decrypt(updateArgs.data.client_secret)).toBe(
            'new-secret-value-123',
        );
        expect(prisma.bitrix_app_secrets.create).not.toHaveBeenCalled();
        expect(dto.code).toBe('garant_manager');
    });

    it('upsert: отсутствующая запись создаётся с кодом из URL', async () => {
        prisma.bitrix_app_secrets.findFirst.mockResolvedValue(null);

        await service.upsert('garant_manager', {
            clientId: 'id',
            clientSecret: 'secret-12345',
        });

        const [createArgs] = prisma.bitrix_app_secrets.create.mock.calls[0] as [
            { data: { code: string; client_secret: string } },
        ];
        expect(createArgs.data.code).toBe('garant_manager');
        expect(decrypt(createArgs.data.client_secret)).toBe('secret-12345');
    });

    it('чтение/удаление несуществующего кода → NotFoundException', async () => {
        prisma.bitrix_app_secrets.findFirst.mockResolvedValue(null);

        await expect(service.findByCode('ghost')).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(service.delete('ghost')).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(prisma.bitrix_app_secrets.delete).not.toHaveBeenCalled();
    });

    it('короткий секрет маскируется целиком', async () => {
        prisma.bitrix_app_secrets.findMany.mockResolvedValue([
            row({ client_secret: 'short' }),
        ]);
        const [dto] = await service.findAll();
        expect(dto.clientSecretMasked).toBe('…');
    });
});
