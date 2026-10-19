import { describe, expect, it, vi } from 'vitest';
import {
  createInvitationEmailDelivery,
  createPasswordResetEmail,
  type EmailSender,
  type OutgoingEmail,
} from './email.service.js';

describe('email delivery adapters', () => {
  it('sends a time-bounded invitation link without returning its token', async () => {
    const messages: OutgoingEmail[] = [];
    const sender: EmailSender = {
      async send(message) {
        messages.push(message);
      },
    };
    const token = 'private-invitation-token';
    const expiresAt = new Date('2026-10-26T10:00:00.000Z');
    const delivery = createInvitationEmailDelivery(sender, 'http://127.0.0.1:5173');

    await delivery.deliver({
      id: 'invitation-1',
      email: 'invitee@example.test',
      token,
      expiresAt,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].to).toBe('invitee@example.test');
    const invitationURL = new URL(messages[0].text.match(/https?:\/\/\S+/)![0]);
    expect(invitationURL.origin + invitationURL.pathname).toBe(
      'http://127.0.0.1:5173/accept-invitation',
    );
    expect(new URLSearchParams(invitationURL.hash.slice(1)).get('token')).toBe(token);
    expect(new URLSearchParams(invitationURL.hash.slice(1)).get('email')).toBe(
      'invitee@example.test',
    );
    expect(messages[0].text).toContain(expiresAt.toISOString());
  });

  it('does not expose the password reset URL outside the outgoing message', async () => {
    const send = vi.fn(async () => {});
    const delivery = createPasswordResetEmail({ send }, 'http://127.0.0.1:5173');
    const token = 'one-time-token';

    await delivery({ email: 'user@example.test', token });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.test',
        text: expect.stringContaining('http://127.0.0.1:5173/reset-password#token=one-time-token'),
      }),
    );
  });

  it('propagates a mail transport failure to the invitation state machine', async () => {
    const delivery = createInvitationEmailDelivery(
      {
        async send() {
          throw new Error('simulated transport failure');
        },
      },
      'http://127.0.0.1:5173',
    );

    await expect(
      delivery.deliver({
        id: 'invitation-2',
        email: 'invitee@example.test',
        token: 'private-token',
        expiresAt: new Date('2026-10-26T10:00:00.000Z'),
      }),
    ).rejects.toThrow('simulated transport failure');
  });
});
