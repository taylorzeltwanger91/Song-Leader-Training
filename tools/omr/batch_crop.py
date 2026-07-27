"""
Batch step 1+2 of the pipeline: for each hymn, detect staves, detect the key
signature's accidental count, and crop every system's treble and bass staff into
separate upscaled images ready for a vision read. Writes a manifest.json.

Usage:
  python batch_crop.py <sheet_music_dir> <index.json> <out_dir> <id> [<id> ...]

Deterministic and fast — this is the automatable half of ingest. The vision reads
that consume these crops are a separate (currently manual) step.
"""
import sys
import os
import json
import cv2
import lib


def crop_hymn(sheet_dir, hymn, out_dir):
    """Crop one hymn's pages into per-system treble/bass images. Returns a record."""
    systems = []          # flat list across all pages: {system, staff, file}
    key_counts = []
    global_system = 0
    for img_name in hymn['images']:
        img = lib.load_gray(os.path.join(sheet_dir, img_name))
        if img is None:
            continue
        staves = lib.detect_staves(img)
        n_systems = len(staves) // 2
        for s in range(n_systems):
            global_system += 1
            treble, bass = staves[s * 2], staves[s * 2 + 1]
            # key accidental count from the treble staff of the first system
            if global_system == 1:
                key_counts.append(lib.count_key_accidentals(img, treble))
            for kind, staff in (('treble', treble), ('bass', bass)):
                crop = lib.upscale(lib.crop_staff(img, staff))
                fn = f"hymn{hymn['id']}-{kind}-sys{global_system}.png"
                cv2.imwrite(os.path.join(out_dir, fn), crop)
                systems.append({'system': global_system, 'staff': kind, 'file': fn})
    return {
        'id': hymn['id'],
        'title': hymn['title'],
        'pages': hymn['pages'],
        'n_systems': global_system,
        'key_accidentals': key_counts[0] if key_counts else None,
        'crops': systems,
    }


def main():
    sheet_dir, index_path, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    ids = [int(x) for x in sys.argv[4:]]
    os.makedirs(out_dir, exist_ok=True)
    index = {h['id']: h for h in json.load(open(index_path))}

    manifest = []
    for hid in ids:
        rec = crop_hymn(sheet_dir, index[hid], out_dir)
        manifest.append(rec)
        print(f"hymn {rec['id']:>3} '{rec['title']}': {rec['n_systems']} systems, "
              f"{rec['key_accidentals']} key accidentals, {len(rec['crops'])} crops")

    json.dump(manifest, open(os.path.join(out_dir, 'manifest.json'), 'w'), indent=1)
    print(f"\nmanifest: {os.path.join(out_dir, 'manifest.json')}")


if __name__ == '__main__':
    main()
