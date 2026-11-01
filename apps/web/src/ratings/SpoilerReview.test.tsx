// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SpoilerReview } from './SpoilerReview.js';

afterEach(cleanup);

describe('SpoilerReview', () => {
  it('does not render a spoiler until the user reveals it and can hide it again', () => {
    const secret = 'El protagonista era el narrador';
    render(<SpoilerReview review={secret} containsSpoilers />);

    expect(screen.getByText('Esta reseña contiene spoilers')).toBeTruthy();
    expect(screen.queryByText(secret)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar reseña' }));
    expect(screen.getByText(secret)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar reseña' }));
    expect(screen.queryByText(secret)).toBeNull();
  });

  it('renders non-spoiler text as plain React text', () => {
    const review = '<img src=x onerror=alert(1)>';
    const { container } = render(<SpoilerReview review={review} containsSpoilers={false} />);
    expect(screen.getByText(review)).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps hidden text out of the whole DOM, attributes included, and escapes markup once revealed', () => {
    const secret = '<script>alert("spoiler")</script> final';
    const { container } = render(<SpoilerReview review={secret} containsSpoilers />);

    expect(container.innerHTML).not.toContain('final');
    expect(container.innerHTML).not.toContain('script');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar reseña' }));
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(secret)).toBeTruthy();
  });
});
