// =====================================================
// Mace of the Deepsong – ULTIMATE EDITION
// Weapon of Rodnar Stonehymn, Priest of Shayl
// (AI Narratives + Tooltips + Customization + Level Requirements)
// Version 1.2
// Fixed JS issue with timing of Tippy.js
// =====================================================

/* ---------- OPENAI CONFIGURATION ---------- */
const OPENAI_CONFIG = {
  apiKey: "sk-proj-", // Paste your OpenAI API key here
  model: "gpt-4o-mini",
  maxTokens: 150,
  temperature: 0.6
};

let sessionApiKey = "";

/* ---------- OPENAI API CALL ---------- */
async function generateNarrative(weaponName, weaponType, attackName, attackFlavor, result, damage, actorName, customization) {
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

  const prompt = `You are a dramatic combat narrator for a D&D 5e game using a specific weapon. Generate a vivid, concise combat description focusing on the attack action, not the result, (2-3 sentences max) for this attack:
Weapon: ${weaponName} (${weaponType})
Attack: ${attackName}
Context: ${attackFlavor}
Character: ${actorName} (Priest of Shayl, God of Minerals)
Result: ${result}
${damage ? `Damage: ${damage}` : ''}${customContext}

STRICT RULES:
- Describe ONLY a MACE attack (swing, arc, slam, ring, crush, haft, head).
- NEVER mention or imply other weapons (no sword, blade, axe, spear, dagger, bow, arrow, staff, gun).
- 2–3 sentences max, under 40 words.
- Focus on the action, not gore/impact details. No preamble. Use vivid action verbs. Keep it under 40 words.`;

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
            content: "You narrate ONLY mace attacks. Never mention swords, blades, axes, spears, daggers, bows, arrows, staves, or guns. Use mineral/divine imagery appropriate to Shayl. Keep it vivid and concise. No preamble or meta-commentary." 
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
  i.name.replace(/\s+/g, "").toLowerCase() === "maceofthedeepsong"
);
if (!weapon) {
  ui.notifications.error("Selected actor does not have Mace of the Deepsong equipped.");
  return;
}

