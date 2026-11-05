import { describe, it, expect } from 'vitest';
import { eventPage, eventErrorPage, EVENT_SCRIPT } from '../worker/event-views';
import { readerPage } from '../worker/views';
import {
  checkEvent, readerEvent, EMPTY_PICKS, openDoor, pickDish, toggleCardItem, type EventPhoto, type SpecialEvent,
} from '../worker/event';

const photos: EventPhoto[] = [
  { key: '11111111-1111-4111-8111-111111111111.jpg', name: 'one.jpg' },
  { key: '22222222-2222-4222-8222-222222222222.jpg', name: 'two.jpg' },
];
const AT = '2026-01-02T10:00:00.000Z';
const TODAY = '2026-01-02';

function event(change: (e: any) => void = () => {}): SpecialEvent {
  const e: any = {
    id: 'ev1', title: 'Placeholder <week>', intro: ['Intro one', 'Intro "two"'], closing: 'Closing line',
    from: '2026-01-01', until: '2026-01-10',
    doors: [
      { id: 'd1', label: 'Sat 3 Jan', heading: 'Saturday 3 January', opens: '2026-01-01', opensLabel: 'Thu 1 Jan',
        dishes: [
          { id: 'a', title: 'Dish <script>A', text: 'Line "A"', photo: 'one.jpg', buy: ['Secret item'] },
          { id: 'b', title: 'Dish B', text: 'Line B' },
        ] },
      { id: 'd2', label: 'Sun 4 Jan', heading: 'Sunday 4 January', opens: '2026-01-05', opensLabel: 'Mon 5 Jan',
        dishes: [{ id: 'c', title: 'Hidden dish', text: 'Hidden', photo: 'two.jpg' }] },
      { id: 'd3', label: 'Fri 9 Jan', heading: 'Friday 9 January', opens: '2026-01-01', opensLabel: 'Thu 1 Jan',
        doorway: 'Taken care of', line: 'No choice here' },
    ],
    card: { title: 'The card', prompt: 'Pick two', pick: 2, opens: '2026-01-01', opensLabel: 'Thu 1 Jan',
      dishes: [{ id: 'x', title: 'Sweet X', text: 'X' }, { id: 'y', title: 'Sweet Y', text: 'Y' }, { id: 'z', title: 'Sweet Z', text: 'Z' }] },
    credits: ['Photo <b>credit</b>'],
  };
  change(e);
  const r = checkEvent(JSON.stringify(e), photos);
  if (!r.ok) throw new Error(r.error);
  return r.event;
}

const page = (picks = EMPTY_PICKS('ev1'), extra: Partial<Parameters<typeof eventPage>[0]> = {}, ev = event(), today = TODAY) => eventPage({
  view: readerEvent(ev, picks, photos, today), home: '/for-you/event', mediaBase: '/for-you/media',
  saveAction: '/for-you/event/save', csrf: 'tok', ...extra,
});

