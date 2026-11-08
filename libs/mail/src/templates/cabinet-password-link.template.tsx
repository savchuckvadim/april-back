import React from 'react';

import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Html,
    Preview,
    Section,
    Tailwind,
    Text,
} from '@react-email/components';

export interface CabinetPasswordLinkTemplateProps {
    name: string;
    url: string;
    /** setup — первый пароль (приглашение), reset — восстановление. */
    purpose: 'setup' | 'reset';
    /** Срок ссылки по-русски: «до 14 ноября, 18:00 (МСК)». */
    expiresLabel: string;
}

/**
 * Письмо кабинета клиента April: ссылка установки или сброса пароля.
 * Ссылка ведёт на сайт кабинета (bitrix.april-app.ru/auth/set-password/…),
 * одноразовая, срок — в тексте.
 */
export function CabinetPasswordLinkTemplate({
    name,
    url,
    purpose,
    expiresLabel,
}: CabinetPasswordLinkTemplateProps) {
    const isSetup = purpose === 'setup';
    const title = isSetup
        ? 'Доступ в кабинет April'
        : 'Восстановление пароля';
    const lead = isSetup
        ? 'Для вас открыт доступ в кабинет April. Задайте пароль — после этого можно входить с сайта, а не только из Битрикс24.'
        : 'Мы получили запрос на восстановление пароля к кабинету April.';

    return (
        <Tailwind>
            <Html>
                <Head />
                <Body className="bg-gray-50 font-sans">
                    <Preview>{title}</Preview>
                    <Container className="mx-auto my-10 max-w-[520px] rounded-lg bg-white p-8">
                        <Heading className="text-xl font-semibold text-gray-900">
                            {title}
                        </Heading>
                        <Text className="text-gray-700">
                            {name ? `${name}, здравствуйте!` : 'Здравствуйте!'}
                        </Text>
                        <Text className="text-gray-700">{lead}</Text>
                        <Section className="my-6 text-center">
                            <Button
                                href={url}
                                className="rounded-md bg-blue-600 px-6 py-3 text-sm font-medium text-white"
                            >
                                {isSetup ? 'Задать пароль' : 'Сменить пароль'}
                            </Button>
                        </Section>
                        <Text className="text-sm text-gray-500">
                            Ссылка одноразовая и действует {expiresLabel}. Если
                            кнопка не открывается, скопируйте адрес в браузер:
                            <br />
                            {url}
                        </Text>
                        <Text className="text-sm text-gray-500">
                            {isSetup
                                ? 'Если вы не ждали этого письма, просто не открывайте ссылку.'
                                : 'Если вы не запрашивали восстановление, ничего делать не нужно: пароль не изменится.'}
                        </Text>
                        <Text className="mt-6 text-xs text-gray-400">
                            © {new Date().getFullYear()} April
                        </Text>
                    </Container>
                </Body>
            </Html>
        </Tailwind>
    );
}
