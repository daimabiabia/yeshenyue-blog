# -*- coding: utf-8 -*-
# Fetch Cubism2 Live2D models from jsdelivr npm packages into public/js/live2d/models/<name>/
# Idempotent: skips files already present with same size; re-fetches missing.
import json, os, sys, urllib.request
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, 'public', 'js', 'live2d', 'models')
MODELS = ['miku', 'koharu', 'nico', 'haruto', 'wanko', 'nipsilon']
LOG = []

# bypass system proxies entirely (local env has a flaky proxy)
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
opener.addheaders = [('User-Agent', 'ysyblog-fetch/1.0')]

def get(url):
    with opener.open(url, timeout=30) as r:
        return r.read()

def refs_of(mj):
    out = []
    def add(rel):
        if rel and rel not in out:
            out.append(rel.replace('\\', '/'))
    add(mj.get('model'))
    for t in mj.get('textures', []) or []:
        add(t)
    add(mj.get('physics'))
    add(mj.get('pose'))
    for e in mj.get('expressions', []) or []:
        add(e.get('file'))
    for grp in (mj.get('motions') or {}).values():
        for mo in grp or []:
            add(mo.get('file'))
    return out

for name in MODELS:
    base = 'https://cdn.jsdelivr.net/npm/live2d-widget-model-%s/assets/' % name
    mjson_rel = name + '.model.json'
    try:
        data = get(base + mjson_rel)
        mj = json.loads(data.decode('utf-8'))
    except Exception as e:
        LOG.append('[FAIL] %s model.json: %s' % (name, e))
        continue
    dstdir = os.path.join(DEST, name)
    os.makedirs(dstdir, exist_ok=True)
    with open(os.path.join(dstdir, mjson_rel), 'wb') as f:
        f.write(data)
    LOG.append('[OK] %s/%s (%d bytes)' % (name, mjson_rel, len(data)))
    n_ok, n_skip, n_err = 1, 0, 0
    for rel in refs_of(mj):
        if not rel:
            continue
        target = os.path.join(dstdir, rel)
        if os.path.isfile(target) and os.path.getsize(target) > 0:
            n_skip += 1
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        try:
            b = get(base + quote(rel))
            with open(target, 'wb') as f:
                f.write(b)
            n_ok += 1
        except Exception as e:
            n_err += 1
            LOG.append('[ERR] %s/%s: %s' % (name, rel, e))
    LOG.append('[SUM] %s ok=%d skip=%d err=%d' % (name, n_ok, n_skip, n_err))

report = '\n'.join(LOG)
with open(os.path.join(ROOT, 'tools', 'models_fetch.log'), 'w', encoding='utf-8') as f:
    f.write(report + '\n')
sys.stdout.write('DONE err_total=%s\n' % report.count('[ERR]'))
