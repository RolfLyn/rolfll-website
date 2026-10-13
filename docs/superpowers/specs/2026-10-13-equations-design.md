# Equation drawings: design

A daily note can hold animated mathematical drawings, woven into its text. The admin types a marker such as `[[heart]]` on its own line, and the reader sees, at that spot, a typeset equation over a dark panel where the curve draws itself.

The repo is public. Notes stay in KV; the code contains only the four curves, their equations and the marker names.

## Writing a drawing

- **A marker** is a line whose whole content, after trimming, is `[[name]]`. The name is matched case-insensitively with inner spaces collapsed. A `[[` anywhere else in a line is ordinary text.
- **The names:**

| Marker | Curve |
|---|---|
| `[[heart]]` | the parametric heart |
| `[[filling heart]]` | the heart that fills in |
| `[[butterfly]]` | Temple Fay's butterfly curve |
| `[[fourier heart]]` | the heart drawn by a Fourier series |

- **Limit:** at most 3 markers per note.
- **Saving checks markers.** A marker-shaped line with an unknown name, or more than 3 markers, rejects the save with the typed values kept:
  - "Unknown drawing [[hart]]. Use [[heart]], [[filling heart]], [[butterfly]] or [[fourier heart]]."
  - "A note can hold at most 3 drawings."
- **Nothing new is stored.** The marker is part of the note text, so the data model, backups and rollback are unchanged. An older Worker version shows the marker as text.
- **Admin:**
  - a hint under the text box lists the four markers;
  - the notes list shows an "Equation" tag on notes with at least one marker;
  - Preview shows the note as she will see it, animation included.
- **Scope:** daily notes only (today's note and the archive). After dark entries are unchanged.

## How it renders

The note text is split at marker lines. Text pieces render exactly as today (escaped, `white-space: pre-line`); empty pieces are dropped. Each marker becomes:

```
<figure class="equation" data-curve="heart">
  <math display="block">…</math>                 (the typeset equation)
  <div class="eq-panel">
    <svg viewBox="0 0 320 240">…</svg>             (the finished curve, server-drawn)
    <canvas></canvas>                              (the animation, added by script)
    <span class="eq-counter"></span>
  </div>
  <button class="eq-again" hidden>Draw again</button>
</figure>
```

- **Today's note:** the text pieces are `<p class="message">` and the figures sit between them.
- **Archive notes:** the same with `<p class="text">`.
- **Equations** are fixed MathML strings in the code, written once per curve.
- **The still SVG** is computed on the server from each curve's maths and is the finished drawing. Without JavaScript, or with reduced motion, it is what she sees.

## The look

- **The panel:** rounded, with the sky's plum gradient, full text width and a 4:3 aspect ratio.
- **The curve:** candle gold (`#e8c27a`) with a soft glow. Construction lines (the Fourier circles) are faint cream.
- **The equation:** sits above the panel in the ink colour, at about the size of the archive text, and scrolls sideways if it is wider than a narrow phone.
- **The counter:** a small italic readout in the panel's lower right corner, for example "k = 42.0" or "n = 12".

## The four curves

All are drawn in a 320×240 box, centred, with a margin.

1. **Heart:** x = 16 sin³t, y = 13 cos t − 5 cos 2t − 2 cos 3t − cos 4t, for t from 0 to 2π.
   - The line traces over about 6 seconds with a brighter tip.
   - The finished heart then breathes (a 2% scale pulse). The breathing is off under reduced motion.
2. **Filling heart:** y = x^(2/3) + 0.9 · sin(kx) · √(3 − x²), for |x| ≤ √3, with x^(2/3) taken as (x²)^(1/3).
   - k eases from 0 to 100 over about 10 seconds.
   - Each frame redraws the curve sampled finely enough for the current k.
   - The counter shows "k = …" to one decimal.
   - The still SVG shows k = 100.
3. **Butterfly:** r = e^(sin θ) − 2 cos 4θ + sin⁵((2θ − π)/24), for θ from 0 to 24π (x = r sin θ, y = r cos θ, shown upright).
   - It traces over about 12 seconds.
4. **Fourier heart:** f(t) = Σ cₙ e^(int).
   - **The coefficients** are the discrete Fourier transform of the heart curve (curve 1), sampled at 256 points. They are ordered by size and the 40 largest are used.
   - **The animation** runs in rounds, about 12 seconds in all. Round n draws one full turn of the chain of the n largest circles while the tip traces the partial sum. n grows 1, 2, 3, … (faster as it goes) up to 40.
   - The counter shows "n = …".
   - **At the end** the circles fade, leaving the heart.
   - **The still SVG** shows the 40-term heart.

## Playing

- **Start:** each figure starts once, when at least 40% of its panel is in view (IntersectionObserver). A figure inside a game note that is not yet revealed is not in view, so it starts after the game.
- **Draw again:** shown once a drawing finishes; it replays the animation.
- **Reduced motion:** the script does nothing, and the still SVG stays.
- **No JavaScript:** the still SVG stays. "Draw again" stays hidden.
- **No IntersectionObserver or canvas:** the still SVG stays.
- **While animating:** the canvas covers the still SVG, which is hidden only once the canvas has drawn its first frame.
- **Size:** the canvas matches the panel at device pixel ratio (capped at 2) and redraws on resize.

## Safety

- Note text is escaped exactly as today. Markers are recognised only from the fixed list.
- **Nothing from the note reaches the script.** The figure carries only `data-curve` from the fixed list, and the script ignores unknown values.
- The script is plain ES5 with no outside libraries and no storage.

## Testing

- **Unit tests:**
  - **marker parsing:** own line only, case and spacing, unknown names, the 3-drawing limit, and text split into pieces;
  - **the still SVG paths:** finite numbers, all points inside the 320×240 box;
  - **the Fourier coefficients:** the 40-term partial sum stays within a small distance of the heart.
- **View tests:**
  - figures appear at the marker's position in today's note and in the archive;
  - text around them is escaped;
  - each curve's equation and data attribute are present;
  - the admin "Equation" tag and hint.
- **Route tests:**
  - saving with an unknown marker or 4 markers is rejected (400) and nothing is written;
  - a valid note saves its text unchanged.
- **Browser check** at phone and desktop sizes:
  - all four animations;
  - Draw again;
  - a drawing inside a game note;
  - reduced motion;
  - no JavaScript;
  - no console errors.
