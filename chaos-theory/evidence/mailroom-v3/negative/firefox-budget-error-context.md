# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game.spec.ts >> mailroom completed through valid inputs (sorter); export scenario and fixture comparison
- Location: tests/e2e/game.spec.ts:175:3

# Error details

```
Error: {"version":1,"build":"chaos-v3","mission":"mailroom","seed":42,"rng":2836018348,"player":{"x":739.6980438232422,"y":218.4691619873047,"vx":122.08950805664062,"vy":-53.962249755859375,"hp":2,"invulnerable":0,"dashTicks":0,"dashCooldown":56,"gadget":0,"cooldowns":[33,34,0,0],"aimX":1,"aimY":0},"bots":[{"id":"courier","kind":"courier","x":814.77294921875,"y":185.28688049316406,"state":"stunned","stun":178,"targetX":850,"targetY":130,"carrying":true,"timer":0,"patrol":0,"facing":-0.6837005615234375,"awareness":0,"arriving":0,"reaction":"parcel-gone","reactionTicks":0,"lookPause":0,"noticeSeen":false,"decoySeen":-1,"curiosity":0},{"id":"sentinel","kind":"sentinel","x":736.0140991210938,"y":317.6049346923828,"state":"stunned","stun":99,"targetX":708.0032196044922,"targetY":306.6657257080078,"carrying":false,"timer":0,"patrol":2,"facing":3.139404296875,"awareness":24,"arriving":0,"reaction":"doughnut","reactionTicks":0,"lookPause":0,"noticeSeen":false,"decoySeen":38,"curiosity":6},{"id":"technician","kind":"technician","x":496.87518310546875,"y":288.2725067138672,"state":"stunned","stun":4,"targetX":590,"targetY":300,"carrying":false,"timer":0,"patrol":0,"facing":0,"awareness":0,"arriving":0,"reaction":"grumble","reactionTicks":0,"lookPause":0,"noticeSeen":false,"decoySeen":-1,"curiosity":0},{"id":"backup","kind":"sentinel","x":745.4972076416016,"y":307.97296142578125,"state":"stunned","stun":142,"targetX":708.0032196044922,"targetY":306.6657257080078,"carrying":false,"timer":0,"patrol":0,"facing":2.4538116455078125,"awareness":0,"arriving":0,"reaction":"annoyed","reactionTicks":59,"lookPause":15,"noticeSeen":false,"decoySeen":38,"curiosity":0}],"solids":[{"x":245,"y":90,"w":120,"h":105},{"x":440,"y":90,"w":50,"h":145},{"x":440,"y":365,"w":50,"h":140},{"x":675,"y":85,"w":60,"h":115}],"props":[{"id":"notice","kind":"sign","x":350,"y":300,"w":46,"h":46,"active":false,"variant":1},{"id":"belt","kind":"conveyor","x":590,"y":300,"w":190,"h":80,"active":true,"variant":0},{"id":"gate","kind":"door","x":465,"y":300,"w":50,"h":130,"active":true,"variant":0},{"id":"dock-a","kind":"dock","x":850,"y":130,"w":80,"h":65,"active":false,"variant":0},{"id":"dock-b","kind":"dock","x":850,"y":470,"w":80,"h":65,"active":false,"variant":0},{"id":"stash","kind":"exit","x":120,"y":470,"w":115,"h":80,"active":false,"variant":0},{"id":"getaway","kind":"exit","x":850,"y":300,"w":90,"h":90,"active":false,"variant":0}],"effects":[{"id":38,"kind":"decoy","x":708.0032196044922,"y":306.6657257080078,"ttl":93},{"id":50,"kind":"splat","x":745.4972076416016,"y":307.97296142578125,"ttl":12},{"id":52,"kind":"foam","x":696.9552612304688,"y":237.36102294921875,"ttl":2},{"id":53,"kind":"splat","x":814.77294921875,"y":185.28688049316406,"ttl":48}],"shots":[],"events":[{"tick":34,"kind":"delivery-sign","nodeId":"notice","variant":1}],"status":"playing","paused":false,"tick":1279,"timeLeft":53.68333333333333,"score":1400,"breakdown":{"objective":400,"time":0,"variety":360,"tricks":740,"damage":-100},"objective":"Courier stunned! Get close and press E to snatch its parcel.","phase":0,"mail":{"banked":2,"carrying":false,"loose":null,"route":"intercept","methods":["redirect","intercept"],"alertLevel":2,"clean":false,"escapeDeadline":null,"secondRoute":"sorter","transit":"none","noise":null},"goal":{"id":"courier","kind":"courier","x":814.77294921875,"y":185.28688049316406,"state":"stunned","stun":178,"targetX":850,"targetY":130,"carrying":true,"timer":0,"patrol":0,"facing":-0.6837005615234375,"awareness":0,"arriving":0,"reaction":"parcel-gone","reactionTicks":0,"lookPause":0,"noticeSeen":false,"decoySeen":-1,"curiosity":0,"label":"SNATCH · E"},"decoy":{"x":708.0032196044922,"y":306.6657257080078,"ttl":93,"serial":38},"nextEffectId":54,"usedGadgets":[3,1,2,0],"scored":["manipulate:notice","gadget:3","gadget:1","manipulate:gate","gadget:2","hit:2","pickup:0","gadget:0","stun:courier","stun:sentinel","bank:1","pickup:1","manipulate:belt","bank:2","mixed-route","second-route","stun:technician","stun:backup"],"interactHeld":true,"fireHeld":false,"dashHeld":false}

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - button "Chaos Theory home" [ref=e4] [cursor=pointer]:
      - generic [ref=e6]: CHAOS THEORY / pocket mayhem
    - generic [ref=e7]: A little trouble goes a long way.
  - main [ref=e8]:
    - generic [ref=e9]:
      - generic [ref=e10]:
        - strong [ref=e11]: Mailroom Mayhem
        - generic [ref=e12]: ARCADE MAYHEM
      - generic [ref=e13]:
        - generic [ref=e14]:
          - generic [ref=e15]: TIME
          - text: "54"
        - generic [ref=e16]:
          - generic [ref=e17]: SCORE
          - text: "1400"
        - generic [ref=e18]:
          - generic [ref=e19]: HEARTS
          - text: ♥♥♡
      - button "Fullscreen" [ref=e20] [cursor=pointer]
      - button "Pause game" [ref=e21] [cursor=pointer]: Ⅱ
    - generic [ref=e22]:
      - strong [ref=e23]: Courier stunned! Get close and press E to snatch its parcel.
      - generic [ref=e24]: SEED 42
    - generic "Mission chapters" [ref=e25]:
      - generic [ref=e26]: 1 · Learn a trick
      - generic [ref=e27]: 2 · Choose a route
      - generic [ref=e28]: 3 · Make your escape
    - generic [ref=e29]:
      - generic [ref=e30]:
        - generic [ref=e31]: THE JOB
        - strong [ref=e32]: ● ● ○
        - generic [ref=e33]: 2/3 parcels stashed
      - generic [ref=e34]:
        - generic [ref=e35]: SECURITY
        - strong [ref=e36]: Backup called
    - img "Robot facility. You are the white robot; follow the pulsing goal marker." [ref=e42]
    - group "Choose a gadget" [ref=e44]:
      - 'button "Gadget 1: Foam launcher" [pressed] [ref=e45] [cursor=pointer]':
        - generic [ref=e46]: "1"
        - generic [ref=e47]:
          - text: Foam launcher
          - generic [ref=e48]: Ready in 0.6s
      - 'button "Gadget 2: Holo decoy" [ref=e49] [cursor=pointer]':
        - generic [ref=e50]: "2"
        - generic [ref=e51]:
          - text: Holo decoy
          - generic [ref=e52]: Ready in 0.6s
      - 'button "Gadget 3: Switch hacker" [ref=e53] [cursor=pointer]':
        - generic [ref=e54]: "3"
        - generic [ref=e55]:
          - text: Switch hacker
          - generic [ref=e56]: Flip a nearby door or switch
      - 'button "Gadget 4: Directive beacon" [ref=e57] [cursor=pointer]':
        - generic [ref=e58]: "4"
        - generic [ref=e59]:
          - text: Directive beacon
          - generic [ref=e60]: Plant a fake notice at a sign
    - paragraph [ref=e61]: WASD / arrows move · Mouse aims · Click / J fires · 1–4 gadget · Space dashes · E interacts · Esc pauses · 4 fools the courier. Foam + E snatches a parcel. Carry each parcel home.
  - status [ref=e62]: Courier stunned! Get close and press E to snatch its parcel.
```

