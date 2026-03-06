import { describe, expect, it } from 'bun:test';

import { slugify } from '../string';

describe('slugify', () => {
  it('should convert basic strings to lowercase slugs', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('My Test String')).toBe('my-test-string');
    expect(slugify('SIMPLE')).toBe('simple');
  });

  it('should handle strings with numbers', () => {
    expect(slugify('Test123')).toBe('test123');
    expect(slugify('Version 2.0')).toBe('version-2-0');
    expect(slugify('Item 42')).toBe('item-42');
  });

  it('should remove special characters and replace with hyphens', () => {
    expect(slugify('test@example.com')).toBe('test-example-com');
    expect(slugify('hello_world')).toBe('hello-world');
    expect(slugify('test!@#$%^&*()')).toBe('test');
    expect(slugify('a.b.c')).toBe('a-b-c');
  });

  it('should remove leading and trailing hyphens', () => {
    expect(slugify('-hello-')).toBe('hello');
    expect(slugify('--test--')).toBe('test');
    expect(slugify('-start')).toBe('start');
    expect(slugify('end-')).toBe('end');
  });

  it('should collapse multiple consecutive hyphens', () => {
    expect(slugify('hello---world')).toBe('hello-world');
    expect(slugify('test----test')).toBe('test-test');
    expect(slugify('a---b---c')).toBe('a-b-c');
  });

  it('should normalize Unicode characters and remove diacritics', () => {
    expect(slugify('Café')).toBe('cafe');
    expect(slugify('naïve')).toBe('naive');
    expect(slugify('résumé')).toBe('resume');
    expect(slugify('Müller')).toBe('muller');
    expect(slugify('Zürich')).toBe('zurich');
    expect(slugify('São Paulo')).toBe('sao-paulo');
  });

  it('should handle strings with spaces', () => {
    expect(slugify('hello world')).toBe('hello-world');
    expect(slugify('  multiple   spaces  ')).toBe('multiple-spaces');
    expect(slugify('leading space')).toBe('leading-space');
    expect(slugify('trailing space ')).toBe('trailing-space');
  });

  it('should handle empty strings', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('---')).toBe('');
  });

  it('should handle strings with only special characters', () => {
    expect(slugify('!@#$%')).toBe('');
    expect(slugify('---')).toBe('');
    expect(slugify('...')).toBe('');
  });

  it('should handle mixed case with special characters', () => {
    expect(slugify('Hello-World_Test123')).toBe('hello-world-test123');
    expect(slugify('My@Company#Product')).toBe('my-company-product');
    expect(slugify('API_V2.0')).toBe('api-v2-0');
  });

  it('should handle strings with emojis and symbols', () => {
    expect(slugify('Hello 😀 World')).toBe('hello-world');
    expect(slugify('Test★String')).toBe('test-string');
    expect(slugify('Price: $100')).toBe('price-100');
  });

  it('should handle already slugified strings', () => {
    expect(slugify('already-slugified')).toBe('already-slugified');
    expect(slugify('test-123')).toBe('test-123');
    expect(slugify('simple')).toBe('simple');
  });

  it('should handle edge cases with hyphens', () => {
    expect(slugify('---hello---world---')).toBe('hello-world');
    expect(slugify('-a-b-c-')).toBe('a-b-c');
    expect(slugify('--')).toBe('');
  });

  it('should preserve alphanumeric characters', () => {
    expect(slugify('abc123')).toBe('abc123');
    expect(slugify('123abc')).toBe('123abc');
    expect(slugify('a1b2c3')).toBe('a1b2c3');
  });

  it('should handle non-ASCII characters', () => {
    expect(slugify('北京')).toBe('');
    expect(slugify('東京')).toBe('');
    expect(slugify('Москва')).toBe('');
  });

  it('should handle device type examples', () => {
    expect(slugify('Modbus RTU')).toBe('modbus-rtu');
    expect(slugify('BACnet/IP')).toBe('bacnet-ip');
    expect(slugify('LonWorks®')).toBe('lonworks');
  });
});
