import { describe, it, expect } from 'vitest';
import { giftPage, giftAdminPage, GIFT_SCRIPT } from '../worker/gift-views';
import {
  checkGift, emptyGiftState, unwrapGift, pickGiftDay, markBooked, readerGift, type Gift, type GiftState,
} from '../worker/gift';
import type { EventPhoto } from '../worker/event';

const photos: EventPhoto[] = [{ key: 'k-a.jpg', name: 'a.jpg' }];
const source = {
  id: 'g1', title: 'A <gift>', from: '2026-11-01', until: '2027-01-07',
  box: { kicker: 'A gift', heading: 'Something <b>later</b>', tag: 'For you' },
  reveals: [
    { kicker: 'First', heading: 'Part one', text: 'What happens.', photos: ['a.jpg'], next: 'And then?' },
    { kicker: 'After', heading: 'Part two', text: 'Dinner.', photos: [], next: 'Now the best part' },
  ],
  pick: { kicker: 'Your choice', heading: 'Pick our day', text: 'Afternoon, then dinner.' },
  days: [
    { id: '2027-01-04', name: 'Monday', heading: 'Monday 4 January' },
    { id: '2027-01-05', name: 'Tuesday', heading: 'Tuesday 5 January' },
  ],
  chosenLine: 'I will book it now.', summary: ['Part one', 'Part two'], pendingLine: 'Times later.', bookedLine: 'Soon.',
  credits: ['Photo: someone'],
};
const checked = checkGift(JSON.stringify(source), photos, null);
if (!checked.ok) throw new Error(checked.error);
const gift: Gift = checked.gift;
const AT = '2026-12-01T10:00:00.000Z';
const TODAY = '2027-01-04';
const fresh = emptyGiftState('g1');
const chosen = pickGiftDay(unwrapGift(fresh, AT), gift, '2027-01-05', '2026-12-01', AT)!;
const booked = markBooked(chosen, '2027-01-05', ['3pm <here>', 'Dinner after'], AT)!;
const page = (s: GiftState, extra: Partial<Parameters<typeof giftPage>[0]> = {}) => giftPage({
  view: readerGift(gift, s, photos, TODAY), home: '/for-you/gift', mediaBase: '/for-you/media',
  saveAction: '/for-you/gift/save', csrf: 'tok', back: '/for-you', ...extra,
});

describe('her gift page', () => {
  it('has every screen in order and starts where she is', () => {
    const html = page(fresh);
    const order = ['data-screen="box"', 'data-screen="reveal"', 'data-screen="pick"'].map((s) => html.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html.split('data-screen="reveal"')).toHaveLength(3);
    expect(html).toContain('data-start="box"');
    expect(page(unwrapGift(fresh, AT))).toContain('data-start="pick"');
    expect(page(chosen)).toContain('data-start="chosen"');
    expect(page(booked)).toContain('data-start="booked"');
  });

  it('unwraps and picks through forms that work without JavaScript', () => {
    const html = page(fresh);
    expect(html).toMatch(/<form[^>]*action="\/for-you\/gift\/save"[^>]*>\s*<input type="hidden" name="csrf" value="tok">\s*<input type="hidden" name="do" value="unwrap">/);
    expect(html).toContain('Untie the ribbon');
    expect(html).toMatch(/name="do" value="pick">\s*<button[^>]*name="day" value="2027-01-05"/);
    expect(html).not.toMatch(/name="day" value="2027-01-04"/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?<b>4<\/b>/);
  });

  it('shows the chosen day with his lines and a way to change it', () => {
    const html = page(chosen);
    expect(html).toContain('Tuesday 5 January');
    expect(html).toContain('I will book it now.');
    expect(html).toContain('Times later.');
    expect(html).toContain('Change the day');
    expect(html).toContain('See it again');
  });

  it('shows the booking once booked, and no way to change it', () => {
    const html = page(booked);
    expect(html).toContain("It's booked");
    expect(html).toContain('3pm &lt;here&gt;');
    expect(html).toContain('BOOKED');
    expect(html).toContain('Soon.');
    const bookedScreen = html.slice(html.indexOf('data-screen="booked"'));
    expect(bookedScreen).not.toContain('Change the day');
    expect(bookedScreen).toContain('See it again');
  });

  it('has no booked screen before booking, and no See it again before a pick', () => {
    expect(page(chosen)).not.toContain('data-screen="booked"');
    expect(page(fresh)).not.toContain('See it again');
  });

  it('escapes his text, serves photos from our storage and hides credits behind a link', () => {
    const html = page(fresh);
    expect(html).toContain('Something &lt;b&gt;later&lt;/b&gt;');
    expect(html).toContain('src="/for-you/media/k-a.jpg"');
    expect(html).toMatch(/<details class="credits"><summary>Photo credits<\/summary>/);
  });

  it('saves nothing in a preview', () => {
    const html = page(fresh, { preview: true, saveAction: undefined, csrf: undefined });
    expect(html).not.toContain('name="csrf"');
    expect(html).not.toContain('data-save=');
  });

  it('carries its script, calms down for reduced motion, and has no em dash', () => {
    const html = page(fresh);
    expect(html).toContain(GIFT_SCRIPT);
    expect(html).toContain('prefers-reduced-motion');
    expect(html).toContain("That didn't save. Try again?");
    expect(html).not.toContain('—');
  });
});

describe('gift admin', () => {
  const admin = (state: GiftState | null, extra: Partial<Parameters<typeof giftAdminPage>[0]> = {}) => giftAdminPage({
    base: '/for-you', csrf: 'tok', text: JSON.stringify(source), photos, gift, state, today: '2026-12-01', ...extra,
  });
  it('has the JSON, photos, preview and clear', () => {
    const html = admin(fresh);
    expect(html).toContain('action="/for-you/admin/gift/save"');
    expect(html).toMatch(/name="photos" accept="image\/\*" multiple/);
    expect(html).toContain('/for-you/admin/gift/preview');
    expect(html).toContain("confirm('Clear everything she has done with this gift?')");
    expect(html).toContain('Not opened yet');
  });
  it('shows her pick and offers to mark that day booked', () => {
    const html = admin(chosen);
    expect(html).toContain('Picked Tuesday 5 January');
    expect(html).toContain('action="/for-you/admin/gift/book"');
    expect(html).toContain('<input type="hidden" name="day" value="2027-01-05">');
    expect(html).toContain('name="lines"');
    expect(admin(unwrapGift(fresh, AT))).not.toContain('/admin/gift/book');
    expect(admin(unwrapGift(fresh, AT))).toContain('Unwrapped');
  });
  it('shows the booking with edit and undo', () => {
    const html = admin(booked);
    expect(html).toContain('3pm &lt;here&gt;');
    expect(html).toContain('action="/for-you/admin/gift/unbook"');
    expect(html).toContain("confirm('Undo booked?");
    expect(html).toContain('action="/for-you/admin/gift/book"');
  });
  it('lists her earlier picks', () => {
    const changed = pickGiftDay(chosen, gift, '2027-01-04', '2026-12-01', '2026-12-02T10:00:00.000Z')!;
    expect(admin(changed)).toMatch(/Earlier[\s\S]*Tuesday 5 January/);
  });
});
