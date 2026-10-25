"""Static review guard for the single, explicitly opted-in visual-game route.

This is a source-review tripwire, not a proof against obfuscated malicious JS.
Browser interaction and actual Worker authentication/replay are tested separately.
"""
import re


def review_world_builder(text: str) -> list[str]:
    errors = []
    guards = [
        "return allSessions().find(s=>JSON.stringify(s)===value)||null;",
        "$('wbDonate').addEventListener('click',async()=>{",
        "if(busy||playbackImported||!selected||!$('wbAdult').checked||!$('wbConsent').checked)return;",
        "const snapshot=structuredClone(selected),identity=JSON.stringify(snapshot);busy=true;",
        "fetch('/api/arena/countermodel/search-donate',{method:'POST',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(15000),",
        "body:JSON.stringify({adult_confirmation:true,consent_training:true,session:snapshot})",
    ]
    for guard in guards:
        if guard not in text:
            errors.append("world-builder.mjs: reviewed opt-in/snapshot/network guard missing: " + guard)
    if len(re.findall(r"\bfetch\s*\(", text)) != 1:
        errors.append("world-builder.mjs: exactly one reviewed fetch is allowed")
    if re.search(r"\b(XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB)\b", text):
        errors.append("world-builder.mjs: unreviewed network or persistent storage primitive")
    return errors
