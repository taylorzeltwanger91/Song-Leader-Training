"""
Reusable OMR pipeline primitives for the Zion's Hymns shape-note hymnal.

These are the pieces that proved out across hymns 237, 5 and 79. They cover the
CHEAP, DETERMINISTIC half of the pipeline — everything that is not a vision-model
read. See tools/omr/README.md for the full process and where these fit.

Dependencies: opencv-python-headless, numpy  (see requirements.txt)
"""
import cv2
import numpy as np

# Aiken 7-shape → scale degree. The SHAPE gives the note LETTER once you know the
# tonic; position gives the octave. This redundancy is what makes disputed notes
# resolvable (resolve.py) and what breaks classical OMR.
NOTE_SEMITONE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def load_gray(page_path):
    return cv2.imread(page_path, cv2.IMREAD_GRAYSCALE)


def detect_staves(img):
    """Return a list of staves, each an np.array of 5 staff-line y-positions
    (top-to-bottom). A hymnal page is 6 staves per full page (treble+bass × N
    systems). Verified reliable on every page tried — this is the solid,
    deterministic backbone of the whole pipeline.
    """
    h, w = img.shape
    bw = (img < 128).astype(np.uint8)
    # A staff line spans most of the page width.
    staff_rows = np.where(bw.sum(axis=1) > w * 0.45)[0]
    lines = []
    start = prev = staff_rows[0]
    for r in staff_rows[1:]:
        if r - prev > 3:
            lines.append((start + prev) // 2)
            start = r
        prev = r
    lines.append((start + prev) // 2)
    lines = np.array(lines)
    return [lines[i:i + 5] for i in range(0, len(lines), 5)]


def line_spacing(staff5):
    return float(np.median(np.diff(staff5)))


def count_key_accidentals(img, staff5, x_start=155, x_end=222):
    """Count flat/sharp glyphs in the key signature of a staff.

    Returns the integer count of accidental-shaped components between the clef
    and the time signature. This is the fix for the single biggest error source
    we hit: a human (me) asserting the wrong key. On hymn 79 I said 4 flats;
    this counter said 5 (Db major), and the page agreed. ALWAYS detect the key,
    never assert it.

    Note: x_start/x_end are page-geometry defaults for this hymnal's engraving
    (~1100px-wide scans). Tune per-corpus if the scan size differs.
    """
    y0, y1 = staff5[0] - 4, staff5[-1] + 4
    band = img[y0:y1, x_start:x_end]
    bw = (band < 128).astype(np.uint8)
    # Strip staff lines so only glyph ink remains.
    horiz = cv2.morphologyEx(bw, cv2.MORPH_OPEN,
                             cv2.getStructuringElement(cv2.MORPH_RECT, (15, 1)))
    noln = cv2.subtract(bw, horiz)
    n, _, stats, _ = cv2.connectedComponentsWithStats(noln, 8)
    # A flat/sharp is a tall-ish inky component.
    glyphs = [i for i in range(1, n)
              if stats[i][2] >= 3 and stats[i][3] >= 10 and stats[i][4] > 15]
    return len(glyphs)


def crop_staff(img, staff5, margin_spacings=4.0, x0=95, x1=None):
    """Crop one staff (with vertical margin for stems / ledger lines) for a
    vision read. Cropping treble and bass staves SEPARATELY is what made the
    reads accurate — it isolates S+A from T+B."""
    if x1 is None:
        x1 = img.shape[1]
    sp = line_spacing(staff5)
    y0 = max(0, int(staff5[0] - margin_spacings * sp))
    y1 = min(img.shape[0], int(staff5[-1] + margin_spacings * sp))
    return img[y0:y1, x0:x1]


def upscale(crop, factor=1.7):
    return cv2.resize(crop, None, fx=factor, fy=factor,
                      interpolation=cv2.INTER_CUBIC)


def staff_position_to_midi(y, staff5, clef):
    """Map a notehead's y-pixel to a MIDI number by staff position (no accidental
    — the caller applies the key). clef is 'treble' or 'bass'.

    Bottom line is E4 (treble) or G2 (bass); each half-spacing up is one diatonic
    step. Used for reading disputed noteheads once the shape has given the letter.
    """
    sp = line_spacing(staff5)
    steps = round((staff5[4] - y) / (sp / 2))  # diatonic steps above bottom line
    letters = 'CDEFGAB'
    base_letter, base_oct = ('E', 4) if clef == 'treble' else ('G', 2)
    idx = letters.index(base_letter) + steps
    octave = base_oct + idx // 7
    semitone = NOTE_SEMITONE[letters[idx % 7]]
    return 12 * (octave + 1) + semitone
