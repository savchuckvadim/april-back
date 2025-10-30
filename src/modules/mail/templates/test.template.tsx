import React from 'react'

import {
    Body,
    Button,
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
    Hr
} from '@react-email/components'

interface EmailVerificationTemplateProps {
    userName: string
    text: string
}

const baseUrl = process.env['APP_URL']

export function TestTemplate({ userName, text }: EmailVerificationTemplateProps) {
    const logo = `${baseUrl}/touch-icons/512x512.png`

    return (
        <Tailwind>
            <Html>
                <Head>
                    <Font
                        fontFamily='Inter'
                        fallbackFontFamily={['Arial', 'sans-serif']}
                        webFont={{
                            url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
                            format: 'woff2'
                        }}
                    />
                </Head>

                <Body style={{ backgroundColor: '#f8f9fa', fontFamily: 'Inter, Arial, sans-serif' }}>
                    <Preview>Информационное письмо от April</Preview>

                    {/* Header */}
                    <Container className='mx-auto my-0 max-w-[600px] bg-white'>
                        <Section className='bg-black px-8 py-6'>
                            <Section className='text-center'>
                                <Heading
                                    className='text-3xl font-bold text-white m-0'
                                    style={{
                                        fontFamily: 'Inter, Arial, sans-serif',
                                        letterSpacing: '0.5px'
                                    }}
                                >
                                    APRIL
                                </Heading>
                                <Text
                                    className='text-sm text-gray-300 mt-2 m-0'
                                    style={{ fontFamily: 'Inter, Arial, sans-serif' }}
                                >
                                    Информационное письмо
                                </Text>
                            </Section>
                        </Section>

                        {/* Main Content */}
                        <Section className='px-8 py-8'>
                            <Text
                                className='text-lg text-gray-800 mb-6'
                                style={{ fontFamily: 'Inter, Arial, sans-serif' }}
                            >
                                Здравствуйте, {userName}!
                            </Text>

                            <Text
                                className='text-base text-gray-700 leading-relaxed mb-6'
                                style={{ fontFamily: 'Inter, Arial, sans-serif' }}
                            >
                                {text}
                            </Text>

                            {/* Information Block */}
                            <Section className='bg-gray-50 border-l-4 border-black p-6 mb-8'>
                                <Heading
                                    className='text-xl font-semibold text-black mb-4'
                                    style={{ fontFamily: 'Inter, Arial, sans-serif' }}
                                >
                                    Важная информация
                                </Heading>
                                <Text
                                    className='text-gray-700 leading-relaxed'
                                    style={{ fontFamily: 'Inter, Arial, sans-serif' }}
                                >
                                    Мы рады сообщить вам о последних обновлениях и новостях нашей компании.
                                    Ваше мнение важно для нас, и мы всегда готовы к диалогу.
                                </Text>
                            </Section>

                            {/* CTA Button */}
                            <Section className='text-center mb-8'>
                                <Button
                                    href={baseUrl}
                                    className='inline-block bg-black text-white px-8 py-4 text-base font-medium rounded-none border-2 border-black hover:bg-white hover:text-black transition-colors'
                                    style={{
                                        fontFamily: 'Inter, Arial, sans-serif',
                                        textDecoration: 'none',
                                        display: 'inline-block'
                                    }}
                                >
                                    Узнать больше
                                </Button>
                            </Section>

                            <Hr className='border-gray-200 my-8' />

                            {/* Additional Info */}
                            <Section className='mb-6'>
                                <Heading
                                    className='text-lg font-semibold text-black mb-4'
                                    style={{ fontFamily: 'Inter, Arial, sans-serif' }}
                                >
                                    Дополнительная информация
                                </Heading>
                                <Text
                                    className='text-gray-600 text-sm leading-relaxed'
                                    style={{ fontFamily: 'Inter, Arial, sans-serif' }}
                                >
                                    Если у вас есть вопросы или предложения, не стесняйтесь обращаться к нам.
                                    Мы всегда готовы помочь и предоставить необходимую поддержку.
                                </Text>
                            </Section>
                        </Section>

                        {/* Footer */}
                        <Section className='bg-gray-100 px-8 py-6'>
                            <Section className='text-center'>
                                <Text
                                    className='text-sm text-gray-600 mb-2'
                                    style={{ fontFamily: 'Inter, Arial, sans-serif' }}
                                >
                                    С уважением, команда April
                                </Text>
                                <Text
                                    className='text-xs text-gray-500'
                                    style={{ fontFamily: 'Inter, Arial, sans-serif' }}
                                >
                                    © {new Date().getFullYear()} April. Все права защищены.
                                </Text>
                                <Text
                                    className='text-xs text-gray-500 mt-2'
                                    style={{ fontFamily: 'Inter, Arial, sans-serif' }}
                                >
                                    Если вы не хотите получать эти письма, вы можете отписаться от рассылки.
                                </Text>
                            </Section>
                        </Section>
                    </Container>
                </Body>
            </Html>
        </Tailwind>
    )
}
