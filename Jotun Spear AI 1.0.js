// =====================================================
// Jotun Spear – ULTIMATE EDITION
// Massive Weapon of the Giant-Kin
// (AI Narratives + Tooltips + Customization + Level Requirements)
// For the 18' Jotun warriors and their 16-20' spears
// Version 1.0
// =====================================================

/* ---------- OPENAI CONFIGURATION ---------- */
const OPENAI_CONFIG = {
  apiKey: "sk-proj-", // Paste your OpenAI API key here
  model: "gpt-4o-mini",
  maxTokens: 150,
  temperature: 0.9
};

let sessionApiKey = "";

/* ---------- OPENAI API CALL ---------- */
async function generateNarrative(attackName, attackFlavor, result, damage, actorName, customization) {
  let apiKey = OPENAI_CONFIG.apiKey || sessionApiKey;
  
  if (!apiKey) {
    apiKey = await Dialog.prompt({
      title: "OpenAI API Key Required",
      content: `
        <p>Enter your OpenAI API key to enable AI-generated combat narratives.</p>
        <p style="font-size:0.9em; color:#666;">Get your key at: <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com/api-keys</a></p>
        <input type="password" id="api-key" style="width:100%; padding:8px; margin-top:8px;" placeholder="sk-...">
      `,
      callback: (html) => html.find("#api-key").val()
    });
    
    if (!apiKey) {
      console.log("No API key provided, using static flavor text");
      return null;
    }
    
    sessionApiKey = apiKey;
  }

  let customContext = "";
  if (customization) {
    if (customization.calledShot && customization.calledDetail) {
      const targetType = {
        'body': 'body part',
        'object': 'object',
        'creature': 'creature type'
      }[customization.calledShot] || 'target';
      customContext += `\nCalled Shot: Targeting ${targetType} - ${customization.calledDetail}`;
    }
    if (customization.style) {
      customContext += `\nStyle: ${customization.style}`;
    }
  }

  const prompt = `You are a dramatic combat narrator for a D&D 5e game. Generate a vivid, concise combat description focusing on the attack action, not the result, (2-3 sentences max) for this attack:

Attack: ${attackName}
Context: ${attackFlavor}
Character: ${actorName} (Jotun Giant Warrior with Massive Spear)
Result: ${result}
${damage ? `Damage: ${damage}` : ''}${customContext}

Make it cinematic and specific to the result, avoid descriptive details on actual impact or hit, its about the action. Emphasize the massive scale and reach. Use vivid action verbs. Keep it under 40 words.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_CONFIG.model,
        messages: [
          { 
            role: "system", 
            content: "You are a dramatic combat narrator. Be vivid, concise, and exciting. Focus on overwhelming size, incredible reach, and devastating piercing strikes. Emphasize the giant scale. No preamble or meta-commentary." 
          },
          { role: "user", content: prompt }
        ],
        max_tokens: OPENAI_CONFIG.maxTokens,
        temperature: OPENAI_CONFIG.temperature
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("OpenAI API Error:", error);
      
      if (response.status === 429) {
        ui.notifications.warn("OpenAI rate limit reached. Using default text.");
      } else if (response.status === 401) {
        ui.notifications.error("Invalid OpenAI API key.");
        sessionApiKey = "";
      } else if (response.status === 403) {
        ui.notifications.error("OpenAI access forbidden. Generate a new key at platform.openai.com/api-keys");
        sessionApiKey = "";
      } else if (response.status === 402) {
        ui.notifications.error("OpenAI account requires payment.");
      } else {
        ui.notifications.warn(`AI narrative generation failed (${response.status}), using default text`);
      }
      return null;
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error("Failed to generate AI narrative:", error);
    ui.notifications.warn("AI narrative generation failed (network error), using default text");
    return null;
  }
}

/* ---------- CRIT THRESHOLD DETECTION ---------- */
function getCritThreshold(actor) {
  let threshold = 20;

  const bonusCrit = actor.system.bonuses?.critical?.threshold;
  if (bonusCrit && Number(bonusCrit) < threshold) threshold = Number(bonusCrit);

  for (const effect of actor.effects.filter(e => !e.disabled)) {
    for (const change of effect.changes) {
      const key = change.key.toLowerCase();
      if (key.includes("crit") && key.includes("threshold")) {
        const val = Number(change.value);
        if (!isNaN(val) && val < threshold) threshold = val;
      }
    }
  }

  const flagCrit = actor.getFlag("dnd5e", "criticalThreshold");
  if (flagCrit && Number(flagCrit) < threshold) threshold = Number(flagCrit);

  return threshold;
}

/* ---------- SAFE FORMULA EVAL ---------- */
async function evalFormula(formula, actor) {
  if (!formula || formula === "0") return 0;
  try {
    return (await new Roll(formula, actor.getRollData()).evaluate()).total;
  } catch {
    return 0;
  }
}

/* ---------- ROLL COLOR WRAPPER ---------- */
function colorizeRoll(html, color) {
  return `<div style="background:${color}; border-radius:4px; padding:2px;">${html}</div>`;
}

/* ---------- VALIDATION ---------- */
if (canvas.tokens.controlled.length !== 1) {
  ui.notifications.warn("Select exactly one token.");
  return;
}
const actor = canvas.tokens.controlled[0].actor;

/* ---------- FIND WEAPON ---------- */
const weapon = actor.items.find(i =>
  i.type === "weapon" &&
  i.name.replace(/\s+/g, "").toLowerCase().includes("jotunspear")
);
if (!weapon) {
  ui.notifications.error("Selected actor does not have a Jotun Spear equipped.");
  return;
}

/* ---------- CORE STATS ---------- */
const strMod = actor.system.abilities.str.mod ?? 0;
const dexMod = actor.system.abilities.dex.mod ?? 0;
const prof = actor.system.attributes.prof ?? 0;
const characterLevel = actor.system.details.level ?? 1;
const weaponAttackBonus = Number(weapon.system.attackBonus ?? 0);
const weaponDamageBonus = Number(weapon.system.damage?.base?.bonus ?? 0);

/* ---------- AUTO BONUSES ---------- */
const bonusSources = [];

if (actor.system.bonuses?.mwak?.attack)
  bonusSources.push({ affects: "attack", formula: actor.system.bonuses.mwak.attack });

if (actor.system.bonuses?.mwak?.damage)
  bonusSources.push({ affects: "damage", formula: actor.system.bonuses.mwak.damage });

for (const effect of actor.effects.filter(e => !e.disabled)) {
  for (const change of effect.changes) {
    if (
      change.key.includes("mwak") ||
      change.key.includes("attack") ||
      change.key.includes("damage")
    ) {
      bonusSources.push({
        affects: change.key.includes("attack") ? "attack" : "damage",
        formula: change.value
      });
    }
  }
}

/* ---------- ATTACK DEFINITIONS ---------- */
const attacks = {
  thrust: {
    label: "Giant's Thrust",
    flavor: "A straightforward thrust with the massive spear, using its incredible reach to strike from afar.",
    dice: "1d10",
    critHitMod: 0,
    critFailMod: 0,
    category: "standard",
    minLevel: 1,
    tooltip: `<strong>Giant's Thrust</strong><br>
<em>Basic Piercing Strike</em><br><br>
<strong>Requires:</strong> Level 1+<br>
<strong>Damage:</strong> 1d10<br>
<strong>Crit Range:</strong> 20<br>
<strong>Fumble:</strong> Only on 1<br><br>
<strong>Best For:</strong><br>
• Reliable, consistent damage<br>
• Standard reach attacks<br>
• Opening strikes<br><br>
<strong>Tactics:</strong> The foundation of giant spear combat. Simple, effective, and uses the weapon's reach advantage.`
  },
  long: {
    label: "Long Reach",
    flavor: "Extending the spear to its full 20-foot length, striking enemies who thought themselves safe.",
    dice: "1d10",
    critHitMod: 0,
    critFailMod: 1,
    category: "standard",
    minLevel: 1,
    special: "extended",
    tooltip: `<strong>Long Reach</strong><br>
<em>Maximum Range Strike</em><br><br>
<strong>Requires:</strong> Level 1+<br>
<strong>Damage:</strong> 1d10<br>
<strong>Crit Range:</strong> 20<br>
<strong>Fumble:</strong> 1-2 ⚠️<br>
<strong>Special:</strong> Extended reach (+5ft)<br><br>
<strong>Best For:</strong><br>
• Keeping distance<br>
• Hitting distant enemies<br>
• Maintaining range advantage<br><br>
<strong>Tactics:</strong> Attack at maximum range. The full extension increases fumble risk but keeps enemies far away.`
  },
  haft: {
    label: "Haft Sweep",
    flavor: "Swinging the thick wooden shaft like a battering ram to knock enemies aside.",
    dice: "1d8",
    critHitMod: 0,
    critFailMod: 0,
    category: "standard",
    minLevel: 2,
    special: "knockback",
    tooltip: `<strong>Haft Sweep</strong><br>
<em>Blunt Force Strike</em><br><br>
<strong>Requires:</strong> Level 2+<br>
<strong>Damage:</strong> 1d8 (bludgeoning)<br>
<strong>Crit Range:</strong> 20<br>
<strong>Fumble:</strong> Only on 1<br>
<strong>Special:</strong> Can knock back<br><br>
<strong>Best For:</strong><br>
• Pushing enemies away<br>
• Creating space<br>
• Breaking formations<br><br>
<strong>Tactics:</strong> Deals bludgeoning damage. On hit, can knock target back 10 feet. Great for crowd control.`
  },
  overhead: {
    label: "Overhead Plunge",
    flavor: "Raising the massive spear high overhead before driving it down with enormous force.",
    dice: "1d12",
    critHitMod: 0,
    critFailMod: 1,
    category: "standard",
    minLevel: 3,
    tooltip: `<strong>Overhead Plunge</strong><br>
<em>Downward Power Strike</em><br><br>
<strong>Requires:</strong> Level 3+<br>
<strong>Damage:</strong> 1d12<br>
<strong>Crit Range:</strong> 20<br>
<strong>Fumble:</strong> 1-2 ⚠️<br><br>
<strong>Best For:</strong><br>
• Maximum melee damage<br>
• Grounded enemies<br>
• Devastating strikes<br><br>
<strong>Tactics:</strong> Highest base damage. The overhead arc increases fumble risk from the massive weapon's weight.`
  },
  rising: {
    label: "Upward Lance",
    flavor: "A rising thrust from low to high, using the spear's length to maximize upward force.",
    dice: "1d10",
    critHitMod: -1,
    critFailMod: 1,
    category: "standard",
    minLevel: 4,
    tooltip: `<strong>Upward Lance</strong><br>
<em>Rising Piercing Strike</em><br><br>
<strong>Requires:</strong> Level 4+<br>
<strong>Damage:</strong> 1d10<br>
<strong>Crit Range:</strong> 19-20<br>
<strong>Fumble:</strong> 1-2 ⚠️<br><br>
<strong>Best For:</strong><br>
• Flying enemies<br>
• Mounted opponents<br>
• Underbelly strikes<br><br>
<strong>Tactics:</strong> Improved crit from upward momentum. Perfect for striking weak points underneath armor.`
  },
  pierce: {
    label: "Armor Piercer",
    flavor: "A precise thrust aimed at gaps in armor, using the spear's steel point to punch through defenses.",
    dice: "2d6",
    critHitMod: -1,
    critFailMod: 0,
    category: "standard",
    minLevel: 5,
    tooltip: `<strong>Armor Piercer</strong><br>
<em>Precision Penetrating Strike</em><br><br>
<strong>Requires:</strong> Level 5+<br>
<strong>Damage:</strong> 2d6<br>
<strong>Crit Range:</strong> 19-20<br>
<strong>Fumble:</strong> Only on 1<br><br>
<strong>Best For:</strong><br>
• Heavily armored foes<br>
• Precision strikes<br>
• Finding weak points<br><br>
<strong>Tactics:</strong> Improved crit and high damage for punching through armor. The steel point finds every gap.`
  },
  sweep: {
    label: "Reaping Sweep",
    flavor: "A wide horizontal sweep with the massive spear, using its length to threaten multiple foes.",
    dice: "1d10",
    critHitMod: 0,
    critFailMod: 1,
    category: "standard",
    minLevel: 6,
    special: "cleave",
    tooltip: `<strong>Reaping Sweep</strong><br>
<em>Wide Arc Strike</em><br><br>
<strong>Requires:</strong> Level 6+<br>
<strong>Damage:</strong> 1d10<br>
<strong>Crit Range:</strong> 20<br>
<strong>Fumble:</strong> 1-2 ⚠️<br>
<strong>Special:</strong> Can hit 3 targets<br><br>
<strong>Best For:</strong><br>
• Multiple enemies in line<br>
• Crowd control<br>
• Area denial<br><br>
<strong>Tactics:</strong> Can hit up to 3 adjacent targets due to massive length. The sweep requires careful control.`
  },
  charge: {
    label: "Charging Lance",
    flavor: "A devastating charge attack, building tremendous momentum behind the steel point.",
    dice: "2d8",
    critHitMod: -1,
    critFailMod: 2,
    category: "special",
    minLevel: 7,
    special: "charge",
    tooltip: `<strong>Charging Lance</strong><br>
<em>Momentum Strike</em><br><br>
<strong>Requires:</strong> Level 7+<br>
<strong>Damage:</strong> 2d8<br>
<strong>Crit Range:</strong> 19-20<br>
<strong>Fumble:</strong> 1-3 ⚠️⚠️<br>
<strong>Special:</strong> Requires 20ft movement<br><br>
<strong>Best For:</strong><br>
• Devastating opening strikes<br>
• Charging into combat<br>
• Breaking enemy lines<br><br>
<strong>Tactics:</strong> Must move at least 20ft before attack. High damage and crit, but momentum increases fumble risk.`
  },
  pin: {
    label: "Pinning Strike",
    flavor: "Driving the spear through an enemy to pin them to the ground or a nearby surface.",
    dice: "1d10+1d6",
    critHitMod: 0,
    critFailMod: 1,
    category: "special",
    minLevel: 9,
    special: "pin",
    tooltip: `<strong>Pinning Strike</strong><br>
<em>Impaling Attack</em><br><br>
<strong>Requires:</strong> Level 9+<br>
<strong>Damage:</strong> 1d10+1d6<br>
<strong>Crit Range:</strong> 20<br>
<strong>Fumble:</strong> 1-2 ⚠️<br>
<strong>Special:</strong> Can immobilize<br><br>
<strong>Best For:</strong><br>
• Pinning single targets<br>
• Preventing escape<br>
• Setting up allies<br><br>
<strong>Tactics:</strong> On hit, target is restrained (DC 15 STR check to escape). Great for controlling dangerous foes.`
  },
  whirling: {
    label: "Titan's Windmill",
    flavor: "Spinning the massive spear in a deadly circle, the giant becomes a whirlwind of steel and wood.",
    dice: "2d10",
    critHitMod: 0,
    critFailMod: 3,
    category: "special",
    minLevel: 11,
    special: "spin",
    tooltip: `<strong>Titan's Windmill</strong><br>
<em>Spinning Area Attack</em><br><br>
<strong>Requires:</strong> Level 11+<br>
<strong>Damage:</strong> 2d10<br>
<strong>Crit Range:</strong> 20<br>
<strong>Fumble:</strong> 1-4 ⚠️⚠️⚠️<br>
<strong>Special:</strong> Hits all within 10ft<br><br>
<strong>Best For:</strong><br>
• Surrounded by enemies<br>
• Massive crowd control<br>
• Creating space<br><br>
<strong>Tactics:</strong> Hits ALL creatures within 10 feet due to spear's length. Extreme fumble risk from spinning the massive weapon.`
  },
  skewer: {
    label: "Giant's Skewer",
    flavor: "A brutal thrust designed to pierce completely through the target, the steel point emerging from the other side.",
    dice: "1d10+2d8",
    critHitMod: -1,
    critFailMod: 0,
    category: "special",
    minLevel: 13,
    special: "penetrate",
    tooltip: `<strong>Giant's Skewer</strong><br>
<em>Full Penetration Strike</em><br><br>
<strong>Requires:</strong> Level 13+<br>
<strong>Damage:</strong> 1d10+2d8<br>
<strong>Crit Range:</strong> 19-20<br>
<strong>Fumble:</strong> Only on 1<br>
<strong>Special:</strong> Can hit 2nd target<br><br>
<strong>Best For:</strong><br>
• Lined-up enemies<br>
• Massive single-target damage<br>
• Penetrating strikes<br><br>
<strong>Tactics:</strong> If damage exceeds target's remaining HP, excess damage carries to creature directly behind them.`
  },
  earth: {
    label: "Earthshaker",
    flavor: "Slamming the massive spear into the ground with such force that the earth itself trembles.",
    dice: "3d10",
    critHitMod: 0,
    critFailMod: 4,
    category: "special",
    minLevel: 15,
    special: "quake",
    tooltip: `<strong>Earthshaker</strong><br>
<em>Ground Slam AoE</em><br><br>
<strong>Requires:</strong> Level 15+<br>
<strong>Damage:</strong> 3d10<br>
<strong>Crit Range:</strong> 20<br>
<strong>Fumble:</strong> 1-5 ⚠️⚠️⚠️⚠️<br>
<strong>Special:</strong> 15ft radius knockdown<br><br>
<strong>Best For:</strong><br>
• Epic boss battles<br>
• Massive crowd control<br>
• Devastating finishers<br><br>
<strong>Tactics:</strong> Hits all in 15ft radius. On hit, targets must make DC 15 DEX save or be knocked prone. Ultimate attack.`
  }
};

