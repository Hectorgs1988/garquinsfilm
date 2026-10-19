import { describe, expect, it } from 'vitest';
import { getAuthConfig } from '../auth/config.js';
import { createSmtpEmailSender } from './email.service.js';

const mailpitTestsEnabled = process.env.RUN_MAILPIT_TESTS === '1';

describe.skipIf(!mailpitTestsEnabled)('Mailpit SMTP integration', () => {
  it('accepts and captures a local test message', async () => {
    const config = getAuthConfig();
    const subject = `GarquinsFilm Mailpit test ${Date.now()}`;
    const recipient = `mailpit-${Date.now()}@garquinsfilm.local`;
    const sender = createSmtpEmailSender(config.smtp);

    await sender.send({
      to: recipient,
      subject,
      text: 'Mensaje local de prueba; no contiene credenciales ni datos personales.',
    });

    const webPort = process.env.MAILPIT_WEB_PORT ?? '8025';
    let messages = '';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await fetch(`http://127.0.0.1:${webPort}/api/v1/messages`);
      if (response.ok) {
        messages = await response.text();
        if (messages.includes(subject) && messages.includes(recipient)) {
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(messages).toContain(subject);
    expect(messages).toContain(recipient);
  });
});
