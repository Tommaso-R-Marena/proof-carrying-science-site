from pathlib import Path
from tempfile import TemporaryDirectory
import hashlib, json, shutil
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from integrate_model_foundry import plan, SOURCES

ROOT = Path(__file__).resolve().parents[1]
def fixture(repo):
    for rel in ["public/semantic-gauntlet-core.mjs", "public/semantic-repair-core.mjs", "scripts/semantic_evaluation_firewall.mjs"]:
        t=repo/rel;t.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/rel,t)
    (repo/"public/arena.html").write_text('<html><div class="arena-research-cards"></div></html>')
    (repo/"package.json").write_text(json.dumps({"scripts":{"ci:zero-minutes":"node --test","deploy":"npm run checks"}}))
with TemporaryDirectory() as d:
    repo=Path(d);fixture(repo)
    changes=plan(repo,ROOT)
    assert len(changes)==len(SOURCES)+2
    assert b'repair-model-lab.html' in changes['public/arena.html']
    assert b'test:learned-repair' in changes['package.json']
    assert not (repo/'public/repair-model-lab.html').exists(), 'dry planning must not mutate site'
    for k,data in changes.items():
        p=repo/k;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
    try:plan(repo,ROOT)
    except ValueError as e:assert 'ALREADY_PRESENT' in str(e)
    else:raise AssertionError('second apply should be rejected')
with TemporaryDirectory() as d:
    repo=Path(d);fixture(repo)
    p=repo/'public/semantic-repair-core.mjs';p.write_text(p.read_text()+'// attack\n')
    try:plan(repo,ROOT)
    except ValueError as e:assert 'VERSION_MISMATCH' in str(e)
    else:raise AssertionError('source tampering should be rejected')
print('GUARDED_MODEL_FOUNDRY_INTEGRATION_TESTS_PASS')
