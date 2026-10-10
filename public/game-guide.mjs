// Navigation help only. Never executes a hint, changes a puzzle or submits data.
export const GAME_GUIDES = {
 'arena-countermodel.html': ['Countermodel Lab','Make the two statements disagree in the same tiny world.','Tap a P or Q fact to turn it on or off. For relationship missions, tap an arrow or a table cell.','Check both statements. Different truth values mean you found a counterexample; otherwise change one fact and try again.','#cmWorld','#cmCheck','#cmFeedback'],
 'arena-proof-quest.html': ['Proof Quest','Put the cards in an order where every prerequisite comes first.','Tap a card to add it to your path. You can undo a choice; dragging is optional.','Place every card, then check the path. The feedback explains which prerequisites need to move earlier.','#questAvailable','#questCheck','#questFeedback'],
 'arena-safety-forge.html': ['Safety Forge','Find a bot failure, then patch it while keeping its mission possible.','In Break mode, tap an action and watch the bot change. In Repair mode, toggle a guard to change the policy.','Repair mode checks reachable states. A repair must block failures and still allow a successful mission. Try cutting its cost afterward.','#forgeActionCards','#forgeTabRepair','#forgeAttackNotice'],
 'prooflab.html': ['ProofLab','Choose the next investigation whose prerequisites are ready.','Tap one candidate card. Dragging is optional. Record your reason and confidence when you want to explain a choice.','Read the accepted or blocked result. Finish the graph and choose a threat hypothesis before checking your investigation.','#plCards','#plCheck','#plFeedback'],
 'meaning-forge.html': ['Meaning Forge','Repair the candidate so it matches the statement you are given.','Change one word or relationship in the controls. Watch the candidate preview update.','Check your meaning. Use the explanation to choose another edit if the structures still differ.','[data-meaning-field]','#meaningCheck','#meaningFeedback'],
 'semantic-gauntlet.html': ['Semantic Gauntlet','Decide whether the translation changes the meaning within the displayed finite bound.','Change facts in the world. Add an agent when one is not enough.','Check your countermodel, or claim equivalence within the bound. Read the result before moving on.','#sgWorld','#sgCountermodel','#sgStatus'],
 'forge-duel.html': ['Shield Duel','Choose the policy that blocks failures while still allowing the mission.','Read both shield recipes. Choose Alpha, Bravo, or Neither; you can also give a reason.','Your choice reveals the checked result. Inspect what failed or why the better policy costs less.','.duel-matchup','.duel-judgment','#duelReveal'],
 'semantic-repair-lab.html': ['Semantic Repair','Fix a translation by making small changes to its formula.','Tap an available formula edit. Undo lets you explore another route.','Check the candidate to find a disagreement or a bounded match. Automatic search is optional assistance.','#srMoves','#srCheck','#srVerdict'],
 'semantic-multistep-lab.html': ['Multi-Step Repair','Explore how several small edits can repair a Boolean formula.','Choose a task and search mode. Set the checking budget before running the planner.','Run the actual search, then inspect its attempts, repair and work counts. An exhausted budget does not establish impossibility.','#msTask','#msRun','#msStatus'],
 'repair-model-lab.html': ['Learned Repair','See how a fitted model ranks possible formula repairs.','Choose a case. Compare the source with the proposed translation.','Run the policy and inspect the checked attempts. Ranking suggests what to try; the checker evaluates each result.','#pmCase','#pmRun','#pmStatus'],
 'intervention-lab.html': ['Intervention Planner','Reach the target with the cheapest allowed changes.','In Your plan, turn facts on or off. Each change has a cost; a locked fact must stay at its baseline value.','First solve the minimum to enable scoring. Then score your proposal to see whether it works and how far its cost is from the minimum.','#planVariables [data-role=proposal]','#planSolve','#planProposal']
};

