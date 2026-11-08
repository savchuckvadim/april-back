import { Injectable } from '@nestjs/common';
import { CabinetContext } from '../domain/cabinet-context';
import { PasswordHasher } from '../infrastructure/password-hasher';
import {
    CabinetPasswordService,
    IssuedPasswordLink,
} from '../session/cabinet-password.service';
import {
    AddMemberInput,
    CabinetMembershipService,
} from './cabinet-membership.service';
import { CabinetMemberView } from './cabinet-member.view';

export interface InviteResult {
    member: CabinetMemberView;
    /**
     * Ссылка установки пароля — только для учётки БЕЗ пароля (новой или
     * ещё не входившей). Учётке с паролем ссылку не выпускаем: иначе
     * владелец портала мог бы сменить пароль чужой действующей учётки.
     */
    passwordLink: IssuedPasswordLink | null;
}

/**
 * Пригласить человека в кабинет портала: участник + ссылка установки
 * пароля (письмом; без почты — ссылку передают вручную, она в ответе).
 */
@Injectable()
export class CabinetInviteService {
    constructor(
        private readonly memberships: CabinetMembershipService,
        private readonly passwords: CabinetPasswordService,
        private readonly hasher: PasswordHasher,
    ) {}

    async invite(
        ctx: CabinetContext,
        input: AddMemberInput,
    ): Promise<InviteResult> {
        const { member, user } = await this.memberships.add(ctx, input);
        const passwordLink = this.hasher.isUsable(user.password)
            ? null
            : await this.passwords.issueLink(user, 'setup');
        return { member, passwordLink };
    }
}
