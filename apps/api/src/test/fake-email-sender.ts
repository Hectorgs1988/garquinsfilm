import type { EmailSender, OutgoingEmail } from '../email/email.service.js';

export class FakeEmailSender implements EmailSender {
  readonly messages: OutgoingEmail[] = [];
  failure: Error | undefined;

  async send(message: OutgoingEmail): Promise<void> {
    if (this.failure) {
      throw this.failure;
    }
    this.messages.push(message);
  }
}