describe('event page', () => {
  it('shows the title, the intro and a door for each entry', () => {
    const html = page();
    expect(html).toContain('Placeholder &lt;week&gt;');
    expect(html).toContain('<p>Intro one</p>');
    expect(html).toContain('Intro &quot;two&quot;');
    expect(html.match(/class="door[ "]/g)).toHaveLength(3);
    expect(html).toContain('Closing line');
  });

  it('a locked door shows its label and opening day and nothing that opens it', () => {
    const html = page();
    const locked = /<span class="door locked"[^>]*data-door="d2"[\s\S]*?<\/span><\/span>/.exec(html)?.[0] ?? '';
    expect(locked).toContain('Sun 4 Jan');
    expect(locked).toContain('Opens Mon 5 Jan');
    expect(html).not.toContain('open=d2');
    expect(html).not.toContain('Hidden dish');
    expect(html).not.toContain(photos[1].key);
  });

  it('an unopened open door is a link to its sheet', () => {
    expect(page()).toContain('<a class="door ready" href="/for-you/event?open=d1" data-door="d1"');
  });

  it('an opened door shows her pick in the doorway, or Pick one, or its doorway line', () => {
    let p = openDoor(openDoor(EMPTY_PICKS('ev1'), 'd1', AT), 'd3', AT);
    expect(page(p)).toContain('Pick one');
    expect(page(p)).toContain('Taken care of');
    p = pickDish(p, 'd1', 'a', AT);
    const html = page(p);
    expect(html).toMatch(/class="door open"[^>]*data-door="d1"[\s\S]*?<img src="\/for-you\/media\/11111111-1111-4111-8111-111111111111\.jpg"[\s\S]*?Dish &lt;script&gt;A/);
  });

  it('only the asked sheet is visible, and its dishes are pick buttons', () => {
    const html = page(EMPTY_PICKS('ev1'), { sheet: 'd1' });
    expect(html).toContain('<div class="wrap" id="sheet-d1">');
    expect(html).toContain('<div class="wrap" id="sheet-d3" hidden>');
    expect(html).toContain('<input type="hidden" name="do" value="pick">');
    expect(html).toContain('<button class="dish" name="dish" value="a"');
    expect(html).toContain('<input type="hidden" name="csrf" value="tok">');
  });

  it('marks her pick', () => {
    const html = page(pickDish(EMPTY_PICKS('ev1'), 'd1', 'b', AT), { sheet: 'd1' });
    expect(html).toContain('<button class="dish picked" name="dish" value="b"');
    expect(html).toContain('♥ Yours');
  });

  it('a door with a line shows it and offers no dishes', () => {
    const sheet = /id="sheet-d3"[\s\S]*?<\/article>/.exec(page())?.[0] ?? '';
    expect(sheet).toContain('No choice here');
    expect(sheet).not.toContain('name="dish"');
  });

  it('the card offers its dishes and sums up her picks', () => {
    let html = page();
    expect(html).toContain('Pick two');
    expect(html).toContain('<input type="hidden" name="do" value="card">');
    const p = toggleCardItem(toggleCardItem(EMPTY_PICKS('ev1'), 'x', 2, AT), 'z', 2, AT);
    html = page(p);
    expect(html).toContain('You picked: Sweet X and Sweet Z');
    expect(html).toContain('<button class="dish picked" name="dish" value="z"');
  });

  it('a locked card says when it opens and holds nothing', () => {
    const html = page(EMPTY_PICKS('ev1'), {}, event((e) => { e.card.opens = '2026-01-05'; e.card.opensLabel = 'Mon 5 Jan'; }));
    expect(html).toContain('Opens Mon 5 Jan');
    expect(html).not.toContain('Sweet X');
    expect(html).not.toContain('name="do" value="card"');
  });

  it('escapes event text and never shows a shopping list', () => {
    const html = page(EMPTY_PICKS('ev1'), { sheet: 'd1' });
    expect(html).not.toContain('<script>A');
    expect(html).toContain('Photo &lt;b&gt;credit&lt;/b&gt;');
    expect(html).not.toContain('Secret item');
  });

  it('a preview posts nothing and runs no saving script', () => {
    const html = page(EMPTY_PICKS('ev1'), { saveAction: undefined, csrf: undefined, preview: true, home: '/for-you/admin/event/preview?on=2026-01-02', sheet: 'd1' });
    expect(html).not.toContain('<form');
    expect(html).not.toContain('data-save=');
    expect(html).toContain('href="/for-you/admin/event/preview?on=2026-01-02&amp;open=d1"');
  });

  it('carries the script only when something is open', () => {
    expect(page()).toContain(EVENT_SCRIPT);
    const allLocked = event((e) => { e.doors.forEach((d: any) => { d.opens = '2026-01-09'; }); delete e.card; });
    expect(page(EMPTY_PICKS('ev1'), {}, allLocked)).not.toContain(EVENT_SCRIPT);
  });

  it('has a friendly error page', () => {
    expect(eventErrorPage()).toContain('Something went wrong');
  });
});

describe('the way in from the notes page', () => {
  const base = { current: null, archive: [], mediaBase: '/m' };
  it('shows a card with the title, marked while something waits', () => {
    const html = readerPage({ ...base, event: { href: '/for-you/event', title: 'Our <week>', waiting: true } });
    expect(html).toContain('<a class="event-link waiting" href="/for-you/event">');
    expect(html).toContain('Our &lt;week&gt;');
    expect(readerPage({ ...base, event: { href: '/e', title: 'T', waiting: false } })).toContain('<a class="event-link" href="/e">');
  });
  it('is absent without an event', () => {
    expect(readerPage(base)).not.toContain('event-link"');
  });
});
