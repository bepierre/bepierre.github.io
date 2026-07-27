const corpusUrl = "data/corpus.json";

const relationNames = { E: "supports", C: "contradicts", S: "silent" };
const relationOrder = { E: 0, C: 1, S: 2 };

const state = {
  data: null,
  currentCaseId: null,
  browseCommitmentId: null,
  initial: new Set(),
  current: new Set(),
  theory: new Set(),
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const byId = (items, id) => items.find((item) => item.id === id);
const pct = (value) => value == null ? "—" : `${Math.round(value * 100)}`;
const valueName = (key) => key.charAt(0).toUpperCase() + key.slice(1);

function valueTags(loadings, limit = 2) {
  return Object.entries(loadings)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, loading]) => `<span>${valueName(name)} ${Math.round(loading * 100)}</span>`)
    .join("");
}

function rationaleFor(principleId, commitmentId) {
  return state.data.relation_rationales.find(
    (item) => item.principle_id === principleId && item.commitment_ids.includes(commitmentId),
  )?.rationale;
}

function renderNavigation() {
  $$(".nav-tab").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".nav-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
      $$(".view").forEach((view) => view.classList.remove("active"));
      $(`#${button.dataset.view}-view`).classList.add("active");
      const url = new URL(window.location);
      button.dataset.view === "browse" ? url.searchParams.delete("view") : url.searchParams.set("view", button.dataset.view);
      history.replaceState(null, "", url);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function renderFamilyRail() {
  const root = $("#family-list");
  root.innerHTML = state.data.families.map((family) => `
    <section class="family-group">
      <div class="family-label">${family.title}</div>
      ${family.case_ids.map((caseId, index) => {
        const item = byId(state.data.cases, caseId);
        return `<button class="case-link" data-case-id="${caseId}">
          <span>${String(index + 1).padStart(2, "0")}</span>${item.title}
        </button>`;
      }).join("")}
    </section>
  `).join("");
  $$(".case-link").forEach((button) => button.addEventListener("click", () => selectCase(button.dataset.caseId)));
}

function selectCase(caseId) {
  state.currentCaseId = caseId;
  state.browseCommitmentId = null;
  const item = byId(state.data.cases, caseId);
  const family = byId(state.data.families, item.family_id);
  const globalIndex = state.data.cases.findIndex((candidate) => candidate.id === caseId) + 1;

  $$(".case-link").forEach((button) => button.classList.toggle("active", button.dataset.caseId === caseId));
  $("#case-number").textContent = String(globalIndex).padStart(2, "0");
  $("#case-family").textContent = family.title;
  $("#case-title").textContent = item.title;
  $("#case-summary").textContent = item.summary;
  $("#case-action").textContent = `${item.actor} can ${item.focal_action}.`;
  $("#case-source").textContent = `MoReBench row ${item.source.row} · ${item.source.category.replaceAll("_", " ")} · ${item.source.context}`;
  $("#rubric-evidence").innerHTML = item.rubric_evidence.map((evidence) => `<li>${evidence}</li>`).join("");
  $("#case-commitments").innerHTML = item.commitment_ids.map((commitmentId) => {
    const commitment = byId(state.data.commitments, commitmentId);
    return `<button class="commitment-card" data-commitment-id="${commitment.id}">
      <b>${commitment.operator.replace("_", " ")}</b><span>${commitment.statement}</span>
    </button>`;
  }).join("");
  $$(".commitment-card").forEach((button) => button.addEventListener("click", () => selectBrowseCommitment(button.dataset.commitmentId)));

  $("#principle-heading").textContent = "Select a commitment";
  $("#principle-subheading").textContent = "Principles will be ordered by how they bear on the selected verdict.";
  $("#principle-list").className = "principle-list empty-state";
  $("#principle-list").innerHTML = `<div class="empty-orbit"></div><p>A commitment gives the principles something to answer to.</p>`;
}

function selectBrowseCommitment(commitmentId) {
  state.browseCommitmentId = commitmentId;
  const commitment = byId(state.data.commitments, commitmentId);
  $$(".commitment-card").forEach((button) => button.classList.toggle("active", button.dataset.commitmentId === commitmentId));
  $("#principle-heading").textContent = commitment.statement;
  $("#principle-subheading").textContent = "These are defeasible relations authored for the demonstration corpus—not claims of moral truth.";

  const entries = state.data.principles.map((principle) => ({
    principle,
    relation: state.data.relation_matrix[principle.id][commitmentId],
    rationale: rationaleFor(principle.id, commitmentId),
  })).sort((a, b) => relationOrder[a.relation] - relationOrder[b.relation]);

  const root = $("#principle-list");
  root.className = "principle-list";
  root.innerHTML = entries.map(({ principle, relation, rationale }) => `
    <article class="principle-card" data-relation="${relation}">
      <div class="principle-meta"><span>${principle.id.slice(0, 3)} · ${principle.scope}</span><span class="${relation}">${relationNames[relation]}</span></div>
      <p>${principle.statement}</p>
      <div class="value-tags">${valueTags(principle.value_loadings)}</div>
      <small>${rationale || `Silent: ${state.data.metadata.silence_rationale}`}</small>
    </article>
  `).join("");
}

function renderCommitmentBuilder() {
  const root = $("#commitment-builder");
  root.innerHTML = state.data.families.map((family) => `
    <div class="builder-family">${family.title}</div>
    ${family.case_ids.flatMap((caseId) => byId(state.data.cases, caseId).commitment_ids).map((commitmentId) => {
      const commitment = byId(state.data.commitments, commitmentId);
      return `<div class="builder-item" data-commitment-id="${commitment.id}">
        <label>
          <input class="initial" type="checkbox" data-commitment-id="${commitment.id}" aria-label="Initial commitment">
          <input class="current" type="checkbox" data-commitment-id="${commitment.id}" aria-label="Current commitment">
          <span><b>${commitment.operator.replace("_", " ")}</b>${commitment.statement}</span>
        </label>
      </div>`;
    }).join("")}
  `).join("");

  $$("#commitment-builder input").forEach((input) => input.addEventListener("change", () => {
    const commitmentId = input.dataset.commitmentId;
    if (input.classList.contains("initial")) {
      input.checked ? state.initial.add(commitmentId) : state.initial.delete(commitmentId);
      if (input.checked) {
        state.current.add(commitmentId);
        const currentInput = document.querySelector(`#commitment-builder input.current[data-commitment-id="${commitmentId}"]`);
        currentInput.checked = true;
      }
    } else {
      input.checked ? state.current.add(commitmentId) : state.current.delete(commitmentId);
    }
    updateScores();
  }));
}

function renderPrincipleBuilder() {
  $("#principle-builder").innerHTML = state.data.principles.map((principle) => `
    <div class="builder-item principle" data-principle-id="${principle.id}">
      <label>
        <input class="principle-check" type="checkbox" data-principle-id="${principle.id}">
        <span><b>${principle.id.slice(0, 3)} · ${principle.scope}</b>${principle.statement}<span class="value-tags compact">${valueTags(principle.value_loadings)}</span></span>
      </label>
    </div>
  `).join("");
  $$("#principle-builder input").forEach((input) => input.addEventListener("change", () => {
    input.checked ? state.theory.add(input.dataset.principleId) : state.theory.delete(input.dataset.principleId);
    updateScores();
  }));
}

function clearRelationTrace() {
  $$("#commitment-builder .builder-item, #principle-builder .builder-item").forEach((item) => {
    item.classList.remove("relation-support", "relation-contradict", "relation-dim");
  });
}

function markRelation(item, relation) {
  item.classList.add(relation === "E" ? "relation-support" : relation === "C" ? "relation-contradict" : "relation-dim");
}

function wireRelationHover() {
  $$("#principle-builder .builder-item").forEach((item) => {
    item.addEventListener("mouseenter", () => {
      clearRelationTrace();
      item.classList.add("relation-support");
      $$("#commitment-builder .builder-item").forEach((commitmentItem) => {
        markRelation(commitmentItem, state.data.relation_matrix[item.dataset.principleId][commitmentItem.dataset.commitmentId]);
      });
    });
    item.addEventListener("mouseleave", clearRelationTrace);
  });

  $$("#commitment-builder .builder-item").forEach((item) => {
    item.addEventListener("mouseenter", () => {
      clearRelationTrace();
      item.classList.add("relation-support");
      $$("#principle-builder .builder-item").forEach((principleItem) => {
        markRelation(principleItem, state.data.relation_matrix[principleItem.dataset.principleId][item.dataset.commitmentId]);
      });
    });
    item.addEventListener("mouseleave", clearRelationTrace);
  });
}

function consequence(commitmentId) {
  const relations = [...state.theory].map((principleId) => state.data.relation_matrix[principleId][commitmentId]);
  return { supports: relations.includes("E"), contradicts: relations.includes("C") };
}

function calculateScores() {
  const commitments = state.data.commitments;
  const selectedCount = state.current.size;
  let accountTotal = 0;
  let unsupported = 0;
  let contradicted = 0;
  let theoryConflict = 0;
  let entailedContent = 0;

  commitments.forEach((commitment) => {
    const { supports, contradicts } = consequence(commitment.id);
    if (supports && !contradicts) entailedContent += 1;
    if (supports && contradicts) theoryConflict += 1;

    if (!state.current.has(commitment.id)) return;
    if (supports && !contradicts) { accountTotal += 1; return; }
    if (!supports && !contradicts) { accountTotal += 0.5; unsupported += 1; return; }
    if (supports && contradicts) { accountTotal += 0.5; contradicted += 1; return; }
    contradicted += 1;
  });

  const account = selectedCount && state.theory.size ? accountTotal / selectedCount : null;

  const systematicityRatio = state.theory.size / Math.max(1, state.theory.size + entailedContent);
  const systematicity = state.theory.size ? 1 - systematicityRatio ** 2 : null;

  let faithfulness = null;
  let faithfulnessDistance = null;
  let dropped = 0;
  let denied = 0;
  if (state.initial.size) {
    let penalty = 0;
    state.initial.forEach((initialId) => {
      if (state.current.has(initialId)) return;
      const isDenied = state.data.commitment_incompatibilities.some(({ commitment_ids: pair }) =>
        pair.includes(initialId) && pair.some((id) => id !== initialId && state.current.has(id)),
      );
      if (isDenied) { penalty += 1; denied += 1; }
      else { penalty += 0.5; dropped += 1; }
    });
    faithfulnessDistance = penalty / state.initial.size;
    faithfulness = 1 - faithfulnessDistance ** 2;
  }

  const incompatible = state.data.commitment_incompatibilities.filter(({ commitment_ids: pair }) => pair.every((id) => state.current.has(id)));
  let achievement = null;
  if (account != null && systematicity != null) {
    achievement = faithfulness == null
      ? (2 / 3) * account + (1 / 3) * systematicity
      : 0.5 * account + 0.25 * systematicity + 0.25 * faithfulness;
  }

  return {
    account, systematicity, systematicityRatio,
    faithfulness, faithfulnessDistance, achievement, entailedContent,
    unsupported, contradicted, theoryConflict, incompatible,
    dropped, denied,
  };
}

function setMetric(name, value) {
  $(`#${name}-score`).textContent = pct(value);
  $(`#${name}-meter`).style.width = value == null ? "0%" : `${value * 100}%`;
}

function renderValueProfile() {
  const root = $("#value-profile-bars");
  if (!state.theory.size) {
    root.innerHTML = "<p>Select principles to reveal their aggregate loading.</p>";
    return;
  }
  const dimensions = Object.keys(state.data.metadata.value_dimensions);
  const profile = Object.fromEntries(dimensions.map((dimension) => [
    dimension,
    [...state.theory].reduce((sum, principleId) => sum + byId(state.data.principles, principleId).value_loadings[dimension], 0) / state.theory.size,
  ]));
  root.innerHTML = dimensions.map((dimension) => `
    <div class="value-bar" title="${state.data.metadata.value_dimensions[dimension]}">
      <span>${valueName(dimension)}</span><i><b style="width:${profile[dimension] * 100}%"></b></i><strong>${Math.round(profile[dimension] * 100)}</strong>
    </div>
  `).join("");
}

function updateScores() {
  const scores = calculateScores();
  renderValueProfile();
  setMetric("account", scores.account);
  setMetric("systematicity", scores.systematicity);
  setMetric("faithfulness", scores.faithfulness);
  $("#achievement-score").textContent = pct(scores.achievement);
  $("#score-ring").style.strokeDashoffset = scores.achievement == null ? 327 : 327 * (1 - scores.achievement);

  if (scores.achievement == null) {
    $("#score-caption").textContent = "Select at least one current commitment and one principle.";
  } else if (scores.incompatible.length || scores.theoryConflict) {
    $("#score-caption").textContent = "The weighted fit is calculable, but this state fails a separate consistency condition.";
  } else {
    $("#score-caption").textContent = "A measure of epistemic fit—not a grade for moral correctness.";
  }

  const diagnostics = [];
  if (!state.initial.size) diagnostics.push(["warn", "No initial commitments: faithfulness is omitted and A/S weights are renormalized."]);
  if (scores.unsupported) diagnostics.push(["warn", `${scores.unsupported} current commitment${scores.unsupported === 1 ? " is" : "s are"} unsupported by the theory.`]);
  if (scores.contradicted) diagnostics.push(["bad", `${scores.contradicted} current commitment${scores.contradicted === 1 ? " is" : "s are"} contradicted or contested by the theory.`]);
  if (scores.theoryConflict) diagnostics.push(["bad", `The selected principles pull both ways on ${scores.theoryConflict} commitment${scores.theoryConflict === 1 ? "" : "s"}.`]);
  if (scores.incompatible.length) diagnostics.push(["bad", `${scores.incompatible.length} explicitly incompatible commitment pair${scores.incompatible.length === 1 ? " is" : "s are"} selected.`]);
  if (scores.dropped || scores.denied) diagnostics.push(["warn", `${scores.dropped} initial commitment${scores.dropped === 1 ? "" : "s"} dropped; ${scores.denied} denied by an incompatible current verdict.`]);
  if (scores.achievement != null && diagnostics.length === 0) diagnostics.push(["good", "No authored consistency conflict or unaccounted current commitment detected."]);
  $("#diagnostics").innerHTML = diagnostics.map(([kind, message]) => `<div class="diagnostic ${kind}">${message}</div>`).join("");
}

const explanations = {
  account: {
    title: "Account: does the theory fit the commitments?",
    body: `<p>Each current commitment receives 1 when supported without contradiction, 0.5 when the theory is silent or pulls both ways, and 0 when contradicted without support. Account is the mean of these item scores.</p><p>Unselected commitments are treated as undecided, not rejected. This deliberately departs from Beisbart et al.'s surplus-content penalty because this prototype records defeasible support rather than deductive theory closure.</p>`
  },
  systematicity: {
    title: "Systematicity: how much does a compact theory cover?",
    body: `<p>Let <code>|T|</code> be selected principles and <code>|content(T)|</code> be commitments supported without theoretical conflict. The prototype uses <code>r = |T| / (|T| + |content(T)|)</code>, then <code>S = 1 − r²</code>.</p><p>This adapts the formal model's inverse relationship between principle count and theory content. It rewards one principle that travels across cases more than several one-off principles.</p>`
  },
  faithfulness: {
    title: "Faithfulness: what happened to initial commitments?",
    body: `<p>For each initial commitment, preservation costs 0, omission costs 0.5, and replacement by an explicitly incompatible current commitment costs 1. New current commitments carry no penalty.</p><p>The normalized distance <code>Dꜰ</code> becomes <code>F = 1 − Dꜰ²</code>. If no initial set C₀ is selected, faithfulness is not defined and is omitted from the achievement score.</p>`
  },
};

function showDialog(title, body) {
  $("#dialog-content").innerHTML = `<h2>${title}</h2>${body}`;
  $("#explanation-dialog").showModal();
}

function wireControls() {
  $("#clear-commitments").addEventListener("click", () => {
    state.initial.clear(); state.current.clear();
    $$("#commitment-builder input").forEach((input) => { input.checked = false; });
    updateScores();
  });
  $("#clear-principles").addEventListener("click", () => {
    state.theory.clear();
    $$("#principle-builder input").forEach((input) => { input.checked = false; });
    updateScores();
  });
  $$(".info").forEach((button) => button.addEventListener("click", () => {
    const item = explanations[button.dataset.help];
    showDialog(item.title, item.body);
  }));
  $("#show-calculation").addEventListener("click", () => {
    const s = calculateScores();
    showDialog("This state's calculation", `
      <p><strong>Account:</strong> A = ${s.account == null ? "—" : s.account.toFixed(3)}. Unsupported: ${s.unsupported}; contradicted or dialectically contested: ${s.contradicted}. Unselected commitments are treated as undecided.</p>
      <p><strong>Systematicity:</strong> ${state.theory.size} principles generate ${s.entailedContent} unconflicted commitment consequences; S = ${s.systematicity == null ? "—" : s.systematicity.toFixed(3)}.</p>
      <p><strong>Faithfulness:</strong> Dꜰ = ${s.faithfulnessDistance == null ? "not defined" : s.faithfulnessDistance.toFixed(3)}; F = ${s.faithfulness == null ? "not defined" : s.faithfulness.toFixed(3)}.</p>
      <p><strong>Achievement:</strong> ${s.faithfulness == null ? "Z = ⅔A + ⅓S" : "Z = 0.50A + 0.25S + 0.25F"}; Z = ${s.achievement == null ? "—" : s.achievement.toFixed(3)}.</p>
      <p>Consistency remains a separate condition: ${s.incompatible.length} incompatible commitment pairs and ${s.theoryConflict} conflicted theoretical consequences.</p>
    `);
  });
  $(".dialog-close").addEventListener("click", () => $("#explanation-dialog").close());
}

function applyComposeQuery() {
  const params = new URLSearchParams(window.location.search);
  const specs = [
    ["initial", state.initial, "#commitment-builder input.initial", "commitmentId", state.data.commitments],
    ["current", state.current, "#commitment-builder input.current", "commitmentId", state.data.commitments],
    ["theory", state.theory, "#principle-builder input", "principleId", state.data.principles],
  ];
  specs.forEach(([name, target, selector, datasetKey, validItems]) => {
    const valid = new Set(validItems.map((item) => item.id));
    const requested = (params.get(name) || "").split(",").filter((id) => valid.has(id));
    requested.forEach((id) => target.add(id));
    $$(selector).forEach((input) => { input.checked = target.has(input.dataset[datasetKey]); });
  });
  if (!params.has("current") && state.initial.size) {
    state.initial.forEach((commitmentId) => state.current.add(commitmentId));
    $$("#commitment-builder input.current").forEach((input) => {
      input.checked = state.current.has(input.dataset.commitmentId);
    });
  }
}

async function init() {
  try {
    const response = await fetch(corpusUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    renderNavigation();
    renderFamilyRail();
    renderCommitmentBuilder();
    renderPrincipleBuilder();
    wireRelationHover();
    wireControls();
    applyComposeQuery();
    selectCase(state.data.cases[0].id);
    const requestedCommitment = new URLSearchParams(window.location.search).get("commitment");
    if (state.data.commitments.some((item) => item.id === requestedCommitment)) {
      const commitment = byId(state.data.commitments, requestedCommitment);
      selectCase(commitment.case_id);
      selectBrowseCommitment(commitment.id);
    }
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView === "compose") {
      document.querySelector(`.nav-tab[data-view="${requestedView}"]`).click();
    }
    updateScores();
  } catch (error) {
    document.body.innerHTML = `<main style="padding:3rem;font-family:sans-serif"><h1>Could not load the corpus</h1><p>${error.message}</p><p>Serve the repository root over HTTP, for example: <code>python3 -m http.server 8000</code>, then open <code>http://localhost:8000/site/</code>.</p></main>`;
  }
}

init();
