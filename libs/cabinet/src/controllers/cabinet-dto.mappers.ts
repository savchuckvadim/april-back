import { IssuedPasswordLink } from '../session/cabinet-password.service';
import { CabinetPasswordLinkDto } from '../dto/cabinet-member.dto';

export function toPasswordLinkDto(
    link: IssuedPasswordLink,
): CabinetPasswordLinkDto {
    return {
        url: link.url,
        expiresAt: link.expiresAt.toISOString(),
        emailSent: link.emailSent,
    };
}