/* ---------- CORE STATS ---------- */
const strMod = actor.system.abilities.str.mod ?? 0;
const wisMod = actor.system.abilities.wis.mod ?? 0;
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
  // NEW BASIC TECHNIQUES (Level 1-2)
  smash: {
    label: "Heavy Smash",
    flavor: "Raising the mace high overhead, bringing it down with crushing force.",
    dice: "1d8",
    critHitMod: 0,
    critFailMod: 1,
    category: "standard",
    minLevel: 1,
    tooltip: `<strong>Heavy Smash</strong><br>
<em>Powerful Overhead Strike</em><br><br>
<strong>Requires:</strong> Level 1+<br>
<strong>Damage:</strong> 1d8<br>
<strong>Crit Range:</strong> 20<br>
<strong>Fumble:</strong> 1-2 ⚠️<br><br>
<strong>Best For:</strong><br>
- High damage at early levels<br>
- Finishing wounded enemies<br>
- Breaking objects<br><br>
<strong>Tactics:</strong> Classic overhead swing. Good damage but you're overcommitted - higher fumble risk.`
  },
  swift: {
    label: "Swift Strike",
    flavor: "A quick horizontal swing, sacrificing power for speed and precision.",
    dice: "1d6",
    critHitMod: -1,
    critFailMod: 0,
    category: "standard",
    minLevel: 1,
    tooltip: `<strong>Swift Strike</strong><br>
<em>Fast Horizontal Swing</em><br><br>
<strong>Requires:</strong> Level 1+<br>
<strong>Damage:</strong> 1d6<br>
<strong>Crit Range:</strong> 19-20 ⭐<br>
<strong>Fumble:</strong> Only on 1<br><br>
<strong>Best For:</strong><br>
- When you need to hit reliably<br>
- Against high AC enemies<br>
- Crit-fishing at low levels<br><br>
<strong>Tactics:</strong> Lower damage but improved crit range. The speed allows for more precise strikes.`
  },
  guard: {
    label: "Guard Break",
    flavor: "A calculated strike designed to slip past shields and parries.",
    dice: "1d7",
    critHitMod: 0,
    critFailMod: 0,
    category: "standard",
    minLevel: 2,
    tooltip: `<strong>Guard Break</strong><br>
<em>Defensive Bypass Strike</em><br><br>
<strong>Requires:</strong> Level 2+<br>
<strong>Damage:</strong> 1d7<br>
<strong>Crit Range:</strong> 20<br>
<strong>Fumble:</strong> Only on 1<br><br>
<strong>Best For:</strong><br>
- Enemies with shields<br>
- Heavily armored foes<br>
- Reliable, safe damage<br><br>
<strong>Tactics:</strong> Perfectly balanced with no modifiers. Aimed at breaking through enemy defenses.`
  },
  crushing: {
    label: "Crushing Hymn",
    flavor: "Chanting Shayl's litany, the mace descends with divine weight, crushing all beneath.",
    dice: "1d8",
    critHitMod: -1,
    critFailMod: 0,
    category: "standard",
    minLevel: 3,
    tooltip: `<strong>Crushing Hymn</strong><br>
<em>Divine Crushing Strike</em><br><br>
<strong>Requires:</strong> Level 3+<br>
<strong>Damage:</strong> 1d8<br>
<strong>Crit Range:</strong> 19-20<br>
<strong>Fumble:</strong> Only on 1<br><br>
<strong>Best For:</strong><br>
• Reliable damage with improved crit<br>
• Divine channeling attacks<br>
• Breaking enemy defenses<br><br>
<strong>Tactics:</strong> Your go-to blessed strike when you need consistent divine damage with better crit chances.`
  },
  judgment: {
    label: "Stone's Judgment",
    flavor: "The mace rings out with mineral clarity, delivering Shayl's unyielding verdict.",
    dice: "1d7",
    critHitMod: 0,
    critFailMod: 0,
    category: "standard",
    minLevel: 4,
    tooltip: `<strong>Stone's Judgment</strong><br>
<em>Balanced Divine Strike</em><br><br>
<strong>Requires:</strong> Level 4+<br>
<strong>Damage:</strong> 1d7<br>
<strong>Crit Range:</strong> 20<br>
<strong>Fumble:</strong> Only on 1<br><br>
<strong>Best For:</strong><br>
• Consistent, safe damage<br>
• When you can't afford risks<br>
• Standard reliable combat<br><br>
<strong>Tactics:</strong> The safest option with no modifiers. Perfect when consistency matters more than spectacular results.`
  },
  earthshaker: {
    label: "Earthshaker",
    flavor: "Channeling the earth's fury, the priest drives the mace down in a hard swing.",
    dice: "1d10",
    critHitMod: 0,
    critFailMod: 1,
    category: "standard",
    minLevel: 5,
    tooltip: `<strong>Earthshaker</strong><br>
<em>Powerful Overhead Strike</em><br><br>
<strong>Requires:</strong> Level 5+<br>
<strong>Damage:</strong> 1d10<br>
<strong>Crit Range:</strong> 20<br>
<strong>Fumble:</strong> 1-2 ⚠️<br><br>
<strong>Best For:</strong><br>
• When you NEED to finish an enemy<br>
• High-stakes finishing blows<br>
• Dramatic divine wrath moments<br><br>
<strong>Tactics:</strong> Higher fumble risk (1-2) makes this risky. Use when victory is worth the danger.`
  },
  resonance: {
    label: "Crystal Resonance",
    flavor: "The mace hums with crystalline frequency, amplifying its destructive harmonics through solid matter.",
    dice: "1d12",
    critHitMod: 0,
    critFailMod: 2,
    category: "special",
    minLevel: 7,
    tooltip: `<strong>Crystal Resonance</strong><br>
<em>High Risk Sonic Strike</em><br><br>
<strong>Requires:</strong> Level 7+<br>
<strong>Damage:</strong> 1d12 💥<br>
<strong>Crit Range:</strong> 20<br>
<strong>Fumble:</strong> 1-3 ⚠️⚠️<br><br>
<strong>Best For:</strong><br>
• Maximum damage output<br>
• Boss fights / armored targets<br>
• When you have advantage<br><br>
<strong>Tactics:</strong> Highest base damage but fumbles on 1-3. The crystalline resonance is unstable but devastating.`
  },
  ward: {
    label: "Mineral Ward",
    flavor: "Sweeping the mace in a protective arc, mineral energy crystallizes into temporary armor.",
    dice: "1d4",
    critHitMod: 0,
    critFailMod: 0,
    special: "ward",
    category: "special",
    minLevel: 5,
    tooltip: `<strong>Mineral Ward</strong><br>
<em>Defensive Blessing Strike</em><br><br>
<strong>Requires:</strong> Level 5+<br>
<strong>Damage:</strong> 1d4<br>
<strong>Crit Range:</strong> 20<br>
<strong>Fumble:</strong> Only on 1<br>
<strong>Special:</strong> Grants temp HP<br><br>
<strong>Best For:</strong><br>
• When you need defense<br>
• Protecting yourself<br>
• Sustained combat encounters<br>
• Damage is only applied to those in 5' radius of Mineral Ward<br><br>
<strong>Tactics:</strong> Lower damage but grants temporary hit points equal to 1d8 + WIS mod for 5 rounds.`
  },
  deepsong: {
    label: "Deepsong Echo",
    flavor: "Striking with perfect pitch, the mace resonates with the deep song of ancient stone.",
    dice: "1d14",
    critHitMod: -2,
    critFailMod: -1,
    category: "special",
    minLevel: 6,
    tooltip: `<strong>Deepsong Echo</strong><br>
<em>Precise Harmonic Strike</em><br><br>
<strong>Requires:</strong> Level 6+<br>
<strong>Damage:</strong> 1d14<br>
<strong>Crit Range:</strong> 18-20 ⭐<br>
<strong>Fumble:</strong> Only on 1<br><br>
<strong>Best For:</strong><br>
• Crit fishing builds<br>
• High AC enemies<br>
• When you have advantage<br><br>
<strong>Tactics:</strong> The harmonic frequency finds weaknesses. Amazing with advantage!`
  },
  petrify: {
    label: "Petrifying Touch",
    flavor: "Infused with mineral essence, the mace's impact begins to calcify flesh and sinew.",
    dice: "1d10",
    critHitMod: 0,
    critFailMod: 0,
    special: "petrify",
    category: "special",
    minLevel: 9,
    tooltip: `<strong>Petrifying Touch</strong><br>
<em>Restraining Stone Magic</em><br><br>
<strong>Requires:</strong> Level 9+<br>
<strong>Damage:</strong> 1d10<br>
<strong>Crit Range:</strong> 20<br>
<strong>Fumble:</strong> Only on 1<br>
<strong>Special:</strong> Restrain (STR save)<br><br>
<strong>Best For:</strong><br>
• Controlling dangerous enemies<br>
• Setting up team attacks<br>
• Immobilizing spellcasters<br><br>
<strong>Tactics:</strong> Effects last for 1+1d4 rounds. Restrained enemies grant advantage!`
  }
};