/* ---------- STYLED ATTACK MENU ---------- */
let selectedMode = "normal";
let useAI = true;
let attacksLocked = false;
let lockTimer = null;

const dialog = new Dialog({
  title: "Jotun Spear — Choose Attack",
  content: `
    <link rel="stylesheet" href="https://unpkg.com/tippy.js@6/dist/tippy.css" />
    <link rel="stylesheet" href="https://unpkg.com/tippy.js@6/themes/light-border.css" />
    
    <style>
      .dialog.window-app {
        min-width: 420px !important;
        width: 420px !important;
      }
      
      .dialog .window-content {
        min-width: 420px !important;
        background: linear-gradient(135deg, #4a5d6f 0%, #7a8fa3 50%, #2c3e50 100%);
      }
      
      .axe-dialog-content {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 6px;
        min-width: 400px;
        max-width: 400px;
      }
      
      .ai-toggle-section {
        background: linear-gradient(135deg, #1c2833 0%, #2c3e50 50%, #1c2833 100%);
        border-radius: 6px;
        padding: 9px;
        border: 1.5px solid #5d6d7e;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .ai-toggle-label {
        font-weight: bold;
        font-size: 16px;
        color: #ecf0f1;
        margin-bottom: 6px;
        padding-bottom: 3px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        text-shadow: 1px 1px 2px #000;
        flex: 1;
      }
      
      .ai-toggle-btn {
        padding: 4px 12px;
        border: 1.5px solid #85929e;
        background: linear-gradient(135deg, #1c2833 0%, #2c3e50 50%, #1c2833 100%);
        color: #85929e;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
        font-size: 10px;
        transition: all 0.2s;
      }
      
      .ai-toggle-btn:hover {
        transform: scale(1.05);
        box-shadow: 0 2px 4px rgba(133, 146, 158, 0.3);
      }
      
      .ai-toggle-btn.disabled {
        background: #555;
        border-color: #777;
        color: #999;
      }
      
      .ai-toggle-btn.disabled:hover {
        transform: scale(1.05);
        background: #666;
      }
      
      .roll-mode-section {
        background: linear-gradient(135deg, #1c2833 0%, #2c3e50 50%, #1c2833 100%);
        border-radius: 6px;
        padding: 9px;
        border: 1.5px solid #5d6d7e;
      }
      
      .roll-mode-label {
        font-weight: bold;
        font-size: 16px;
        color: #ecf0f1;
        margin-bottom: 12px;
        padding-bottom: 10px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        text-shadow: 1px 1px 2px #000;
      }
      
      .roll-mode-buttons {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
      }
      
      .roll-mode-btn {
        padding: 4px 6px;
        border: 1.5px solid #555;
        background: #2c3e50;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
        font-size: 14px;
        transition: all 0.2s;
        text-align: center;
        color: #ecf0f1;
      }
      
      .roll-mode-btn:hover {
        background: #34495e;
        border-color: #85929e;
      }
      
      .roll-mode-btn.selected {
        background: linear-gradient(135deg, #5d6d7e 0%, #85929e 50%, #5d6d7e 100%);
        color: white;
        border-color: #b3bcc4;
      }
      
      .attack-category {
        margin-bottom: 9px;
      }
      
      .category-title {
        font-weight: bold;
        font-size: 16px;
        color: #ecf0f1;
        margin-bottom: 6px;
        padding-bottom: 3px;
        border-bottom: 1.5px solid #5d6d7e;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        text-shadow: 1px 1px 2px #000;
      }
      
      .attack-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 6px;
      }
      
      /* Clickable Info Cards */
      .attack-info {
        border-radius: 4px;
        padding: 6px;
        font-size: 15px;
        color:#0b0d0e;
        line-height: 1.3;
        cursor: pointer;
        transition: all 0.2s;
        position: relative;
        border: 1.5px solid transparent;
        min-height: 60px;
      }

      .attack-info.standard-card {
        background: radial-gradient(circle at 30% 30%, #aeb6bf 0%, #5d6d7e 70%, #34495e 100%);
        border-color: #5d6d7e;
      }

      .attack-info.special-card {
        background: radial-gradient(circle at 30% 30%, #aeb6bf 0%, #5d6d7e 70%, #34495e 100%);
        border-color: #85929e;
      }
      
      .attack-info:hover {
        background: radial-gradient(circle at 70% 30%, #aeb6bf 0%, #5d6d7e 70%, #34495e 100%);
        color: #3498db;
        border: 2px solid transparent;
        border-color: #85929e;
        transform: translateY(-2px);
        box-shadow: 0 2px 8px rgba(133, 146, 158, 0.4);
        filter: brightness(1.15);
      }
      
      .attack-info:active {
        transform: translateY(0px);
      }
      
      .attack-info.locked {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
        filter: grayscale(0.5);
      }
      
      .attack-info::after {
        content: "ℹ️";
        position: absolute;
        top: 4px;
        right: 4px;
        font-size: 10px;
        opacity: 0.8;
      }
      
      .attack-info strong {
        font-size: 15px;
        color: #0b0d0e;
        font-weight: bold;
      }
      
      .attack-stat {
        display: inline-block;
        margin-right: 9px;
        white-space: nowrap;
      }
      
      .stat-label {
        font-weight: 300;
        color: #0b0d0e;
      }
      
      /* Tippy tooltip styling */
      .tippy-box[data-theme~='axe-attack'] {
        background: radial-gradient(circle at 50% 50%, #2a2a2a 0%, #1a1a1a 100%);
        color: #ecf0f1;
        font-size: 12px;
        max-width: 300px;
        border: 2px solid #5d6d7e;
        position: relative;
      }
      
      .tippy-box[data-theme~='axe-attack']::before {
        content: '';
        position: absolute;
        top: 8px;
        right: 8px;
        width: 80px;
        height: 80px;
        background-image: url('https://assets.forge-vtt.com/682698e464a8e01c529f02a4/icons/Drakkael%20Battle%20Axe%20Icon.png');
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        opacity: 0.50;
        pointer-events: none;
        z-index: 0;
      }
      
      .tippy-box[data-theme~='axe-attack'] .tippy-content {
        padding: 12px;
        line-height: 1.5;
        position: relative;
        z-index: 1;
      }
      
      .tippy-box[data-theme~='axe-attack'] strong {
        color: #85929e;
      }
      
      .tippy-box[data-theme~='axe-attack'] em {
        color: #3498db;
      }
    </style>
    
    <script src="https://unpkg.com/@popperjs/core@2"></script>
    <script src="https://unpkg.com/tippy.js@6"></script>
    
    <div class="axe-dialog-content">
      <div class="ai-toggle-section">
        <img
  src="https://assets.forge-vtt.com/682698e464a8e01c529f02a4/icons/OdysseyIcon.png"
  style="
    width: 40px;
    height: 40px;
    object-fit: contain;
    border: none;
    outline: none;
    box-shadow: none;
    background: transparent;
    display: block;
  "
  alt="AI Icon">
        <span class="ai-toggle-label">AI-Generated Narratives</span>
        <div class="ai-toggle-btn" data-ai="true">ON</div>
      </div>
      
      <div class="roll-mode-section">
        <span class="roll-mode-label">Roll Mode</span>
        <div class="roll-mode-buttons">
          <div class="roll-mode-btn selected" data-mode="normal">Normal</div>
          <div class="roll-mode-btn" data-mode="adv">Advantage</div>
          <div class="roll-mode-btn" data-mode="dis">Disadvantage</div>
        </div>
      </div>
      
      <div class="attack-category">
        <div class="category-title">⚔️ Basic Techniques</div>
        <div class="attack-grid">
          <div class="attack-info standard-card" data-attack="thrust">
            <strong>Giant's Thrust</strong><br>
            <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d10</span>
            <span class="attack-stat"><span class="stat-label">Reliable</span></span>
          </div>
          <div class="attack-info standard-card" data-attack="long">
            <strong>Long Reach</strong><br>
            <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d10</span>
            <span class="attack-stat"><span class="stat-label">+5ft</span></span>
          </div>
        </div>
        <div class="attack-grid" style="margin-top: 6px;">
          <div class="attack-info standard-card" data-attack="haft">
            <strong>Haft Sweep</strong><br>
            <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d8</span>
            <span class="attack-stat"><span class="stat-label">Push</span></span>
          </div>
          <div class="attack-info standard-card" data-attack="overhead">
            <strong>Overhead Plunge</strong><br>
            <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d12</span>
            <span class="attack-stat"><span class="stat-label">Power</span></span>
          </div>
        </div>
        <div class="attack-grid" style="margin-top: 6px;">
          <div class="attack-info standard-card" data-attack="rising">
            <strong>Upward Lance</strong><br>
            <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d10</span>
            <span class="attack-stat"><span class="stat-label">Crit:</span> 19+</span>
          </div>
          <div class="attack-info standard-card" data-attack="pierce">
            <strong>Armor Piercer</strong><br>
            <span class="attack-stat"><span class="stat-label">Dmg:</span> 2d6</span>
            <span class="attack-stat"><span class="stat-label">Crit:</span> 19+</span>
          </div>
        </div>
        <div class="attack-grid" style="margin-top: 6px;">
          <div class="attack-info standard-card" data-attack="sweep">
            <strong>Reaping Sweep</strong><br>
            <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d10</span>
            <span class="attack-stat"><span class="stat-label">Hits:</span> 3</span>
          </div>
        </div>
      </div>
      
      <div class="attack-category">
        <div class="category-title">✨ Advanced Maneuvers</div>
        <div class="attack-grid">
          <div class="attack-info special-card" data-attack="charge">
            <strong>⚡ Charging Lance</strong><br>
            <span class="attack-stat"><span class="stat-label">Dmg:</span> 2d8</span>
            <span class="attack-stat"><span class="stat-label">Crit:</span> 19+</span>
          </div>
          <div class="attack-info special-card" data-attack="pin">
            <strong>📌 Pinning Strike</strong><br>
            <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d10+1d6</span>
            <span class="attack-stat"><span class="stat-label">Restrain</span></span>
          </div>
        </div>
        <div class="attack-grid" style="margin-top: 6px;">
          <div class="attack-info special-card" data-attack="whirling">
            <strong>🌪️ Titan's Windmill</strong><br>
            <span class="attack-stat"><span class="stat-label">Dmg:</span> 2d10</span>
            <span class="attack-stat"><span class="stat-label">10ft AoE</span></span>
          </div>
          <div class="attack-info special-card" data-attack="skewer">
            <strong>🎯 Giant's Skewer</strong><br>
            <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d10+2d8</span>
            <span class="attack-stat"><span class="stat-label">Pierce</span></span>
          </div>
        </div>
        <div class="attack-grid" style="margin-top: 6px;">
          <div class="attack-info special-card" data-attack="earth">
            <strong>💥 Earthshaker</strong><br>
            <span class="attack-stat"><span class="stat-label">Dmg:</span> 3d10</span>
            <span class="attack-stat"><span class="stat-label">15ft AoE</span></span>
          </div>
        </div>
      </div>
    </div>
  `,
  buttons: {},
  render: (html) => {
    // Initialize Tippy.js tooltips with retry mechanism (MUST BE FIRST)
    const initTooltips = (attempt = 1, maxAttempts = 10) => {
      if (typeof tippy !== 'undefined') {
        html.find('.attack-info').each(function() {
          const attackKey = $(this).data('attack');
          const attack = attacks[attackKey];
          if (attack && attack.tooltip) {
            try {
              const tippyInstance = tippy(this, {
                content: attack.tooltip,
                allowHTML: true,
                theme: 'axe-attack',
                placement: 'right',
                arrow: true,
                interactive: false,
                delay: [200, 0],
                duration: [300, 200],
                hideOnClick: false
              });
              // Store the Tippy instance on the DOM element itself
              this._tippy = Array.isArray(tippyInstance) ? tippyInstance[0] : tippyInstance;
            } catch (e) {
              console.warn('Failed to initialize tooltip for', attackKey, e);
            }
          }
        });
        console.log(`✅ Tooltips initialized for ${html.find('.attack-info').length} attack cards (attempt ${attempt})`);
      } else if (attempt < maxAttempts) {
        console.log(`⏳ Tippy.js not loaded yet, retrying... (attempt ${attempt} of ${maxAttempts})`);
        setTimeout(() => initTooltips(attempt + 1, maxAttempts), 200);
      } else {
        console.warn('❌ Tippy.js failed to load after ' + maxAttempts + ' attempts - tooltips will not be available');
      }
    };
    
    // Start tooltip initialization immediately (no delay needed)
    initTooltips();
    
    // Handle attack card clicks
    html.find('.attack-info').on('click', function() {
      if (attacksLocked) {
        ui.notifications.warn("Attacks are locked. Please wait...");
        return;
      }
      
      // Hide tooltip on click
      if (this._tippy) {
        this._tippy.hide();
      }
      
      const attackType = $(this).data('attack');
      execute(attackType, html);
    });
    
    // Handle AI toggle
    html.find('.ai-toggle-btn').on('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      useAI = !useAI;
      $(this).text(useAI ? "ON" : "OFF");
      $(this).toggleClass('disabled', !useAI);
      
      if (useAI) {
        ui.notifications.info("AI narratives enabled");
      } else {
        ui.notifications.info("AI narratives disabled");
      }
    });
    
    // Handle roll mode button clicks
    html.find('.roll-mode-btn').on('click', function() {
      html.find('.roll-mode-btn').removeClass('selected');
      $(this).addClass('selected');
      selectedMode = $(this).data('mode');
    });
  },
  default: "thrust",
  width: 420
});

