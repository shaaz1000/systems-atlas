"""Records the narration for every story scene with Kokoro-82M, a free open-source voice model.

Writes audio/<story id>/<scene index>.mp3 and audio/voice.js (durations, per-word timings and a
hash of each line, so the player can tell when a recording no longer matches edited text).
Re-running only records lines that are new or changed.

Setup (once):
  python3 -m venv .venv && . .venv/bin/activate
  pip install "kokoro>=0.9.4" "misaki[en]" soundfile
  # if espeak-ng reports a missing 'phontab' file, point it at the bundled data with a short path:
  #   ln -s "$(python -c 'import espeakng_loader as e; print(e.get_data_path())')" ~/.espeak-ng-data
  #   export ESPEAK_DATA_PATH=~/.espeak-ng-data
Run:
  node tools/export-narration.js > narration.json
  python tools/generate-voice.py narration.json
"""
import json
import os
import re
import sys
import time

import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, 'audio')
MANIFEST = os.path.join(AUDIO, 'voice.js')
VOICE = os.environ.get('ATLAS_VOICE', 'af_heart')
SR = 24000
# Slightly slower, more deliberate delivery for the serious beats.
SPEED = {'problem': 1.0, 'happens': 1.0, 'breaks': 0.94, 'fix': 1.02, 'remember': 0.92}


def text_hash(t):
    """djb2-xor over UTF-8 bytes, base 36. Must match hashText() in js/story.js."""
    h = 5381
    for b in t.encode('utf-8'):
        h = ((h * 33) ^ b) & 0xFFFFFFFF
    digits = '0123456789abcdefghijklmnopqrstuvwxyz'
    out = ''
    while True:
        h, r = divmod(h, 36)
        out = digits[r] + out
        if h == 0:
            return out


def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def word_starts(text, tokens):
    """Start time (seconds) for each whitespace-separated caption word, aligned to model tokens."""
    words = text.split()
    toks = [(norm(t), s) for t, s in tokens if norm(t)]
    starts, j, last = [], 0, 0.0
    for w in words:
        target = norm(w)
        if not target:
            starts.append(last)
            continue
        if j < len(toks):
            start = toks[j][1] if toks[j][1] is not None else last
            got = ''
            while j < len(toks) and len(got) < len(target):
                got += toks[j][0]
                j += 1
            last = start
        starts.append(round(last, 2))
    return starts


def load_manifest():
    if not os.path.exists(MANIFEST):
        return {}
    src = open(MANIFEST, encoding='utf-8').read()
    m = re.search(r'ACAD\.addVoice\((\{.*\})\);', src, re.S)
    return json.loads(m.group(1))['clips'] if m else {}


def main(path):
    lines = json.load(open(path, encoding='utf-8'))
    clips = load_manifest()
    pipe = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')
    todo = []
    for ln in lines:
        entry = (clips.get(ln['story']) or [None] * 99)
        have = entry[ln['index']] if ln['index'] < len(entry) else None
        mp3 = os.path.join(AUDIO, ln['story'], '%d.mp3' % ln['index'])
        if not (have and have.get('h') == text_hash(ln['text']) and os.path.exists(mp3)):
            todo.append(ln)
    print('%d lines, %d to record' % (len(lines), len(todo)), flush=True)
    t0 = time.time()
    for n, ln in enumerate(todo, 1):
        speed = SPEED.get(ln['beat'], 1.0)
        audio, toks, offset = [], [], 0.0
        for r in pipe(ln['text'], voice=VOICE, speed=speed):
            a = np.asarray(r.audio, dtype=np.float32)
            for t in (r.tokens or []):
                toks.append((t.text, None if t.start_ts is None else t.start_ts + offset))
            audio.append(a)
            offset += len(a) / SR
        wav = np.concatenate(audio) if audio else np.zeros(SR // 2, dtype=np.float32)
        wav = np.concatenate([wav, np.zeros(int(SR * 0.25), dtype=np.float32)])  # short breath at the end
        folder = os.path.join(AUDIO, ln['story'])
        os.makedirs(folder, exist_ok=True)
        sf.write(os.path.join(folder, '%d.mp3' % ln['index']), wav, SR, format='MP3')
        lst = clips.setdefault(ln['story'], [])
        while len(lst) <= ln['index']:
            lst.append(None)
        lst[ln['index']] = {'h': text_hash(ln['text']), 'd': round(len(wav) / SR, 2), 'w': word_starts(ln['text'], toks)}
        if n % 10 == 0 or n == len(todo):
            save(clips)
            rate = (time.time() - t0) / n
            print('%d/%d recorded, ~%d min left' % (n, len(todo), rate * (len(todo) - n) / 60), flush=True)
    # drop recordings for stories or scenes that no longer exist
    live = {}
    for ln in lines:
        live.setdefault(ln['story'], set()).add(ln['index'])
    clips = {k: [c if i in live[k] else None for i, c in enumerate(v)] for k, v in clips.items() if k in live}
    save(clips)
    print('done', flush=True)


def save(clips):
    os.makedirs(AUDIO, exist_ok=True)
    body = json.dumps({'voice': VOICE, 'model': 'Kokoro-82M', 'clips': clips}, separators=(',', ':'))
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        f.write('/* Generated by tools/generate-voice.py. Do not edit by hand. */\n')
        f.write('window.ACAD && ACAD.addVoice && ACAD.addVoice(' + body + ');\n')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'narration.json')
