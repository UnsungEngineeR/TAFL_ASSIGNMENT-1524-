

let cy = null;
let currentNFA = null;
let stateCounter = 0;
let alphabet = new Set();
let currentView = 'nfa-graph';

document.addEventListener('DOMContentLoaded', () => {
    cytoscape.use(cytoscapeDagre);
    
    document.getElementById('btn-generate').addEventListener('click', handleGenerate);
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('btn-simulate').addEventListener('click', animateSimulation);
    
    // Feature: Export PNG
    document.getElementById('btn-export').addEventListener('click', exportPNG);
    
    // Feature: Reset Layout
    document.getElementById('btn-reset-layout').addEventListener('click', resetLayout);
    
    // Feature: Preloaded Examples
    document.querySelectorAll('.btn-example').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.getElementById('regex-input').value = e.target.getAttribute('data-regex');
            handleGenerate();
        });
    });
    
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentView = e.target.getAttribute('data-view');
            renderCurrentView(false);
        });
    });
});

function toggleTheme() {
    const body = document.body;
    if (body.getAttribute('data-theme') === 'dark') {
        body.removeAttribute('data-theme');
    } else {
        body.setAttribute('data-theme', 'dark');
    }
    if (cy) renderCurrentView(false);
}

function showError(msg) {
    const errDiv = document.getElementById('error-message');
    errDiv.textContent = msg;
    errDiv.classList.remove('hidden');
}