dialog.render(true);

/* =====================================================
   EXECUTE ATTACK
===================================================== */

async function execute(type, html) {
  const atk = attacks[type];
  
  // Level requirement check
  if (atk.minLevel && characterLevel < atk.minLevel) {
    ui.notifications.error(`${atk.label} requires level ${atk.minLevel}. You are currently level ${characterLevel}.`);
    return;
  }
  
  // Show customization dialog
  const customization = await new Promise((resolve) => {
    new Dialog({
      title: `${atk.label} — Customize Attack`,
      content: `
        <style>
          .customize-dialog {
            display: flex;
            flex-direction: column;
            gap: 16px;
            padding: 8px;
          }
          
          .customize-section {
            background: #f9f9f9;
            border-radius: 6px;
            padding: 12px;
            border: 1.5px solid #ddd;
          }
          
          .customize-label {
            font-weight: bold;
            font-size: 13px;
            color: #333;
            margin-bottom: 6px;
            display: block;
          }
          
          .helper-text {
            font-size: 11px;
            color: #666;
            font-style: italic;
            margin-bottom: 8px;
          }
          
          .radio-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          
          .radio-option {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          
          .radio-option input[type="radio"] {
            margin: 0;
          }
          
          .radio-option label {
            font-size: 12px;
            cursor: pointer;
          }
          
          .text-input {
            width: 100%;
            padding: 8px;
            border: 1.5px solid #ddd;
            border-radius: 4px;
            font-size: 12px;
            font-family: inherit;
          }
          
          .text-input:focus {
            outline: none;
            border-color: #3498db;
          }
          
          .bypass-hint {
            text-align: center;
            font-size: 11px;
            color: #999;
            margin-top: 8px;
          }
        </style>
        
        <div class="customize-dialog">
          <div class="customize-section">
            <label class="customize-label">Called Shot?</label>
            <div class="helper-text">Target a specific area for narrative flavor</div>
            <div class="radio-group">
              <div class="radio-option">
                <input type="radio" id="called-none" name="called-shot" value="none" checked>
                <label for="called-none">None (Standard Attack)</label>
              </div>
              <div class="radio-option">
                <input type="radio" id="called-body" name="called-shot" value="body">
                <label for="called-body">Body Part (chest, head, leg, etc.)</label>
              </div>
              <div class="radio-option">
                <input type="radio" id="called-object" name="called-shot" value="object">
                <label for="called-object">Object (shield, gate, wall, etc.)</label>
              </div>
              <div class="radio-option">
                <input type="radio" id="called-creature" name="called-shot" value="creature">
                <label for="called-creature">Creature Type (dragon, giant, etc.)</label>
              </div>
            </div>
            <input type="text" 
                   class="text-input" 
                   id="called-detail" 
                   placeholder="Specify target (e.g., 'heart', 'gate', 'dragon')" 
                   style="margin-top: 8px;">
          </div>
          
          <div class="customize-section">
            <label class="customize-label">Additional Style?</label>
            <div class="helper-text">Add personality or flair to the attack description</div>
            <input type="text" 
                   class="text-input" 
                   id="style-detail" 
                   placeholder="e.g., 'with titanic force', 'roaring', 'coldly'">
            <div class="helper-text" style="margin-top: 6px; margin-bottom: 0;">
              Examples: "with the force of a landslide", "roaring a challenge", "with icy precision"
            </div>
          </div>
          
          <div class="bypass-hint">
            Press BYPASS to skip customization and attack normally
          </div>
        </div>
      `,
      buttons: {
        bypass: {
          icon: '<i class="fas fa-forward"></i>',
          label: "BYPASS",
          callback: () => resolve({ 
            calledShot: null, 
            calledDetail: null, 
            style: null 
          })
        },
        submit: {
          icon: '<i class="fas fa-check"></i>',
          label: "SUBMIT",
          callback: (html) => {
            const calledShot = html.find('input[name="called-shot"]:checked').val();
            const calledDetail = html.find('#called-detail').val().trim();
            const style = html.find('#style-detail').val().trim();
            
            resolve({
              calledShot: calledShot !== 'none' ? calledShot : null,
              calledDetail: calledDetail || null,
              style: style || null
            });
          }
        }
      },
      default: "bypass",
      close: () => resolve(null)
    }).render(true);
  });
  
  if (customization === null) return;
  
  const mode = selectedMode;

  let bonusAttack = 0;
  let bonusDamage = 0;

  for (const b of bonusSources) {
    const val = await evalFormula(b.formula, actor);
    if (b.affects === "attack") bonusAttack += val;
    if (b.affects === "damage") bonusDamage += val;
  }

  const toHit = strMod + prof + weaponAttackBonus + bonusAttack;
  const baseDamageFormula = `${atk.dice} + ${strMod} + ${weaponDamageBonus} + ${bonusDamage}`;

  const baseCritThreshold = getCritThreshold(actor);
  const critThreshold = Math.max(1, baseCritThreshold + (atk.critHitMod ?? 0));
  const critFailThreshold = 1 + (atk.critFailMod ?? 0);

  let base = "1d20";
  if (mode === "adv") base = "2d20kh";
  if (mode === "dis") base = "2d20kl";

  const attackRoll = await new Roll(`${base} + ${toHit}`).evaluate();
  game.dice3d?.showForRoll(attackRoll);

  const d20 = attackRoll.dice.find(d => d.faces === 20);
  const natural = d20 ? Math.max(...d20.results.map(r => r.result)) : null;

  const isCrit = natural !== null && natural >= critThreshold;
  const isFumble = natural !== null && natural <= critFailThreshold;

  let damageFormula = baseDamageFormula;
  if (isCrit) damageFormula = `${atk.dice}*2 + ${strMod} + ${weaponDamageBonus} + ${bonusDamage}`;

  const damageRoll = await new Roll(damageFormula).evaluate();
  game.dice3d?.showForRoll(damageRoll);

  // Generate AI narrative
  let flavorText = atk.flavor;
  if (useAI) {
    ui.notifications.info("Generating AI narrative...");
    
    let resultDesc = "normal hit";
    if (isCrit) resultDesc = "critical hit";
    if (isFumble) resultDesc = "critical fumble/miss";
    
    const aiNarrative = await generateNarrative(
      atk.label,
      atk.flavor,
      resultDesc,
      !isFumble ? damageRoll.total : null,
      actor.name,
      customization
    );
    
    if (aiNarrative) {
      flavorText = aiNarrative;
    }
  }

  // Build special effects text
  let specialText = "";
  
  if (atk.special === "extended" && !isFumble) {
    specialText = `
    <div style="background:#e8f4f8; border-left: 4px solid #17a2b8; padding: 8px; margin: 8px 0;">
      <strong>📏 Long Reach</strong>
      <p>Extended to maximum range! Attack has <strong>+5 feet reach</strong> this turn.</p>
      <p style="font-size:0.9em; color:#666;"><em>The massive spear keeps enemies at a distance.</em></p>
    </div>`;
  }
  
  if (atk.special === "knockback" && !isFumble) {
    specialText = `
    <div style="background:#fff3cd; border-left: 4px solid #ffc107; padding: 8px; margin: 8px 0;">
      <strong>💨 Haft Sweep</strong>
      <p>On hit, target is <strong>knocked back 10 feet</strong>.</p>
      <p style="font-size:0.9em; color:#666;"><em>The massive shaft sends enemies flying.</em></p>
    </div>`;
  }
  
  if (atk.special === "cleave" && !isFumble) {
    specialText = `
    <div style="background:#d4edda; border-left: 4px solid #28a745; padding: 8px; margin: 8px 0;">
      <strong>⚔️ Reaping Sweep</strong>
      <p>The massive sweep can hit <strong>up to 3 adjacent targets</strong> in a line.</p>
      <p style="font-size:0.9em; color:#666;"><em>Roll attack for each target within the 20-foot arc.</em></p>
    </div>`;
  }
  
  if (atk.special === "charge" && !isFumble) {
    specialText = `
    <div style="background:#f8d7da; border-left: 4px solid #dc3545; padding: 8px; margin: 8px 0;">
      <strong>⚡ Charging Lance</strong>
      <p>Required <strong>at least 20 feet of movement</strong> before this attack.</p>
      <p style="font-size:0.9em; color:#666;"><em>The momentum of a giant makes this devastating.</em></p>
    </div>`;
  }
  
  if (atk.special === "pin" && !isFumble) {
    specialText = `
    <div style="background:#fff3cd; border-left: 4px solid #ffc107; padding: 8px; margin: 8px 0;">
      <strong>📌 Pinning Strike</strong>
      <p>Target is <strong>restrained</strong>! DC 15 STR check to break free.</p>
      <p style="font-size:0.9em; color:#666;"><em>The spear pins the target to the ground or nearby surface.</em></p>
    </div>`;
  }
  
  if (atk.special === "spin" && !isFumble) {
    specialText = `
    <div style="background:#d1ecf1; border-left: 4px solid #17a2b8; padding: 8px; margin: 8px 0;">
      <strong>🌪️ Titan's Windmill</strong>
      <p>The spinning spear hits <strong>ALL creatures within 10 feet</strong>!</p>
      <p style="font-size:0.9em; color:#666;"><em>Make a separate attack roll for each enemy in range.</em></p>
    </div>`;
  }
  
  if (atk.special === "penetrate" && !isFumble) {
    specialText = `
    <div style="background:#f8d7da; border-left: 4px solid #dc3545; padding: 8px; margin: 8px 0;">
      <strong>🎯 Giant's Skewer</strong>
      <p>If damage exceeds target's HP, <strong>excess damage hits creature directly behind</strong>!</p>
      <p style="font-size:0.9em; color:#666;"><em>The steel point punches completely through.</em></p>
    </div>`;
  }
  
  if (atk.special === "quake" && !isFumble) {
    specialText = `
    <div style="background:#cce5ff; border-left: 4px solid #004085; padding: 8px; margin: 8px 0;">
      <strong>💥 Earthshaker</strong>
      <p>Hits <strong>ALL in 15-foot radius</strong>! DC 15 DEX save or be <strong>knocked prone</strong>.</p>
      <p style="font-size:0.9em; color:#666;"><em>The ground trembles from the titanic impact.</em></p>
    </div>`;
  }

  // Build modifier breakdowns for chat
  const sign = n => (n >= 0 ? `<span style="color:#2ecc71">+${n}</span>` : `<span style="color:#e74c3c">${n}</span>`);
  
  const attackMods = `
<ul>
  <li>STR: ${sign(strMod)}</li>
  <li>Proficiency: ${sign(prof)}</li>
  <li>Weapon: ${sign(weaponAttackBonus)}</li>
  <li>Other: ${sign(bonusAttack)}</li>
  <li><strong>Total:</strong> ${sign(toHit)}</li>
</ul>`;

  const damageMods = `
<ul>
  <li>Dice: ${atk.dice}</li>
  <li>STR: ${sign(strMod)}</li>
  <li>Weapon: ${sign(weaponDamageBonus)}</li>
  <li>Other: ${sign(bonusDamage)}</li>
</ul>`;

  const expandMods = isCrit || isFumble ? "open" : "";

  let critText = "";
  if (isCrit) {
    critText = critThreshold < 20
      ? `<p><strong>Critical Hit (${critThreshold}+)</strong></p>`
      : `<p><strong>Critical Hit (Natural 20)</strong></p>`;
  } else if (isFumble) {
    critText = `<p><strong style="color:#c0392b;">Critical Failure (Natural ${natural})</strong></p>`;
  }
  
  // Build customization text for chat
  let customText = "";
  if (customization && (customization.calledShot || customization.style)) {
    const parts = [];
    if (customization.calledShot && customization.calledDetail) {
      const targetType = {
        'body': '🎯 Body Part',
        'object': '🏰 Object',
        'creature': '🐉 Creature'
      }[customization.calledShot] || '🎯 Target';
      parts.push(`${targetType}: <em>${customization.calledDetail}</em>`);
    }
    if (customization.style) {
      parts.push(`✨ Style: <em>${customization.style}</em>`);
    }
    if (parts.length > 0) {
      customText = `<div style="background:#f0f8ff; border-left: 3px solid #3498db; padding: 6px 8px; margin: 8px 0; font-size: 0.9em;">
        ${parts.join(' • ')}
      </div>`;
    }
  }

  // Post to chat
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
<div class="dnd5e chat-card">
  <header class="card-header" style="display:flex; align-items:center; gap:12px;">
    <div>
      <div style="font-size:1.1em; font-weight:bold;">${actor.name}</div>
      <div style="font-size:1em;">⚔️ ${atk.label}</div>
    </div>
  </header>

  <div class="card-content">
    <p><em>${flavorText}</em></p>
    ${critText}
    ${customText}
    ${specialText}

    <h4>Attack Roll</h4>
    ${colorizeRoll(
      await attackRoll.render(),
      isCrit ? "#f8d7da" : isFumble ? "#d4edda" : "#eee"
    )}
    <details ${expandMods}>
      <summary><strong>Modifiers</strong></summary>
      ${attackMods}
    </details>

    <h4>Damage Roll</h4>
    ${colorizeRoll(
      await damageRoll.render(),
      isCrit ? "#f8d7da" : "#eee"
    )}
    <details ${expandMods}>
      <summary><strong>Modifiers</strong></summary>
      ${damageMods}
    </details>
  </div>
</div>
`
  });
  
  // Lock attacks for 10 seconds
  attacksLocked = true;
  const attackCards = html.find('.attack-info');
  attackCards.addClass('locked');
  
  // Disable all tooltips
  attackCards.each(function() {
    if (this._tippy) {
      this._tippy.disable();
      this._tippy.hide();
    }
  });
  
  // Clear any existing timer
  if (lockTimer) clearTimeout(lockTimer);
  
  // Unlock after 10 seconds
  lockTimer = setTimeout(() => {
    attacksLocked = false;
    attackCards.removeClass('locked');
    
    // Re-enable tooltips
    attackCards.each(function() {
      if (this._tippy) {
        this._tippy.enable();
      }
    });
    
    ui.notifications.info("Attacks ready!");
  }, 10000);
}
