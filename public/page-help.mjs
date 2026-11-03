// Optional contextual help. Never runs a check, changes a game or submits data.
import {PAGE_HELP} from './page-help-core.mjs';
export function mountPageHelp(doc=document,pathname=location.pathname){
 const raw=pathname.split('/').filter(Boolean).at(-1)||'index.html',name=raw.endsWith('.html')?raw:raw+'.html';
 const c=PAGE_HELP[name],main=doc.querySelector('main');if(!c||!main||doc.getElementById('pageHelp'))return;
 const make=(tag,text)=>{const e=doc.createElement(tag);if(text)e.textContent=text;return e;};
 const details=make('details');details.id='pageHelp';details.className='page-help';
 const summary=make('summary','How to use this page');const category=make('p',c.kind);category.className='page-help-kind';
 const action=make('p');action.append(make('strong','Start here: '),doc.createTextNode(c.first_step));
 const meaning=make('p');const resultPage=/tool|game|lab|viewer|explorer|workflow|demonstration|results|registry|workspace/.test(c.kind);meaning.append(make('strong',resultPage?'How to read the result: ':'Keep in mind: '),doc.createTextNode(c.scope));
 const words=make('details'),label=make('summary','A few useful words');words.append(label);
 const definitions=[
 ['CSV','A spreadsheet saved as plain text with a heading row and one record per row.'],
 ['JSON','A text format for structured data. Tools can read its named fields.'],
 ['Hash','A fingerprint of exact file bytes. A matching hash identifies data, not its author or scientific accuracy.'],
 ['Claim','A specific statement you want to check.'],
 ['Assurance','Support for a specific claim, under stated checks and assumptions. It is not a guarantee about everything.'],
 ['Evidence','The files, observations or proof steps supporting a statement.'],
 ['Lean','A mathematical proof checker. Its verdict concerns the exact statement and assumptions it checked.'],
 ['Replay','Run the check again from the original inputs.'],
 ['Recorded','Evidence from an earlier run, rather than a check you just requested.'],
 ['Assumption','Something the result depends on. It needs justification rather than being established by that result.'],
 ['Counterexample','One concrete example that shows a statement or proposed rule is wrong.'],
 ['Bounded','Limited to an explicit size, set of cases, or checking budget.'],
 ['Receipt','A record of what a verifier reported. An imported receipt needs independent checking.'],
 ['Authority','The checker or decision-maker whose verdict counts under a stated policy.'],
 ['Dependency','An input or earlier result that another step needs.'],
 ['Held out','Data kept out of fitting, so predictions can be compared with observations the fitting step did not use.'],
 ['Model','A mathematical or learned rule used to make predictions or suggestions. Its scope is specific to the tool.'],
 ['Proof obligation','A precise question that must be settled before a larger conclusion is supported.'],
 ['Canonical','Written in one agreed, unambiguous format.'],
 ['Semantic','Concerning the meaning of a statement, rather than just its wording.'],
 ['L0','Level 0: the starting contributor level. Higher permissions require review.']
 ];
 const text=main.textContent.toLowerCase();let glossary=definitions.filter(([term])=>text.includes(term.toLowerCase())).slice(0,9);if(!glossary.length)glossary=definitions.filter(([term])=>['Claim','Evidence','Replay'].includes(term));
 const dl=make('dl');for(const [term,definition] of glossary)dl.append(make('dt',term),make('dd',definition));words.append(dl);
 const link=make('a','Try the scientific workflow');link.href='https://proof-carrying-science-site.marenatommaso.workers.dev/experience.html';link.target='_blank';link.rel='noopener noreferrer';
 details.append(summary,category,action,meaning,words);if(name!=='experience.html')details.append(link);
 const gameScope=doc.getElementById('gameGuideDetails');
 if(gameScope)gameScope.append(details);
 else{const title=main.querySelector('h1');const section=title?.closest('header,section');if(section&&main.contains(section)&&section!==main)section.append(details);else{const p=title?.nextElementSibling;if(p?.tagName==='P')p.after(details);else title?.after(details);}}
 doc.documentElement.dataset.pageHelpReady=name;
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mountPageHelp(),{once:true});else mountPageHelp();
}
