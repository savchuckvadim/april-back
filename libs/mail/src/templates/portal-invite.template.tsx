import React from 'react';

import {
    Body,
    Container,
    Font,
    Head,
    Heading,
    Html,
    Img,
    Preview,
    Section,
    Tailwind,
    Text,
} from '@react-email/components';

interface PortalInviteTemplateProps {
    /** Код подключения портала в исходном виде (GRNT-XXXX-XXXX) */
    code: string;
    /** Срок действия кода, уже отформатированный для человека */
    expiresAtLabel?: string;
    /** Организация получателя (если известна) */
    organization?: string;
}

const baseUrl = `https://${process.env.AUTH_COOKIE_SPA_DOMAIN}`;
const supportEmail = 'april-app@mail.ru';

/**
 * Письмо с кодом подключения портала к сервису April
 * (приложение «Менеджер Гарант» из Битрикс24.Маркет).
 *
 * Формулировки согласованы с требованиями модерации Маркета:
 * речь идёт о подключении портала к внешнему сервису April,
 * а не об открытии функциональности приложения.
 */
export function PortalInviteTemplate({
    code,
    expiresAtLabel,
    organization,
}: PortalInviteTemplateProps) {
    const logo = `${baseUrl}/touch-icons/512x512.png`;

    return (
        <Tailwind>
            <Html>
                <Head>
                    <Font
                        fontFamily="Geist"
                        fallbackFontFamily="Arial"
                        webFont={{
                            url: 'https://fonts.googleapis.com/css2?family=Geist:wght@300;500;700&display=swap',
                            format: 'woff2',
                        }}
                    />
                </Head>

                <Body
                    style={{
                        backgroundColor: '#f8f9fa',
                        fontFamily: 'Inter, Arial, sans-serif',
                    }}
                >
                    <Preview>Код подключения портала к сервису April</Preview>
                    <Container className="mx-auto my-10 max-w-[500px] rounded-lg bg-white p-8 shadow-lg">
                        <Section className="text-center">
                            <Img
                                src={logo}
                                width="100"
                                height="100"
                                alt="April"
                                className="mx-auto mb-4"
                            />
                            <Heading
                                className="text-2xl font-bold text-blue-600"
                                style={{ fontFamily: 'Geist, Arial' }}
                            >
                                Код подключения портала
                            </Heading>
                            <Text
                                className="mb-6 text-gray-500"
                                style={{ fontFamily: 'Geist, Arial' }}
                            >
                                {organization
                                    ? `Здравствуйте! Для организации «${organization}» выпущен код подключения портала Битрикс24 к сервису April.`
                                    : 'Здравствуйте! Для вас выпущен код подключения портала Битрикс24 к сервису April.'}
                            </Text>

                            <Section className="mb-8 rounded-lg border border-blue-100 bg-blue-50 p-6">
                                <Text
                                    className="mb-2 text-sm text-gray-500"
                                    style={{ fontFamily: 'Geist, Arial' }}
                                >
                                    Ваш код подключения
                                </Text>
                                <Text
                                    className="my-2 text-3xl font-bold tracking-widest text-blue-700"
                                    style={{ fontFamily: 'Geist, Arial' }}
                                >
                                    {code}
                                </Text>
                                {expiresAtLabel ? (
                                    <Text
                                        className="mt-2 text-sm text-gray-500"
                                        style={{ fontFamily: 'Geist, Arial' }}
                                    >
                                        Код действует до {expiresAtLabel}
                                    </Text>
                                ) : null}
                            </Section>

                            <Section className="mb-8 rounded-lg border border-gray-100 bg-gray-50 p-6 text-left">
                                <Text
                                    className="mb-3 font-medium text-gray-800"
                                    style={{ fontFamily: 'Geist, Arial' }}
                                >
                                    Как подключить портал:
                                </Text>
                                <Text
                                    className="mb-2 text-gray-700"
                                    style={{ fontFamily: 'Geist, Arial' }}
                                >
                                    1. Установите приложение «Менеджер Гарант»
                                    из Битрикс24.Маркет на своём портале.
                                </Text>
                                <Text
                                    className="mb-2 text-gray-700"
                                    style={{ fontFamily: 'Geist, Arial' }}
                                >
                                    2. Откройте установленное приложение на
                                    портале.
                                </Text>
                                <Text
                                    className="text-gray-700"
                                    style={{ fontFamily: 'Geist, Arial' }}
                                >
                                    3. Введите код из этого письма — портал
                                    будет подключён к сервису April.
                                </Text>
                            </Section>

                            <Text
                                className="text-sm text-gray-500"
                                style={{ fontFamily: 'Geist, Arial' }}
                            >
                                «Менеджер Гарант» — клиентский интерфейс
                                внешнего сервиса April. Если вы не запрашивали
                                подключение портала, просто проигнорируйте это
                                письмо.
                            </Text>
                            <Text
                                className="mt-4 text-sm text-gray-500"
                                style={{ fontFamily: 'Geist, Arial' }}
                            >
                                Вопросы по подключению: {supportEmail}
                            </Text>
                            <Text
                                className="mt-6 text-sm text-gray-400"
                                style={{ fontFamily: 'Geist, Arial' }}
                            >
                                © {new Date().getFullYear()} April. Все права
                                защищены.
                            </Text>
                        </Section>
                    </Container>
                </Body>
            </Html>
        </Tailwind>
    );
}