/* ---------- STYLED ATTACK MENU ---------- */
let selectedMode = "normal";
let useAI = true;
let attacksLocked = false;
let lockTimer = null;

const dialog = new Dialog({
  title: "Mace of the Deepsong — Choose Attack",
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
        background: linear-gradient(175deg, #a68966 10%, #c2a886 50%, #b09473 100%);
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
        background: linear-gradient(135deg, #b87333 0%, #df9b6d 50%, #b87333 100%);
        border-radius: 6px;
        padding: 9px;
        border: 1.5px solid #b3d9e8;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .ai-toggle-label {
        font-weight: bold;
        font-size: 16px;
        color: #fff;
        margin-bottom: 6px;
        padding-bottom: 3px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        text-shadow: 1px 1px 2px #1c1c1c;
        flex: 1;
      }
      
      .ai-toggle-btn {
        padding: 4px 12px;
        border: 1.5px solid #4a90e2;
        background: linear-gradient(135deg, #a68966 0%, #c2a886 50%, #b09473 100%);
        color: green;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
        font-size: 10px;
        transition: all 0.2s;
      }
      
      .ai-toggle-btn:hover {
        transform: scale(1.05);
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
      
      .ai-toggle-btn.disabled {
        background: #999;
        border-color: #666;
        color: #fff;
      }
      
      .ai-toggle-btn.disabled:hover {
        transform: scale(1.05);
        background: #777;
      }
      
      .roll-mode-section {
        background: linear-gradient(135deg, #b87333 0%, #df9b6d 50%, #b87333 100%);
        border-radius: 6px;
        padding: 9px;
        border: 1.5px solid #ddd;
      }
      
      .roll-mode-label {
        font-weight: bold;
        font-size: 16px;
        color: #fff;
        margin-bottom: 12px;
        padding-bottom: 10px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        text-shadow: 1px 1px 2px #1c1c1c;
      }
      
      .roll-mode-buttons {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
      }
      
      .roll-mode-btn {
        padding: 4px 6px;
        border: 1.5px solid #999;
        background: white;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
        font-size: 14px;
        transition: all 0.2s;
        text-align: center;
      }
      
      .roll-mode-btn:hover {
        background: #e8e8e8;
        border-color: #666;
      }
      
      .roll-mode-btn.selected {
        background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #002366 100%);
        color: white;
        border-color: #2e5c8a;
      }
      
      .attack-category {
        margin-bottom: 9px;
      }
      
      .category-title {
        font-weight: bold;
        font-size: 16px;
        color: #fff;
        margin-bottom: 6px;
        padding-bottom: 3px;
        border-bottom: 1.5px solid #1c1c1c;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        text-shadow: 1px 1px 2px #1c1c1c;
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
        color: black;
        line-height: 1.3;
        cursor: pointer;
        transition: all 0.2s;
        position: relative;
        border: 1.5px solid transparent;
        min-height: 60px;
      }

      .attack-info.divine-card {
        background: linear-gradient(185deg, #b87333 0%, #df9b6d 50%, #b87333 100%);
        border-color: #8e5431;
      }

      .attack-info.mineral-card {
        background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #002366 100%);
        border-color: #c5a059;
      }
      
      .attack-info:hover {
        transform: translateY(-2px);
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        filter: brightness(1.1);
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
        color: #000;
        font-weight: bold;
      }
      
      .attack-stat {
        display: inline-block;
        margin-right: 9px;
        white-space: nowrap;
      }
      
      .stat-label {
        font-weight: 300;
        color: #1c1c1c;
      }
      
      /* Tippy tooltip styling */
      .tippy-box[data-theme~='mace-attack'] {
        background-color: #2c3e50;
        color: #ecf0f1;
        font-size: 12px;
        max-width: 300px;
        border: 2px solid #34495e;
      }
      
      .tippy-box[data-theme~='mace-attack'] .tippy-content {
        padding: 12px;
        line-height: 1.5;
      }
      
      .tippy-box[data-theme~='mace-attack'] strong {
        color: #3498db;
      }
      
      .tippy-box[data-theme~='mace-attack'] em {
        color: #e67e22;
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
  <div class="category-title">⚔️ Divine Strikes</div>
  <div class="attack-grid">
    <div class="attack-info divine-card" data-attack="smash">
      <strong>Heavy Smash</strong><br>
      <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d8</span>
      <span class="attack-stat"><span class="stat-label">Fumble:</span> 1-2</span>
    </div>
    <div class="attack-info divine-card" data-attack="swift">
      <strong>Swift Strike</strong><br>
      <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d6</span>
      <span class="attack-stat"><span class="stat-label">Crit:</span> 19+</span>
    </div>
  </div>
  <div class="attack-grid" style="margin-top: 6px;">
    <div class="attack-info divine-card" data-attack="guard">
      <strong>Guard Break</strong><br>
      <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d7</span>
      <span class="attack-stat"><span class="stat-label">Balanced</span></span>
    </div>
    <div class="attack-info divine-card" data-attack="crushing">
      <strong>Crushing Hymn</strong><br>
      <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d8</span>
      <span class="attack-stat"><span class="stat-label">Crit:</span> 19+</span>
    </div>
  </div>
  <div class="attack-grid" style="margin-top: 6px;">
    <div class="attack-info divine-card" data-attack="judgment">
      <strong>Stone's Judgment</strong><br>
      <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d7</span>
      <span class="attack-stat"><span class="stat-label">Balanced</span></span>
    </div>
    <div class="attack-info divine-card" data-attack="earthshaker">
      <strong>Earthshaker</strong><br>
      <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d10</span>
      <span class="attack-stat"><span class="stat-label">Fumble:</span> 1-2</span>
    </div>
  </div>
</div>      
      <div class="attack-category">
        <div class="category-title">✨ Mineral Miracles</div>
        <div class="attack-grid">
          <div class="attack-info mineral-card" data-attack="resonance">
            <strong>💎 Crystal Resonance</strong><br>
            <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d12</span>
            <span class="attack-stat"><span class="stat-label">Fumble:</span> 1-3</span>
          </div>
          <div class="attack-info mineral-card" data-attack="ward">
            <strong>🛡️ Mineral Ward</strong><br>
            <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d4</span>
            <span class="attack-stat"><span class="stat-label">Temp HP</span></span>
          </div>
        </div>
        <div class="attack-grid" style="margin-top: 6px;">
          <div class="attack-info mineral-card" data-attack="deepsong">
            <strong>🎵 Deepsong Echo</strong><br>
            <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d14</span>
            <span class="attack-stat"><span class="stat-label">Crit:</span> 18+</span>
          </div>
          <div class="attack-info mineral-card" data-attack="petrify">
            <strong>🗿 Petrifying Touch</strong><br>
            <span class="attack-stat"><span class="stat-label">Dmg:</span> 1d10</span>
            <span class="attack-stat"><span class="stat-label">Restrain</span></span>
          </div>
        </div>
      </div>
    </div>
  `,
  buttons: {},
  render: (html) => {
    // Handle attack card clicks
    html.find('.attack-info').click(function() {
      // Check if attacks are locked
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
    html.find('.ai-toggle-btn').click(function(e) {
      e.preventDefault();
      e.stopPropagation();
      useAI = !useAI;
      $(this).text(useAI ? "ON" : "OFF");
      $(this).toggleClass('disabled', !useAI);
      
      // Visual feedback
      if (useAI) {
        ui.notifications.info("AI narratives enabled");
      } else {
        ui.notifications.info("AI narratives disabled");
      }
    });
    
    // Handle roll mode button clicks
    html.find('.roll-mode-btn').click(function() {
      html.find('.roll-mode-btn').removeClass('selected');
      $(this).addClass('selected');
      selectedMode = $(this).data('mode');
    });
    
    // Initialize Tippy.js tooltips with retry mechanism
    const initTooltips = (attempt = 1, maxAttempts = 10) => {
      if (typeof tippy !== 'undefined') {
        html.find('.attack-info').each(function() {
          const attackKey = $(this).data('attack');
          const attack = attacks[attackKey];
          if (attack && attack.tooltip) {
            try {
              const instance = tippy(this, {
                content: attack.tooltip,
                allowHTML: true,
                theme: 'mace-attack',
                placement: 'right',
                arrow: true,
                interactive: false,
                delay: [200, 0],
                duration: [300, 200],
                hideOnClick: false
              });
              // Store the Tippy instance on the element
              this._tippy = Array.isArray(instance) ? instance[0] : instance;
            } catch (e) {
              console.warn('Failed to initialize tooltip for', attackKey, e);
            }
          }
        });
        console.log('Tooltips initialized for', html.find('.attack-info').length, 'attack cards (attempt', attempt + ')');
      } else if (attempt < maxAttempts) {
        console.log('Tippy.js not loaded yet, retrying... (attempt', attempt, 'of', maxAttempts + ')');
        setTimeout(() => initTooltips(attempt + 1, maxAttempts), 200);
      } else {
        console.warn('Tippy.js failed to load after', maxAttempts, 'attempts - tooltips will not be available');
      }
    };
    
    // Start initialization after small delay
    setTimeout(() => initTooltips(), 100);
  },
  default: "crushing",
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
            border-color: #4a90e2;
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
                <label for="called-body">Body Part (head, arm, leg, etc.)</label>
              </div>
              <div class="radio-option">
                <input type="radio" id="called-object" name="called-shot" value="object">
                <label for="called-object">Object (shield, weapon, armor, etc.)</label>
              </div>
              <div class="radio-option">
                <input type="radio" id="called-creature" name="called-shot" value="creature">
                <label for="called-creature">Creature Type (goblin, dragon, etc.)</label>
              </div>
            </div>
            <input type="text" 
                   class="text-input" 
                   id="called-detail" 
                   placeholder="Specify target (e.g., 'left arm', 'shield', 'goblin')" 
                   style="margin-top: 8px;">
          </div>
          
          <div class="customize-section">
            <label class="customize-label">Additional Style?</label>
            <div class="helper-text">Add personality or flair to the attack description</div>
            <input type="text" 
                   class="text-input" 
                   id="style-detail" 
                   placeholder="e.g., 'with divine fury', 'solemnly', 'righteously', 'in prayer'">
            <div class="helper-text" style="margin-top: 6px; margin-bottom: 0;">
              Examples: "with divine fury", "solemnly", "righteously", "while chanting prayers"
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

 /* =====================================================
   FIX #2: Correct crit/fumble detection for adv/dis
   - In Foundry, dice results include an `active` flag.
   - For 2d20kh / 2d20kl, ONLY ONE d20 result is "kept"
     (active=true). That is the natural roll that matters.
   - Your old code always took Math.max(), which breaks
     disadvantage (it should use the LOWER kept die).
===================================================== */

const d20 = attackRoll.dice.find(d => d.faces === 20);

// Prefer the kept/used die result (active === true).
// This correctly handles:
//   - 1d20 (single result is active)
//   - 2d20kh (keeps highest)
//   - 2d20kl (keeps lowest)
const keptResult = d20?.results?.find(r => r.active);

// Fallback: if Foundry didn't mark `active` for some reason,
// use the first result as a safe default.
const natural = keptResult?.result ?? d20?.results?.[0]?.result ?? null;

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
  weapon.name,
  "mace",
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

  // Calculate special effects once (shared between overlay and chat)
  let tempHPRoll = null;
  let saveDC = null;
  
if (atk.special === "ward" && !isFumble) {
  /* =====================================================
     MINERAL WARD – APPLY TEMP HP TO ACTOR
     - Rolls the ward bonus (currently 1d6 + WIS mod)
     - Applies it to the actor as temporary hit points
     - Temp HP does NOT stack in 5e, so we keep the higher value
  ===================================================== */

  tempHPRoll = await new Roll(`1d6 + ${wisMod}`).evaluate();
  game.dice3d?.showForRoll(tempHPRoll);

  // Safety: Make sure we can actually update this actor
  if (!actor.isOwner) {
    ui.notifications.warn("Mineral Ward rolled temp HP, but you don't have permission to update this actor.");
  } else {
    // Foundry dnd5e temp HP lives here
    const currentTemp = Number(actor.system?.attributes?.hp?.temp ?? 0);

    // 5e rule: temp HP doesn't stack; take the higher value
    const newTemp = Math.max(currentTemp, tempHPRoll.total);

    // Only update if it actually increases temp HP
    if (newTemp > currentTemp) {
      await actor.update({ "system.attributes.hp.temp": newTemp });
      ui.notifications.info(`Mineral Ward applied: Temp HP is now ${newTemp}.`);
    } else {
      ui.notifications.info(`Mineral Ward rolled ${tempHPRoll.total}, but current Temp HP (${currentTemp}) is higher.`);
    }
  }
}
  
  if (atk.special === "petrify" && !isFumble) {
    saveDC = 8 + prof + wisMod;
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
        'object': '🛡️ Object',
        'creature': '🐉 Creature'
      }[customization.calledShot] || '🎯 Target';
      parts.push(`${targetType}: <em>${customization.calledDetail}</em>`);
    }
    if (customization.style) {
      parts.push(`✨ Style: <em>${customization.style}</em>`);
    }
    if (parts.length > 0) {
      customText = `<div style="background:#f0f8ff; border-left: 3px solid #4a90e2; padding: 6px 8px; margin: 8px 0; font-size: 0.9em;">
        ${parts.join(' • ')}
      </div>`;
    }
  }

  // Build special effects for chat
  let specialText = "";
  
  if (tempHPRoll) {
    specialText = `
    <div style="background:#d4edda; border-left: 4px solid #28a745; padding: 8px; margin: 8px 0;">
      <strong>🛡️ Mineral Ward</strong>
      <p>Crystalline energy coalesces into protective armor, granting <strong>${tempHPRoll.total} temporary hit points</strong>.</p>
      <p style="font-size:0.9em; color:#666;"><em>The blessing of Shayl protects the faithful.</em></p>
    </div>`;
  }
  
  if (saveDC) {
    specialText = `
    <div style="background:#fff3cd; border-left: 4px solid #ffc107; padding: 8px; margin: 8px 0;">
      <strong>🗿 Petrifying Touch</strong>
      <p>Target must make a DC ${saveDC} Strength saving throw or be <strong>restrained</strong> until the end of your next turn.</p>
      <p style="font-size:0.9em; color:#666;"><em>Their limbs begin to stiffen and calcify as mineral essence takes hold.</em></p>
    </div>`;
  }

  // Post to chat

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
<div class="dnd5e chat-card">
  <header class="card-header" style="display:flex; align-items:center; gap:12px;">
    <div>
      <div style="font-size:1.1em; font-weight:bold;">${actor.name}</div>
      <div style="font-size:1em;">🔨 ${atk.label}</div>
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