export function mountGameGuide(doc = document) {
 const slug=location.pathname.split('/').filter(Boolean).at(-1)||'';
 const config=GAME_GUIDES[slug.endsWith('.html')?slug:slug+'.html'];
 const main=doc.querySelector('main');
 if(!config||!main||doc.getElementById('gameGuide'))return;
 const [name,goal,move,check,moveTarget,checkTarget,resultTarget]=config;
 const make=(tag,text,className)=>{const el=doc.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;};
 const root=make('section',null,'game-guide');root.id='gameGuide';root.setAttribute('aria-label',name+' play guide');
 const head=make('div',null,'game-guide-head');head.append(make('strong','Your goal: '+goal));
 const games=make('a','All games');games.href='arena.html';head.append(games);
 const note=make('p','No account needed to play. Research sharing is a separate, optional action.','game-guide-note');
 const actions=make('div',null,'game-guide-actions');
 const start=make('button','Show me how to play','game-guide-primary');start.type='button';start.id='gameGuideStart';
 const play=make('button','Go straight to play');play.type='button';play.id='gameGuidePlay';
 actions.append(start,play);
 const tour=make('div',null,'game-guide-tour');tour.hidden=true;tour.id='gameGuideTour';
 const progress=make('p',null,'game-guide-progress');
 const title=make('h2');title.id='gameGuideTitle';
 const instruction=make('p');instruction.id='gameGuideInstruction';instruction.setAttribute('role','status');
 const nav=make('div',null,'game-guide-actions');
 const back=make('button','Previous'),jump=make('button','Show the controls','game-guide-primary'),next=make('button','Next'),close=make('button','Close guide');
 for(const b of [back,jump,next,close])b.type='button';
 jump.id='gameGuideJump';next.id='gameGuideNext';close.id='gameGuideClose';
 nav.append(back,jump,next,close);tour.append(progress,title,instruction,nav);root.append(head,note,actions,tour);
 const header=main.querySelector(':scope > header');if(header)header.after(root);else main.prepend(root);
 let step=0,highlight=null;
 const stages=[['1 · Try a move',move,moveTarget],['2 · Check or reveal',check,checkTarget],['3 · Read, retry and explore','A failed attempt is useful feedback. Change one thing and try again. Your game keeps its own result; this guide does not award a win or reveal an answer.',resultTarget]];
 const clean=()=>{highlight?.classList.remove('game-guide-target');highlight=null;};
 const showTarget=selector=>{
  clean();let target=doc.querySelector(selector);
  if(!target)return;
  const details=target.closest('details');if(details)details.open=true;
  // Results can be hidden until play. Navigate to the visible game area without
  // revealing evidence or bypassing the game's own progression.
  if(!target.getClientRects().length){target=target.parentElement;while(target&&!target.getClientRects().length)target=target.parentElement;}
  if(!target)return;
  target.classList.add('game-guide-target');highlight=target;
  target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  const control=target.matches('button,input,select,textarea')?target:target.querySelector('button:not(:disabled),input:not(:disabled),select:not(:disabled)');
  if(control)control.focus({preventScroll:true});else{target.tabIndex=-1;target.focus({preventScroll:true});}
 };
 const render=()=>{clean();progress.textContent=`${step+1} of 3 · Move, check, learn`;title.textContent=stages[step][0];instruction.textContent=stages[step][1];back.disabled=step===0;next.textContent=step===2?'Finish guide':'Next';};
 const end=()=>{clean();tour.hidden=true;start.setAttribute('aria-expanded','false');start.focus({preventScroll:true});};
 start.setAttribute('aria-controls','gameGuideTour');start.setAttribute('aria-expanded','false');
 start.addEventListener('click',()=>{step=0;tour.hidden=false;start.setAttribute('aria-expanded','true');render();jump.focus({preventScroll:true});});
 play.addEventListener('click',()=>showTarget(moveTarget));
 // Put the first action before long introductory copy on small screens.
 if(header){
  const shortcut=make('button','Start playing','game-guide-start');shortcut.type='button';shortcut.id='gameGuideQuickPlay';
  shortcut.addEventListener('click',()=>showTarget(moveTarget));
  const heading=header.querySelector('h1');if(heading)heading.after(shortcut);else header.prepend(shortcut);
 }
 back.addEventListener('click',()=>{step=Math.max(0,step-1);render();});
 next.addEventListener('click',()=>{if(step===2)end();else{step++;render();}});
 jump.addEventListener('click',()=>showTarget(stages[step][2]));close.addEventListener('click',end);
 root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!tour.hidden){event.preventDefault();end();}});
}
if(typeof document!=='undefined')mountGameGuide();
