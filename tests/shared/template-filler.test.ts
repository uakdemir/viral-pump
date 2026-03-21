import { describe, it, expect } from 'vitest';
import { fillPromptTemplate, fillHtmlTemplate } from '../../src/shared/template-filler.js';

describe('fillPromptTemplate', () => {
  it('replaces simple placeholders', () => {
    expect(fillPromptTemplate('Price: {{price}}', { price: 2350 })).toBe('Price: 2350');
  });

  it('replaces dot-path placeholders', () => {
    expect(fillPromptTemplate('{{data.price}}', { data: { price: 100 } })).toBe('100');
  });

  it('returns empty string for missing values', () => {
    expect(fillPromptTemplate('Hello {{name}}!', {})).toBe('Hello !');
  });

  it('does NOT escape HTML characters in prompt mode', () => {
    expect(fillPromptTemplate('{{text}}', { text: '<b>bold</b>' })).toBe('<b>bold</b>');
  });

  it('handles multiple placeholders', () => {
    const result = fillPromptTemplate('{{a}} and {{b}}', { a: 'foo', b: 'bar' });
    expect(result).toBe('foo and bar');
  });

  it('handles null and undefined values', () => {
    expect(fillPromptTemplate('{{a}} {{b}}', { a: null, b: undefined })).toBe(' ');
  });
});

describe('fillHtmlTemplate', () => {
  it('escapes HTML characters', () => {
    expect(fillHtmlTemplate('{{text}}', { text: '<script>alert("xss")</script>' })).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('escapes ampersands', () => {
    expect(fillHtmlTemplate('{{text}}', { text: 'A & B' })).toBe('A &amp; B');
  });

  it('still replaces dot paths', () => {
    expect(fillHtmlTemplate('{{data.name}}', { data: { name: 'test' } })).toBe('test');
  });

  it('escapes in context of HTML template', () => {
    const html = '<div>{{generatedText}}</div>';
    const result = fillHtmlTemplate(html, { generatedText: 'Price > $100 & "rising"' });
    expect(result).toBe('<div>Price &gt; $100 &amp; &quot;rising&quot;</div>');
  });
});
