"""
Generate a verification-pass prompt for one hymn+staff.

    python make_verify_prompt.py 25 treble -o /tmp/v25t.txt

The claim is piped in from show_measures.py --claim. NEVER retype a measure listing by
hand: on 2026-08-18 doing exactly that corrupted a claim, and the verifiers correctly
reported that the page contradicted it — which read as four transcription errors that
did not exist. See the README's "Never hand-copy a machine-generated listing" section.
"""
import argparse, json, os, subprocess, sys, glob, re

HERE = os.path.dirname(os.path.abspath(__file__))
ARCHIVE = os.path.expanduser('~/Downloads/ZionsHymns-Archive')
VOICES = {'treble': ('soprano', 'alto', 'upper voice/stems up', 'lower voice/stems down'),
          'bass':   ('tenor', 'bass', 'upper voice/stems up', 'lower voice/stems down')}
DEGREES = {'C':'do=C, re=D, mi=E, fa=F, sol=G, la=A, ti=B',
           'G':'do=G, re=A, mi=B, fa=C, sol=D, la=E, ti=F#',
           'D':'do=D, re=E, mi=F#, fa=G, sol=A, la=B, ti=C#',
           'A':'do=A, re=B, mi=C#, fa=D, sol=E, la=F#, ti=G#',
           'E':'do=E, re=F#, mi=G#, fa=A, sol=B, la=C#, ti=D#',
           'Bb':'do=Bb, re=C, mi=D, fa=Eb, sol=F, la=G, ti=A',
           'Eb':'do=Eb, re=F, mi=G, fa=Ab, sol=Bb, la=C, ti=D'}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('hymn', type=int); ap.add_argument('staff', choices=['treble','bass'])
    ap.add_argument('-o','--out', required=True)
    a = ap.parse_args()

    src = os.path.join(HERE, 'hymns', 'pending', f'{a.hymn}.txt')
    meta = dict(re.findall(r'^(\w+):\s*(.*)$', open(src).read(), re.M))
    claim = subprocess.run([sys.executable, os.path.join(HERE,'show_measures.py'),
                            src, '--staff', a.staff, '--claim'],
                           capture_output=True, text=True, check=True).stdout.strip()
    d = glob.glob(f"{ARCHIVE}/hymn-{a.hymn:03d}-*")[0]
    crops = sorted(glob.glob(f"{d}/crops/hymn{a.hymn}-{a.staff}-sys*.png"),
                   key=lambda p:int(re.search(r'sys(\d+)',p).group(1)))
    up, lo, ups, los = VOICES[a.staff]
    beats = int(meta['time'].split('/')[0])
    unit = {'2':'HALF NOTE','4':'QUARTER NOTE','8':'EIGHTH NOTE'}[meta['time'].split('/')[1]]
    pick = 'a pickup' if meta.get('anacrusis','0') not in ('0','False','false') else 'no pickup'

    open(a.out,'w').write(f"""You are VERIFYING an existing transcription against the printed page. You are NOT transcribing from scratch. For each measure, check whether the page shows what is claimed, and report ONLY where it does not.

ISOLATION: any intermediate work goes in /tmp/omr-vfy-{a.hymn}-{a.staff}/.

THE HYMN: {a.hymn}, "{meta['title']}", Zion's Hymns (Aiken 7-shape).
Key {meta['key']} ({DEGREES.get(meta['key'],'')}). Meter {meta['time']} — one beat = ONE {unit}, full bar = {beats} beats. There is {pick}.

YOUR IMAGES — {a.staff.upper()} staff ({up} = {ups}, {lo} = {los}), read IN ORDER:
""" + "\n".join(crops) + f"""

THE CLAIM TO CHECK — measure numbers are 1-based and continuous across systems:

{claim}

HOW TO REPORT — be brief, one line per system:
  sys1: OK
  sys3: m9 {up} beat 1 — page shows A4, not B4 (oval on the A4 space, sol=A)
  sys5: m18 {lo} beat 2 — cannot tell, two heads overlap; needs a human

Report ONLY disagreements and genuine uncertainties. If a system matches, say "OK" and move on — do NOT restate correct notes, and do NOT rewrite the transcription.

WHAT TO SCRUTINISE, in priority order:
1. STACKED COLUMNS where the two voices sit close together or share a notehead. An independent reader made ALL of its errors here on other hymns, repeatedly assigning the lower notehead of a stacked pair to the upper voice.
2. OCTAVE placement — a note an octave off survives every automatic check we run, so it is the single most valuable thing you can catch.
3. Any note whose Aiken shape disagrees with its staff position (shape gives the letter, position gives the octave). Report both if they conflict.
4. Durations only where a bar would not sum to {beats}.

IMPORTANT: if you find yourself disagreeing with many measures in a row, or the claim seems shifted by one measure against the page, say so explicitly and stop — that pattern means the claim I sent you is misaligned, not that the transcription is wrong. It has happened before.

A short list of specific disagreements, or "all systems OK", is the useful answer.
""")
    print(f"wrote {a.out}  ({len(crops)} systems)")

if __name__ == '__main__':
    sys.exit(main())
