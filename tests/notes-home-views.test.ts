import { describe, it, expect } from 'vitest';
import {
  homeStartPage, homeScorePage, homeDonePage, homeLovePage, homeCreditsPage, homeErrorPage, HOME_SCRIPT,
} from '../worker/home-views';
import { homeResults, type Home, type HomeGroup, type HomePicture } from '../worker/home';

const T = '2026-11-12T10:00:00.000Z';
function pic(id: string, group: HomeGroup = 'houses', tags: string[] = []): HomePicture {
  return { id, group, title: `Picture ${id}`, tags, credit: `Credit ${id}`, file: `${id}.jpg`, added: T };
}

const score = (over: Partial<Parameters<typeof homeScorePage>[0]> = {}) => homeScorePage({
  groupName: 'Houses', picture: { id: 'p1', title: 'White farmhouse', file: 'p1.jpg' }, index: 3, total: 20,
  action: '/for-you/home/score', csrf: 'tok', group: 'houses', nextHref: '/for-you/home/houses?at=p2', nextFile: 'p2.jpg',
  mediaBase: '/for-you/media', home: '/for-you/home', ...over,
});

describe('scoring page', () => {
  it('starts an unscored picture at 5', () => {
    const html = score();
    expect(html).toContain('action="/for-you/home/score"');
    expect(html).toContain('name="csrf" value="tok"');
    expect(html).toContain('name="id" value="p1"');
    expect(html).toContain('name="group" value="houses"');
    expect(html).toContain('<input type="range" name="score" min="1" max="10" step="1" value="5"');
    expect(html).toContain('>5<');
    expect(html).toContain('it&#39;s nice');
    expect(html).toContain('>Next</button>');
    expect(html).toContain('data-next="/for-you/home/houses?at=p2"');
    expect(html).toContain('data-next-file="/for-you/media/p2.jpg"');
  });
  it('starts a scored picture at her score', () => {
    const html = score({ score: 9 });
    expect(html).toContain('value="9"');
    expect(html).toContain('love it');
  });
  it('shows Back only when there is a previous picture', () => {
    expect(score({ backHref: '/for-you/home/houses?at=p0' })).toContain('href="/for-you/home/houses?at=p0">Back</a>');
    expect(score()).not.toContain('>Back</a>');
  });
  it('shows the picture, linked full size, with its place', () => {
    const html = score();
    expect(html).toContain('<a class="pic" href="/for-you/media/p1.jpg"');
    expect(html).toContain('src="/for-you/media/p1.jpg"');
    expect(html).toContain('3 of 20');
  });
  it('escapes the title', () => {
    expect(score({ picture: { id: 'p1', title: '<b>x</b>', file: 'p1.jpg' } })).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('start page', () => {
  const groups = [
    { id: 'houses' as const, name: 'Houses', scored: 2, total: 5, coverKey: 'h.jpg', href: '/h' },
    { id: 'rooms' as const, name: 'Rooms', scored: 0, total: 3, href: '/r' },
    { id: 'gardens' as const, name: 'Gardens', scored: 0, total: 0, href: '/g' },
    { id: 'furniture' as const, name: 'Furniture', scored: 1, total: 1, href: '/f' },
  ];
  it('shows four cards with counts', () => {
    const html = homeStartPage({ groups, mediaBase: '/m', back: '/for-you' });
    expect(html).toContain('Our future home');
    expect(html).toContain('2 of 5');
    expect(html).toContain('0 of 3');
    expect(html).toContain('1 of 1');
    expect(html).toContain('src="/m/h.jpg"');
    expect(html).not.toContain('See what you love');
  });
  it('links to her results once she has scored', () => {
    expect(homeStartPage({ groups, mediaBase: '/m', back: '/for-you', loveHref: '/love' })).toContain('href="/love">See what you love');
  });
});

describe('done page', () => {
  it('names the group and the next one', () => {
    const html = homeDonePage({ groupName: 'Houses', next: { name: 'Rooms', href: '/r' }, loveHref: '/love', home: '/home' });
    expect(html).toContain('That&#39;s all the houses');
    expect(html).toContain('href="/r">On to rooms');
    expect(html).toContain('href="/love">See what you love');
  });
  it('has no next button when every group is done', () => {
    expect(homeDonePage({ groupName: 'Gardens', loveHref: '/love', home: '/home' })).not.toContain('On to');
  });
});

describe('love page', () => {
  const h: Home = {
    on: true,
    pictures: [
      pic('h1', 'houses', ['wood', 'light']), pic('h2', 'houses', ['wood', 'light']),
      pic('r1', 'rooms', ['wood', 'light']), pic('g1', 'gardens'),
    ],
  };
  const page = (scores: Record<string, number>) => homeLovePage({
    results: homeResults(h, Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { score: v, at: T }]))),
    mediaBase: '/m', creditsHref: '/credits', home: '/home',
  });
  it('waits until enough is scored', () => {
    const html = page({ h1: 9 });
    expect(html).toContain('Your dream home');
    expect(html).toContain('Score a few more and your dream home starts to appear.');
    expect(html).not.toContain('What you&#39;re drawn to');
  });
  it('shows the dream home and words when ready', () => {
    const html = page({ h1: 9, h2: 8, r1: 10, g1: 7 });
    expect(html).toContain('Put together from everything you loved');
    expect(html).toContain('What you&#39;re drawn to');
    expect(html).toContain('>wood<');
    expect(html).toContain('>light<');
    expect(html.match(/class="tile/g)).toHaveLength(3);
    expect(html).toContain('href="/m/h1.jpg"');
    expect(html).toContain('href="/credits">Photo credits');
  });
  it('says nothing here yet for an empty group', () => {
    expect(page({ h1: 9, h2: 8, r1: 10, g1: 7 })).toContain('Nothing here yet.');
  });
});

describe('credits and error pages', () => {
  it('lists credits, escaped', () => {
    const html = homeCreditsPage({ credits: [{ title: 'A & B', credit: '<i>Me</i> on Unsplash' }], back: '/love' });
    expect(html).toContain('A &amp; B');
    expect(html).toContain('&lt;i&gt;Me&lt;/i&gt; on Unsplash');
  });
  it('has an error page', () => {
    expect(homeErrorPage()).toContain('Something went wrong');
  });
});

describe('copy and script', () => {
  it('uses no em dashes', () => {
    const all = [score(), homeDonePage({ groupName: 'Houses', loveHref: '/l', home: '/h' }), homeErrorPage(), HOME_SCRIPT].join('');
    expect(all).not.toContain('—');
  });
  it('saves quietly and is plain ES5', () => {
    expect(HOME_SCRIPT).toContain('quiet=1');
    expect(HOME_SCRIPT).toContain("That didn't save. Try again?");
    expect(HOME_SCRIPT).not.toMatch(/=>|\blet |\bconst /);
  });
  it('moves on from a deleted picture and falls back to the form otherwise', () => {
    expect(HOME_SCRIPT).toContain('xhr.status === 404');
    expect(HOME_SCRIPT).toContain('form.submit()');
  });
  it('wakes the Next button when the page is restored', () => {
    expect(HOME_SCRIPT).toContain('pageshow');
  });
});

describe('admin page', async () => {
  const { homeAdminPage } = await import('../worker/home-views');
  const h: Home = { on: false, pictures: [pic('a', 'houses', ['wood', 'big windows']), pic('b', 'rooms')] };
  const base = { base: '/for-you', csrf: 'tok' };
  it('switches the banner', () => {
    const off = homeAdminPage({ ...base, home: h, scores: {} });
    expect(off).toContain('Switch the banner on');
    expect(off).toContain('The banner is off');
    expect(off).toContain('name="on" value="1"');
    const on = homeAdminPage({ ...base, home: { ...h, on: true }, scores: {} });
    expect(on).toContain('Switch the banner off');
    expect(on).toContain('name="on" value="0"');
  });
  it('lists pictures with tags and her score', () => {
    const html = homeAdminPage({ ...base, home: h, scores: { a: { score: 8, at: T } } });
    expect(html).toContain('Picture a');
    expect(html).toContain('wood, big windows');
    expect(html).toContain('not scored');
    expect(html).toContain('Her score: 8');
    expect(html).toContain('src="/for-you/admin/media/a.jpg"');
    expect(html).toContain('action="/for-you/admin/home/add"');
    expect(html).toContain('action="/for-you/admin/home/delete"');
  });
  it('lists her scores newest first', () => {
    const html = homeAdminPage({ ...base, home: h, scores: { a: { score: 8, at: T }, b: { score: 3, at: '2026-11-12T12:00:00.000Z' } } });
    expect(html.indexOf('<td>Picture b</td>')).toBeGreaterThan(-1);
    expect(html.indexOf('<td>Picture b</td>')).toBeLessThan(html.indexOf('<td>Picture a</td>'));
  });
  it('still opens when the pictures cannot be read', () => {
    const html = homeAdminPage({ ...base, home: null, scores: {}, problem: 'The saved pictures could not be read.' });
    expect(html).toContain('The saved pictures could not be read.');
    expect(html).toContain('action="/for-you/admin/home/add"');
  });
  it('says when her scores cannot be read', () => {
    expect(homeAdminPage({ ...base, home: h, scores: null })).toContain('Her scores could not be read.');
  });
  it('uses no em dashes', () => {
    expect(homeAdminPage({ ...base, home: h, scores: {} })).not.toContain('—');
  });
});
