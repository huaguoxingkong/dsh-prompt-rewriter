/**
 * Offline prompt-shape comparison.
 *
 * It cannot judge how GOOD a rewrite is (that needs a real model), but it can show
 * exactly what the model is asked to do, which is what changes when the prompt changes.
 * Run: node scripts/prompt-shape.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const intentSource = fs.readFileSync(path.join(ROOT, 'intent-first-rules.mjs'), 'utf8');
const legacySource = fs.readFileSync(path.join(ROOT, 'legacy-rules.mjs'), 'utf8');
const workbuddySource = fs.readFileSync(path.join(ROOT, 'workbuddy-rules.mjs'), 'utf8');

/** Pull one top-level const array out of a source file without importing it. */
function grabFrom(text, name) {
	const start = text.indexOf(`const ${name} = [`);
	if (start < 0) return undefined;
	// The block ends at the closing bracket, whatever follows it (`.join(…)`, `;`).
	const end = text.indexOf('\n]', start);
	if (end < 0) return undefined;
	return text.slice(start, end + 2);
}
const grab = (name) => grabFrom(source, name);

const BASE = grabFrom(legacySource, 'LEGACY_RULES') ?? grab('BASE_RULES');
const PLAIN = grab('SYSTEM_PROMPT_PLAIN');
const CONTEXT = grab('SYSTEM_PROMPT_CONTEXT');
const PROTOCOL = grab('INTENT_FIRST_OUTPUT_PROTOCOL');
const INTENT = grabFrom(intentSource, 'INTENT_FIRST_RULES');
const WORKBUDDY = grabFrom(workbuddySource, 'WORKBUDDY_RULES');

/** Entries of a `const NAME = ['…', '…'];` block, quotes stripped. */
function entries(block) {
	if (block === undefined) return [];
	return block
		.split('\n')
		.slice(1)
		.map((line) => {
			// Rule sets are written either as 'single-quoted' prose or as JSON-style
			// "double-quoted" lines (the verbatim WorkBuddy prompt). Both must count.
			const single = /^\s*'(.*)',?\s*$/u.exec(line);
			if (single !== null) return single[1].replace(/\\'/gu, "'");
			const double = /^\s*"(.*)",?\s*$/u.exec(line);
			if (double !== null) {
				try { return JSON.parse('"' + double[1] + '"'); } catch { return double[1]; }
			}
			return line;
		});
}

/** Slot shape of one rule set: slots, blanks and the characters actually sent. */
function shape(block) {
	const list = entries(block);
	const blank = list.filter((line) => line.trim().length === 0).length;
	return { slots: list.length, blank, rules: list.length - blank, chars: list.join('\n').length };
}

const countLines = (block) => entries(block).filter((line) => line.trim().length > 0).length;

console.log('=== rule sets shipped in this bundle ===');
const sets = [
	['BASE_RULES (legacy)', BASE],
	['INTENT_FIRST_RULES', INTENT],
	['WORKBUDDY_RULES', WORKBUDDY],
];
for (const [name, block] of sets) {
	const s = shape(block);
	console.log(`${name.padEnd(22)} ${s.slots} 槽位 / ${s.blank} 空 / ${s.rules} 非空 / ${s.chars} 字符`);
}
console.log(`${'OUTPUT_PROTOCOL'.padEnd(22)} ${countLines(PROTOCOL)} 行`);
console.log(`${'SYSTEM_PROMPT_PLAIN'.padEnd(22)} ${countLines(PLAIN)} 行（含 BASE）`);
console.log(`${'SYSTEM_PROMPT_CONTEXT'.padEnd(22)} ${countLines(CONTEXT)} 行（含 BASE）`);

const drafts = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'drafts.json'), 'utf8'));
console.log(`\n=== fixtures: ${drafts.drafts.length} 条草稿 ===`);
for (const d of drafts.drafts) {
	console.log(`- ${d.id.padEnd(14)} ${d.label}`);
}

// The clauses that define the shipped 1.7.0 design: legacy rules plus the
// attachment-path safety clauses kept from the extracted rewrite.
const present = (pattern) => pattern.test(legacySource) || pattern.test(source) || pattern.test(CONTEXT ?? '');
const clauses = [
	['旧规则：资深提示词工程师', /You are a senior prompt engineer/u],
	['旧规则：1.2x-3x 长度', /1\.2x to 3x/u],
	['旧规则：最多 3 个占位符', /Use at most 3 placeholders/u],
	['附件：手打引用逐字保留', /the user TYPED/u],
	['附件：禁止写出磁盘路径', /NEVER write out a disk path/u],
	['附件：定义 [附件N] 标记', /\[附件N: name\]/u],
];
console.log('\n=== 1.7.0 已发布规则的关键条款 ===');
for (const [label, re] of clauses) {
	console.log(`${present(re) ? '已有' : '缺失'}  ${label}`);
}

// Every non-legacy rule set must commit to a reading instead of asking the user.
const noAsk = [
	['意图优先：明令不得反问', /Never ask the user a question/u.test(intentSource)],
	['WorkBuddy：原文只禁「回答问题」', /Do NOT answer questions/u.test(workbuddySource)],
	['WorkBuddy：与原始提取逐字一致', workbuddySource.includes('maximum length should be around 800 characters') && workbuddySource.includes('Add relevant examples')],
	['意图优先：冲突时取更可能读法', /take the more probable one and rewrite/u.test(intentSource)],
	['输出协议不含 CLARIFY 标签', PROTOCOL !== undefined && !/CLARIFY/u.test(PROTOCOL)],
	['协议只有 ENHANCED / UNCHANGED', PROTOCOL !== undefined && /ENHANCED/u.test(PROTOCOL) && /UNCHANGED/u.test(PROTOCOL)],
	['index.js 无「先确认目标」字样', !/confirm the goal before acting|请先确认目标/u.test(source)],
];
console.log('\n=== 非 legacy 规则集一律反问？ ===');
for (const [label, ok] of noAsk) {
	console.log(`${ok ? '通过' : '失败'}  ${label}`);
}

const completion = [
	['意图优先：六维齐备（GOAL/INPUTS/SCOPE/METHOD/OUTPUT/QUALITY BAR）', ['- GOAL — the outcome to produce', '- INPUTS — what to work from', '- SCOPE — what is included', '- METHOD — the steps, order', '- OUTPUT — the format, length', '- QUALITY BAR — what makes the result acceptable'].every((dimension) => intentSource.includes(dimension))],
	['意图优先：允许并预期扩写', /two to five times its length/u.test(intentSource)],
	['意图优先：UNCHANGED 可达（精确自洽或非任务）', /Return UNCHANGED when the draft is already precise and self-consistent/u.test(intentSource)],
	['意图优先：长度硬上限 5 倍', /never beyond five times the draft length/u.test(intentSource)],
];
console.log('\n=== 意图优先：推断后补全（而非最小编辑） ===');
for (const [label, ok] of completion) {
	console.log(`${ok ? '通过' : '失败'}  ${label}`);
}

const retired = [
	['意图优先：四类合法改动（旧内联版）', '1. DISAMBIGUATE'],
	['意图优先：硬禁止（旧内联版）', 'HARD PROHIBITION'],
	['意图优先：意图候选（旧内联版）', 'OFFER AN INTENT CANDIDATE'],
	['意图优先：输出前自检（旧内联版）', 'Before you answer, check the rewrite'],
];
console.log('\n=== 已拆出的规则（不应再内联在 index.js） ===');
for (const [label, phrase] of retired) {
	console.log(`${source.includes(phrase) ? '仍在（错误）' : '已移除'}  ${label}`);
}
