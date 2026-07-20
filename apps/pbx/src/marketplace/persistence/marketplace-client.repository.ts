import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Client } from 'generated/prisma';
import { PrismaService } from '@lib/core/prisma/prisma.service';

/**
 * Идентичность клиента маркетплейса: организация (`clients`) и её корневой
 * пользователь (`users`).
 *
 * Вынесено из MarketplaceInstallRepository: тот отвечает за установки и
 * порталы, а здесь — только «кто такой клиент». Спецификация:
 * ai/tasks/bitrix-marketplace-client-identity.md.
 */

export interface ClientIdentityInput {
    organizationName: string;
    contactEmail: string;
    lastName: string;
    firstName: string;
    /** ID пользователя на портале Bitrix — якорь идентичности */
    bitrixUserId?: string;
}

/**
 * Роль корневого пользователя клиента.
 *
 * Внешнего ключа на `roles` в схеме нет, а сама таблица ролей пуста —
 * значение проверено по факту: оба существующих пользователя имеют role_id=1.
 * Роли ведёт Laravel-проект; когда там появится отдельная роль клиента,
 * менять нужно ЗДЕСЬ, а не по месту вызова.
 */
const CLIENT_ROOT_ROLE_ID = BigInt(1);

@Injectable()
export class MarketplaceClientRepository {
    private readonly logger = new Logger(MarketplaceClientRepository.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Заявка на подключение: создать организацию с корневым пользователем и
     * привязать к порталу, либо (повторная подача) обновить данные.
     * Идемпотентно — второго клиента/пользователя не появляется.
     *
     * Всё одной транзакцией: портал с client_id, но без организации (или
     * организация без корневого пользователя) — состояние, из которого
     * кабинет уже не выберется сам.
     */
    async linkClientWithRootUser(
        portalId: bigint,
        data: ClientIdentityInput,
    ): Promise<Client> {
        return this.prisma.$transaction(async tx => {
            const portal = await tx.portal.findUnique({
                where: { id: portalId },
            });

            const client = portal?.client_id
                ? await tx.client.update({
                      where: { id: portal.client_id },
                      data: {
                          name: data.organizationName,
                          email: data.contactEmail,
                          updated_at: new Date(),
                      },
                  })
                : await tx.client.create({
                      data: {
                          name: data.organizationName,
                          email: data.contactEmail,
                          status: 'pending',
                          is_active: true,
                          created_at: new Date(),
                          updated_at: new Date(),
                      },
                  });

            if (!portal?.client_id) {
                await tx.portal.update({
                    where: { id: portalId },
                    data: { client_id: client.id },
                });
                this.logger.log(
                    `Onboarding: клиент #${client.id} привязан к порталу #${portalId}`,
                );
            }

            // Корневой пользователь ищется по организации, а не по email:
            // email мог быть изменён в этой же заявке, и поиск по нему завёл
            // бы второго пользователя той же организации.
            const existing = await tx.user.findFirst({
                where: { client_id: client.id },
                orderBy: { id: 'asc' },
            });

            if (existing) {
                await tx.user.update({
                    where: { id: existing.id },
                    data: {
                        name: data.firstName,
                        surname: data.lastName,
                        email: data.contactEmail,
                        ...(data.bitrixUserId
                            ? { bitrix_id: data.bitrixUserId }
                            : {}),
                        updated_at: new Date(),
                    },
                });
            } else {
                await tx.user.create({
                    data: {
                        name: data.firstName,
                        surname: data.lastName,
                        email: data.contactEmail,
                        client_id: client.id,
                        role_id: CLIENT_ROOT_ROLE_ID,
                        ...(data.bitrixUserId
                            ? { bitrix_id: data.bitrixUserId }
                            : {}),
                        // Пароля у клиентов пока нет (клиентский auth — позже):
                        // кладём заведомо неподходящий хэш, чтобы вход по
                        // паролю был невозможен, а не «пустой пароль».
                        password: unusablePassword(),
                        email_verified_at: null,
                        created_at: new Date(),
                        updated_at: new Date(),
                    },
                });
                this.logger.log(
                    `Onboarding: корневой пользователь клиента #${client.id} создан`,
                );
            }

            return client;
        });
    }

    /** Организация, уже привязанная к порталу (null — заявки ещё не было) */
    async findPortalClient(portalId: bigint): Promise<Client | null> {
        const portal = await this.prisma.portal.findUnique({
            where: { id: portalId },
            include: { clients: true },
        });
        return portal?.clients ?? null;
    }
}

/**
 * Заглушка пароля: случайная строка в формате, который bcrypt-сравнение
 * никогда не примет за валидный хэш. Проверять её никто не должен —
 * вход клиента появится вместе с верификацией почты.
 */
function unusablePassword(): string {
    return `!unusable!${randomBytes(24).toString('hex')}`;
}
