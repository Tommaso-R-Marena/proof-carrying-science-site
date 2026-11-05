"""Compare actual Lean outputs to a separate Python implementation."""
import json
import sys
from oracle import replay
count = 0
for line in sys.stdin:
    v = json.loads(line)
    assert v['initial'] == replay(v['spec'], [], True)
    expected = [{'guarded': replay(v['spec'], v['plans'][:i+1], True), 'control': replay(v['spec'], v['plans'][:i+1], False)} for i in range(len(v['plans']))]
    assert v['outcomes'] == expected
    count += 1
print(json.dumps({'passed': True, 'independentPythonCases': count, 'nativeLeanExecutedByPython': False}))
