import nodemailer from 'nodemailer';
import type { AuthConfig } from '../auth/config.js';
import type { InvitationDelivery } from '../auth/invitations.service.js';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: OutgoingEmail): Promise<void>;
}

export class EmailDeliveryUnavailableError extends Error {
  constructor() {
    super('Email delivery is unavailable.');
    this.name = 'EmailDeliveryUnavailableError';
  }
}

export function createSmtpEmailSender(config: AuthConfig['smtp']): EmailSender {
  const transport = config.host
    ? nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        connectionTimeout: 5_000,
        greetingTimeout: 5_000,
        socketTimeout: 10_000,
        ...(config.user && config.password
          ? { auth: { user: config.user, pass: config.password } }
          : {}),
      })
    : undefined;

  return {
    async send(message) {
      if (!transport || !config.from) {
        throw new EmailDeliveryUnavailableError();
      }
      const result = await transport.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      const accepted = result.accepted.some(
        (recipient) => recipient.toLowerCase() === message.to.toLowerCase(),
      );
      if (!accepted || result.rejected.length > 0) {
        throw new EmailDeliveryUnavailableError();
      }
    },
  };
}

export function createInvitationEmailDelivery(
  sender: EmailSender,
  webAppURL: string,
): InvitationDelivery {
  return {
    async deliver(invitation) {
      const url = new URL('/accept-invitation', webAppURL);
      url.hash = new URLSearchParams({
        email: invitation.email,
        token: invitation.token,
      }).toString();
      await sender.send({
        to: invitation.email,
        subject: 'Invitación a GarquinsFilm',
        text: [
          'Has recibido una invitación para crear una cuenta de GarquinsFilm.',
          '',
          `Acepta la invitación antes del ${invitation.expiresAt.toISOString()}:`,
          url.toString(),
          '',
          'Si no esperabas este mensaje, puedes ignorarlo.',
        ].join('\n'),
      });
    },
  };
}

export function createPasswordResetEmail(
  sender: EmailSender,
  webAppURL: string,
): (input: { email: string; token: string }) => Promise<void> {
  return async ({ email, token }) => {
    const url = new URL('/reset-password', webAppURL);
    url.hash = new URLSearchParams({ token }).toString();
    await sender.send({
      to: email,
      subject: 'Recuperación de contraseña de GarquinsFilm',
      text: [
        'Se ha solicitado restablecer la contraseña de tu cuenta de GarquinsFilm.',
        '',
        `El enlace temporal y de un solo uso es: ${url}`,
        '',
        'Si no solicitaste este cambio, ignora este mensaje.',
      ].join('\n'),
    });
  };
}
