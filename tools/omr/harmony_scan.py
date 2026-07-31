"""Independent harmony check on a single assembled hymn: at each 0.5-beat, is the
{S,A,T,B} sonority a clean triad (or 7th)? Prints dissonant beats as candidate misreads.
Not proof of error (passing tones/suspensions exist) — a triage list for a second look.

Usage: python harmony_scan.py <hymn.json>
"""
import sys, json
NAMES = {0:'C',1:'Db',2:'D',3:'Eb',4:'E',5:'F',6:'Gb',7:'G',8:'Ab',9:'A',10:'Bb',11:'B'}
TR = []
for r in range(12):
    TR.append(frozenset({r,(r+4)%12,(r+7)%12})); TR.append(frozenset({r,(r+3)%12,(r+7)%12}))
def ok(pcs):
    st = set(pcs)
    if len(st) <= 1: return True
    if any(st <= t for t in TR): return True
    for r in range(12):
        if st <= {r,(r+4)%12,(r+7)%12,(r+10)%12}: return True   # dom7
        if st <= {r,(r+3)%12,(r+7)%12,(r+10)%12}: return True   # min7
        if st <= {r,(r+4)%12,(r+7)%12,(r+11)%12}: return True   # maj7
    return False
def samp(notes, t):
    for n in notes:
        if n['onset'] <= t+1e-6 and t < n['onset']+n['dur']-1e-6:
            return None if n.get('rest') else n['midi'] % 12
    return None
d = json.load(open(sys.argv[1]))
v = d['voices']
total = sum(n['dur'] for n in v['soprano'])
t = 0.0; bad = 0; n_tested = 0
while t < total - 1e-6:
    ch = [samp(v[x], t) for x in ('soprano','alto','tenor','bass')]
    present = [c for c in ch if c is not None]
    if len(present) >= 3:
        n_tested += 1
        if not ok(present):
            bad += 1
            print(f"  beat {t:6}: {[NAMES[c] if c is not None else '-' for c in ch]}  dissonant")
    t = round(t + 0.5, 3)
print(f"hymn {d.get('hymnId')}: {bad} dissonant / {n_tested} tested beats")