# Test source

```ts
  194 |     await advance(page, 1, { fire: false });
  195 |     const dock = (await state(page)).props.find((p) => p.id === "dock-b")!;
  196 |     await drive(page, dock, 3);
  197 |     for (let i = 0; i < 30 && !(await state(page)).mail!.loose; i++)
  198 |       await advance(page, 6, { fire: false });
  199 |     await interact(page);
  200 |     expect((await state(page)).mail!.carrying).toBe(true);
  201 |     await drive(page, { x: 120, y: 470 });
  202 |     await interact(page);
  203 |     expect((await state(page)).mail!.banked).toBe(1);
  204 |     await page.screenshot({
  205 |       path: `evidence/mailroom-v3/${secondRoute}/first-haul-${test.info().project.name}.png`,
  206 |       fullPage: true,
  207 |     });
  208 |     // Two active interceptions use real foam shots and E, with every bot still running.
  209 |     for (let haul = 1; haul < 3; haul++) {
  210 |       for (let j = 0; j < 180 && !(await state(page)).mail!.carrying; j++) {
  211 |         const s = await state(page),
  212 |           c = s.bots.find((b) => b.kind === "courier")!;
  213 |         if (s.status !== "playing")
  214 |           throw Error("Mailroom ended before three hauls: " + s.status);
  215 |         const d = Math.hypot(c.x - s.player.x, c.y - s.player.y);
  216 |         const threat = s.bots
  217 |           .filter(
  218 |             (b) =>
  219 |               b.kind === "sentinel" &&
  220 |               b.arriving === 0 &&
  221 |               b.stun < 25 &&
  222 |               lineOfSight(s, s.player, b),
  223 |           )
  224 |           .sort(
  225 |             (a, b) =>
  226 |               Math.hypot(a.x - s.player.x, a.y - s.player.y) -
  227 |               Math.hypot(b.x - s.player.x, b.y - s.player.y),
  228 |           )[0];
  229 |         if (
  230 |           threat &&
  231 |           Math.hypot(threat.x - s.player.x, threat.y - s.player.y) < 160
  232 |         ) {
  233 |           if (s.player.cooldowns[1] === 0) {
  234 |             const dirs = [
  235 |               [1, 0],
  236 |               [0, 1],
  237 |               [-1, 0],
  238 |               [0, -1],
  239 |             ];
  240 |             const dir = dirs.find(
  241 |               ([x, y]) =>
  242 |                 !blocked(s, s.player.x + x * 150, s.player.y + y * 150) &&
  243 |                 lineOfSight(s, s.player, {
  244 |                   x: s.player.x + x * 150,
  245 |                   y: s.player.y + y * 150,
  246 |                 }),
  247 |             );
  248 |             if (dir) {
  249 |               await advance(page, 1, { fire: false });
  250 |               await advance(page, 1, {
  251 |                 gadget: 1,
  252 |                 fire: true,
  253 |                 aimX: dir[0],
  254 |                 aimY: dir[1],
  255 |               });
  256 |               continue;
  257 |             }
  258 |           }
  259 |           const tx = threat.x - s.player.x,
  260 |             ty = threat.y - s.player.y,
  261 |             n = Math.hypot(tx, ty) || 1;
  262 |           await advance(page, 6, {
  263 |             gadget: 0,
  264 |             fire: true,
  265 |             aimX: tx / n,
  266 |             aimY: ty / n,
  267 |           });
  268 |           continue;
  269 |         }
  270 |
  271 |         if (c.carrying && c.stun > 0 && d < 60) {
  272 |           await interact(page);
  273 |           break;
  274 |         }
  275 |         const target = nextWaypoint(s, s.player, c) ?? c;
  276 |         const dx = target.x - s.player.x,
  277 |           dy = target.y - s.player.y,
  278 |           n = Math.hypot(dx, dy) || 1;
  279 |         const aimX = (c.x - s.player.x) / (d || 1),
  280 |           aimY = (c.y - s.player.y) / (d || 1);
  281 |         await advance(page, 6, {
  282 |           x: d > 45 ? dx / n : 0,
  283 |           y: d > 45 ? dy / n : 0,
  284 |           aimX,
  285 |           aimY,
  286 |           gadget: 0,
  287 |           fire: c.carrying && d < 300,
  288 |           dash: j % 22 === 0,
  289 |         });
  290 |       }
  291 |       expect(
  292 |         (await state(page)).mail!.carrying,
  293 |         JSON.stringify(await state(page)),
> 294 |       ).toBe(true);
      |         ^ Error: {"version":1,"build":"chaos-v3","mission":"mailroom","seed":42,"rng":2836018348,"player":{"x":739.6980438232422,"y":218.4691619873047,"vx":122.08950805664062,"vy":-53.962249755859375,"hp":2,"invulnerable":0,"dashTicks":0,"dashCooldown":56,"gadget":0,"cooldowns":[33,34,0,0],"aimX":1,"aimY":0},"bots":[{"id":"courier","kind":"courier","x":814.77294921875,"y":185.28688049316406,"state":"stunned","stun":178,"targetX":850,"targetY":130,"carrying":true,"timer":0,"patrol":0,"facing":-0.6837005615234375,"awareness":0,"arriving":0,"reaction":"parcel-gone","reactionTicks":0,"lookPause":0,"noticeSeen":false,"decoySeen":-1,"curiosity":0},{"id":"sentinel","kind":"sentinel","x":736.0140991210938,"y":317.6049346923828,"state":"stunned","stun":99,"targetX":708.0032196044922,"targetY":306.6657257080078,"carrying":false,"timer":0,"patrol":2,"facing":3.139404296875,"awareness":24,"arriving":0,"reaction":"doughnut","reactionTicks":0,"lookPause":0,"noticeSeen":false,"decoySeen":38,"curiosity":6},{"id":"technician","kind":"technician","x":496.87518310546875,"y":288.2725067138672,"state":"stunned","stun":4,"targetX":590,"targetY":300,"carrying":false,"timer":0,"patrol":0,"facing":0,"awareness":0,"arriving":0,"reaction":"grumble","reactionTicks":0,"lookPause":0,"noticeSeen":false,"decoySeen":-1,"curiosity":0},{"id":"backup","kind":"sentinel","x":745.4972076416016,"y":307.97296142578125,"state":"stunned","stun":142,"targetX":708.0032196044922,"targetY":306.6657257080078,"carrying":false,"timer":0,"patrol":0,"facing":2.4538116455078125,"awareness":0,"arriving":0,"reaction":"annoyed","reactionTicks":59,"lookPause":15,"noticeSeen":false,"decoySeen":38,"curiosity":0}],"solids":[{"x":245,"y":90,"w":120,"h":105},{"x":440,"y":90,"w":50,"h":145},{"x":440,"y":365,"w":50,"h":140},{"x":675,"y":85,"w":60,"h":115}],"props":[{"id":"notice","kind":"sign","x":350,"y":300,"w":46,"h":46,"active":false,"variant":1},{"id":"belt","kind":"conveyor","x":590,"y":300,"w":190,"h":80,"active":true,"variant":0},{"id":"gate","kind":"door","x":465,"y":300,"w":50,"h":130,"active":true,"variant":0},{"id":"dock-a","kind":"dock","x":850,"y":130,"w":80,"h":65,"active":false,"variant":0},{"id":"dock-b","kind":"dock","x":850,"y":470,"w":80,"h":65,"active":false,"variant":0},{"id":"stash","kind":"exit","x":120,"y":470,"w":115,"h":80,"active":false,"variant":0},{"id":"getaway","kind":"exit","x":850,"y":300,"w":90,"h":90,"active":false,"variant":0}],"effects":[{"id":38,"kind":"decoy","x":708.0032196044922,"y":306.6657257080078,"ttl":93},{"id":50,"kind":"splat","x":745.4972076416016,"y":307.97296142578125,"ttl":12},{"id":52,"kind":"foam","x":696.9552612304688,"y":237.36102294921875,"ttl":2},{"id":53,"kind":"splat","x":814.77294921875,"y":185.28688049316406,"ttl":48}],"shots":[],"events":[{"tick":34,"kind":"delivery-sign","nodeId":"notice","variant":1}],"status":"playing","paused":false,"tick":1279,"timeLeft":53.68333333333333,"score":1400,"breakdown":{"objective":400,"time":0,"variety":360,"tricks":740,"damage":-100},"objective":"Courier stunned! Get close and press E to snatch its parcel.","phase":0,"mail":{"banked":2,"carrying":false,"loose":null,"route":"intercept","methods":["redirect","intercept"],"alertLevel":2,"clean":false,"escapeDeadline":null,"secondRoute":"sorter","transit":"none","noise":null},"goal":{"id":"courier","kind":"courier","x":814.77294921875,"y":185.28688049316406,"state":"stunned","stun":178,"targetX":850,"targetY":130,"carrying":true,"timer":0,"patrol":0,"facing":-0.6837005615234375,"awareness":0,"arriving":0,"reaction":"parcel-gone","reactionTicks":0,"lookPause":0,"noticeSeen":false,"decoySeen":-1,"curiosity":0,"label":"SNATCH · E"},"decoy":{"x":708.0032196044922,"y":306.6657257080078,"ttl":93,"serial":38},"nextEffectId":54,"usedGadgets":[3,1,2,0],"scored":["manipulate:notice","gadget:3","gadget:1","manipulate:gate","gadget:2","hit:2","pickup:0","gadget:0","stun:courier","stun:sentinel","bank:1","pickup:1","manipulate:belt","bank:2","mixed-route","second-route","stun:technician","stun:backup"],"interactHeld":true,"fireHeld":false,"dashHeld":false}
  295 |       if (haul === 1 && secondRoute === "sorter") {
  296 |         await drive(page, { x: 590, y: 300 });
  297 |         await advance(page, 1, { fire: false });
  298 |         await advance(page, 1, { gadget: 1, fire: true, aimX: 1, aimY: 0 });
  299 |         await advance(page, 1, { fire: false });
  300 |         await advance(page, 1, { gadget: 2, fire: true });
  301 |         await advance(page, 1, { fire: false });
  302 |         expect(
  303 |           (await state(page)).props.find((p) => p.kind === "conveyor")!.active,
  304 |         ).toBe(true);
  305 |         await interact(page);
  306 |         expect((await state(page)).mail!.transit).toBe("moving");
  307 |         await drive(page, { x: 360, y: 360 }, 3);
  308 |         for (
  309 |           let n = 0;
  310 |           n < 50 && (await state(page)).mail!.transit !== "ready";
  311 |           n++
  312 |         )
  313 |           await advance(page, 3, { fire: false });
  314 |         await page.screenshot({
  315 |           path: `evidence/mailroom-v3/${secondRoute}/sorter-${test.info().project.name}.png`,
  316 |           fullPage: true,
  317 |         });
  318 |         await interact(page);
  319 |         expect((await state(page)).mail!.carrying).toBe(true);
  320 |       }
  321 |       await drive(page, { x: 120, y: 470 });
  322 |       await interact(page);
  323 |       if (haul === 1)
  324 |         await page.screenshot({
  325 |           path: `evidence/mailroom-v3/${secondRoute}/backup-${test.info().project.name}.png`,
  326 |           fullPage: true,
  327 |         });
  328 |     }
  329 |     expect((await state(page)).mail!.banked).toBe(3);
  330 |     expect((await state(page)).status).toBe("playing");
  331 |     expect((await state(page)).mail!.secondRoute).toBe(secondRoute);
  332 |     await page.screenshot({
  333 |       path: `evidence/mailroom-v3/${secondRoute}/escape-${test.info().project.name}.png`,
  334 |       fullPage: true,
  335 |     });
  336 |     await drive(page, { x: 850, y: 300 });
  337 |     await interact(page);
  338 |
  339 |     const exportedReplay = await page.evaluate(() =>
  340 |       window.__chaos.getReplay(),
  341 |     );
  342 |     const independentReplay = verifyReplay(exportedReplay);
  343 |     expect(independentReplay.valid, independentReplay.reason).toBe(true);
  344 |     expect(independentReplay.state!.mail!.banked).toBe(3);
  345 |     await mkdir("results", { recursive: true });
  346 |     await writeFile(
  347 |       `results/mailroom-${secondRoute}-replay-${test.info().project.name}.json`,
  348 |       JSON.stringify(
  349 |         await page.evaluate(() => window.__chaos.getReplay()),
  350 |         null,
  351 |         2,
  352 |       ),
  353 |     );
  354 |     const completed = await state(page);
  355 |     await writeFile(
  356 |       `results/mailroom-${secondRoute}-run-${test.info().project.name}.json`,
  357 |       JSON.stringify(
  358 |         {
  359 |           kind: "automated valid-input browser play, not a human study",
  360 |           seed: completed.seed,
  361 |           ticks: completed.tick,
  362 |           gameSeconds: completed.tick / 60,
  363 |           score: completed.score,
  364 |           hearts: completed.player.hp,
  365 |           banked: completed.mail!.banked,
  366 |           methods: completed.mail!.methods,
  367 |           backup: completed.bots.some((b) => b.id === "backup"),
  368 |           secondRoute: completed.mail!.secondRoute,
  369 |           escaped:
  370 |             completed.status === "won" &&
  371 |             completed.mail!.escapeDeadline !== null,
  372 |           events: completed.events,
  373 |         },
  374 |         null,
  375 |         2,
  376 |       ),
  377 |     );
  378 |     expect((await state(page)).mail!.methods.sort()).toEqual([
  379 |       "intercept",
  380 |       "redirect",
  381 |     ]);
  382 |     await expect(
  383 |       page.getByRole("heading", { name: "Mayhem complete!" }),
  384 |     ).toBeVisible();
  385 |     await page.screenshot({
  386 |       path: `evidence/mailroom-v3/${secondRoute}/victory-${test.info().project.name}.png`,
  387 |       fullPage: true,
  388 |     });
  389 |     await page
  390 |       .getByRole("button", { name: "Research Lab", exact: true })
  391 |       .click();
  392 |     await expect(page.getByText(/Real-model test not run/)).toBeVisible();
  393 |     await page.getByRole("button", { name: "Run fixture comparison" }).click();
  394 |     await expect(page.getByText(/Tool guard blocked execution/)).toBeVisible();
```
