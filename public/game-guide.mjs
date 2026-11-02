// Navigation help only. Never executes a hint, changes a puzzle or submits data.
export const GAME_GUIDES = {
 'assurance-fold.html': ['Assurance Fold','Drag each claim token into the zone that matches what it actually is, then hold a cool board until it locks.','Click and drag a token toward its highlighted zone. Let go near the edge for a soft snap. Arrow keys nudge; Shake and the coach count as help.','Read the heat report if you are stuck. Keep scientific tokens out of the authority zone. A lock auto-saves a local notebook you can export later.','#afCanvas','#afCheck','#afFeedback'],
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

// Each instruction describes a control, never a solution or an automatic move.
Object.assign(GAME_GUIDES,{
 'world-builder.html':['World Builder','Find a world where two rules give different answers.','Tap a key or door switch to change one fact.','Test the world. Different answers mean a discovery; matching answers mean try another world.','#wbWorld','#wbCheck','#wbFeedback'],
 'bridge-builder.html':['Bridge Builder','Connect your starting facts to the goal.','Read the goal, then pick a step card. Undo lets you change your mind.','Finish every goal to complete the round. The board replays recorded Lean steps; a fresh kernel check is a separate action.','#choices','#choices','#feedback'],
 'memory-workshop.html':['Memory Workshop','Connect facts to a goal using rules in your toolbox.','Read the goal and choose a step card. You can undo a choice.','Complete every goal. The board replays recorded proof steps; it does not run Lean on each click.','#choices','#choices','#feedback']
});
const SIMPLE={
 'assurance-fold.html':['Put each evidence card in the right category.','Tap a card below the board, then a category. Dragging also works.','Lower the heat and keep it low until the board locks. Use the heat report to see what still needs fixing.','#afTokenTray'],
 'arena-proof-quest.html':['Put the step cards in a working order.','Tap a card to add it to your path. Undo lets you change your mind.','Place all the cards, then check. Each step must come after the steps it needs.'],
 'arena-safety-forge.html':['Find a broken bot rule, then fix its safeguards.','Choose an action and watch the bot. You can start again whenever you like.','A repair succeeds when it blocks failures and still lets the bot finish its mission.'],
 'forge-duel.html':['Choose a plan that follows the bot’s rules and still allows its mission.','Read both plans. Choose Alpha, Bravo or Neither.','After you choose, the game reveals what each plan does. A wrong guess is a chance to learn.'],
 'arena-countermodel.html':['Make two rules give different answers in the same world.','Tap a fact to turn it on or off. Some puzzles also use characters and arrows.','Check your world. Different answers show a difference between the rules. Otherwise change a fact and try again.'],
 'meaning-forge.html':['Make the proposed sentence match the target.','Change a word in the controls, then read the updated sentence.','Check the result. Keep editing if the game’s statement structures still differ.'],
 'prooflab.html':['Choose the next step in a research plan.','Read a card and pick a step you think is ready.','Build the plan, choose a concern, then review it. This practises planning; the game does not prove a theorem.']
};
for(const [slug,[goal,move,check,target]] of Object.entries(SIMPLE)){
 const c=GAME_GUIDES[slug];c[1]=goal;c[2]=move;c[3]=check;if(target)c[4]=target;
}

export function mountGameGuide(doc = document) {
 const slug=location.pathname.split('/').filter(Boolean).at(-1)||'';
 const config=GAME_GUIDES[slug.endsWith('.html')?slug:slug+'.html'];
 const main=doc.querySelector('main');
 if(!config||!main||doc.getElementById('gameGuide'))return;
 const [name,goal,move,check,moveTarget,checkTarget,resultTarget]=config;
 const make=(tag,text,className)=>{const el=doc.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;};
 const root=make('section',null,'game-guide');root.id='gameGuide';root.setAttribute('aria-label',name+' play guide');
 const head=make('div',null,'game-guide-head');head.append(make('strong','Your goal: '+goal));
 const games=make('a','Choose a different game');games.href='arena.html';head.append(games);
 const first=make('p','First move: '+move,'game-guide-first');
 const note=make('p','No account needed. Sharing your play is optional.','game-guide-note');
 const scope=make('p',slug.startsWith('bridge-builder')||slug.startsWith('memory-workshop')?'This board replays recorded proof steps. A fresh Lean check is a separate action.':slug.startsWith('prooflab')?'This is a planning exercise. Completing it does not prove a theorem.':slug.startsWith('repair-model-lab')?'This runs a trained ranking model and finite checks. A ranking is not a proof.':'This checks the game’s rules. A win does not establish real-world AI safety or scientific truth.','game-guide-note');scope.id='gameGuideScope';
 const actions=make('div',null,'game-guide-actions');
 const tutorialPage=slug.startsWith('bridge-builder')||slug.startsWith('memory-workshop');
 const play=make('button',tutorialPage?'Go to my puzzle':'Start playing',tutorialPage?'':'game-guide-primary');play.type='button';play.id='gameGuideQuickPlay';play.disabled=true;
 const start=make('button','Show me the steps');start.type='button';start.id='gameGuideStart';
 actions.append(play,start);
 const ready=make('p','Waiting for the game controls to load. No move has been made.','game-guide-note');ready.id='gameGuideReady';ready.setAttribute('role','status');
 const tour=make('div',null,'game-guide-tour');tour.hidden=true;tour.id='gameGuideTour';
 const progress=make('p',null,'game-guide-progress');const title=make('h2');title.id='gameGuideTitle';
 const instruction=make('p');instruction.id='gameGuideInstruction';instruction.setAttribute('role','status');
 const nav=make('div',null,'game-guide-actions');
 const back=make('button','Previous'),jump=make('button','Show the controls','game-guide-primary'),next=make('button','Next'),close=make('button','Close guide'),board=make('button','Show the board');
 for(const b of [back,jump,next,close,board])b.type='button';
 jump.id='gameGuideJump';next.id='gameGuideNext';close.id='gameGuideClose';board.id='gameGuidePlay';
 nav.append(back,jump,next,close,board);tour.append(progress,title,instruction,nav);root.append(head,first,actions,ready,note,scope,tour);
 const header=main.querySelector(':scope > header');if(header)header.after(root);else main.prepend(root);
 let step=0,highlight=null;
 const stages=[['1 · Try a move',move,moveTarget],['2 · Check the result',check,checkTarget],['3 · Try again or play on','Read the game’s feedback. You can retry, undo or choose another round. This guide does not make a move, give an answer or award a win.',resultTarget]];
 const clean=()=>{highlight?.classList.remove('game-guide-target');highlight=null;};
 const showTarget=selector=>{
  clean();let target=doc.querySelector(selector);
  if(!target){ready.textContent='The game is still loading. Try again when its controls appear.';return;}
  for(let p=target;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
  // Game-owned results stay hidden until the actual engine establishes them.
  if(!target.getClientRects().length){target=target.parentElement;while(target&&!target.getClientRects().length)target=target.parentElement;}
  if(!target)return;
  target.classList.add('game-guide-target');highlight=target;
  target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  const control=target.matches('button,input,select,textarea')&&!target.disabled?target:target.querySelector('button:not(:disabled),input:not(:disabled),select:not(:disabled)');
  if(control)control.focus({preventScroll:true});else{target.tabIndex=-1;target.focus({preventScroll:true});}
 };
 const render=()=>{clean();progress.textContent=`${step+1} of 3`;title.textContent=stages[step][0];instruction.textContent=stages[step][1];back.disabled=step===0;next.textContent=step===2?'Finish guide':'Next';};
 const end=()=>{clean();tour.hidden=true;start.setAttribute('aria-expanded','false');start.focus({preventScroll:true});};
 start.setAttribute('aria-controls','gameGuideTour');start.setAttribute('aria-expanded','false');
 start.addEventListener('click',()=>{step=0;tour.hidden=false;start.setAttribute('aria-expanded','true');render();jump.focus({preventScroll:true});});
 const begin=()=>{
  showTarget(moveTarget);
  // Keep the current puzzle's two rules visible before the first world edit.
  if(slug==='world-builder.html'||slug==='world-builder')doc.getElementById('wbPuzzle')?.scrollIntoView({block:'start',behavior:'instant'});
 };
 play.addEventListener('click',begin);board.addEventListener('click',begin);
 back.addEventListener('click',()=>{step=Math.max(0,step-1);render();});next.addEventListener('click',()=>{if(step===2)end();else{step++;render();}});
 jump.addEventListener('click',()=>showTarget(stages[step][2]));close.addEventListener('click',end);
 doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&!tour.hidden){event.preventDefault();end();}});
 // Wait for a usable real control. Never substitute a tutorial result or run a
 // game action just to make the guide appear ready.
 const update=()=>{
  const target=doc.querySelector(moveTarget);const control=target?.matches('button,input,select,textarea')?target:target?.querySelector('button:not(:disabled),input:not(:disabled),select:not(:disabled)');
  const available=Boolean(control&&!control.disabled);if(play.disabled!==!available)play.disabled=!available;
  const text=available?'Ready. Start when you like.':'Waiting for the game controls to load. No move has been made.';
  if(ready.textContent!==text)ready.textContent=text;
  if(available)observer.disconnect();
 };
 const observer=new MutationObserver(update);observer.observe(main,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});update();root.dataset.mounted='true';
}
if(typeof document!=='undefined')mountGameGuide();
