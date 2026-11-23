// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { translations } from '../i18n/translations';
import { TranslatableText } from './TranslatableText';

const t = translations.en;
const ORIGINAL = 'La llave del lavabo gotea';

afterEach(cleanup);

describe('TranslatableText', () => {
  it('shows the original with a loading hint while translating', () => {
    render(<TranslatableText original={ORIGINAL} outcome={{ state: 'loading' }} t={t} />);
    expect(screen.getByText(ORIGINAL)).toBeTruthy();
    expect(screen.getByText(t.translating)).toBeTruthy();
    expect(screen.queryByText(t.machineTranslation)).toBeNull();
  });

  it('shows a labelled translation that can be switched to the original and back', () => {
    render(<TranslatableText original={ORIGINAL} outcome={{ state: 'translated', text: 'The sink faucet drips' }} t={t} />);
    expect(screen.getByText('The sink faucet drips')).toBeTruthy();
    expect(screen.getByText(t.machineTranslation)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: t.viewOriginal }));
    expect(screen.getByText(ORIGINAL)).toBeTruthy();
    expect(screen.queryByText('The sink faucet drips')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: t.viewTranslation }));
    expect(screen.getByText('The sink faucet drips')).toBeTruthy();
  });

  it('shows the original as written when it is already in the UI language', () => {
    render(<TranslatableText original={ORIGINAL} outcome={{ state: 'same' }} t={t} />);
    expect(screen.getByText(ORIGINAL)).toBeTruthy();
    expect(screen.queryByText(t.machineTranslation)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps the original visible with an error message when translation fails', () => {
    const { rerender } = render(<TranslatableText original={ORIGINAL} outcome={{ state: 'error', reason: 'failed' }} t={t} />);
    expect(screen.getByText(ORIGINAL)).toBeTruthy();
    expect(screen.getByText(t.translationFailed)).toBeTruthy();

    rerender(<TranslatableText original={ORIGINAL} outcome={{ state: 'error', reason: 'busy' }} t={t} />);
    expect(screen.getByText(t.translationBusy)).toBeTruthy();
  });

  it('sanitizes translated rich text like the original', () => {
    const { container } = render(
      <TranslatableText
        html
        original="<p>Fuga</p>"
        outcome={{ state: 'translated', text: '<p>Leak <b>here</b><img src=x onerror="alert(1)"><script>alert(2)</script></p>' }}
        t={t}
      />,
    );
    const html = container.innerHTML;
    expect(html).toContain('<b>here</b>');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
  });
});
