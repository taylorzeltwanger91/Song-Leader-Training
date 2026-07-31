"""Symbol Error Rate — the standard OMR accuracy metric (adopted 2026-07-29, after the
MuSViT benchmark work; see README "What we took from the MuSViT work").

SER = Levenshtein(prediction, reference) / len(reference), on the per-voice symbol
sequence, where each symbol is a `pitch:dur` token (rests included as `R:dur`). Compares
one SATB JSON (candidate read) against a verified SATB JSON (ground truth) and reports
per-voice and overall SER.

Use it to score readers/prompts on one comparable number, and — later — to evaluate a
fine-tuned MuSViT head on the same ruler. Lower is better; 0.0 = identical.

Usage:  python ser.py <reference.json> <candidate.json>
"""
import sys
import json

VOICES = ['soprano', 'alto', 'tenor', 'bass']


def tokens(notes):
    """Voice -> list of 'midi:dur' symbols ('R:dur' for rests)."""
    out = []
    for n in notes:
        d = n['dur']
        out.append(f"R:{d}" if n.get('rest') else f"{n['midi']}:{d}")
    return out


def levenshtein(a, b):
    """Edit distance between two token lists."""
    m, n = len(a), len(b)
    prev = list(range(n + 1))
    for i in range(1, m + 1):
        cur = [i] + [0] * n
        for j in range(1, n + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
        prev = cur
    return prev[n]


def ser(ref_json, cand_json):
    ref = json.load(open(ref_json))['voices']
    cand = json.load(open(cand_json))['voices']
    total_edits = total_ref = 0
    print(f"{'voice':<9} {'ref':>4} {'cand':>4} {'edits':>5} {'SER':>7}")
    for v in VOICES:
        r = tokens(ref.get(v, []))
        c = tokens(cand.get(v, []))
        e = levenshtein(c, r)
        s = e / len(r) if r else float('nan')
        total_edits += e
        total_ref += len(r)
        print(f"{v:<9} {len(r):>4} {len(c):>4} {e:>5} {s:>6.1%}")
    overall = total_edits / total_ref if total_ref else float('nan')
    print(f"{'OVERALL':<9} {total_ref:>4} {'':>4} {total_edits:>5} {overall:>6.1%}")
    return overall


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("usage: python ser.py <reference.json> <candidate.json>")
        sys.exit(2)
    ser(sys.argv[1], sys.argv[2])
