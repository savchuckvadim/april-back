import type { MailerOptions } from '@nestjs-modules/mailer'
import { PugAdapter } from '@nestjs-modules/mailer/dist/adapters/pug.adapter'
import { ConfigService } from '@nestjs/config'
import path from 'path'

export function getMailerConfig(configService: ConfigService): MailerOptions {
	return {
		transport: {
			host: configService.getOrThrow<string>('MAIL_HOST'),
			port: configService.getOrThrow<number>('MAIL_PORT'),
			secure: false,
			auth: {
				user: configService.getOrThrow<string>('MAIL_LOGIN'),
				pass: configService.getOrThrow<string>('MAIL_PASSWORD')
			},
            tls: {
                rejectUnauthorized: false,
            },
		},
		defaults: {
			from: `"April Team" ${configService.getOrThrow<string>('MAIL_LOGIN')}`
		},
        // template: {
        //     dir: path.resolve(process.cwd(), 'src/templates'),
        //     adapter: new PugAdapter(),
        //     options: {
        //         strict: true,
        //     },
        // },
	}
}
