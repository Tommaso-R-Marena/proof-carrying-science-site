"""Narrow source admission for the only reviewed loopback transport module."""
import re


def review_file_check_transport(text):
    errors=[]
    for guard in ["location.protocol!=='http:'", "location.hostname!=='127.0.0.1'",
                  'session.origin!==location.origin', "!/^[a-f0-9]{64}$/.test(session.token)",
                  'requireLocal(session);', "credentials:'omit'", "redirect:'error'",
                  "cache:'no-store'", 'size>16384', 'reader.cancel()',
                  "history.replaceState(null,'',location.pathname)", 'AbortSignal.timeout(35000)']:
        if guard not in text:errors.append('file-check-local.mjs: missing reviewed loopback guard: '+guard)
    targets=re.findall(r"\bfetch\s*\(\s*['\"]([^'\"]+)['\"]",text)
    if targets!=['/api/session','/api/check-files'] or len(re.findall(r'\bfetch\s*\(',text))!=2:
        errors.append('file-check-local.mjs: only the two fixed loopback API targets are admitted')
    if len(re.findall(r'\brequireLocal\(session\);',text))!=2:
        errors.append('file-check-local.mjs: both entry points must enforce the local origin')
    if re.search(r'\b(XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b',text):
        errors.append('file-check-local.mjs: unreviewed network primitive')
    return errors
