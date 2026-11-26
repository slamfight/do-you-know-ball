'use strict';
const pick = (items, rng = Math.random) => items[Math.floor(rng() * items.length)];
function makeRun(players, rng = Math.random) {
  const groups = new Map();
  for (const p of players) {
    if (!groups.has(p.gender)) groups.set(p.gender, { unseen: [], recycled: [] });
    groups.get(p.gender).unseen.push(p);
  }
  let active = null, score = 0;
  function remove(pool, p) { const i = pool.indexOf(p); if (i !== -1) pool.splice(i, 1); }
  function next() {
    if (active) throw new Error('Answer current round first');
    const eligible = [...groups.values()].filter(g => g.unseen.length + g.recycled.length >= 2);
    // Draw the target uniformly from fresh eligible players; only when a gender has
    // no fresh players left may its previous distractors be chosen as targets.
    const candidates = eligible.flatMap(g => (g.unseen.length ? g.unseen : g.recycled));
    if (!candidates.length) return null;
    const target = pick(candidates, rng), g = groups.get(target.gender);
    const unseenOthers = g.unseen.filter(p => p.id !== target.id);
    const distractors = unseenOthers.length ? unseenOthers : g.recycled.filter(p => p.id !== target.id);
    const distractor = pick(distractors, rng);
    remove(g.unseen,target); remove(g.recycled,target);
    remove(g.unseen,distractor); remove(g.recycled,distractor);
    active = {target,distractor,choices:rng()<0.5?[target,distractor]:[distractor,target]};
    return active;
  }
  function answer(id) {
    if (!active || !active.choices.some(p => p.id === id)) throw new Error('Invalid answer');
    const round = active; active = null;
    if (id !== round.target.id) return false;
    score++; groups.get(round.distractor.gender).recycled.push(round.distractor);
    return true;
  }
  // A broken portrait is removed for this run, while the other player returns to
  // its original pool if it had not been successfully displayed.
  function discardBroken(ids, before) {
    if (!active) return;
    for (const p of active.choices) if (!ids.includes(p.id)) {
      const g=groups.get(p.gender); (before.has(p.id)?g.recycled:g.unseen).push(p);
    }
    active=null;
  }
  return {next, answer, discardBroken, get score(){return score;}};
}
if (typeof module !== 'undefined' && module.exports) module.exports = {makeRun};
if (typeof document !== 'undefined') {
const $ = id => document.getElementById(id);
let database=[], run, mode='all', gender='all', league='all', round=null, token=0, seen=new Set(), locked=true, lastCorrect=null, skipped=0;
const filters = p => (gender==='all'||gender===p.gender)&&(league==='all'||league===p.league);
function selectedMode(){return league==='all'?gender:gender==='all'?league:`${gender}:${league}`;}
function incompatible(){return (gender==='men'&&league==='WSL')||(gender==='women'&&league!=='all'&&league!=='WSL');}
function bestKey(){return `footballer-chain-v1-best:${mode}`;}
function best(){try{return Number(localStorage.getItem(bestKey()))||0;}catch{return 0;}}
let sessionBest=0;
function updateScore(){sessionBest=Math.max(sessionBest,best(),run.score);try{localStorage.setItem(bestKey(),String(sessionBest));}catch{} $('score').textContent=run.score;$('best').textContent=sessionBest;}
function show(name){for(const id of ['menu','play','end']) $(id).hidden=id!==name;}
function nameClub(p){return `${p.name} (${p.club})`;}
function eligibleCount(pool){const counts={};for(const p of pool) counts[p.gender]=(counts[p.gender]||0)+1;return Object.values(counts).filter(n=>n>=2).reduce((a,b)=>a+b,0);}
function updateMenu(){mode=selectedMode();for(const b of document.querySelectorAll('[data-gender]'))b.setAttribute('aria-pressed',String(b.dataset.gender===gender));for(const b of document.querySelectorAll('[data-league]'))b.setAttribute('aria-pressed',String(b.dataset.league===league));const pool=database.filter(filters), count=eligibleCount(pool);$('start').disabled=count<2;$('availability').hidden=count>=2;$('availability').textContent=database.length?'Not enough same-gender players to start.':'No player database yet. Run the collector with --images-only to create players.json, then refresh.';}
function preload(src){return new Promise(resolve=>{const im=new Image();let finished=false;const timer=setTimeout(()=>done(false),10000);function done(ok){if(finished)return;finished=true;clearTimeout(timer);resolve(ok);}im.onload=()=>done(im.naturalWidth>0);im.onerror=()=>done(false);im.src=src;});}
async function nextRound(){
  const currentToken=++token;locked=true;for(let i=0;i<2;i++) $('choice'+i).disabled=true;
  $('loading').hidden=false;$('portraits').hidden=true;$('play-error').hidden=true;
  while(currentToken===token){
    round=run.next();
    if(!round){finish(null);return;}
    const ok=await Promise.all(round.choices.map(p=>preload(p.image)));
    if(currentToken!==token)return;
    if(ok.some(x=>!x)){const bad=round.choices.filter((p,i)=>!ok[i]).map(p=>p.id);skipped+=bad.length;run.discardBroken(bad,seen);continue;}
    for(const p of round.choices)seen.add(p.id);
    $('round').textContent=`Round ${run.score+1}`;$('target').textContent=round.target.name;
    $('feedback').hidden=!lastCorrect;if(lastCorrect)$('feedback').textContent=`Correct — ${nameClub(lastCorrect)}.`;
    round.choices.forEach((p,i)=>{$('choice'+i).querySelector('img').src=p.image;$('choice'+i).disabled=false;});
    $('loading').hidden=true;$('portraits').hidden=false;locked=false;$('question').focus({preventScroll:true});return;
  }
}
function start(selected){mode=selected;const pool=database.filter(filters);if(eligibleCount(pool)<2)return;run=makeRun(pool);seen=new Set();lastCorrect=null;skipped=0;sessionBest=best();$('feedback').hidden=true;$('target').textContent='…';$('round').textContent='Round 1';show('play');updateScore();nextRound();}
function finish(wrong){++token;locked=true;updateScore();show('end');$('final-score').textContent=run.score;$('final-best').textContent=sessionBest;$('end-portraits').hidden=!wrong;
  if(wrong){$('end-kicker').hidden=true;$('end-kicker').textContent='';$('end-title').textContent="Ahh soz that's wrong!";$('end-message').textContent=`That was ${nameClub(wrong)}.`;$('wrong-photo').src=wrong.image;$('right-photo').src=round.target.image;$('wrong-name').textContent=`Your choice: ${wrong.name}`;$('right-name').textContent=`Correct: ${round.target.name}`;}
  else{$('end-kicker').hidden=false;$('end-kicker').textContent=skipped?'Run complete':'Run complete';$('end-title').textContent=skipped?'No more available pairs!':'You win!';$('end-message').textContent=skipped?`${skipped} unavailable portraits were skipped. No valid pairs remain.`:'You identified every footballer possible without repeating a correct answer.';}
  $('end-title').focus({preventScroll:true});
}
function choose(i){if(locked||!round)return;locked=true;const p=round.choices[i];if(run.answer(p.id)){lastCorrect=p;updateScore();nextRound();}else finish(p);}
function menu(){++token;locked=true;show('menu');updateMenu();}
for(const b of document.querySelectorAll('[data-gender]'))b.addEventListener('click',()=>{gender=b.dataset.gender;if(incompatible())league='all';updateMenu();});for(const b of document.querySelectorAll('[data-league]'))b.addEventListener('click',()=>{league=b.dataset.league;if(incompatible())gender='all';updateMenu();});$('start').addEventListener('click',()=>start(selectedMode()));$('choice0').addEventListener('click',()=>choose(0));$('choice1').addEventListener('click',()=>choose(1));$('again').addEventListener('click',()=>start(mode));$('back').addEventListener('click',menu);$('quit').addEventListener('click',menu);
(async()=>{try{const response=await fetch('players.json',{cache:'no-store'});if(!response.ok)throw new Error('Unavailable');const data=await response.json();if(!Array.isArray(data))throw new Error('Invalid player data');const ids=new Set();database=data.filter(p=>p&&p.id!=null&&p.name&&p.club&&p.league&&['men','women'].includes(p.gender)&&typeof p.image==='string'&&p.image.startsWith('images/')&&!ids.has(p.id)&&ids.add(p.id));}catch{database=[];}updateMenu();})();
}