function exportPNG() {
    if (!cy || cy.nodes().length === 0) return showError("Generate a graph first to export.");
    
    const isDark = document.body.hasAttribute('data-theme');
    const bgColor = isDark ? '#0f172a' : '#f8fafc';
    const textColor = isDark ? '#f8fafc' : '#0f172a';
    const primaryColor = isDark ? '#60a5fa' : '#2563eb';

    // 1. Get the raw graph image from Cytoscape
    const graphDataURI = cy.png({ full: true, scale: 2, bg: 'transparent' });
    const graphImg = new Image();
    
    graphImg.onload = function() {
        // 2. Create a hidden HTML5 canvas to combine text + graph
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const padding = 40;
        const headerHeight = 250; 
        
        // Ensure canvas is wide enough for text even if the graph is small
        canvas.width = Math.max(graphImg.width, 800) + (padding * 2);
        canvas.height = graphImg.height + headerHeight + padding;

        // 3. Paint Background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 4. Draw Header Text (Regex)
        const regex = document.getElementById('regex-input').value.trim();
        ctx.fillStyle = primaryColor;
        ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        let y = padding + 30;
        ctx.fillText(`Regular Expression: ${regex}`, padding, y);
        
        // 5. Draw NFA Formal Details
        ctx.fillStyle = textColor;
        ctx.font = '18px monospace';
        y += 50;
        ctx.fillText(`Postfix: ${document.getElementById('def-postfix').textContent}`, padding, y);
        y += 35;
        ctx.fillText(`Q (States): ${document.getElementById('def-Q').textContent}`, padding, y);
        y += 35;
        ctx.fillText(`Σ (Alphabet): ${document.getElementById('def-Sigma').textContent}`, padding, y);
        y += 35;
        ctx.fillText(`q₀ (Start): ${document.getElementById('def-q0').textContent}`, padding, y);
        y += 35;
        ctx.fillText(`F (Final): ${document.getElementById('def-F').textContent}`, padding, y);

        // 6. Draw the Graph Image below the text
        ctx.drawImage(graphImg, padding, headerHeight);

        // 7. Trigger the Download
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `NFA_${regex.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        a.click();
    };
    
    graphImg.src = graphDataURI;
}

function resetLayout() {
    if (cy) {
        cy.layout({ name: 'dagre', rankDir: 'LR', nodeSep: 50, edgeSep: 50, rankSep: 70 }).run();
    }
}

// --- 1. Parsing & NFA Construction (Thompson's) ---
function insertExplicitConcat(exp) {
    let output = "";
    for (let i = 0; i < exp.length; i++) {
        let c1 = exp[i], c2 = exp[i + 1];
        output += c1;
        if (i + 1 < exp.length && /[a-zA-Z0-9*+)]/.test(c1) && /[a-zA-Z0-9(]/.test(c2)) output += ".";
    }
    return output;
}

function toPostfix(exp) {
    let output = "", stack = [];
    const precedence = { '*': 3, '+': 3, '.': 2, '|': 1, '(': 0 };
    for (let char of exp) {
        if (/[a-zA-Z0-9]/.test(char)) output += char;
        else if (char === '(') stack.push(char);
        else if (char === ')') {
            while (stack.length && stack[stack.length - 1] !== '(') output += stack.pop();
            stack.pop();
        } else {
            while (stack.length && precedence[stack[stack.length - 1]] >= precedence[char]) output += stack.pop();
            stack.push(char);
        }
    }
    while (stack.length) output += stack.pop();
    return output;
}

class Transition { constructor(to, symbol = 'ε') { this.to = to; this.symbol = symbol; } }
class State { constructor(id) { this.id = id; this.transitions = []; } }
class NFA { constructor(start, end) { this.start = start; this.end = end; } }

function createSymbolNFA(symbol) {
    alphabet.add(symbol);
    let start = new State(stateCounter++), end = new State(stateCounter++);
    start.transitions.push(new Transition(end, symbol));
    return new NFA(start, end);
}
function concatNFA(nfa1, nfa2) {
    nfa1.end.transitions.push(new Transition(nfa2.start, 'ε'));
    return new NFA(nfa1.start, nfa2.end);
}
function unionNFA(nfa1, nfa2) {
    let start = new State(stateCounter++), end = new State(stateCounter++);
    start.transitions.push(new Transition(nfa1.start, 'ε'), new Transition(nfa2.start, 'ε'));
    nfa1.end.transitions.push(new Transition(end, 'ε')), nfa2.end.transitions.push(new Transition(end, 'ε'));
    return new NFA(start, end);
}
function kleeneStarNFA(nfa) {
    let start = new State(stateCounter++), end = new State(stateCounter++);
    start.transitions.push(new Transition(nfa.start, 'ε'), new Transition(end, 'ε'));
    nfa.end.transitions.push(new Transition(nfa.start, 'ε'), new Transition(end, 'ε'));
    return new NFA(start, end);
}
function plusNFA(nfa) {
    let start = new State(stateCounter++);
    let end = new State(stateCounter++);
    start.transitions.push(new Transition(nfa.start, 'ε'));
    nfa.end.transitions.push(new Transition(nfa.start, 'ε')); 
    nfa.end.transitions.push(new Transition(end, 'ε'));
    return new NFA(start, end);
}

function buildNFA(postfix) {
    stateCounter = 0;
    alphabet.clear();
    let stack = [];
    for (let char of postfix) {
        if (/[a-zA-Z0-9]/.test(char)) stack.push(createSymbolNFA(char));
        else if (char === '*') stack.push(kleeneStarNFA(stack.pop()));
        else if (char === '+') stack.push(plusNFA(stack.pop()));
        else if (char === '.') { let n2 = stack.pop(), n1 = stack.pop(); stack.push(concatNFA(n1, n2)); }
        else if (char === '|') { let n2 = stack.pop(), n1 = stack.pop(); stack.push(unionNFA(n1, n2)); }
    }
    return stack.pop();
}

function getEpsilonClosure(states) {
    let closure = new Set(states), stack = [...states];
    while (stack.length) {
        let curr = stack.pop();
        for (let t of curr.transitions) {
            if (t.symbol === 'ε' && !closure.has(t.to)) {
                closure.add(t.to);
                stack.push(t.to);
            }
        }
    }
    return closure;
}

// --- 2. Rendering Logic & Smart Edge Routing ---
function handleGenerate() {
    document.getElementById('error-message').classList.add('hidden');
    
    let rawInput = document.getElementById('regex-input').value.trim();
    let sanitizedInput = rawInput
        .replace(/[⁺⁺₊\u207A\u208A]/g, '+') 
        .replace(/[⁎∗\u204E\u2217]/g, '*');

    if (!sanitizedInput) return;

    try {
        // Feature: Show Postfix Step
        let postfixStr = toPostfix(insertExplicitConcat(sanitizedInput));
        currentNFA = buildNFA(postfixStr);
        
        document.querySelector('[data-view="nfa-graph"]').click();
        updateFormalDefinition(currentNFA, postfixStr);
        renderCurrentView(true);
        resetSimulationUI();
    } catch (err) {
        showError(err.message);
    }
}

function updateFormalDefinition(nfa, postfixStr) {
    const defContainer = document.getElementById('formal-definition');
    if (!nfa) {
        if(defContainer) defContainer.classList.add('hidden');
        return;
    }

    let visited = new Set();
    let queue = [nfa.start];
    visited.add(nfa.start.id);

    while (queue.length > 0) {
        let curr = queue.shift();
        for (let t of curr.transitions) {
            if (!visited.has(t.to.id)) {
                visited.add(t.to.id);
                queue.push(t.to);
            }
        }
    }

    let Q_arr = Array.from(visited).sort((a, b) => a - b).map(id => `q${id}`);
    let sigma_arr = Array.from(alphabet).sort();
    
    if(document.getElementById('def-Q')) {
        document.getElementById('def-postfix').textContent = postfixStr;
        document.getElementById('def-Q').textContent = `{ ${Q_arr.join(', ')} }`;
        document.getElementById('def-Sigma').textContent = sigma_arr.length > 0 ? `{ ${sigma_arr.join(', ')} }` : '∅';
        document.getElementById('def-q0').textContent = `q${nfa.start.id}`;
        document.getElementById('def-F').textContent = `{ q${nfa.end.id} }`;
        defContainer.classList.remove('hidden');
    }
}

function resetSimulationUI() {
    const statusDiv = document.getElementById('sim-status');
    statusDiv.className = 'sim-status';
    statusDiv.textContent = 'Waiting for input...';
    if (cy) cy.elements().removeClass('cy-active-node cy-active-edge');
}

function renderCurrentView(animateBuild = false) {
    const cyContainer = document.getElementById('cy');
    const tableContainer = document.getElementById('table-container');

    if (currentView === 'nfa-graph') {
        cyContainer.classList.remove('hidden');
        tableContainer.classList.add('hidden');
        renderGraph(getNFAElements(), animateBuild);
    } else {
        cyContainer.classList.add('hidden');
        tableContainer.classList.remove('hidden');
        renderNFATable();
    }
}

function getNFAElements() {
    let elements = [], visited = new Set(), queue = [currentNFA.start];
    let rawEdges = [];
    visited.add(currentNFA.start.id);

    while (queue.length) {
        let curr = queue.shift();
        let classes = curr.id === currentNFA.start.id ? 'start' : '';
        if (curr.id === currentNFA.end.id) classes += ' accept';
        
        elements.push({ data: { id: `q${curr.id}`, label: `q${curr.id}` }, classes });
        
        for (let t of curr.transitions) {
            rawEdges.push({ source: curr.id, target: t.to.id, symbol: t.symbol });
            if (!visited.has(t.to.id)) { visited.add(t.to.id); queue.push(t.to); }
        }
    }

    let pairEdgeCount = {};
    for (let e of rawEdges) {
        let pairKey = e.source < e.target ? `${e.source}-${e.target}` : `${e.target}-${e.source}`;
        pairEdgeCount[pairKey] = (pairEdgeCount[pairKey] || 0) + 1;
    }

    for (let e of rawEdges) {
        let pairKey = e.source < e.target ? `${e.source}-${e.target}` : `${e.target}-${e.source}`;
        let isLoop = e.source === e.target;

        if (isLoop) {
            elements.push({ data: { source: `q${e.source}`, target: `q${e.target}`, label: e.symbol }, classes: 'loop-edge' });
        } else if (e.source > e.target) {
            elements.push({ 
                data: { source: `q${e.source}`, target: `q${e.target}`, label: e.symbol },
                classes: 'backward-loop'
            });
        } else if (pairEdgeCount[pairKey] > 1) {
            elements.push({ 
                data: { source: `q${e.source}`, target: `q${e.target}`, label: e.symbol },
                classes: 'curved-edge'
            });
        } else {
            elements.push({ data: { source: `q${e.source}`, target: `q${e.target}`, label: e.symbol }, classes: 'straight-edge' });
        }
    }
    
    return elements;
}

function renderGraph(elements, animateBuild) {
    if (cy) cy.destroy();
    const isDark = document.body.hasAttribute('data-theme');
    
    cy = cytoscape({
        container: document.getElementById('cy'),
        elements: elements,
        style: [
            { selector: 'node', style: { 'width': '35px', 'height': '35px', 'background-color': isDark ? '#1e293b' : '#fff', 'border-width': 2, 'border-color': '#2563eb', 'label': 'data(label)', 'text-valign': 'center', 'color': isDark ? '#f8fafc' : '#0f172a', 'font-size': '12px' } },
            { selector: 'node.start', style: { 'background-color': isDark ? '#1e3a8a' : '#dbeafe', 'border-color': '#2563eb' } },
            { selector: 'node.accept', style: { 'border-width': 4, 'border-color': '#059669', 'border-style': 'double' } },
            
            { selector: 'edge', style: { 'width': 2, 'line-color': isDark ? '#475569' : '#cbd5e1', 'target-arrow-color': isDark ? '#475569' : '#cbd5e1', 'target-arrow-shape': 'triangle', 'label': 'data(label)', 'text-background-color': isDark ? '#0f172a' : '#f8fafc', 'text-background-opacity': 1, 'text-background-padding': '3px', 'color': isDark ? '#f8fafc' : '#0f172a', 'edge-distances': 'node-position' } },
            
            { selector: '.straight-edge', style: { 'curve-style': 'bezier' } },
            { selector: '.curved-edge', style: { 'curve-style': 'unbundled-bezier', 'control-point-distances': 40, 'control-point-weights': 0.5 } },
            { selector: '.backward-loop', style: { 'curve-style': 'unbundled-bezier', 'control-point-distances': -100, 'control-point-weights': 0.5 } },
            { selector: '.loop-edge', style: { 'curve-style': 'bezier' } },
            
            { selector: '.cy-active-node', style: { 'background-color': '#f59e0b', 'border-color': '#b45309', 'color': '#fff', 'width': '50px', 'height': '50px', 'font-size': '16px', 'border-width': '4px' } },
            { selector: '.cy-active-edge', style: { 'line-color': '#f59e0b', 'target-arrow-color': '#f59e0b', 'width': 4 } },
            
            { selector: 'node, edge', style: { 'transition-property': 'opacity, width, height, background-color, border-width', 'transition-duration': '300ms' } },
            { selector: '.cy-hidden', style: { 'opacity': 0 } }
        ],
        layout: { name: 'dagre', rankDir: 'LR', nodeSep: 50, edgeSep: 50, rankSep: 70 }
    });

    if (animateBuild) {
        executeGraphBuildAnimation();
    }
}

async function executeGraphBuildAnimation() {
    const generateBtn = document.getElementById('btn-generate');
    generateBtn.disabled = true;

    cy.elements().addClass('cy-hidden');

    const sleep = ms => new Promise(res => setTimeout(res, ms));
    await sleep(100); 

    let sortedNodes = cy.nodes().toArray().sort((a, b) => {
        let idA = parseInt(a.id().replace(/\D/g, ''));
        let idB = parseInt(b.id().replace(/\D/g, ''));
        return idA - idB;
    });

    for (let node of sortedNodes) {
        node.removeClass('cy-hidden');
        await sleep(200); 
        
        let outEdges = node.connectedEdges(`[source = "${node.id()}"]`);
        if (outEdges.length > 0) {
            outEdges.removeClass('cy-hidden');
            await sleep(200);
        }
    }

    generateBtn.disabled = false;
}

// --- 3. NFA Table & Simulation ---
function renderNFATable() {
    let html = `<table><tr><th>State</th>`;
    let symbols = [...Array.from(alphabet), 'ε'];
    symbols.forEach(s => html += `<th>${s}</th>`);
    html += `</tr>`;

    let visited = new Set(), queue = [currentNFA.start], rows = [];
    visited.add(currentNFA.start.id);

    while (queue.length) {
        let curr = queue.shift();
        let rowStr = `<tr><td>${curr.id === currentNFA.start.id ? '→ ' : ''}${curr.id === currentNFA.end.id ? '* ' : ''}q${curr.id}</td>`;
        symbols.forEach(sym => {
            let targets = curr.transitions.filter(t => t.symbol === sym).map(t => `q${t.to.id}`);
            rowStr += `<td>${targets.length ? '{' + targets.join(',') + '}' : '∅'}</td>`;
        });
        rowStr += `</tr>`;
        rows.push({ id: curr.id, html: rowStr });

        for (let t of curr.transitions) {
            if (!visited.has(t.to.id)) { visited.add(t.to.id); queue.push(t.to); }
        }
    }
    rows.sort((a,b) => a.id - b.id).forEach(r => html += r.html);
    document.getElementById('table-container').innerHTML = html + `</table>`;
}

async function animateSimulation() {
    if (!currentNFA) return showError("Generate an NFA first.");
    
    const str = document.getElementById('sim-input').value.trim();
    const statusDiv = document.getElementById('sim-status');
    const btn = document.getElementById('btn-simulate');

    if (currentView !== 'nfa-graph') {
        document.querySelector('[data-view="nfa-graph"]').click();
    }

    btn.disabled = true;
    statusDiv.className = 'sim-status';
    statusDiv.textContent = 'Initializing...';
    cy.elements().removeClass('cy-active-node cy-active-edge');

    const sleep = ms => new Promise(res => setTimeout(res, ms));

    let currentStates = getEpsilonClosure([currentNFA.start]);
    highlightGraphElements(currentStates, []);
    
    await sleep(2000); 

    for (let i = 0; i < str.length; i++) {
        let char = str[i];
        statusDiv.textContent = `Processing '${char}'...`;

        let nextStatesPreEpsilon = new Set();
        let usedTransitions = [];

        for (let state of currentStates) {
            for (let t of state.transitions) {
                if (t.symbol === char) {
                    nextStatesPreEpsilon.add(t.to);
                    usedTransitions.push({source: `q${state.id}`, target: `q${t.to.id}`});
                }
            }
        }

        let nextStates = getEpsilonClosure(Array.from(nextStatesPreEpsilon));
        highlightGraphElements(nextStates, usedTransitions);
        currentStates = nextStates;
        
        await sleep(2000); 
        if (currentStates.size === 0) break; 
    }

    let isAccepted = Array.from(currentStates).some(s => s.id === currentNFA.end.id);
    if (isAccepted) {
        statusDiv.textContent = `Accepted`;
        statusDiv.classList.add('accepted');
    } else {
        statusDiv.textContent = `Rejected`;
        statusDiv.classList.add('rejected');
    }
    
    btn.disabled = false;
}

function highlightGraphElements(activeStates, activeEdges) {
    if (!cy) return;
    
    cy.elements().removeClass('cy-active-node cy-active-edge');

    activeStates.forEach(s => {
        cy.getElementById(`q${s.id}`).addClass('cy-active-node');
    });

    activeEdges.forEach(edge => {
        cy.edges(`[source="${edge.source}"][target="${edge.target}"]`).addClass('cy-active-edge');
    });
}