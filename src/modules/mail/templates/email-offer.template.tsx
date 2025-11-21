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
    Text
} from '@react-email/components'


interface EmailOfferTemplateProps {
    email: string
    hasLogo?: boolean
}

export function EmailOfferTemplate() {



    return (
        <Tailwind>
            <Html>
                <Head>
                    <Font
                        fontFamily='Geist'
                        fallbackFontFamily='Arial'
                        webFont={{
                            url: 'https://fonts.googleapis.com/css2?family=Geist:wght@300;500;700&display=swap',
                            format: 'woff2'
                        }}
                    />
                </Head>

                <Body style={{ backgroundColor: '#f8f9fa', fontFamily: 'Inter, Arial, sans-serif' }}>

                    <Preview>Коммерческое предложение Апрель Битрикс</Preview>
                    <Container className='mx-auto my-10 max-w-[500px] rounded-lg bg-white p-8 shadow-lg'>
                        <Section className='text-center'>

                            <Heading className='text-2xl font-bold text-blue-600' style={{ fontFamily: 'Geist, Arial' }}>
                                Коммерческое предложение
                            </Heading>
                            <Text className='mb-6 text-gray-500' style={{ fontFamily: 'Geist, Arial' }}>
                                Привет! Мы получили запрос коммерческого предложения.
                            </Text>
                            <Section className='mb-8 rounded-lg border border-blue-100 bg-blue-50 p-6'>
                                <Text className='mb-4 text-gray-800' style={{ fontFamily: 'Geist, Arial' }}>
                                    Предложение находится в прикрепленном файле

                                </Text>

                            </Section>
                            <Text className='text-sm text-gray-500' style={{ fontFamily: 'Geist, Arial' }}>
                                Если вы не запрашивали коммерческое предложение, просто проигнорируйте это письмо.
                            </Text>
                            <Text className='mt-6 text-sm text-gray-400' style={{ fontFamily: 'Geist, Arial' }}>
                                © {new Date().getFullYear()} April. Все права защищены.
                             
                            </Text>
                        </Section>
                    </Container>
                </Body>

            </Html>
        </Tailwind>
    )
}
